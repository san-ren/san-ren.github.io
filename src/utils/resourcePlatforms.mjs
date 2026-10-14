/**
 * 支持平台 —— 全站唯一真源
 *
 * 四个消费方：
 *   1. 内容集合校验：src/content.config.ts 的 z.enum
 *   2. Keystatic 后台：keystatic.config.tsx 的「支持平台」多选
 *   3. 卡片浮窗：src/components/SiteCard/index.astro → getPlatformBadges()
 *   4. 自动探测兜底：src/utils/platformDetect.mjs → inferPlatformsFromReleaseAssets()
 *
 * ⚠️ 增删平台只改这里，其它文件一律 import，不要再写第二份映射表；
 *    改动等于改动内容集合 schema，需按 AGENTS.md 第 1 节清 .astro 缓存重新 sync。
 *
 * ⚠️ 本文件用 .mjs 而非 .ts 是刻意的：astro.config.mjs 由 Node 原生加载（不经 Vite 转译），
 *    构建配置只能静态 import 纯 .mjs。因此这里必须是纯 JS、零依赖、零 node 内置模块 ——
 *    它同时会被打进浏览器 bundle（Keystatic 后台与卡片都引用它）。
 */

/** 手动「不显示平台徽章」的哨兵值（与真实平台值同存在 platforms 字段里） */
export const PLATFORM_NONE = 'none';

/**
 * 平台元数据：
 *   value      → 存进内容 JSON 的 platforms 字段
 *   label/color/logo → 生成 shields.io 静态徽章
 *   color 必须是 6 位十六进制：静态徽章的颜色写在路径里（/badge/<label>-<color>），
 *   只给 <label> 不给颜色会被 shields.io 判成 404。
 *   logo 取自 simple-icons；留空则不请求图标（shields.io 对不存在的 logo 只会静默不画）。
 *   ⚠️ Windows 特意留空：simple-icons 已下架微软全部品牌图标（windows / windows11 /
 *      microsoft / windows-terminal 实测均无），带 logo= 只会得到一个空图标位。
 */
export const RESOURCE_PLATFORMS = [
  { value: 'windows', label: 'Windows', color: '0078D6', logo: '', logoColor: '' },
  { value: 'macos', label: 'macOS', color: '555555', logo: 'apple', logoColor: 'white' },
  { value: 'linux', label: 'Linux', color: 'FCC624', logo: 'linux', logoColor: '080808' },
  { value: 'android', label: 'Android', color: '3DDC84', logo: 'android', logoColor: '080808' },
  { value: 'ios', label: 'iOS', color: '24292F', logo: 'apple', logoColor: 'white' },
  { value: 'web', label: 'Web', color: '4285F4', logo: 'googlechrome', logoColor: 'white' },
];

/** 全部平台值（顺序即徽章展示顺序） */
export const RESOURCE_PLATFORM_VALUES = RESOURCE_PLATFORMS.map((p) => p.value);

/** 内容集合 z.enum 用：平台值 + 手动隐藏哨兵 */
export const RESOURCE_PLATFORM_ENUM = [...RESOURCE_PLATFORM_VALUES, PLATFORM_NONE];

/** Keystatic 后台「支持平台」多选选项 */
export const RESOURCE_PLATFORM_OPTIONS = [
  ...RESOURCE_PLATFORMS.map((p) => ({ label: p.label, value: p.value })),
  { label: '🚫 不显示平台徽章', value: PLATFORM_NONE },
];

/** 平台值 → 元数据 */
const PLATFORM_META = new Map(RESOURCE_PLATFORMS.map((p) => [p.value, p]));

/** 是否为已知平台值（哨兵 PLATFORM_NONE 不算） */
export function isKnownPlatform(value) {
  return PLATFORM_META.has(value);
}

/**
 * 生成浮窗用的平台徽章（shields.io 静态徽章，与 getBadges() 的动态徽章同一套视觉）
 * @param {string[]} [platforms] 手动填写或自动探测得到的平台值数组
 * @returns {{ value: string, alt: string, src: string }[]} 按平台定义顺序输出，未知值自动忽略
 */
