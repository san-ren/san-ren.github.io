// --- START OF FILE astro.config.mjs ---

import { mkdirSync, writeFileSync } from 'node:fs';
import { readGithubToken, runPlatformDetection } from './src/utils/platformDetect.mjs';
import { defineConfig } from 'astro/config';
import node from '@astrojs/node';
import react from "@astrojs/react";
import markdoc from "@astrojs/markdoc";
import mdx from '@astrojs/mdx';
import remarkGfm from 'remark-gfm';
import sitemap from '@astrojs/sitemap';
import astroExpressiveCode from 'astro-expressive-code';
import tailwindcss from '@tailwindcss/vite';

// 1. 部署目标（由 package.json 的 cross-env DEPLOY_TARGET= 注入）
//    github (默认) : 纯静态 + base=/my-nav  → GitHub Pages。无法使用在线后台（GH Pages 不能跑 Node）。
//    root          : 纯静态 + base=/        → 自有域名根路径。
//    admin         : 接 @astrojs/node 适配器，只有 /api/keystatic 走 SSR → 部署到 Node 宿主后可用在线后台。
const deployTarget = process.env.DEPLOY_TARGET || 'github';
const isAdminTarget = deployTarget === 'admin';
const isDevCommand = process.argv.includes('dev');

// 2. base / site
const myBase = (isDevCommand || deployTarget !== 'github') ? '/' : '/my-nav';
const mySite = 'https://san-ren.github.io';

// 3. 定义集成列表
const integrations = [
  astroExpressiveCode({
    themes: ['dracula', 'github-light'],
    themeCssSelector: (theme) => `html.${theme.name === 'dracula' ? 'dark' : 'light'}`,
    frames: {
      showCopyToClipboardButton: true,
      showFileName: false,
      frameStyle: 'box',
    },
    styleOverrides: {
      ui: { windowControlsDecoration: 'none' },
      codeBackground: '#1e293b',
      codeForeground: '#e2e8f0',
      borderColor: '#334155',
      frames: {
          editorActiveTabBackground: '#1e293b',
          editorActiveTabForeground: '#e2e8f0',
          frameBoxShadowCssValue: 'none',
      }
    },
    defaultProps: { frame: 'code' },
  }),
  react(), 
  markdoc(), 
  mdx({ remarkPlugins: [remarkGfm] }), 
  sitemap()
];

// 4. Keystatic 后端 API 注入（dev 与 admin 目标都需要）
//    注意：这里故意不注册 keystatic() 全量集成，因为它会注入 /keystatic/[...params] 动态路由，
//    在 dev 下会抢走自定义 SPA 外壳的子路径 —— 刷新 /keystatic/collection/xxx 时渲染官方页面，
//    而官方页面缺少自定义外壳的客户端增强（删除二次确认）与非安全上下文下的 crypto.subtle 兜底。
//    页面路由一律交给 src/pages/keystatic/[...params].astro + 404 SPA fallback，
//    这样 dev 与生产行为保持一致，只补后端 API 即可。
if (isAdminTarget || isDevCommand) {
  integrations.push({
    name: 'keystatic-admin-api',
    hooks: {
      'astro:config:setup': ({ injectRoute, updateConfig, config }) => {
        console.log(`🔑 [${isAdminTarget ? 'Admin' : 'Dev'}] 正在注入 Keystatic API 路由...`);
        // keystatic() 内置的虚拟模块provide，缺了它 internal/keystatic-api.js 无法解析配置
        updateConfig({
          vite: {
            plugins: [{
              name: 'keystatic-virtual-config',
              resolveId(id) {
                if (id === 'virtual:keystatic-config') {
                  return this.resolve('./keystatic.config', './a');
                }
                return null;
              },
            }],
            optimizeDeps: { entries: ['keystatic.config.*', '.astro/keystatic-imports.js'] },
          },
        });
        // dev 下补上 .astro/keystatic-imports.js（官方 keystatic() 会生成它，
        // 作为 Vite 首轮依赖预打包的入口，缺了它 Keystatic UI 依赖会在运行时才被发现）
        if (isDevCommand) {
          const dotAstroDir = new URL('./.astro/', config.root);
          mkdirSync(dotAstroDir, { recursive: true });
          writeFileSync(new URL('keystatic-imports.js', dotAstroDir), `import "@keystatic/astro/ui";
import "@keystatic/astro/api";
import "@keystatic/core/ui";
`);
        }
        injectRoute({
          pattern: '/api/keystatic/[...params]',
          entrypoint: '@keystatic/astro/internal/keystatic-api.js',
          prerender: false,
        });
      },
    },
  });
}

