/**
 * 支持平台自动探测（构建期 / 命令行）—— 手动字段的兜底数据源
 *
 * 数据流：
 *   src/content/nav-groups/*.json（未手动填写 platforms 的 GitHub 资源）
 *     → GitHub Releases API（附件名推断平台，规则见 resourcePlatforms.mjs）
 *       → src/data/platform-cache.json（缓存，随仓库提交）
 *         → src/utils/navData.ts 读取（手动优先 / 缓存兜底）→ 卡片浮窗徽章
 *
 * 两个调用方：
 *   1. astro.config.mjs 的 platform-detect 集成：pnpm build（阻塞）与 pnpm dev（不阻塞启动）
 *   2. pnpm platforms:detect：命令行补全缓存，支持 --force 全量重探
 *
 * ⚠️ 探测失败绝不打断构建：网络错误 / 限额耗尽只跳过，缓存保持原样，下一轮再试。
 * ⚠️ 未认证的 GitHub API 限额是 60 次/小时，因此默认每轮只花 25 次（随缓存提交后，
 *    后续构建通常一次请求都不用花）。
 * ⚠️ 本文件只在 Node 侧运行（node:fs / fetch），不要被浏览器端组件引用。
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  PLATFORM_NONE,
  getGithubRepoKey,
  inferPlatformsFromReleaseAssets,
  isKnownPlatform,
} from './resourcePlatforms.mjs';

/** 缓存文件（相对项目根） */
export const CACHE_RELATIVE_PATH = 'src/data/platform-cache.json';

const CONTENT_RELATIVE_DIR = 'src/content/nav-groups';
const API_BASE = 'https://api.github.com';
const USER_AGENT = 'my-nav-platform-detect';
/** 并发请求数：既要快，也别把未认证限额撞出 403 */
const CONCURRENCY = 4;
const REQUEST_TIMEOUT = 15000;
const CACHE_TTL_DAYS = 30;
/** 未认证时的默认预算（限额 60 次/小时，留出余量给其它工具） */
const UNAUTH_BUDGET = 25;
/** 认证时的默认预算（限额 5000 次/小时，够跑完全站） */
const AUTH_BUDGET = 500;

/** 读取缓存；文件缺失或损坏时返回空缓存（探测会重建） */
export function loadPlatformCache(root) {
  try {
    const raw = JSON.parse(readFileSync(join(root, CACHE_RELATIVE_PATH), 'utf8'));
    const repos = raw && typeof raw.repos === 'object' && raw.repos ? raw.repos : {};
    return { ...raw, repos };
  } catch {
    return { repos: {} };
  }
}

function savePlatformCache(root, cache) {
  // 先与磁盘上的最新内容合并：dev 集成（server:start）与命令行探测可能同时在跑，
  // 各自手里都只有启动那一刻的快照，直接覆盖会丢掉对方刚探测出来的条目。
  // 同 key 取 checkedAt 更新的那份。
  for (const [key, entry] of Object.entries(loadPlatformCache(root).repos)) {
    const mine = cache.repos[key];
    if (!mine) {
      cache.repos[key] = entry;
    } else if (Date.parse(entry?.checkedAt || '') > Date.parse(mine?.checkedAt || '')) {
      cache.repos[key] = entry;
    }
  }
  writeFileSync(join(root, CACHE_RELATIVE_PATH), `${JSON.stringify(cache, null, 2)}\n`, 'utf8');
}

/**
 * 读取 GITHUB_TOKEN：优先进程环境变量，其次项目根的 .env（不打印、不外传）
 * @param {string} root
 * @returns {string}
 */