export function getPlatformBadges(platforms) {
  if (!Array.isArray(platforms)) return [];

  const picked = new Set(platforms);
  return RESOURCE_PLATFORMS.filter((p) => picked.has(p.value)).map((p) => {
    const logo = p.logo ? `&logo=${p.logo}&logoColor=${p.logoColor}` : '';
    return {
      value: p.value,
      alt: p.label,
      src: `https://img.shields.io/badge/${encodeURIComponent(p.label)}-${p.color}?style=flat${logo}`,
    };
  });
}

/**
 * 从链接解析 GitHub 的 owner/repo（GitHub 侧不区分大小写，统一转小写作为缓存键）
 * @param {string} [url]
 * @returns {string|null}
 */
export function getGithubRepoKey(url) {
  if (typeof url !== 'string' || !url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.hostname !== 'github.com' && parsed.hostname !== 'www.github.com') return null;
    const [owner, repo] = parsed.pathname.split('/').filter(Boolean);
    if (!owner || !repo) return null;
    return `${owner}/${repo.replace(/\.git$/, '')}`.toLowerCase();
  } catch {
    return null;
  }
}

/** 附件名 → 平台：只认确定性的文件名特征，顺序无关（命中即算） */
const ASSET_RULES = [
  { platform: 'windows', test: (name) => /\.(exe|msi|msix|appx)$/.test(name) || /(^|[-_.])win(dows)?(32|64)?([-_.]|$)/.test(name) },
  { platform: 'macos', test: (name) => /\.(dmg|pkg)$/.test(name) || /\.app\.zip$/.test(name) || /(^|[-_.])(mac|macos|osx|darwin)([-_.]|$)/.test(name) },
  { platform: 'linux', test: (name) => /\.(appimage|deb|rpm|flatpak|snap)$/.test(name) || /\.pkg\.tar\.(gz|xz|zst)$/.test(name) || name.includes('linux') },
  { platform: 'android', test: (name) => /\.(apk|aab|apks|xapk)$/.test(name) },
  { platform: 'ios', test: (name) => /\.ipa$/.test(name) },
  // 网页应用偶尔会把构建产物直接挂成 index.html 之类的附件
  { platform: 'web', test: (name) => /\.(html|htm)$/.test(name) },
];

/**
 * 从 GitHub Release 附件名推断支持的平台（自动兜底用，手动字段始终优先）
 *
 * 只做附件名匹配，不猜仓库描述文本 —— 猜错比不显示更糟。
 * 覆盖不到的情况（源码发布、非 GitHub 资源、纯 Web 应用）留给手动 platforms 字段。
 *
 * @param {string[]} [assetNames]
 * @returns {string[]} 平台值数组（按 RESOURCE_PLATFORM_VALUES 顺序）
 */
export function inferPlatformsFromReleaseAssets(assetNames) {
  if (!Array.isArray(assetNames) || assetNames.length === 0) return [];

  const hit = new Set();
  for (const assetName of assetNames) {
    if (typeof assetName !== 'string' || !assetName) continue;
    const name = assetName.toLowerCase();
    for (const rule of ASSET_RULES) {
      if (!hit.has(rule.platform) && rule.test(name)) hit.add(rule.platform);
    }
  }
  return RESOURCE_PLATFORM_VALUES.filter((value) => hit.has(value));
}

// ==========================================================================
// 以下五个是「附件名猜不出来时」的兜底信号，按可信度从高到低排列，
// 由构建期 platformDetect.mjs 依序尝试（命中即停，省 API 额度）：
//   topics → 文件树 → 主语言 → package.json → GitHub Actions workflow
// ==========================================================================

/** topic → 平台：作者主动打的标签，是最可靠的软信号 */
const TOPIC_PLATFORM_MAP = [
  { value: 'windows', tests: ['windows', 'win32', 'win64', 'windows-app', 'windows-desktop'] },
  { value: 'macos', tests: ['macos', 'mac', 'osx', 'macos-app', 'mac-app'] },
  { value: 'linux', tests: ['linux', 'linux-app'] },
  { value: 'android', tests: ['android', 'android-app'] },
  { value: 'ios', tests: ['ios', 'iphone', 'ipad', 'ios-app'] },
];

