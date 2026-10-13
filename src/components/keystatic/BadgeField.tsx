// src/components/keystatic/BadgeField.tsx
import React, { useState, useEffect, useRef } from 'react';
import { fields } from '@keystatic/core';

// ==========================================
// 1. 徽章规则定义 (配置区域)
// ==========================================
const BADGE_RULES = [
  {
    id: 'github',
    domain: 'github.com',
    label: 'GitHub 项目',
    color: 'bg-gray-100 text-gray-800',
    options: [
      { label: 'Stars', value: 'stars' },
      { label: 'Last Commit', value: 'last_commit' },
      { label: 'Version', value: 'version' },
      // License 已下线（浮窗改展示「支持平台」徽章，见 src/utils/resourcePlatforms.mjs）
      { label: 'Issues', value: 'issues' },
      { label: 'Forks', value: 'forks' },
    ]
  },
  {
    id: 'vscode',
    domain: 'marketplace.visualstudio.com',
    label: 'VS Code 插件',
    color: 'bg-blue-50 text-blue-700',
    options: [
      { label: 'Installs (安装量)', value: 'installs' },
      { label: 'Version (版本)', value: 'version' },
      { label: 'Rating (评分)', value: 'rating' },
      { label: 'Last Updated (最近更新)', value: 'last_updated' },
      { label: 'Downloads', value: 'downloads' },
    ]
  },
  {
    id: 'npm',
    domain: 'npmjs.com',
    label: 'NPM 包',
    color: 'bg-red-50 text-red-700',
    options: [
      { label: 'Downloads (下载量)', value: 'downloads' },
      { label: 'Version (版本)', value: 'version' },
      { label: 'License (协议)', value: 'license' },
    ]
  },
  {
    id: 'pypi',
    domain: 'pypi.org',
    label: 'Python 包 (PyPI)',
    color: 'bg-yellow-50 text-yellow-800',
    options: [
      { label: 'Downloads', value: 'downloads' },
      { label: 'Version', value: 'version' },
      { label: 'Python Versions', value: 'py_versions' },
    ]
  }
];

// 根据 URL 获取对应的规则
const getBadgeRule = (url: string) => {
  if (!url) return null;
  return BADGE_RULES.find(rule => url.includes(rule.domain)) || null;
};

