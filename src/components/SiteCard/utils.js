/**
 * 提取 URL 的域名
 */
export const getDomain = (targetUrl) => {
  try {
    if (!targetUrl) return null;
    return new URL(targetUrl).hostname;
  } catch (e) {
    return null;
  }
};

/**
 * 徽章类型定义（供前端 UI 生成复选框使用）
 * 导出这个常量，可以在你的表单页面引用，用来生成 checkbox
 */
export const BADGE_OPTIONS = {
  github: [
    { label: 'Stars (星标)', value: 'stars' },
    { label: 'Version (版本)', value: 'version' },
    // License 已下线：浮窗上的许可徽章改由支持平台徽章（见 ../../utils/resourcePlatforms.mjs）占位
    { label: 'Last Commit (最后提交)', value: 'last_commit' },
  ],
  vscode: [
    { label: 'Installs (安装量)', value: 'installs' },
    { label: 'Version (版本)', value: 'version' },
    { label: 'Last Updated (最后更新)', value: 'last_updated' },
    // VS Code 没有 License 和 Stars(对应的是 Rating，可选加)
  ]
};

/**
 * 生成徽章列表数据
 * @param {string} url - 项目链接
 * @param {Array} hide_badges - 需要隐藏/禁用的徽章 Key 列表 (例如: ['license', 'last_commit'])
 */
export const getBadges = (url, hide_badges = []) => {
  let badges = [];
  if (!url) return badges;

  // 确保是数组，防止报错
  const hiddenKeys = Array.isArray(hide_badges) ? hide_badges : [];

  try {
    // ---------------------------------------------------------
    // 1. GitHub Badges
    // ---------------------------------------------------------
    if (url.includes("github.com")) {
      const pathParts = new URL(url).pathname.split('/').filter(Boolean);
      if (pathParts.length >= 2) {
        const owner = pathParts[0];
        const repo = pathParts[1];
        const styleParam = "?style=flat&color=blue";

        // 定义 GitHub 支持的徽章配置
        // ⚠️ License 已下线：浮窗改展示「支持平台」徽章，见 ../../utils/resourcePlatforms.mjs
        const badgeConfigs = {
          stars: { 
            src: `https://img.shields.io/github/stars/${owner}/${repo}${styleParam}&label=Stars`, 
            alt: "Stars" 
          },
          last_commit: { 
            src: `https://img.shields.io/github/last-commit/${owner}/${repo}${styleParam}&color=slate&label=Last%20Commit`, 
            alt: "Last Commit" 
          },
          version: { 
            src: `https://img.shields.io/github/v/release/${owner}/${repo}${styleParam}&color=orange&label=Release`, 
            alt: "Version" 
          }
        };

        // 遍历配置，如果 Key 不在 hiddenKeys 中，则显示
        Object.keys(badgeConfigs).forEach(key => {
          if (!hiddenKeys.includes(key)) {
            badges.push(badgeConfigs[key]);
          }
        });
      }
    }
    // ---------------------------------------------------------
    // 2. VS Code Marketplace Badges
    // ---------------------------------------------------------
    else if (url.includes("marketplace.visualstudio.com")) {
      const urlObj = new URL(url);
      const itemId = urlObj.searchParams.get('itemName');
      if (itemId) {
        const styleParam = "?style=flat";

        // 定义 VS Code 支持的徽章配置
        const badgeConfigs = {
          installs: { 
            src: `https://img.shields.io/visual-studio-marketplace/i/${itemId}${styleParam}&color=blue&label=Installs`, 
            alt: "Installs" 
          },
          version: { 
            src: `https://img.shields.io/visual-studio-marketplace/v/${itemId}${styleParam}&color=orange&label=Version`, 
            alt: "Version" 
          },
          last_updated: { 
            src: `https://img.shields.io/visual-studio-marketplace/last-updated/${itemId}${styleParam}&color=slate&label=Updated`, 
            alt: "Last Updated" 
          }
        };

        Object.keys(badgeConfigs).forEach(key => {
          if (!hiddenKeys.includes(key)) {
            badges.push(badgeConfigs[key]);
          }
        });
      }
    }
  } catch (e) {
    console.error("Badge error", e);
  }
  return badges;
};
