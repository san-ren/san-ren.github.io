// BatchAdder 数据操作函数
import { readContentFile, readContentFiles, writeContentFile } from '../../api-shared/content';
import type { ParsedResource, GroupInfo, AddResult, DuplicateInfo, DuplicateCheckResult } from '../types';

// 获取分组列表
export function getGroups(): GroupInfo[] {
  const groups: GroupInfo[] = [];

  for (const { file, data: json } of readContentFiles('[BatchAdder]')) {
    if (!json || typeof json !== 'object') continue;

    const categories = (json.categories || []).map((cat: any, index: number) => ({
      name: cat.name,
      index,
      tabs: (cat.tabs || []).map((tab: any, tabIndex: number) => ({
        name: tab.tabName || `Tab${tabIndex + 1}`,
        index: tabIndex,
      })),
    }));

    groups.push({
      id: json.id || file.replace('.json', ''),
      name: json.name,
      pageName: json.pageName,
      file,
      categories,
    });
  }

  return groups;
}

// 创建新资源对象
function createNewResource(resource: ParsedResource) {
  return {
    toolbox: null,
    name: resource.title,
    url: resource.url,
    official_site: resource.homepage || '',
    desc: resource.desc,
    icon: resource.icon,
    hide_badges: [],
    // 空数组 = 交给构建期自动探测兜底（手动勾选后以手动为准）
    platforms: [],
    status: 'ok',
  };
}

// 添加资源到分组
export function addResourceToGroup(
  groupFile: string,
  resource: ParsedResource,
  target: { type: 'top' | 'category' | 'tab'; categoryIndex?: number; tabIndex?: number }
): AddResult {
  try {
    const json = readContentFile<any>(groupFile);

    const newResource = createNewResource(resource);

    if (target.type === 'top') {
      if (!json.resources) json.resources = [];
      json.resources.push(newResource);
    } else if (target.type === 'category' && target.categoryIndex !== undefined) {
      if (!json.categories) json.categories = [];
      if (!json.categories[target.categoryIndex]) {
        return { success: false, message: '分类不存在' };
      }
      if (!json.categories[target.categoryIndex].resources) {
        json.categories[target.categoryIndex].resources = [];
      }
      json.categories[target.categoryIndex].resources.push(newResource);
    } else if (target.type === 'tab' && target.categoryIndex !== undefined && target.tabIndex !== undefined) {
      if (!json.categories) json.categories = [];
      if (!json.categories[target.categoryIndex]) {
        return { success: false, message: '分类不存在' };
      }
      if (!json.categories[target.categoryIndex].tabs || !json.categories[target.categoryIndex].tabs[target.tabIndex]) {
        return { success: false, message: 'Tab不存在' };
      }
      if (!json.categories[target.categoryIndex].tabs[target.tabIndex].list) {
        json.categories[target.categoryIndex].tabs[target.tabIndex].list = [];
      }
      json.categories[target.categoryIndex].tabs[target.tabIndex].list.push(newResource);
    }

    writeContentFile(groupFile, json);

    const categoryName = (target.type === 'category' || target.type === 'tab') && target.categoryIndex !== undefined
      ? json.categories[target.categoryIndex]?.name
      : undefined;
    const tabName = target.type === 'tab' && target.categoryIndex !== undefined && target.tabIndex !== undefined
      ? json.categories[target.categoryIndex]?.tabs?.[target.tabIndex]?.tabName
      : undefined;

    return {
      success: true,
      message: '添加成功',
      addedTo: `${json.name}${categoryName ? ' / ' + categoryName : ''}${tabName ? ' / ' + tabName : ''}`,
    };

  } catch (e: any) {
    return { success: false, message: e.message };
  }
}

// 作为新Tab添加资源
export function addAsNewTab(
  groupFile: string,
  categoryIndex: number | undefined,
  tabName: string,
  resources: ParsedResource[]
): AddResult[] {
  const results: AddResult[] = [];

  try {
    const json = readContentFile<any>(groupFile);

    // 创建新Tab
    const newTab = {
      tabName: tabName,
      list: resources.map(r => createNewResource(r))
    };

    if (categoryIndex !== undefined) {
      // 添加到指定分类
      if (!json.categories) json.categories = [];
      if (!json.categories[categoryIndex]) {
        return resources.map(() => ({ success: false, message: '分类不存在' }));
      }
      if (!json.categories[categoryIndex].tabs) {
        json.categories[categoryIndex].tabs = [];
      }
      json.categories[categoryIndex].tabs.push(newTab);
      results.push({
        success: true,
        message: `成功创建Tab「${tabName}」并添加 ${resources.length} 个资源`,
        addedTo: `${json.name} / ${json.categories[categoryIndex].name} / ${tabName}`,
      });
    } else {
      // 添加到分组直属（创建一个新分类来包含这个Tab）
      if (!json.categories) json.categories = [];

      const newCategory = {
        name: tabName,
        resources: [],
        tabs: [newTab]
      };
      json.categories.push(newCategory);

      results.push({
        success: true,
        message: `成功创建分类「${tabName}」并添加Tab，共 ${resources.length} 个资源`,
        addedTo: `${json.name} / ${tabName}`,
      });
    }

    writeContentFile(groupFile, json);
    return results;
  } catch (e: any) {
    return resources.map(() => ({ success: false, message: e.message }));
  }
}

