// src/components/keystatic/Toolbox/ToolboxPage.tsx
import React, { useState, useCallback, createContext, useContext, useEffect } from 'react';
import { Link, Wrench, ArrowLeft, AlertTriangle, Edit3, CheckCircle, RefreshCw } from 'lucide-react';
import { LinkChecker } from './LinkChecker';
import { ResourceEditor } from './ResourceEditor';
import { TABS as TAB_STYLES, MODAL, BUTTON } from './toolbox-shared';

// --- ✅ 全局Token上下文 ---
import { TokenContext } from './TokenContext';

// localStorage key
const GITHUB_TOKEN_KEY = 'toolbox_github_token';

/** 读取浏览器里已保存的 Token（无 window 的环境返回空串） */
const readStoredGithubToken = () =>
  typeof window !== 'undefined' ? localStorage.getItem(GITHUB_TOKEN_KEY) || '' : '';

// --- 类型定义 ---
type TabId = 'link' | 'editor';

interface Tab {
  id: TabId;
  label: string;
  icon: React.ReactNode;
  description: string;
}

// --- 样式常量 ---
const STYLES = {
  container: {
    minHeight: '100vh',
    background: '#f8fafc',
  },
  header: {
    background: 'white',
    borderBottom: '1px solid #e2e8f0',
    padding: '8px 20px',    // 👈 标题区域内边距：上下16px，左右24px
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    position: 'sticky' as const,
    top: 0,
    zIndex: 100,
  },
  title: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',           // 👈 图标与文字之间的间距
  },
  adminLink: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    color: '#2563eb',
    textDecoration: 'none',
    fontSize: '14px',
    fontWeight: 500,
    padding: '8px 16px',
    borderRadius: '6px',
    background: '#eff6ff',
    transition: 'all 0.2s',
  },
};

// --- 标签页配置 ---
const TABS: Tab[] = [
  {
    id: 'link',
    label: '链接检测',
    icon: <Link size={18} />,
    description: '检测GitHub仓库和网站链接有效性',
  },
  {
    id: 'editor',
    label: '资源编辑',
    icon: <Edit3 size={18} />,
    description: '批量添加和转移资源',
  },
];

