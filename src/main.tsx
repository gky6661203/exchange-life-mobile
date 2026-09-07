import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';
import './modules.css';
import './finance.css';

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: boolean }> {
  state = { error: false };
  static getDerivedStateFromError() { return { error: true }; }
  render() { return this.state.error ? <main className="connection-state"><h1>頁面暫時無法顯示</h1><p>已儲存的資料仍然安全。請重新開啟頁面。</p><button className="button" onClick={() => location.reload()}>重新載入</button></main> : this.props.children; }
}
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><ErrorBoundary><App /></ErrorBoundary></React.StrictMode>);
if (import.meta.env.PROD && 'serviceWorker' in navigator) window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => {}); });