// ==========================================
// 2. 观察者组件
// ==========================================
function BadgeObserverComponent(props: any) {
  // value 存储的是被勾选（隐藏）的徽章 key 数组
  const { value, onChange } = props;
  const currentHiddenBadges = Array.isArray(value) ? value : [];

  const [activeRule, setActiveRule] = useState<any>(null);
  const [targetUrl, setTargetUrl] = useState('');

  // --- DOM 查找逻辑：寻找 URL 输入框 ---
  const findUrlInput = () => {
    // 获取所有可见的文本输入框
    const inputs = document.querySelectorAll('input:not([type="hidden"]):not([disabled])');
    
    for (let i = 0; i < inputs.length; i++) {
      const input = inputs[i] as HTMLInputElement;
      
      // 排除掉之前的 Smart Filler 工具栏的输入框 (如果有 data-id 标记最好，没有则根据 placeholder 判断)
      if (input.placeholder && input.placeholder.includes('粘贴链接')) continue;
      if (input.getAttribute('data-id') === 'icon-input-field') continue; // 排除图标选择器

      // 通过父级容器的 Label 文字来判断
      // 兼容 Keystatic 的 DOM 结构
      const container = input.closest('div[data-layout-span]') || input.closest('label') || input.parentElement?.parentElement;
      const labelText = (container?.textContent || '').toLowerCase();

      // 关键词匹配：只要 Label 里包含这些词，就认为是目标 URL 框
      // 你可以根据你的实际 Label 修改这里，比如 '项目地址', '仓库链接' 等
      const keywords = ['url', 'link', 'address', '地址', '链接', '项目', 'repo'];
      const isOfficial = labelText.includes('官网') || labelText.includes('official') || labelText.includes('homepage');
      
      // 必须包含关键词，且不能是官网 (通常我们要给项目仓库加徽章，而不是官网)
      if (keywords.some(k => labelText.includes(k)) && !isOfficial) {
        return input;
      }
    }
    return null;
  };

  useEffect(() => {
    let inputElement: HTMLInputElement | null = null;
    let checkTimer: NodeJS.Timeout;

    const handleInputChange = (e: Event) => {
      const target = e.target as HTMLInputElement;
      const newUrl = target.value;
      setTargetUrl(newUrl);
      
      const newRule = getBadgeRule(newUrl);
      
      // 如果切换了平台（例如从 GitHub 改成 NPM），清空旧的勾选状态
      setActiveRule((prevRule: any) => {
        if (prevRule?.id !== newRule?.id) {
            // 这里我们不做 onChange([]) 清空，防止用户误触导致配置丢失
            // 如果你希望严格一点，可以在这里调用 onChange([]) 
        }
        return newRule;
      });
    };

    // 轮询查找 DOM (Keystatic 动态渲染，可能组件加载时 Input 还没出来)
    const initObserver = () => {
      inputElement = findUrlInput();
      if (inputElement) {
        // 1. 初始化读取
        setTargetUrl(inputElement.value);
        setActiveRule(getBadgeRule(inputElement.value));
        
        // 2. 添加监听 (涵盖手动输入 + 自动填充触发的 input 事件)
        inputElement.addEventListener('input', handleInputChange);
        clearInterval(checkTimer);
      }
    };

    // 每 300ms 找一次，最多找 10 次
    let attempts = 0;
    checkTimer = setInterval(() => {
      initObserver();
      attempts++;
      if (attempts > 10) clearInterval(checkTimer);
    }, 300);

    return () => {
      if (checkTimer) clearInterval(checkTimer);
      if (inputElement) {
        inputElement.removeEventListener('input', handleInputChange);
      }
    };
  }, []);

  // --- 处理点击 ---
  const toggleBadge = (badgeValue: string) => {
    if (currentHiddenBadges.includes(badgeValue)) {
      // 移除 (显示)
      onChange(currentHiddenBadges.filter((v: string) => v !== badgeValue));
    } else {
      // 添加 (隐藏)
      onChange([...currentHiddenBadges, badgeValue]);
    }
  };

  // --- 渲染 ---
  if (!activeRule) {
    return (
      <div style={{ padding: '12px', border: '1px dashed #cbd5e1', borderRadius: '6px', background: '#f8fafc', color: '#64748b', fontSize: '13px' }}>
        {targetUrl 
          ? `暂不支持该域名的徽章显示 (${new URL(targetUrl).hostname || targetUrl})` 
          : '等待上方填入项目链接...'}
      </div>
    );
  }

  return (
    <div style={{ padding: '12px', border: '1px solid #e2e8f0', borderRadius: '8px', background: 'white' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', paddingBottom: '8px', borderBottom: '1px solid #f1f5f9' }}>
        <span className={`px-2 py-0.5 rounded text-xs font-bold ${activeRule.color}`}>
          {activeRule.label}
        </span>
        <span style={{ fontSize: '12px', color: '#64748b' }}>
          勾选想要 <b>隐藏 (不显示)</b> 的徽章
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
        {activeRule.options.map((opt: any) => {
          const isHidden = currentHiddenBadges.includes(opt.value);
          return (
            <label 
              key={opt.value}
              style={{ 
                display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 8px', 
                borderRadius: '4px', cursor: 'pointer', fontSize: '13px',
                border: isHidden ? '1px solid #e2e8f0' : '1px solid #bfdbfe',
                background: isHidden ? '#f8fafc' : '#eff6ff',
                opacity: isHidden ? 0.7 : 1
              }}
            >
              <input 
                type="checkbox" 
                checked={isHidden}
                onChange={() => toggleBadge(opt.value)}
                style={{ cursor: 'pointer' }}
              />
              <span style={{ 
                textDecoration: isHidden ? 'line-through' : 'none',
                color: isHidden ? '#94a3b8' : '#1e293b'
              }}>
                {opt.label}
              </span>
            </label>
          )
        })}
      </div>
    </div>
  );
}

// ==========================================
// 3. 导出 Keystatic 字段定义
// ==========================================
// 定义参数类型
type BadgeFieldProps = {
  label: string;
  description?: string;
  defaultValue?: string[];
};

// 导出构造函数
export function badgeListField({
  label,
  description = '',
  defaultValue = []
}: BadgeFieldProps) {
  return {
    kind: 'form',
    label,
    description,
    Input: BadgeObserverComponent, // 直接绑定组件
    
    // 数据处理逻辑
    defaultValue: () => defaultValue,
    validate: (value: unknown) => Array.isArray(value),
    
    // 解析：从文件读到内存
    parse: (value: unknown) => (Array.isArray(value) ? value : []),
    
    // 序列化：从内存存到文件 (MDX/Frontmatter)
    // 这里的 ({ value }) 意味着在 YAML 中存储为标准数组格式
    serialize: (value: unknown) => ({ value }), 
    
    // Reader API (用于前端查询)
    reader: {
      parse: (value: unknown) => (Array.isArray(value) ? value : []),
    }
  } as any; // 使用 as any 规避复杂的类型检查，Keystatic 会识别这个结构
}