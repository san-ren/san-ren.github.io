import { config, fields, collection, singleton } from '@keystatic/core';
import { wrapper } from '@keystatic/core/content-components';
import React from 'react';
import { toolboxField, iconPickerField, toolboxLinkField } from './src/components/keystatic/ToolboxField'; 
import { badgeListField } from './src/components/keystatic/BadgeField';
import { RESOURCE_STATUS_OPTIONS, getStatusEmoji } from './src/utils/resourceStatus';
import { RESOURCE_PLATFORM_OPTIONS } from './src/utils/resourcePlatforms.mjs';

const VISUAL_TAGS = [
  { label: '🏠 首页/概览', value: '🏠' },
  { label: '🛠️ 系统/工具', value: '🛠️' },
  { label: '🎨 设计/美化', value: '🎨' },
  { label: '📺 影音/娱乐', value: '📺' },
  { label: '📚 文档/阅读', value: '📚' },
  { label: '⚡ 效率/生产力', value: '⚡' },
  { label: '☁️ 网络/云端', value: '☁️' },
  { label: '🤖 开发/AI (Dev)', value: '🤖' },
  { label: '⚪ 无标签', value: ' ' }
];

// --- Block Components ---
// 移植自 wj-markdown-editor
// 
// GitHub Alert (5种): Note, Tip, Important, Warning, Caution - 简洁边框样式
// 自定义容器 (6种): Info, Tip, Important, Warning, Danger, Details - 彩色背景样式

// ========== GitHub Alert Schema (5种) ==========
const gitHubAlertSchema = {
  type: fields.select({
    label: 'Alert 类型',
    options: [
      { label: '📘 Note (笔记)', value: 'note' },
      { label: '💡 Tip (技巧)', value: 'tip' },
      { label: '💬 Important (重要)', value: 'important' },
      { label: '⚠️ Warning (警告)', value: 'warning' },
      { label: '🔴 Caution (注意)', value: 'caution' },
    ],
    defaultValue: 'note',
  }),
  title: fields.text({ label: '标题 (可选)' }),
  content: fields.child({ kind: 'block', placeholder: '在此输入内容...' }),
};

// ========== 自定义容器 Schema (6种) ==========
const containerSchema = {
  type: fields.select({
    label: '容器类型',
    options: [
      { label: 'ℹ️ Info (信息)', value: 'info' },
      { label: '💡 Tip (技巧)', value: 'tip' },
      { label: '💬 Important (重要)', value: 'important' },
      { label: '⚠️ Warning (警告)', value: 'warning' },
      { label: '🔥 Danger (危险)', value: 'danger' },
      { label: '🔽 Details (详情/折叠)', value: 'details' },
    ],
    defaultValue: 'info',
  }),
  title: fields.text({ label: '标题 (可选)' }),
  open: fields.checkbox({ label: '默认展开 (仅 Details 有效)', defaultValue: false }),
  content: fields.child({ kind: 'block', placeholder: '在此输入内容...' }),
};

// ========== GitHub Alert 样式配置 ==========
const gitHubAlertStyles: Record<string, { bg: string; border: string; text: string; icon: string }> = {
  note: { bg: '#f8fafc', border: '#0969da', text: '#0969da', icon: '📘' },
  tip: { bg: '#f8fafc', border: '#1a7f37', text: '#1a7f37', icon: '💡' },
  important: { bg: '#f8fafc', border: '#8250df', text: '#8250df', icon: '💬' },
  warning: { bg: '#f8fafc', border: '#9a6700', text: '#9a6700', icon: '⚠️' },
  caution: { bg: '#f8fafc', border: '#cf222e', text: '#cf222e', icon: '🔴' },
};

// ========== 自定义容器样式配置 ==========
const containerStyles: Record<string, { bg: string; border: string; text: string; icon: string }> = {
  info: { bg: 'rgb(239, 240, 243)', border: '#656869', text: '#656869', icon: 'ℹ️' },
  tip: { bg: 'rgb(221, 245, 237)', border: '#18794e', text: '#18794e', icon: '💡' },
  important: { bg: 'rgb(241, 236, 252)', border: '#6f42c1', text: '#6f42c1', icon: '💬' },
  warning: { bg: 'rgb(252, 244, 220)', border: '#915930', text: '#915930', icon: '⚠️' },
  danger: { bg: 'rgb(254, 228, 232)', border: '#b8272c', text: '#b8272c', icon: '🔥' },
  details: { bg: 'rgb(239, 240, 243)', border: '#656869', text: '#656869', icon: '▶' },
};

