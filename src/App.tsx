import { lazy, Suspense, useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowRight, ArrowUpRight, House, Wallet, CreditCard, ListChecks, CalendarDays, ArrowLeftRight, MapPin, Settings2, PanelTop, LockKeyhole, LoaderCircle, Menu, WifiOff, RefreshCw, Check } from 'lucide-react';
import type { AppData, Page } from './lib/types';
import { api } from './lib/api';
import Home from './pages/Home';
import Settings from './pages/Settings';
import Report from './pages/Report';
import { Modal } from './components/ui';
const Expenses = lazy(() => import('./pages/Expenses'));
const Documents = lazy(() => import('./pages/Documents'));
const Checklists = lazy(() => import('./pages/Checklists'));
const Courses = lazy(() => import('./pages/Courses'));
const Exchange = lazy(() => import('./pages/Exchange'));
const Places = lazy(() => import('./pages/Places'));
const navigation = [
  { page: 'home', icon: House, label: '生活總覽' }, { page: 'expenses', icon: Wallet, label: '記帳預算' },
  { page: 'documents', icon: CreditCard, label: '證件夾' }, { page: 'checklists', icon: ListChecks, label: '生活清單' },
  { page: 'courses', icon: CalendarDays, label: '我的課表' }, { page: 'exchange', icon: ArrowLeftRight, label: '匯率換算' },
  { page: 'places', icon: MapPin, label: '地點收藏' },
] as const;
function Brand() { return <span className="brand"><span className="brand-mark"><ArrowRight size={23} /><i /></span><span>Exchange life<span className="brand-dot">.</span><small>交換生活手帳</small></span></span>; }
function Login({ configured, onLogin }: { configured: boolean; onLogin: () => Promise<void> }) {
  const [password, setPassword] = useState(''), [confirm, setConfirm] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault(); setError('');
    if (!configured && password !== confirm) { setError('兩次輸入的密碼不一致'); return; }
    setBusy(true);
    try { await api(`/auth/${configured ? 'login' : 'setup'}`, { method: 'POST', body: JSON.stringify({ password }) }); setPassword(''); setConfirm(''); await onLogin(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return <main className="login-page"><div className="login-story"><Brand /><div className="login-story-content"><div className="login-line-art"><ArrowUpRight size={120} strokeWidth={.7} /></div><h1>生活在別處，<br />日子在這裡。</h1><p>從出發的期待，到回程的行李。<br />把交換生活裡重要的小事，好好收在一起。</p><div className="login-tags"><span>日常</span><span>探索</span><span>成長</span></div></div><span className="login-story-footer">Your semester, in one place.</span></div><section className="login-form-side"><div className="mobile-login-brand"><Brand /></div><div className="login-form-card"><span className="login-lock"><LockKeyhole size={24} strokeWidth={1.5} /></span><p className="page-eyebrow">A little space of your own</p><h2>{configured ? '歡迎回到你的日常' : '給新生活，一個開始'}</h2><p className="muted">{configured ? '輸入私人密碼，打開你的交換生活手帳。' : '設定一組私人密碼，讓證件與生活記錄只屬於你。'}</p><form onSubmit={submit}><label className="field"><span>私人密碼</span><input type="password" autoComplete={configured ? 'current-password' : 'new-password'} minLength={configured ? 1 : 12} maxLength={256} required placeholder={configured ? '輸入你的密碼' : '至少 12 個字元'} value={password} onChange={e => setPassword(e.target.value)} /></label>{!configured && <label className="field"><span>再次確認密碼</span><input type="password" autoComplete="new-password" minLength={12} maxLength={256} required value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="再輸入一次" /></label>}{error && <p className="error-message" role="alert">{error}</p>}<button type="submit" className="button login-submit" disabled={busy}>{busy ? <LoaderCircle size={18} className="spin" /> : null}{busy ? '正在開啟…' : configured ? '打開我的手帳' : '建立我的私人手帳'}<ArrowRight size={18} /></button></form><p className="login-privacy"><LockKeyhole size={13} />保持登入 30 天，隨手打開每一天。</p></div><div className="login-bottom">不趕路，去感受路。</div></section></main>;
}
export default function App() {
  const [status, setStatus] = useState<{ authenticated: boolean; configured: boolean } | null>(null);
  const [data, setData] = useState<AppData | null>(null), [error, setError] = useState('');
  const [page, setPage] = useState<Page>('home'), [more, setMore] = useState(false), [toast, setToast] = useState('');
  const [quickExpense, setQuickExpense] = useState(false);
  const [online, setOnline] = useState(navigator.onLine), [syncing, setSyncing] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const refresh = useCallback(async () => { const next = await api<AppData>('/data'); setData(next); setError(''); }, []);
  const boot = useCallback(async () => { setError(''); try { const next = await api<{ authenticated: boolean; configured: boolean }>('/auth/status'); setStatus(next); if (next.authenticated) await refresh(); else setData(null); } catch (e) { setError((e as Error).message); } }, [refresh]);
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
  if (!status || (status.authenticated && !data)) return <main className="connection-state"><Brand />{error ? <><WifiOff size={30} /><h1>暫時連不上你的手帳</h1><p className="muted">{error}</p><button className="button" onClick={boot}>重新連線</button></> : <><LoaderCircle className="spin" size={26} /><p className="muted">正在打開你的日常…</p></>}</main>;
  if (!status.authenticated || !data) return <Login configured={status.configured} onLogin={boot} />;
  const props = { data, refresh, notify };
  return <div className="app-layout"><a className="skip-link" href="#main-content">跳至主要內容</a><aside className="sidebar"><button className="brand-button" onClick={() => navigate('home')} aria-label="回到生活總覽"><Brand /></button><div className="sidebar-section-label">我的生活</div><nav aria-label="主要導覽">{navigation.map(({ page: target, icon: Icon, label }) => <button key={target} className={`nav-item ${page === target ? 'active' : ''}`} onClick={() => navigate(target)} aria-current={page === target ? 'page' : undefined}><Icon size={19} strokeWidth={1.7} />{label}{page === target && <span className="nav-active-dot" />}</button>)}</nav><div className="sidebar-bottom"><div className="sidebar-note"><PanelTop size={22} strokeWidth={1.3} /><p>給重要的日子，<br />留一個位置。</p><small>慢慢來，也很好。</small></div><button className={`nav-item ${page === 'settings' ? 'active' : ''}`} onClick={() => navigate('settings')}><Settings2 size={19} />個人設定</button><div className="sidebar-user"><span className="avatar">{data.profile.name.slice(0, 1) || '我'}</span><div><strong>{data.profile.name || '我的交換手帳'}</strong><small>{data.profile.school || '一段新生活的開始'}</small></div></div></div></aside>
  <div className="workspace"><header className="topbar"><div className="topbar-brand"><Brand /></div><div className="breadcrumb">我的空間<span>/</span>{navigation.find(n => n.page === page)?.label || (page === 'report' ? '交換總結' : '個人設定')}</div><div className="topbar-actions"><span className={`sync-status ${online ? '' : 'offline'}`}><i />{online ? '私人手帳' : '目前離線'}</span><button className="icon-button" aria-label="同步資料" disabled={syncing || !online} onClick={async () => { setSyncing(true); try { await refresh(); notify('已同步最新資料'); } catch (e) { notify((e as Error).message); } finally { setSyncing(false); } }}><RefreshCw size={16} className={syncing ? 'spin' : ''} /></button><button className="topbar-avatar avatar" aria-label="個人設定" onClick={() => navigate('settings')}>{data.profile.name.slice(0, 1) || '我'}</button></div></header>{!online && <div className="offline-banner"><WifiOff size={16} />目前離線，連線後即可儲存與同步資料。</div>}<main id="main-content" className="main-content"><Suspense fallback={<div className="page-loading"><LoaderCircle className="spin" />正在打開…</div>}>{page === 'home' ? <Home data={data} navigate={navigate} onAddExpense={() => { navigate('expenses'); setQuickExpense(true); }} /> : page === 'expenses' ? <Expenses {...props} initialCreate={quickExpense} /> : page === 'documents' ? <Documents {...props} /> : page === 'checklists' ? <Checklists {...props} /> : page === 'courses' ? <Courses {...props} /> : page === 'exchange' ? <Exchange {...props} /> : page === 'places' ? <Places {...props} /> : page === 'report' ? <Report data={data} navigate={navigate} /> : <Settings key={data.profile.baseCurrency} {...props} navigate={navigate} logout={logout} />}</Suspense></main></div>
  <nav className="bottom-nav" aria-label="手機導覽">{navigation.filter(n => ['home','expenses','checklists','documents'].includes(n.page)).map(({ page: target, icon: Icon, label }) => <button key={target} className={page === target ? 'active' : ''} aria-current={page === target ? 'page' : undefined} onClick={() => navigate(target)}><Icon size={21} strokeWidth={page === target ? 2.1 : 1.6} /><span>{target === 'home' ? '總覽' : target === 'expenses' ? '記帳' : target === 'checklists' ? '清單' : '證件'}</span></button>)}<button className={['courses','exchange','places','settings','report'].includes(page) ? 'active' : ''} onClick={() => setMore(true)}><Menu size={21} /><span>更多</span></button></nav>
  {more && <Modal title="生活裡的更多" onClose={() => setMore(false)}><div className="more-grid">{[...navigation.filter(n => ['courses','exchange','places'].includes(n.page)), { page: 'settings' as const, icon: Settings2, label: '個人設定' }].map(({ page: target, icon: Icon, label }) => <button key={target} onClick={() => navigate(target)}><Icon size={25} strokeWidth={1.5} /><span>{label}</span><ArrowUpRight size={16} /></button>)}</div></Modal>}
  {toast && <div className="toast" role="status"><Check size={17} />{toast}</div>}</div>;
}
