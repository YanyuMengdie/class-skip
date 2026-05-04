import React from 'react';
import ReactDOM from 'react-dom/client';
import App from '@/App';

// 版本标记：若控制台看到此行，说明当前运行的是 9.13（含：只学5分钟、多文档问答、本页注释默认收起）
if (typeof window !== 'undefined') console.log('[逃课神器] 9.13 已加载');

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);