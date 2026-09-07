import { useEffect, useState } from 'react';
import { ArrowUpRight, ArrowRight, Plane, Wallet, CreditCard, ListChecks, CalendarDays, ArrowLeftRight, MapPin, Plus, SlidersHorizontal, ChevronRight, Clock3, CircleCheck, ShieldCheck } from 'lucide-react';
import type { AppData, Page, RateResult } from '../lib/types';
import { api } from '../lib/api';
import { daysUntil, money, shortDate, today } from '../lib/format';
const shortcuts = [
  { page: 'expenses', icon: Wallet, label: '記帳預算', sub: '每一筆，都有數' },
  { page: 'documents', icon: CreditCard, label: '證件夾', sub: '重要的，帶在身邊' },
  { page: 'checklists', icon: ListChecks, label: '生活清單', sub: '一件一件，慢慢來' },
  { page: 'courses', icon: CalendarDays, label: '我的課表', sub: '留一點時間給探索' },
  { page: 'exchange', icon: ArrowLeftRight, label: '匯率換算', sub: '換個幣種，一樣清楚' },
  { page: 'places', icon: MapPin, label: '地點收藏', sub: '把想去的地方留下' },
] as const;
export default function Home({ data, navigate, onAddExpense }: { data: AppData; navigate: (page: Page) => void; onAddExpense: () => void }) {
  const p = data.profile;
  const now = today(p.timeZone);
  const [rate, setRate] = useState<RateResult | null>(null);
  const [rateFailed, setRateFailed] = useState(false);
  const [rateRevision, setRateRevision] = useState(0);
  useEffect(() => {
    const update = () => { if (navigator.onLine && document.visibilityState === 'visible') setRateRevision(value => value + 1); };
    const interval = setInterval(update, 60 * 60 * 1000);
    window.addEventListener('focus', update);
    return () => { clearInterval(interval); window.removeEventListener('focus', update); };
  }, []);
  useEffect(() => { let live = true; setRate(null); setRateFailed(false); api<RateResult>(`/rates?base=${p.localCurrency}&quote=${p.baseCurrency}`).then(r => { if (live) setRate(r); }).catch(() => { if (live) setRateFailed(true); }); return () => { live = false; }; }, [p.localCurrency, p.baseCurrency, rateRevision]);
  const departure = daysUntil(p.departureDate, now), returning = daysUntil(p.returnDate, now);
  const duration = p.semesterStart && p.semesterEnd ? daysUntil(p.semesterEnd, p.semesterStart)! : 0;
  const elapsed = p.semesterStart ? -daysUntil(p.semesterStart, now)! : 0;
  const progress = duration > 0 ? Math.min(100, Math.max(0, Math.round(elapsed / duration * 100))) : null;
  const month = now.slice(0, 7), budget = p.monthlyBudgets[month] || 0;
  const spent = data.expenses.filter(e => e.date.startsWith(month) && e.baseCurrency === p.baseCurrency).reduce((sum, e) => sum + e.baseAmount, 0);
  const expiring = data.documents.filter(d => d.expiryDate && daysUntil(d.expiryDate, now)! <= 30).sort((a, b) => a.expiryDate.localeCompare(b.expiryDate));
  const tasks = data.checklists.filter(t => !t.done && t.dueDate && t.dueDate <= now).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const weekday = new Date(`${now}T12:00:00`).getDay() || 7;
  const courses = data.courses.filter(c => c.weekday === weekday).sort((a, b) => a.startPeriod - b.startPeriod);
  const configured = Boolean(p.school && p.departureDate && p.returnDate);
  return <div className="page-stack home-page">
    <header className="page-heading"><div><p className="page-eyebrow">{new Intl.DateTimeFormat('zh-TW', { timeZone: p.timeZone, month: 'long', day: 'numeric', weekday: 'long' }).format(new Date())}</p><h1>{p.name ? `${p.name}，今天也好。` : '我的交換生活'}</h1><p className="page-description">一段新的日常，每一天都算數。</p></div><button className="button quick-add" onClick={onAddExpense}><Plus size={18} /><span>記一筆</span></button></header>
    {!configured && <button className="setup-banner" onClick={() => navigate('settings')}><span className="setup-symbol"><SlidersHorizontal size={20} /></span><span><strong>第一站，設定你的交換旅程</strong><small>填入目的地與日期，讓這裡成為你的日常。</small></span><ChevronRight size={20} /></button>}
    <section className="journey-card" aria-label="交換旅程進度"><div className="journey-top"><span className="journey-label"><Plane size={18} /> 我的交換旅程</span><span className="journey-badge">{departure === null ? '準備出發' : departure > 0 ? '期待出發' : returning !== null && returning < 0 ? '旅程已珍藏' : '正在旅途中'}</span></div><div className="journey-route"><div><span>從熟悉的日常</span><h2>{p.destination || '下一站，等你填上'}</h2><p>{p.school || '世界很大，從這一站開始。'}</p></div><ArrowUpRight className="journey-arrow" size={52} strokeWidth={1.2} /></div><div className="journey-metrics"><div><span>{departure !== null && departure < 0 ? '已出發' : '距離出發'}</span><strong>{departure === null ? '—' : Math.abs(departure)}<small>天</small></strong></div><div><span>學期進度</span><strong>{progress === null ? '—' : progress}<small>%</small></strong></div><div><span>{returning !== null && returning < 0 ? '返程至今' : '距離返程'}</span><strong>{returning === null ? '—' : Math.abs(returning)}<small>天</small></strong></div></div><div className="journey-progress"><div style={{ width: `${progress || 0}%` }} /></div><div className="journey-dates"><span>{shortDate(p.departureDate)}</span><span>{shortDate(p.returnDate)}</span></div></section>
    <section className="shortcut-section"><div className="section-title"><h2>生活的每一面</h2><span>隨手打開，安心安排</span></div><div className="shortcut-grid">{shortcuts.map(({ page, icon: Icon, label, sub }) => <button className="shortcut" key={page} onClick={() => navigate(page)}><div className="shortcut-top"><Icon size={23} strokeWidth={1.55} /><ArrowUpRight size={15} /></div><strong>{label}</strong><small>{sub}</small></button>)}</div></section>
    <div className="home-overview-grid"><section className="panel budget-summary"><div className="panel-header"><h2>本月的小帳本</h2><Wallet size={18} /></div><span className="muted">{budget ? '還可以安心花' : '本月已支出'}</span><p className="overview-number">{money(budget ? budget - spent : spent, p.baseCurrency)}</p>{budget ? <><div className="progress-track"><div style={{ width: `${Math.min(100, spent / budget * 100)}%`, background: spent > budget ? '#ad3434' : undefined }} /></div><div className="spread muted"><small>已用 {money(spent, p.baseCurrency)}</small><small>預算 {money(budget, p.baseCurrency)}</small></div></> : <p className="muted small">設定一份預算，給生活多一點從容。</p>}<button className="text-button" onClick={() => navigate('expenses')}>{budget ? '查看收支' : '設定月預算'}<ArrowRight size={15} /></button></section>
    <section className="panel rate-summary"><div className="panel-header"><h2>今日匯率</h2><ArrowLeftRight size={18} /></div><span className="muted">1 {p.localCurrency} 換算為</span><p className="overview-number">{rate ? rate.rate.toFixed(4) : '—'} <small>{p.baseCurrency}</small></p><p className="muted small">{rate ? `${rate.date} 參考匯率${rate.stale ? ' · 使用最近快取' : ''}` : rateFailed ? '暫時無法取得匯率，稍後再試。' : '正在取得最新參考匯率…'}</p><button className="text-button" onClick={() => navigate('exchange')}>打開換算器<ArrowRight size={15} /></button></section></div>
    <div className="home-overview-grid"><section className="panel"><div className="panel-header"><h2>今天，留意一下</h2><Clock3 size={18} /></div>{tasks.length + courses.length === 0 ? <div className="calm-empty"><CircleCheck size={26} strokeWidth={1.4} /><p>今天沒有待辦日程</p><small>把時間留給新的發現。</small></div> : <div>{courses.map(c => <button className="home-agenda-row" key={c.id} onClick={() => navigate('courses')}><span className="agenda-period">{c.startPeriod}–{c.endPeriod}<small>節</small></span><span><strong>{c.name}</strong><small>{c.room || '未填教室'}</small></span><ChevronRight size={16} /></button>)}{tasks.slice(0, 3).map(t => <button className="home-agenda-row" key={t.id} onClick={() => navigate('checklists')}><ListChecks size={22} /><span><strong>{t.title}</strong><small>{t.dueDate < now ? '已逾期 · ' : '今日截止 · '}{shortDate(t.dueDate)}</small></span><ChevronRight size={16} /></button>)}</div>}</section>
    <section className="panel"><div className="panel-header"><h2>證件提醒</h2><ShieldCheck size={18} /></div>{expiring.length ? expiring.slice(0, 3).map(d => <button className="home-agenda-row" key={d.id} onClick={() => navigate('documents')}><CreditCard size={22} /><span><strong>{d.name}</strong><small className={daysUntil(d.expiryDate, now)! <= 7 ? 'expiry-danger' : 'expiry-warning'}>{daysUntil(d.expiryDate, now)! < 0 ? '已到期' : `${daysUntil(d.expiryDate, now)} 天後到期`}</small></span><ChevronRight size={16} /></button>) : <div className="calm-empty"><ShieldCheck size={26} strokeWidth={1.4} /><p>{data.documents.length ? '近期沒有即將到期的證件' : '重要文件，妥善收藏'}</p><button className="text-button" onClick={() => navigate('documents')}>{data.documents.length ? '查看證件夾' : '新增第一張證件'}<ArrowRight size={15} /></button></div>}</section></div>
    {(p.address || p.studentId) && <section className="personal-note"><span className="muted">我的隨身資訊</span>{p.studentId && <p>學號　{p.studentId}</p>}{p.address && <p>住址　{p.address}</p>}</section>}
    <footer className="home-footer"><span>Exchange life.</span><span>生活在別處，日子在這裡。</span></footer>
  </div>;
}