// ========== GitHub Alert ContentView ==========
const GitHubAlertContentView = (props: any) => {
  const type = props.value?.type || 'note';
  const title = props.value?.title || type.charAt(0).toUpperCase() + type.slice(1);
  const style = gitHubAlertStyles[type] || gitHubAlertStyles.note;

  return (
    <div style={{ padding: '8px 16px', background: style.bg, borderLeft: `4px solid ${style.border}`, borderRadius: '6px', margin: '1em 0' }}>
      <div style={{ fontWeight: '500', color: style.text, display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '8px' }}>
        <span>{style.icon}</span>
        {title}
      </div>
      <div>{props.children}</div>
    </div>
  );
};

// ========== 自定义容器 ContentView ==========
const ContainerContentView = (props: any) => {
  const type = props.value?.type || 'info';
  const title = props.value?.title || (type === 'details' ? 'Details' : type.charAt(0).toUpperCase() + type.slice(1));
  const open = props.value?.open || false;
  const style = containerStyles[type] || containerStyles.info;

  // Details 折叠容器
  if (type === 'details') {
    return (
      <div style={{ padding: '10px', background: style.bg, border: `1px solid ${style.border}`, borderRadius: '6px', margin: '1em 0' }}>
        <div style={{ fontWeight: '500', display: 'flex', gap: '8px', color: style.text, alignItems: 'center', cursor: 'pointer' }}>
          <span style={{ transform: open ? 'rotate(90deg)' : 'none', transition: '0.2s', fontSize: '0.8em' }}>▶</span>
          {title}
        </div>
        <div style={{ marginTop: '8px', paddingLeft: '18px' }}>{props.children}</div>
      </div>
    );
  }

  // 普通容器
  return (
    <div style={{ padding: '12px 16px', background: style.bg, borderRadius: '8px', margin: '1em 0', display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <div style={{ fontWeight: '500', color: style.text, display: 'flex', gap: '8px', alignItems: 'center' }}>
        <span>{style.icon}</span>
        {title}
      </div>
      <div>{props.children}</div>
    </div>
  );
};

// ========== 注册组件 ==========
// 两个块组件共用同一份定义（原先还额外维护了一份未被引用的 documentBlocks，已删除）
const gitHubAlertBlock = {
  label: '📢 GitHub Alert',
  schema: gitHubAlertSchema,
  ContentView: GitHubAlertContentView,
};
const containerBlock = {
  label: '📦 容器',
  schema: containerSchema,
  ContentView: ContainerContentView,
};

const mdxBlocks: any = {
  GitHubAlert: wrapper({
    ...gitHubAlertBlock,
    icon: <span style={{fontSize: '20px'}}>📢</span>,
  } as any),
  Container: wrapper({
    ...containerBlock,
    icon: <span style={{fontSize: '20px'}}>📦</span>,
  } as any),
};

const commonMdxOptions = {
  bold: true,
  italic: true,
  strikethrough: true,
  code: true,
  heading: [2, 3, 4, 5, 6] as const,
};

// --- Reusable Fields ---
const resourceFields = {
  toolbox: toolboxField as any,
  toolboxLink: toolboxLinkField as any, 
  name: fields.text({ label: '名称' }),
  url: fields.url({
    label: '项目链接',
    description: 'GitHub地址或下载直链',
    validation: { isRequired: false }
  }),
  official_site: fields.url({
    label: '官网地址',
    validation: { isRequired: false }
  }),
  desc: fields.text({
    label: '简短描述',
    multiline: true
  }),
  detail: fields.text({
    label: '详细介绍',
    multiline: true,
    description: '支持标准 Markdown 语法',
  }),
  icon: iconPickerField,
  hide_badges: badgeListField({
    label: '隐藏徽章 (勾选则隐藏)',
    description: '根据上方项目地址自动生成可用的徽章选项',
    defaultValue: []
  }),
  platforms: fields.multiselect({
    label: '🖥️ 支持平台',
    description: '手动勾选即以此为准；留空的资源由构建期从 GitHub Release 附件名自动探测兜底，勾选「不显示平台徽章」可强制隐藏',
    options: RESOURCE_PLATFORM_OPTIONS,
    defaultValue: []
  }),
  guide_id: fields.text({ label: '关联教程ID' }),
  status: fields.select({
    label: '资源状态',
    description: '失效资源将自动沉底并显示降级样式',
    // 选项收敛到 src/utils/resourceStatus.ts，与内容集合 schema 共用唯一真源
    options: RESOURCE_STATUS_OPTIONS,
    defaultValue: 'ok',
  }),
};

/**
 * 资源数组字段
 * 分组直属 / 分类直属 / Tab 内三处结构完全一致，只有 label 与未命名时的兜底文案不同。
 */
const resourceArray = (label: string, fallbackName: string) =>
  fields.array(fields.object(resourceFields), {
    label,
    itemLabel: (props: any) => getStatusEmoji(props.fields.status.value) + (props.fields.name.value || fallbackName),
  });

// 1. 定义环境判断变量
const isDev = import.meta.env.DEV;

// 2. 线上存储模式（⚠️ 必须在构建期确定，它会被打进产物，运行时再改无效）
//    cloud (默认)  : Keystatic 官方托管。浏览器直连 https://api.keystatic.cloud 走 PKCE 登录，
//                    不经由自家后端，所以纯静态托管（GitHub Pages）就能打开在线后台，无需服务器。
//                    前提：Keystatic Cloud 里已建好 astro-nav/my-nav 并绑定 GitHub 仓库。
//    github        : 自建 GitHub App + 自托管 SSR (/api/keystatic)，必须有 Node 宿主。
//                    用 KEYSTATIC_STORAGE=github 配合 `pnpm build:admin` 构建。
//                    ⚠️ 二者互斥：cloud 模式下 @keystatic/core 会让本地 API 路由全部返回 404。
// 注意：本文件会被 KeystaticAdmin.tsx `import config from '../../keystatic.config'`
// 打进**浏览器** bundle（makePage(config)），而浏览器里没有 process 全局 ——
// 直接写 process.env.X 会抛 ReferenceError，整个后台岛屿水合失败 → /keystatic 白屏。
// 取值三条路，保证任何环境下都不会崩、且值正确：
//   1. Node / 构建期：读 process.env.KEYSTATIC_STORAGE（astro.config.mjs 里也 define 了它）；
//   2. 浏览器：读 astro.config.mjs 注入的 __KEYSTATIC_STORAGE__（构建期已替换成字面量）；
//   3. 两者都拿不到（例如 define 被误删）：退回 undefined → 落到 cloud 分支。
declare const __KEYSTATIC_STORAGE__: string | undefined;

const storageEnv = typeof process !== 'undefined'
  ? process.env.KEYSTATIC_STORAGE
  : (typeof __KEYSTATIC_STORAGE__ !== 'undefined' ? __KEYSTATIC_STORAGE__ : undefined);

const remoteStorage = storageEnv === 'github'
  ? { kind: 'github', repo: { owner: 'san-ren', name: 'my-nav' } } as const
  : { kind: 'cloud' } as const;

export default config({
  // 本地开发：直接读写磁盘 (local)，不需要任何登录；线上：见上方 remoteStorage 注释
  storage: isDev ? { kind: 'local' } : remoteStorage,
  cloud: { project: 'astro-nav/my-nav' },
  ui: {
    brand: { name: 'MyNav 管理后台' },
    navigation: {
      '核心数据': ['groups', 'pages'], 
      '内容创作': ['guides', 'changelog'],
      '全局设置': ['siteSettings'],
    },
  },
  singletons: {
    siteSettings: singleton({
      label: '⚙️ 网站配置',
      path: 'src/content/site-settings/config',
      format: { data: 'json' },
      schema: {
        title: fields.text({ label: '网站标题' }),
        description: fields.text({ label: '网站描述', multiline: true }),
        author: fields.text({ label: '页脚作者' }),
        githubUser: fields.text({ label: 'GitHub 用户名' }),
        githubRepo: fields.text({ label: 'GitHub 仓库名' }),
      },
    }),
  },
  collections: {
    pages: collection({
      label: '页面元数据',
      slugField: 'id',
      path: 'src/content/nav-pages/*',
      format: { data: 'json' },
      columns: ['name', 'sortOrder'],
      schema: {
        name: fields.text({ label: '页面名称' }),
        id: fields.text({ label: '页面ID', validation: { length: { min: 1 } } }),
        icon: fields.text({ label: '图标' }),
        sortOrder: fields.integer({ label: '权重', defaultValue: 10 }),
      },
    }),
    groups: collection({
      label: '内容分组',
      slugField: 'id',
      path: 'src/content/nav-groups/*',
      format: { data: 'json' },
      columns: ['visualTag', 'name', 'pageName'],
      schema: {
        pageName: fields.relationship({ 
          label: '📄 所属页面', 
          collection: 'pages', 
          validation: { isRequired: true },
          description: '选择该分组归属于哪个页面'
        }),
        visualTag: fields.select({
          label: '👀 视觉标记',
          description: '用于在后台列表中快速区分属于不同大类的分组',
          options: VISUAL_TAGS,
          defaultValue: ' ',
        }),
        name: fields.text({ label: '📝 分组名称', validation: { isRequired: true } }),
        pageConfig: fields.object(
          {
            sortPrefix: fields.select({
              label: '🔢 排序权重', 
              options: ['01','02','03','04','05','06','07','08','09','10','11','12'].map(v => ({ label: v, value: v })),
              defaultValue: '10',
            }),
          },
          { label: '⚙️ 分组配置', description: '设置分组在页面内的排序顺序' }
        ),
        id: fields.text({ label: '🆔 系统ID', validation: { length: { min: 1 } } }),
        resources: resourceArray('📚 分组直属资源', '未命名资源'),
        categories: fields.array(
          fields.object({
            name: fields.text({ label: '分类名称' }),
            resources: resourceArray('📚 直属资源列表', '未命名资源'),
            tabs: fields.array(
              fields.object({
                tabName: fields.text({ label: '标签页名称' }),
                list: resourceArray('资源列表', '资源'),
              }),
              { label: '🗂️ 标签页', itemLabel: (props) => props.fields.tabName.value || '标签页' }
            )
          }),
          { label: '📑 分类列表', itemLabel: (props) => props.fields.name.value || '未命名分类' }
        ),
      },
    }),
    guides: collection({
      label: '教程文章',
      slugField: 'title',
      path: 'src/content/guides/*',
      format: { contentField: 'body' },
      columns: ['title', 'status', 'date'],
      schema: {
        title: fields.text({ label: '标题' }),
        status: fields.select({
          label: '状态',
          options: [{ label: '已发布', value: 'published' }, { label: '草稿', value: 'draft' }],
          defaultValue: 'draft'
        }),
        date: fields.date({ label: '日期', defaultValue: { kind: 'today' } }),
        cover: fields.image({ label: '封面', directory: 'public/images/guides/covers', publicPath: '/images/guides/covers/' }),
        body: fields.mdx({
          label: '正文 (MDX)',
          options: { ...commonMdxOptions, image: { directory: 'public/images/guides', publicPath: '/images/guides/' } },
          components: mdxBlocks, 
        })
      }
    }),
    changelog: collection({
      label: '更新记录',
      slugField: 'version',
      path: 'src/content/changelog/*',
      format: { contentField: 'content' },
      columns: ['version', 'type','status', 'date'],
      schema: {
        version: fields.text({ label: '版本号', validation: { length: { min: 1 } } }),
        type: fields.select({
          label: '更新类型',
          options: [
            { label: '🚀 功能更新', value: 'function' },
            { label: '📚 内容更新', value: 'content' },
          ],
          defaultValue: 'function', 
        }),
        date: fields.date({ label: '发布日期', defaultValue: { kind: 'today' }, validation: { isRequired: true } }),
        status: fields.select({
          label: '发布状态',
          options: [
            { label: '✅ 已发布', value: 'published' },
            { label: '📝 草稿 (不显示)', value: 'draft' }
          ],
          defaultValue: 'published'
        }),
        content: fields.mdx({
          label: '更新详情 (MDX源码)',
          options: { ...commonMdxOptions, image: { directory: 'public/images/changelog', publicPath: '/images/changelog/' } },
          components: mdxBlocks,
        }),
      },
    }),
  },
});