// --- 主组件 ---
export function ToolboxPage() {
  const [activeTab, setActiveTab] = useState<TabId>('link');
  const [pendingTab, setPendingTab] = useState<TabId | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  // ✅ 全局GitHub Token状态 - 支持localStorage持久化
  const [githubToken, setGithubTokenState] = useState(readStoredGithubToken);
  
  // 追踪是否有未保存的更改
  const [isTokenSaved, setIsTokenSaved] = useState(true);
  // 存储里是否真的配置了 Token（显示「已保存 / 未配置」的依据）
  // ⚠️ 不能拿 isTokenSaved 顶替：它初始与「重置」后都是 true，
  //    于是项目转移 / 换浏览器 / 清过存储时明明没有 Token，界面却显示「已保存」。
  const [hasStoredToken, setHasStoredToken] = useState(() => readStoredGithubToken().length > 0);

  // 子组件数据状态（由子组件通过回调更新）
  const [hasUnsavedData, setHasUnsavedData] = useState({
    link: false,
    editor: false,
  });

  // ✅ 运行中的任务和Toast通知
  const [runningTasks, setRunningTasks] = useState<{ [key: string]: { name: string, progress: number } }>({});
  const [toasts, setToasts] = useState<{ id: number, message: string }[]>([]);

  const addToast = useCallback((message: string) => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  }, []);

  const handleTaskStart = useCallback((id: string, name: string) => {
    setRunningTasks(prev => ({ ...prev, [id]: { name, progress: 0 } }));
  }, []);

  const handleTaskProgress = useCallback((id: string, progress: number) => {
    setRunningTasks(prev => ({ ...prev, [id]: { ...prev[id], progress } }));
  }, []);

  const handleTaskEnd = useCallback((id: string, message?: string) => {
    setRunningTasks(prev => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    if (message) {
      addToast(message);
    }
  }, [addToast]);

  // 设置Token（标记为未保存）
  const setGithubToken = useCallback((token: string) => {
    setGithubTokenState(token);
    setIsTokenSaved(false);
  }, []);

  // 保存Token到localStorage（顺带去掉粘贴时可能带上的空白）
  const saveToken = useCallback(() => {
    if (typeof window !== 'undefined') {
      const value = githubToken.trim();
      localStorage.setItem(GITHUB_TOKEN_KEY, value);
      setGithubTokenState(value);
      setIsTokenSaved(true);
      setHasStoredToken(value.length > 0);
    }
  }, [githubToken]);

  // 重置Token
  const resetToken = useCallback(() => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(GITHUB_TOKEN_KEY);
      setGithubTokenState('');
      setIsTokenSaved(true);
      setHasStoredToken(false);
    }
  }, []);

  // 请求切换标签
  const requestTabChange = useCallback((targetTab: TabId) => {
    // 如果当前标签有未保存数据，显示确认弹窗
    if (hasUnsavedData[activeTab]) {
      setPendingTab(targetTab);
      setShowConfirmModal(true);
    } else {
      setActiveTab(targetTab);
    }
  }, [activeTab, hasUnsavedData]);

  // 确认切换
  const confirmSwitch = useCallback(() => {
    if (pendingTab) {
      // 清除之前标签的数据状态
      setHasUnsavedData(prev => ({ ...prev, [activeTab]: false }));
      setActiveTab(pendingTab);
    }
    setShowConfirmModal(false);
    setPendingTab(null);
  }, [pendingTab, activeTab]);

  // 取消切换
  const cancelSwitch = useCallback(() => {
    setShowConfirmModal(false);
    setPendingTab(null);
  }, []);

  // 子组件更新数据状态
  // 值没变就返回原对象，避免无意义的重渲染（配合子组件的 effect 可防止无限更新循环）
  const updateDataStatus = useCallback((tab: TabId, hasData: boolean) => {
    setHasUnsavedData(prev => (prev[tab] === hasData ? prev : { ...prev, [tab]: hasData }));
  }, []);

  // ✅ 使用 useCallback 缓存传递给子组件的回调函数，避免无限渲染循环
  const handleLinkDataStatusChange = useCallback((hasData: boolean) => {
    updateDataStatus('link', hasData);
  }, [updateDataStatus]);

  const handleEditorDataStatusChange = useCallback((hasData: boolean) => {
    updateDataStatus('editor', hasData);
  }, [updateDataStatus]);

  const renderContent = () => {
    return (
      <>
        <div style={{ display: activeTab === 'link' ? 'block' : 'none' }}>
          <LinkChecker 
            onDataStatusChange={handleLinkDataStatusChange} 
            onTaskStart={handleTaskStart}
            onTaskProgress={handleTaskProgress}
            onTaskEnd={handleTaskEnd}
          />
        </div>
        <div style={{ display: activeTab === 'editor' ? 'block' : 'none' }}>
          <ResourceEditor 
            onDataStatusChange={handleEditorDataStatusChange} 
            onTaskStart={handleTaskStart}
            onTaskProgress={handleTaskProgress}
            onTaskEnd={handleTaskEnd}
          />
        </div>
      </>
    );
  };


  // ✅ Token上下文值
  const tokenContextValue = {
    githubToken,
    setGithubToken,
    saveToken,
    resetToken,
    isTokenSaved,
    hasStoredToken,
  };

  return (
    // ✅ 用 TokenContext.Provider 包裹整个组件
    <TokenContext.Provider value={tokenContextValue}>
      <div style={STYLES.container}>
        {/* 顶部导航 */}
        <div style={STYLES.header}>
          <div style={STYLES.title}>
            <div style={{
              width: '40px',
              height: '40px',
              borderRadius: '10px',
              background: 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
            }}>
              <Wrench size={22} />
            </div>
            <div>
              <h1 style={{ fontSize: '18px', fontWeight: 700, color: '#1e293b', margin: 0 }}>
                工具箱
              </h1>
              <p style={{ fontSize: '12px', color: '#64748b', margin: 0 }}>
                导航站资源管理工具集
              </p>
            </div>
          </div>
          
          {/* 中间进度区 */}
          <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '32px' }}>
            {Object.values(runningTasks).map((task, idx) => (
              <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#f1f5f9', padding: '4px 12px', borderRadius: '20px', fontSize: '13px', color: '#334155' }}>
                <RefreshCw size={14} style={{ color: '#3b82f6' }} className="animate-spin" />
                <span>{task.name}: {task.progress}%</span>
              </div>
            ))}
          </div>
          
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <a 
              href="/keystatic" 
              style={STYLES.adminLink}
            >
              <ArrowLeft size={16} />
              返回后台
            </a>
          </div>
        </div>

        {/* 标签页导航 */}
        <div style={TAB_STYLES.main}>
          {TABS.map(tab => (
            <button
              key={tab.id}
              className="toolbox-main-tab"
              onClick={() => requestTabChange(tab.id)}
              style={{
                ...TAB_STYLES.mainTab(activeTab === tab.id),
              }}
              title={tab.description}
            >
              {tab.icon}
              {tab.label}
              {/* 数据状态指示器 */}
              {hasUnsavedData[tab.id] && (
                <span style={{
                  position: 'absolute',
                  top: '8px',
                  right: '8px',
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  background: '#f59e0b',
                }} />
              )}
            </button>
          ))}
        </div>

        {/* 内容区域 */}
        <div style={{ padding: '0' }} className="tab-content">
          {renderContent()}
        </div>

        {/* Toasts */}
        <div style={{ position: 'fixed', top: '24px', right: '24px', zIndex: 1000, display: 'flex', flexDirection: 'column', gap: '8px', pointerEvents: 'none' }}>
          {toasts.map(toast => (
            <div key={toast.id} style={{
              background: 'white',
              borderLeft: '4px solid #22c55e',
              boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -4px rgba(0,0,0,0.1)',
              padding: '12px 16px',
              borderRadius: '6px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              animation: 'slideInRight 0.3s ease-out forwards',
              pointerEvents: 'auto',
            }}>
              <CheckCircle size={18} style={{ color: '#22c55e' }} />
              <span style={{ fontSize: '14px', color: '#1e293b', fontWeight: 500 }}>{toast.message}</span>
            </div>
          ))}
        </div>

        {/* 确认切��弹窗 */}
        {showConfirmModal && (
          <div style={MODAL.overlay} onClick={cancelSwitch}>
            <div style={MODAL.content} onClick={e => e.stopPropagation()}>
              <div style={MODAL.title}>
                <AlertTriangle size={24} style={{ color: '#f59e0b' }} />
                确认切换？
              </div>
              
              <p style={MODAL.text}>
                当前页面有未处理的数据，请注意提示。
                <br /><br />
                确定要切换吗？
              </p>
              
              <div style={MODAL.buttons}>
                <button onClick={cancelSwitch} style={BUTTON.secondary}>
                  取消
                </button>
                <button onClick={confirmSwitch} style={BUTTON.primary}>
                  确认切换
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </TokenContext.Provider>
  );
}
