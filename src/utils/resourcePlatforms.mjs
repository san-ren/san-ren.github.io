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