// 5. 动态加载开发环境专用功能 (Toolbox 依赖本地文件系统，因此只在 dev 下可用)
if (isDevCommand) {
  // 5.0 在启动信息里补上后台地址，省得每次手敲 /keystatic
  integrations.push({
    name: 'dev-url-hints',
    hooks: {
      'astro:server:start': ({ address }) => {
        const port = address?.port ?? 4321;
        // 用 setTimeout 而不是 logger：logger 会把多行 message 折叠掉，
        // 而延迟一个 tick 能保证这块提示排在 Astro 自己那组 URL 之后。
        setTimeout(() => {
          const rows = [
            ['📝 Keystatic 后台  (本地 local 模式)', `http://localhost:${port}/keystatic`],
            ['🧰 Toolbox 工具箱 (仅 dev 可用)', `http://localhost:${port}/toolbox`],
          ];
          const width = Math.max(...rows.map(([l]) => [...l].reduce((n, c) => n + (c.charCodeAt(0) < 128 ? 1 : 2), 0)));
          console.log('');
          for (const [label, url] of rows) {
            const w = [...label].reduce((n, c) => n + (c.charCodeAt(0) < 128 ? 1 : 2), 0);
            console.log(`  ┃ ${label}${' '.repeat(width - w)}  ${url}`);
          }
          console.log('');
        }, 0);
      },
    },
  });

  // 5.1 Keystatic 本地后台：API 路由已在第 4 节统一注入。
  // 这里刻意不再 push keystatic() 全量集成 —— 它会注入官方页面动态路由
  // /keystatic/[...params]（prerender: false），在 dev 下截胡自定义 SPA 外壳的
  // 子路径（刷新 /keystatic/collection/xxx 会渲染官方页面）。详见第 4 节注释。

  // 5.2 注入智能解析 API (仅开发环境)
  integrations.push({
    name: 'dev-smart-parse-api',
    hooks: {
      'astro:config:setup': ({ injectRoute }) => {
        console.log('🚀 [Dev] 正在注入智能解析 API...');
        injectRoute({
          pattern: '/api/smart-parse',
          entrypoint: './src/components/keystatic/ToolboxField/smart-parse.ts',
          prerender: false 
        });
      },
    },
  });

  // 5.3 注入工具箱 API 路由 (仅开发环境)
  integrations.push({
    name: 'dev-toolbox-api',
    hooks: {
      'astro:config:setup': ({ injectRoute }) => {
        injectRoute({
          pattern: '/api/github-check',
          entrypoint: './src/components/keystatic/Toolbox/GithubChecker/api/index.ts',
          prerender: false 
        });
        injectRoute({
          pattern: '/api/link-check',
          entrypoint: './src/components/keystatic/Toolbox/LinkChecker/api/index.ts',
          prerender: false 
        });
        injectRoute({
          pattern: '/api/batch-add',
          entrypoint: './src/components/keystatic/Toolbox/BatchAdder/api/index.ts',
          prerender: false 
        });
        injectRoute({
        pattern: '/api/resource-mover',
        entrypoint: './src/components/keystatic/Toolbox/ResourceMover/api/index.ts',
        prerender: false 
        });
      },
    },
  });
}

// 6. 支持平台自动探测（手动 platforms 字段的兜底数据源，真源见 src/utils/resourcePlatforms.mjs）
//    只为「未手动填写平台」的 GitHub 资源补 src/data/platform-cache.json，页面渲染时由
//    navData.ts 读取（手动优先、缓存兜底）。
//    构建期阻塞执行，保证页面渲染时缓存已就绪；dev 下不阻塞启动，写完缓存由 Vite 热更新带出。
//    永远是"尽力而为"：网络失败 / API 限额耗尽只打印提示，绝不打断 dev / build。
//    开关：PLATFORM_DETECT=auto(默认) | force(连未过期的缓存也重探) | off；
//          PLATFORM_DETECT_BUDGET 本轮请求上限；PLATFORM_DETECT_TTL_DAYS 缓存有效期（默认 30 天）。
const platformDetectMode = process.env.PLATFORM_DETECT || 'auto';