// 作为新分类添加资源
export function addAsNewCategory(
  groupFile: string,
  categoryName: string,
  resources: ParsedResource[]
): AddResult[] {
  const results: AddResult[] = [];

  try {
    const json = readContentFile<any>(groupFile);

    // 创建新分类
    const newCategory = {
      name: categoryName,
      resources: resources.map(r => createNewResource(r)),
      tabs: []
    };

    if (!json.categories) json.categories = [];
    json.categories.push(newCategory);

    writeContentFile(groupFile, json);

    results.push({
      success: true,
      message: `成功创建分类「${categoryName}」并添加 ${resources.length} 个资源`,
      addedTo: `${json.name} / ${categoryName}`,
    });

    return results;
  } catch (e: any) {
    return resources.map(() => ({ success: false, message: e.message }));
  }
}

// 检测重复资源
export function checkDuplicates(resources: ParsedResource[]): DuplicateCheckResult {
  const duplicates: DuplicateInfo[] = [];
  const uniqueResources: ParsedResource[] = [];

  // 内容文件只读一次，避免对每个资源重复读盘
  const contentFiles = readContentFiles<Record<string, any>>('[BatchAdder]');

  for (const resource of resources) {
    let found = false;
    const resourceUrl = resource.url.toLowerCase();
    const resourceHomepage = resource.homepage?.toLowerCase() || '';

    for (const { file, data: json } of contentFiles) {
      if (!json || typeof json !== 'object') continue;

      const groupName = json.name || file;

      // 检查分组直属资源
      if (json.resources && Array.isArray(json.resources)) {
        for (const r of json.resources) {
          const existingUrl = (r.url || '').toLowerCase();
          const existingHomepage = (r.official_site || '').toLowerCase();

          if (existingUrl === resourceUrl ||
              (resourceHomepage && existingUrl === resourceHomepage) ||
              (existingHomepage && resourceUrl === existingHomepage)) {
            duplicates.push({
              url: resource.url,
              title: r.name || resource.title,
              location: `${groupName} (分组直属)`,
              groupFile: file,
            });
            found = true;
            break;
          }
        }
      }

      if (found) break;

      // 检查分类下的资源
      if (json.categories && Array.isArray(json.categories)) {
        for (let catIdx = 0; catIdx < json.categories.length; catIdx++) {
          const cat = json.categories[catIdx];
          const catName = cat.name || `分类${catIdx + 1}`;

          // 检查分类直属资源
          if (cat.resources && Array.isArray(cat.resources)) {
            for (const r of cat.resources) {
              const existingUrl = (r.url || '').toLowerCase();
              const existingHomepage = (r.official_site || '').toLowerCase();

              if (existingUrl === resourceUrl ||
                  (resourceHomepage && existingUrl === resourceHomepage) ||
                  (existingHomepage && resourceUrl === existingHomepage)) {
                duplicates.push({
                  url: resource.url,
                  title: r.name || resource.title,
                  location: `${groupName} / ${catName}`,
                  groupFile: file,
                });
                found = true;
                break;
              }
            }
          }

          if (found) break;

          // 检查Tab中的资源
          if (cat.tabs && Array.isArray(cat.tabs)) {
            for (let tabIdx = 0; tabIdx < cat.tabs.length; tabIdx++) {
              const tab = cat.tabs[tabIdx];
              const tabName = tab.tabName || `Tab${tabIdx + 1}`;

              if (tab.list && Array.isArray(tab.list)) {
                for (const r of tab.list) {
                  const existingUrl = (r.url || '').toLowerCase();
                  const existingHomepage = (r.official_site || '').toLowerCase();

                  if (existingUrl === resourceUrl ||
                      (resourceHomepage && existingUrl === resourceHomepage) ||
                      (existingHomepage && resourceUrl === existingHomepage)) {
                    duplicates.push({
                      url: resource.url,
                      title: r.name || resource.title,
                      location: `${groupName} / ${catName} / ${tabName}`,
                      groupFile: file,
                    });
                    found = true;
                    break;
                  }
                }
              }

              if (found) break;
            }
          }

          if (found) break;
        }
      }

      if (found) break;
    }

    if (!found) {
      uniqueResources.push(resource);
    }
  }

  return {
    isDuplicate: duplicates.length > 0,
    duplicates,
    uniqueResources,
  };
}
