import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';
import './modules.css';
import './finance.css';

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: boolean }> {
  state = { error: false };
  static getDerivedStateFromError() { return { error: true }; }
  render() { return this.state.error ? <main className="connection-state"><h1>页面暂时无法显示</h1><p>已保存的资料仍然安全。请重新打开页面。</p><button className="button" onClick={() => location.reload()}>重新载入</button></main> : this.props.children; }
}
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><ErrorBoundary><App /></ErrorBoundary></React.StrictMode>);
if (import.meta.env.PROD && 'serviceWorker' in navigator) window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => {}); });