if (platformDetectMode !== 'off') {
  const runPlatformDetect = async (stage) => {
    try {
      const token = readGithubToken(process.cwd());
      const summary = await runPlatformDetection({
        root: process.cwd(),
        mode: platformDetectMode,
        token,
        budget: Number(process.env.PLATFORM_DETECT_BUDGET) || 0,
        ttlDays: Number(process.env.PLATFORM_DETECT_TTL_DAYS ?? 30),
        log: (message) => console.log(`🖥️ [Platform] ${message}`),
      });

      if (summary.requested > 0) {
        console.log(
          `🖥️ [Platform/${stage}] 平台缓存新增 ${summary.added} 条（已缓存 ${summary.cached}/${summary.candidates}，待探测 ${summary.pending}${token ? '，已认证' : '，未认证'}）`
        );
      }
      if (summary.pending > summary.requested && !summary.rateLimited) {
        console.log('   └ 提示：pnpm platforms:detect 可继续补全；.env 里配 GITHUB_TOKEN 可一次跑完全站');
      }
    } catch (error) {
      console.warn('🖥️ [Platform] 自动探测跳过：', error?.message || error);
    }
  };

  integrations.push({
    name: 'platform-detect',
    hooks: {
      'astro:build:start': () => runPlatformDetect('build'),
      'astro:server:start': () => {
        void runPlatformDetect('dev');
      },
    },
  });
}

// 7. Vite 构建优化配置
const viteConfig = {
  plugins: [tailwindcss()],
  // ⚠️ keystatic.config.tsx 会被 KeystaticAdmin.tsx `import config from '../../keystatic.config'`
  // 打进浏览器端 bundle，而它在模块顶层读 process.env.KEYSTATIC_STORAGE 来选数据模式。
  // 浏览器里没有 process 全局 → "ReferenceError: process is not defined" →
  // 后台岛屿水合失败 → /keystatic 一片空白（dev 与线上同样会中招）。
  // 用 define 在转换/构建期把这个表达式替换成字面量：客户端与服务端取值一致，且不再引用 process。
  define: {
    // 两个 key 各管一边：
    //   process.env.*  → Node / 构建期读取（dev 下 Vite 对项目源码不替换，靠源码里的 typeof 兜底）
    //   __KEYSTATIC_STORAGE__ → 浏览器端（keystatic.config.tsx 里 typeof 判断后取它）
    'process.env.KEYSTATIC_STORAGE': JSON.stringify(process.env.KEYSTATIC_STORAGE || 'cloud'),
    __KEYSTATIC_STORAGE__: JSON.stringify(process.env.KEYSTATIC_STORAGE || 'cloud'),
  },
  // ⚠️ client:only 岛屿（Toolbox / SearchModal / ShareExportModal 等）的裸依赖
  // 是浏览器运行时才动态 import 的，Vite 的依赖扫描器看不见它们，只能在首次请求时
  // 临时发现并重跑预打包。这期间如果有别的进程（例如 `astro check`）用不同的入口集
  // 覆写了 node_modules/.vite/deps，运行中的 dev server 会继续吐旧 hash 的模块地址，
  // 浏览器拿到 504 Outdated Optimize Dep → 岛屿静默白屏（表现为 /toolbox 一片空白）。
  // 显式列进来可保证它们永远在首轮预打包结果里，不再依赖运行时发现。
  optimizeDeps: {
    include: ['lucide-react', 'fuse.js', 'marked'],
  },
  server: {
    watch: {
      usePolling: true,
      interval: 1000,
    },
  },
  build: {
    rollupOptions: {
      output: {
        // 手动分割代码块，优化加载性能
        manualChunks: (id) => {
          if (id.includes('react') || id.includes('react-dom')) {
            return 'react-vendor';
          }
          if (id.includes('lucide-react')) {
            return 'lucide-icons';
          }
          if (id.includes('fuse.js')) {
            return 'fuse-search';
          }
        },
      },
    },
    chunkSizeWarningLimit: 600,
  },
};

export default defineConfig({
  site: mySite,
  base: myBase,
  trailingSlash: isDevCommand ? 'ignore' : 'always', 
  output: 'static',
  // admin 目标下才挂适配器（必须放在这里，放进 integrations 里 Astro 识别不到）
  adapter: isAdminTarget ? node({ mode: 'standalone' }) : undefined,
  integrations: integrations,
  server: {
    host: true,
    port: 4321,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    }
  },
  devToolbar: { enabled: false },
  compressHTML: true,
  vite: viteConfig
});
