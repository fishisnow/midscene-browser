import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
// 导入i18n配置
import './locales/i18n';

const rootEl = document.getElementById('root');
if (rootEl) {
  const root = ReactDOM.createRoot(rootEl);
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}