export function readGithubToken(root) {
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
  try {
    const raw = readFileSync(join(root, '.env'), 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const matched = /^\s*(?:export\s+)?GITHUB_TOKEN\s*=\s*(.+?)\s*$/.exec(line);
      if (matched) return matched[1].replace(/^["']|["']$/g, '');
    }
  } catch {
    // 没有 .env 是常态，静默跳过
  }
  return '';
}

/** 遍历一个分组 JSON 里的全部资源（分组直属 / 分类直属 / Tab 列表） */
function* iterateResources(group) {
  if (!group || typeof group !== 'object') return;
  for (const res of group.resources || []) if (res) yield res;
  for (const cat of group.categories || []) {
    if (!cat) continue;
    for (const res of cat.resources || []) if (res) yield res;
    for (const tab of cat.tabs || []) {
      for (const res of (tab && tab.list) || []) if (res) yield res;
    }
  }
}

/**
 * 收集需要自动探测的 GitHub 仓库（去重后的 owner/repo 列表）
 * 手动填过 platforms 的资源（含 PLATFORM_NONE 哨兵）一律跳过。
 * @param {string} root 项目根目录
 * @returns {string[]}
 */
export function collectPlatformTargets(root) {
  const dir = join(root, CONTENT_RELATIVE_DIR);
  if (!existsSync(dir)) return [];

  const targets = new Map();
  for (const file of readdirSync(dir)) {
    if (!file.endsWith('.json')) continue;

    let group;
    try {
      group = JSON.parse(readFileSync(join(dir, file), 'utf8'));
    } catch {
      continue; // 单个坏文件不该拖垮整轮探测
    }

    for (const res of iterateResources(group)) {
      const manual = Array.isArray(res.platforms) ? res.platforms : [];
      if (manual.includes(PLATFORM_NONE) || manual.some(isKnownPlatform)) continue;

      const key = getGithubRepoKey(res.url);
      if (key && !targets.has(key)) targets.set(key, key);
    }
  }
  return [...targets.values()];
}

/** 拉取最近 5 个 Release 的附件名 */
async function fetchReleaseAssets(key, token) {
  const headers = { Accept: 'application/vnd.github+json', 'User-Agent': USER_AGENT };
  if (token) headers.Authorization = `token ${token}`;

  const res = await fetch(`${API_BASE}/repos/${key}/releases?per_page=5`, {
    headers,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT),
  });

  if (res.status === 404) return { status: 'missing' };
  // 451 = 仓库被 DMCA 封禁（永久不可访问），当成已确认结果缓存，别再每次重建都重试
  if (res.status === 451) return { status: 'blocked' };
  if (res.status === 403 || res.status === 429) return { status: 'rate-limited' };
  if (!res.ok) return { status: 'error', code: res.status };

  const releases = await res.json();
  const assetNames = [];
  for (const release of Array.isArray(releases) ? releases : []) {
    for (const asset of release?.assets || []) {
      if (typeof asset?.name === 'string') assetNames.push(asset.name);
    }
  }
  return { status: 'ok', assetNames };
}

/**
 * 跑一轮探测：只为「缓存里没有」以及（force 或带 token 时）「缓存已过期」的仓库发请求。
 *
 * @param {object} [options]
 * @param {string} [options.root] 项目根目录，默认 process.cwd()
 * @param {'auto'|'force'} [options.mode] force = 连未过期的缓存也重探
 * @param {string} [options.token] GitHub Token，留空则走未认证限额
 * @param {number} [options.budget] 本轮最多发起的请求数，0/缺省按是否认证取默认值
 * @param {number} [options.ttlDays] 缓存有效期（天），0 = 永不过期
 * @param {(message: string) => void} [options.log]
 * @returns {Promise<{ candidates: number, cached: number, pending: number, requested: number, added: number, failed: number, rateLimited: boolean }>}
 */
export async function runPlatformDetection({
  root = process.cwd(),
  mode = 'auto',
  token = '',
  budget = 0,
  ttlDays = CACHE_TTL_DAYS,
  log = () => {},
} = {}) {
  const cache = loadPlatformCache(root);
  const candidates = collectPlatformTargets(root);
  const limit = budget > 0 ? budget : token ? AUTH_BUDGET : UNAUTH_BUDGET;
  // 未认证时不去重探已有缓存：那会把 60 次/小时的额度浪费在"已知答案"上
  const refreshExisting = mode === 'force' || Boolean(token);
  const now = Date.now();

  const pending = candidates.filter((key) => {
    const entry = cache.repos[key];
    if (!entry || !Array.isArray(entry.platforms)) return true;
    if (mode === 'force') return true; // force 无视 TTL，全部重探（推断规则改过时用它刷新）
    if (!refreshExisting || !ttlDays) return false;
    const checkedAt = Date.parse(entry.checkedAt || '');
    return !Number.isFinite(checkedAt) || now - checkedAt > ttlDays * 86400000;
  });

  const batch = pending.slice(0, limit);

  let cursor = 0;
  let added = 0;
  let failed = 0;
  let rateLimited = false;

  const worker = async () => {
    while (!rateLimited && cursor < batch.length) {
      const key = batch[cursor++];
      try {
        const result = await fetchReleaseAssets(key, token);

        if (result.status === 'rate-limited') {
          rateLimited = true;
          log(
            `⚠️ GitHub API 限额已用完（${token ? '认证额度' : '未认证为 60 次/小时'}），已探测结果照常写盘，下次再补`
          );
          return;
        }
        if (result.status === 'error') {
          failed++;
          continue;
        }
        if (result.status === 'missing' || result.status === 'blocked') {
          cache.repos[key] = {
            platforms: [],
            checkedAt: new Date().toISOString(),
            note: result.status === 'missing' ? 'repository not found' : 'repository access blocked (451)',
          };
          added++;
          continue;
        }

        cache.repos[key] = {
          platforms: inferPlatformsFromReleaseAssets(result.assetNames),
          assetCount: result.assetNames.length,
          checkedAt: new Date().toISOString(),
        };
        added++;
      } catch {
        failed++; // 超时 / 网络抖动：不写缓存，下一轮重试
      }
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, batch.length) }, () => worker())
  );

  if (added > 0) savePlatformCache(root, cache);

  return {
    candidates: candidates.length,
    cached: candidates.length - pending.length,
    pending: pending.length,
    requested: batch.length,
    added,
    failed,
    rateLimited,
  };
}

/** 命令行入口：循环补全直到没有待探测项（或限额耗尽） */
async function main() {
  const root = process.cwd();
  const token = readGithubToken(root);
  const force = process.argv.includes('--force');

  console.log(`🖥️ 平台探测：项目根 ${root}`);
  console.log(token ? '🔑 已读取 GITHUB_TOKEN（认证额度 5000 次/小时）' : '🔓 未找到 GITHUB_TOKEN，走未认证限额（60 次/小时，可写进 .env）');

  let round = 0;
  for (;;) {
    round++;
    const summary = await runPlatformDetection({
      root,
      mode: force ? 'force' : 'auto',
      token,
      log: (message) => console.log(message),
    });

    console.log(
      `   第 ${round} 轮：缓存 ${summary.cached}/${summary.candidates}，本轮新增 ${summary.added}，失败 ${summary.failed}，待探测 ${summary.pending}`
    );

    // force 只跑一轮：每轮 384 条都会重新入队，added 永远不为 0，靠它判断会死循环
    // added === 0 说明这一轮什么都没写进缓存（剩下的全是失败项），再跑也是重复烧额度
    if (force || summary.rateLimited || summary.pending === 0 || summary.added === 0) break;
  }

  console.log('✅ 完成。缓存文件：' + CACHE_RELATIVE_PATH);
}

// 仅在被直接执行（pnpm platforms:detect）时跑：被 astro.config.mjs import 时不触发
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error('平台探测失败：', error);
    process.exitCode = 1;
  });
}
