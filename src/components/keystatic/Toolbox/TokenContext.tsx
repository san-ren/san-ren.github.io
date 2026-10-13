import { createContext, useContext } from 'react';

export interface TokenContextType {
  githubToken: string;
  setGithubToken: (token: string) => void;
  saveToken: () => void;
  resetToken: () => void;
  /**
   * 输入框内容是否已经保存过（用于禁用「保存」按钮）。
   * ⚠️ 它不等于「已配置 Token」：初始值与「重置」之后都是 true。
   */
  isTokenSaved: boolean;
  /** 浏览器存储里是否真的存在 Token —— 显示「已保存 / 未配置」只能看它 */
  hasStoredToken: boolean;
}

export const TokenContext = createContext<TokenContextType>({
  githubToken: '',
  setGithubToken: () => {},
  saveToken: () => {},
  resetToken: () => {},
  isTokenSaved: false,
  hasStoredToken: false,
});

export const useGithubToken = () => useContext(TokenContext);