/** 这些 topic 视为「桌面三件套都支持」 */
const CROSS_PLATFORM_TOPICS = ['cross-platform', 'crossplatform', 'cross-platform-app', 'multi-platform', 'multiplatform'];

/** Apple 生态语言：没有更具体的信号时按桌面 macOS 计 */
const APPLE_LANGUAGES = ['Swift', 'Objective-C', 'Objective-C++'];

/**
 * 从仓库 topics 推断平台（作者主动标注，比文件名更可信）
 * @param {string[]} [topics]
 * @returns {string[]}
 */
export function inferPlatformsFromTopics(topics) {
  if (!Array.isArray(topics) || topics.length === 0) return [];

  const lower = topics.map((t) => String(t).toLowerCase());
  const hit = new Set();
  for (const topic of lower) {
    if (CROSS_PLATFORM_TOPICS.includes(topic)) {
      hit.add('windows');
      hit.add('macos');
      hit.add('linux');
      continue;
    }
    for (const rule of TOPIC_PLATFORM_MAP) {
      if (!hit.has(rule.value) && rule.tests.includes(topic)) hit.add(rule.value);
    }
  }
  return RESOURCE_PLATFORM_VALUES.filter((value) => hit.has(value));
}

/**
 * 从仓库主语言推断平台：只认 Apple 生态（Swift / Objective-C → macOS）。
 * 注意：Swift 也存在 Linux 服务端项目，所以 topics 已说明 Linux 时不会走到这里
 * （调用方按 topics → 语言 的顺序提前终止了）。
 * @param {string} [language]
 * @returns {string[]}
 */
export function inferPlatformsFromLanguage(language) {
  if (typeof language !== 'string' || !language) return [];
  return APPLE_LANGUAGES.includes(language) ? ['macos'] : [];
}

/**
 * 从默认分支的文件树推断平台
 * @param {string[]} files 文件路径数组（git trees API）
 * @param {string} [language] 仓库主语言，仅用于 C# + .sln 的「倾向 Windows」判据
 * @returns {string[]}
 */
export function inferPlatformsFromFiles(files, language) {
  if (!Array.isArray(files) || files.length === 0) return [];

  const paths = files.map((f) => String(f).toLowerCase());
  const has = (pattern) => paths.some((p) => pattern.test(p));
  const hit = new Set();

  // Android：清单或 Gradle 工程文件
  if (has(/androidmanifest\.xml$/) || has(/(^|\/)(build\.gradle|build\.gradle\.kts|settings\.gradle|settings\.gradle\.kts)$/)) {
    hit.add('android');
  }

  // Apple：Xcode 工程 / Info.plist。iOS 与 macOS 无法只凭工程文件区分，
  // 判据是这些文件的位置：全都在 ios/ 目录下（Flutter / RN 的 iOS 子工程）→ iOS，
  // 否则按桌面 macOS 计；另外出现 ios/ 目录或 LaunchScreen 时补一枚 iOS。
  const appleFiles = paths.filter(
    (p) => /info\.plist$/.test(p) || /\.xcodeproj(\/|$)/.test(p) || /\.xcworkspace(\/|$)/.test(p)
  );
  if (appleFiles.length > 0) {
    const iosOnly = appleFiles.every((p) => /(^|\/)ios\//.test(p));
    hit.add(iosOnly ? 'ios' : 'macos');
    if (has(/(^|\/)ios\//) || has(/launchscreen\.(storyboard|xib)$/)) hit.add('ios');
  }

  // Windows：C# 解决方案（.wpf 是框架名不是扩展名，文件树里无从判断，只保留 .sln 判据）
  if (language === 'C#' && (has(/\.sln$/) || has(/\.csproj$/))) hit.add('windows');

  return RESOURCE_PLATFORM_VALUES.filter((value) => hit.has(value));
}

/**
 * 从 package.json 原文推断平台：electron / tauri 依赖 = 跨平台桌面应用
 * @param {string} [raw]
 * @returns {string[]}
 */
export function inferPlatformsFromPackageJson(raw) {
  if (typeof raw !== 'string' || !raw) return [];

  let pkg;
  try {
    pkg = JSON.parse(raw);
  } catch {
    return [];
  }
  const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}), ...(pkg.optionalDependencies || {}) };
  const isCrossPlatformDesktop = Object.keys(deps).some(
    (name) => name === 'electron' || name.startsWith('@electron/') || name === 'tauri' || name.startsWith('@tauri-apps/')
  );
  return isCrossPlatformDesktop ? ['windows', 'macos', 'linux'] : [];
}

