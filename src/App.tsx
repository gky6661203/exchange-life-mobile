import AccountGate from './components/AccountGate';
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRight, ArrowUpRight, House, Wallet, CreditCard, ListChecks, CalendarDays, ArrowLeftRight, MapPin, Settings2, LockKeyhole, LoaderCircle, Menu, WifiOff, RefreshCw, Check, X } from 'lucide-react';
import type { AppData, Page } from './lib/types';
import { api } from './lib/api';
import Home from './pages/Home';
import Settings from './pages/Settings';
import Report from './pages/Report';
const Expenses = lazy(() => import('./pages/Expenses'));
const Documents = lazy(() => import('./pages/Documents'));
const Checklists = lazy(() => import('./pages/Checklists'));
const Courses = lazy(() => import('./pages/Courses'));
const Exchange = lazy(() => import('./pages/Exchange'));
const Places = lazy(() => import('./pages/Places'));
const navigation = [
  { page: 'home', icon: House, label: '总览' }, { page: 'expenses', icon: Wallet, label: '记账预算' },
  { page: 'documents', icon: CreditCard, label: '证件卡包' }, { page: 'checklists', icon: ListChecks, label: '生活清单' },
  { page: 'courses', icon: CalendarDays, label: '课表' }, { page: 'exchange', icon: ArrowLeftRight, label: '汇率' },
  { page: 'places', icon: MapPin, label: '地点' },
] as const;
function Brand() { return <span className="brand"><span className="brand-mark"><ArrowRight size={23} /><i /></span><span>Exchange life<span className="brand-dot">.</span><small>交换生活手账</small></span></span>; }
export default function App() {
  const [status, setStatus] = useState<{ authenticated: boolean; configured: boolean; user?: { email: string; name: string } | null } | null>(null);
  const [data, setData] = useState<AppData | null>(null), [error, setError] = useState('');
  const [page, setPage] = useState<Page>('home'), [more, setMore] = useState(false), [toast, setToast] = useState('');
  const [quickExpense, setQuickExpense] = useState(false);
  const [online, setOnline] = useState(navigator.onLine), [syncing, setSyncing] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const refresh = useCallback(async () => { const next = await api<AppData>('/data'); setData(next); setError(''); }, []);
  const boot = useCallback(async () => { setError(''); try { const next = await api<{ authenticated: boolean; configured: boolean; user?: { email: string; name: string } | null }>('/auth/status'); setStatus(next); if (next.authenticated) await refresh(); else setData(null); } catch (e) { setError((e as Error).message); } }, [refresh]);
  useEffect(() => { void boot(); const expired = () => { setStatus(s => s ? { ...s, authenticated: false } : null); setData(null); setMore(false); }; window.addEventListener('session-expired', expired); return () => window.removeEventListener('session-expired', expired); }, [boot]);
  useEffect(() => { const change = () => { setOnline(navigator.onLine); }; window.addEventListener('online', change); window.addEventListener('offline', change); return () => { window.removeEventListener('online', change); window.removeEventListener('offline', change); }; }, []);
  useEffect(() => {
    if (!status?.authenticated) return;
    const poll = () => { if (document.visibilityState === 'visible' && navigator.onLine) refresh().catch(() => {}); };
    const interval = setInterval(poll, 30000); window.addEventListener('focus', poll); document.addEventListener('visibilitychange', poll);
    return () => { clearInterval(interval); window.removeEventListener('focus', poll); document.removeEventListener('visibilitychange', poll); };
  }, [status?.authenticated, refresh]);
  const notify = useCallback((message: string) => { setToast(message); clearTimeout(timer.current); timer.current = setTimeout(() => setToast(''), 4000); }, []);
  const navigate = (next: Page) => { setPage(next); setQuickExpense(false); setMore(false); window.scrollTo({ top: 0 }); };
  async function logout() { try { await api('/auth/logout', { method: 'POST' }); setData(null); setStatus({ authenticated: false, configured: true }); setPage('home'); } catch (e) { notify((e as Error).message); } }
  if (!status || (status.authenticated && !data)) return <main className="connection-state"><Brand />{error ? <><WifiOff size={30} /><h1>暂时连不上</h1><p className="muted">{error}</p><button className="button" onClick={boot}>重连</button></> : <><LoaderCircle className="spin" size={26} /><p className="muted">打开中…</p></>}</main>;
  if (!status.authenticated || !data) return <AccountGate brand={<Brand />} onLogin={boot} />;
  const props = { data, refresh, notify };
  return <div className="app-layout"><a className="skip-link" href="#main-content">跳至主要内容</a><aside className="sidebar"><button className="brand-button" onClick={() => navigate('home')} aria-label="回到总览"><Brand /></button><div className="sidebar-section-label">菜单</div><nav aria-label="主要导航">{navigation.map(({ page: target, icon: Icon, label }) => <button key={target} className={`nav-item ${page === target ? 'active' : ''}`} onClick={() => navigate(target)} aria-current={page === target ? 'page' : undefined}><Icon size={19} strokeWidth={1.7} />{label}{page === target && <span className="nav-active-dot" />}</button>)}</nav><div className="sidebar-bottom"><button className={`nav-item ${page === 'settings' ? 'active' : ''}`} onClick={() => navigate('settings')}><Settings2 size={19} />设置</button><div className="sidebar-user"><span className="avatar">{data.profile.name.slice(0, 1) || '我'}</span><div><strong>{data.profile.name || '我的交换手账'}</strong><small>{data.profile.school || '未填写学校'}</small></div></div></div></aside>
  <div className="workspace"><header className="topbar"><button className="mobile-menu-trigger" onClick={() => setMore(true)} aria-label="打开菜单"><Menu size={20} /></button><div className="topbar-brand"><Brand /></div><div className="breadcrumb">我的空间<span>/</span>{navigation.find(n => n.page === page)?.label || (page === 'report' ? '交换总结' : '设置')}</div><div className="topbar-actions"><span className={`sync-status ${online ? '' : 'offline'}`}><i />{online ? '已同步' : '离线'}</span><button className="icon-button" aria-label="同步资料" disabled={syncing || !online} onClick={async () => { setSyncing(true); try { await refresh(); notify('已同步'); } catch (e) { notify((e as Error).message); } finally { setSyncing(false); } }}><RefreshCw size={16} className={syncing ? 'spin' : ''} /></button><button className="topbar-avatar avatar" aria-label="设置" onClick={() => navigate('settings')}>{data.profile.name.slice(0, 1) || '我'}</button></div></header>{!online && <div className="offline-banner"><WifiOff size={16} />当前离线，联网后可同步。</div>}<main id="main-content" className="main-content"><Suspense fallback={<div className="page-loading"><LoaderCircle className="spin" />打开中…</div>}>{page === 'home' ? <Home data={data} navigate={navigate} onAddExpense={() => { navigate('expenses'); setQuickExpense(true); }} /> : page === 'expenses' ? <Expenses {...props} initialCreate={quickExpense} /> : page === 'documents' ? <Documents {...props} /> : page === 'checklists' ? <Checklists {...props} /> : page === 'courses' ? <Courses {...props} /> : page === 'exchange' ? <Exchange {...props} /> : page === 'places' ? <Places {...props} /> : page === 'report' ? <Report data={data} navigate={navigate} /> : <Settings key={data.profile.baseCurrency} {...props} navigate={navigate} logout={logout} accountEmail={status.user?.email} />}</Suspense></main></div>
  <nav className="ios-tabbar" aria-label="底部导航">{[{ page: 'home', icon: House, label: '总览' }, { page: 'expenses', icon: Wallet, label: '记账' }, { page: 'documents', icon: CreditCard, label: '卡包' }, { page: 'courses', icon: CalendarDays, label: '课表' }].map(({ page: target, icon: Icon, label }) => <button key={target} className={page === target ? 'active' : ''} aria-current={page === target ? 'page' : undefined} onClick={() => navigate(target as Page)}><Icon size={23} strokeWidth={page === target ? 2.2 : 1.7} /><span>{label}</span></button>)}<button onClick={() => setMore(true)} className={['checklists', 'exchange', 'places', 'settings', 'report'].includes(page) ? 'active' : ''}><Menu size={23} /><span>更多</span></button></nav><button className="mobile-dock-button" onClick={() => setMore(true)} aria-label="打开菜单"><Menu size={22} /><span>菜单</span></button>
  {more && <div className="drawer-backdrop" onClick={event => { if (event.target === event.currentTarget) setMore(false); }}><aside className="mobile-drawer" aria-label="手机菜单"><div className="mobile-drawer-head"><Brand /><button className="icon-button" onClick={() => setMore(false)} aria-label="关闭菜单"><X size={20} /></button></div><nav>{navigation.map(({ page: target, icon: Icon, label }) => <button key={target} className={`nav-item ${page === target ? 'active' : ''}`} onClick={() => navigate(target)}><Icon size={20} />{label}</button>)}<button className={`nav-item ${page === 'settings' ? 'active' : ''}`} onClick={() => navigate('settings')}><Settings2 size={20} />设置</button></nav></aside></div>}
  {toast && <div className="toast" role="status"><Check size={17} />{toast}</div>}</div>;
}




