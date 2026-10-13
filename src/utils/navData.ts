/**
 * 导航数据聚合 —— index.astro 与 [id].astro 的唯一入口
 *
 * 原先两个页面各自维护一份「读取集合 → 过滤归属 → 深拷贝 → 关联教程 → 排序」，
 * 以及一份 buildShareTree 和一张图标映射表，现统一收敛到这里。
 * 改导航数据结构时只改本文件。
 */
import { getCollection } from 'astro:content';
import {
  LayoutDashboard,
  Star,
  Code,
  Palette,
  Clapperboard,
  Headphones,
  Image,
  Video,
  Hammer,
  Settings,
  Briefcase,
  Network,
  Download,
} from 'lucide-react';
import { attachGuidesToResources } from './guideMatcher';
import { PLATFORM_NONE, getGithubRepoKey, isKnownPlatform } from './resourcePlatforms.mjs';
// 平台自动探测缓存：由构建期的 platform-detect 集成（src/utils/platformDetect.mjs）维护
import platformCache from '../data/platform-cache.json';

/** 页面图标映射表（对应 nav-pages JSON 的 icon 字段） */
export const NAV_ICONS: Record<string, any> = {
  Star,
  Code,
  Palette,
  LayoutDashboard,
  Clapperboard,
  Headphones,
  Image,
  Video,
  Hammer,
  Settings,
  Briefcase,
  Network,
  Download,
};

/** 按图标名取组件，未配置或名称未知时回退到 LayoutDashboard */
export function getNavIcon(name?: string) {
  return (name && NAV_ICONS[name]) || LayoutDashboard;
}

/**
 * 支持平台解析，三档优先级（真源见 src/utils/resourcePlatforms.mjs）：
 *   1. platforms 含 none 哨兵      → 强制不显示（自动探测也不再兜底）
 *   2. platforms 填了已知平台值    → 以手动为准
 *   3. 其余（空数组 / 未填写）     → 回退到 src/data/platform-cache.json 的自动探测结果
 * 结果写回 resource.platforms，SiteCard 直接透传渲染徽章。
 */
function resolveResourcePlatforms(resource: any) {
  const manual = Array.isArray(resource.platforms) ? resource.platforms : [];

  if (manual.includes(PLATFORM_NONE)) {
    resource.platforms = [];
    return resource;
  }

  const manualKnown = manual.filter(isKnownPlatform);
  if (manualKnown.length > 0) {
    resource.platforms = manualKnown;
    return resource;
  }

  const repoKey = getGithubRepoKey(resource.url);
  const detected = repoKey ? (platformCache as any).repos?.[repoKey]?.platforms : null;
  resource.platforms = Array.isArray(detected) ? detected.filter(isKnownPlatform) : [];
  return resource;
}

/** 遍历分组内的全部资源（分组直属 / 分类直属 / Tab 列表） */
function forEachResource(groups: any[], visit: (resource: any) => void) {
  for (const group of groups) {
    (group.resources || []).forEach(visit);
    for (const category of group.categories || []) {
      (category.resources || []).forEach(visit);
      for (const tab of category.tabs || []) {
        (tab.list || []).forEach(visit);
      }
    }
  }
}

/**
 * 读取并组装导航数据：页面 → 分组（含分类 / Tab）
 * - 深拷贝分组数据，避免污染 Astro Content 集合缓存
 * - 自动关联教程（填充 guide_id）
 * - 分组按 pageConfig.sortPrefix 升序，页面按 sortOrder 升序
 */
export async function loadNavResources(): Promise<any[]> {
  const rawPages = await getCollection('nav-pages');
  const rawGroups = await getCollection('nav-groups');
  const guides = await getCollection('guides');

  return rawPages
    .map((page) => {
      let currentGroups = rawGroups
        .filter((g) => {
          const groupPageId =
            typeof g.data.pageName === 'object' ? g.data.pageName.id : g.data.pageName;
          return groupPageId === page.id;
        })
        .map((g) => JSON.parse(JSON.stringify(g.data))); // 深拷贝以避免污染原始 Collection 缓存

      // 自动填充 guide_id
      currentGroups = attachGuidesToResources(currentGroups, guides);

      // 解析支持平台（手动优先 / 自动探测兜底），供站点卡片浮窗展示徽章
      forEachResource(currentGroups, resolveResourcePlatforms);

      currentGroups.sort((a, b) => {
        const sortA = Number(a.pageConfig?.sortPrefix || 10);
        const sortB = Number(b.pageConfig?.sortPrefix || 10);
        return sortA - sortB;
      });

      return {
        ...page.data,
        id: page.id,
        groups: currentGroups,
      };
    })
    .sort((a, b) => (a.sortOrder || 99) - (b.sortOrder || 99));
}

/**
 * 构建分享导出用的嵌套树：分组 → 分类 → Tab → 卡片
 */
export function buildShareTree(groups: any[]) {
  return groups.map((group: any, groupIdx: number) => {
    const node = {
      id: `group-${groupIdx}`,
      type: 'group',
      name: group.name,
      children: [] as any[],
    };
    if (group.resources && group.resources.length > 0) {
      node.children.push(...group.resources.map((r: any) => ({ type: 'card', data: r })));
    }
    (group.categories || []).forEach((cat: any, catIdx: number) => {
      const catId = `cat-${groupIdx}-${catIdx}`;
      const catNode = {
        id: catId,
        type: 'category',
        name: cat.name,
        children: [] as any[],
      };
      if (cat.resources && cat.resources.length > 0) {
        catNode.children.push(...cat.resources.map((r: any) => ({ type: 'card', data: r })));
      }
      (cat.tabs || []).forEach((tab: any, tabIdx: number) => {
        const tabId = `pane-${groupIdx}-${catIdx}-${tabIdx}`;
        const tabNode = {
          id: tabId,
          type: 'tab',
          name: tab.tabName,
          children: [] as any[],
        };
        if (tab.list && tab.list.length > 0) {
          tabNode.children.push(...tab.list.map((r: any) => ({ type: 'card', data: r })));
        }
        if (tabNode.children.length > 0) catNode.children.push(tabNode);
      });
      if (catNode.children.length > 0) node.children.push(catNode);
    });
    return node;
  });
}