/** 只看 runs-on 与 matrix os 行，避免把注释 / 脚本里的系统名当成 CI 信号 */
const WORKFLOW_OS_PATTERNS = [
  { value: 'linux', test: (scope) => /ubuntu|linux/.test(scope) },
  { value: 'macos', test: (scope) => /macos|osx/.test(scope) },
  { value: 'windows', test: (scope) => /windows|win32|win64/.test(scope) },
];

/**
 * 从 GitHub Actions workflow 原文推断平台（runs-on / matrix.os）
 * @param {string} [text]
 * @returns {string[]}
 */
export function inferPlatformsFromWorkflow(text) {
  if (typeof text !== 'string' || !text) return [];

  const scope = [...(text.match(/^\s*runs-on:.*$/gm) || []), ...(text.match(/^\s*-?\s*os:.*$/gm) || [])]
    .join('\n')
    .toLowerCase();
  if (!scope) return [];

  const hit = new Set();
  for (const rule of WORKFLOW_OS_PATTERNS) {
    if (!hit.has(rule.value) && rule.test(scope)) hit.add(rule.value);
  }
  return RESOURCE_PLATFORM_VALUES.filter((value) => hit.has(value));
}

// ==========================================================================
// CI 信号门槛
// runs-on: ubuntu-latest 是 GitHub 的默认值，大量与平台无关的项目都会写它，
// 直接拿来当平台证据会把自托管 Web 应用 / 命令行工具 / 库统一误判成 Linux。
// 桌面应用反而不用担心：它们通常有 Release 附件（.exe/.dmg/.deb…）或
// package.json 里的 electron / tauri 依赖，那两道信号排在更前面。
// ==========================================================================

/** 这些主语言基本不产出"平台专属"的桌面安装包 */
const CI_SIGNAL_BLOCKED_LANGUAGES = [
  'TypeScript',
  'JavaScript',
  'PHP',
  'Python',
  'Ruby',
  'HTML',
  'CSS',
  'Shell',
  'Dockerfile',
  'Jupyter Notebook',
];

/** 这些 topic 说明项目本身与桌面平台无关 */
const CI_SIGNAL_BLOCKED_TOPICS = [
  'web',
  'web-app',
  'webapp',
  'website',
  'cli',
  'command-line',
  'command-line-tool',
  'commandline',
  'terminal',
  'shell-script',
  'library',
  'framework',
  'sdk',
  'api',
  'backend',
  'server-side',
  'docs',
  'bot',
  'scraper',
  'crawler',
];

/**
 * 是否跳过 CI（workflow runs-on）信号
 * @param {object} [signals]
 * @param {string[]} [signals.topics] 仓库 topics
 * @param {string} [signals.language] 仓库主语言
 * @returns {boolean} true = 这个项目不该用 runs-on 推断平台
 */
export function shouldSkipCiSignal({ topics = [], language = '' } = {}) {
  const normalizedTopics = (Array.isArray(topics) ? topics : []).map((t) => String(t).toLowerCase());
  if (normalizedTopics.some((topic) => CI_SIGNAL_BLOCKED_TOPICS.includes(topic))) return true;

  const normalizedLanguage = String(language || '').toLowerCase();
  return CI_SIGNAL_BLOCKED_LANGUAGES.some((lang) => lang.toLowerCase() === normalizedLanguage);
}
