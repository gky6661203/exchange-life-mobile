import { useEffect, useState } from 'react';
import { ArrowUpRight, ArrowRight, Plane, Wallet, CreditCard, ListChecks, Plus, SlidersHorizontal, ChevronRight, Clock3, CircleCheck, ShieldCheck } from 'lucide-react';
import type { AppData, Page, RateResult } from '../lib/types';
import { api } from '../lib/api';
import { daysUntil, money, shortDate, today } from '../lib/format';
import { periodRangeLabel } from '../lib/course-times';
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
    <header className="page-heading"><div><p className="page-eyebrow">{new Intl.DateTimeFormat('zh-CN', { timeZone: p.timeZone, month: 'long', day: 'numeric', weekday: 'long' }).format(new Date())}</p><h1>{p.name ? `${p.name}，今天好。` : '交换生活'}</h1></div><button className="button quick-add" onClick={onAddExpense}><Plus size={18} /><span>记一笔</span></button></header>
    {!configured && <button className="setup-banner" onClick={() => navigate('settings')}><span className="setup-symbol"><SlidersHorizontal size={20} /></span><span><strong>设置交换信息</strong><small>目的地、日期、币种</small></span><ChevronRight size={20} /></button>}
    <section className="journey-card" aria-label="交换进度"><div className="journey-top"><span className="journey-label"><Plane size={18} /> 我的交换</span><span className="journey-badge">{departure === null ? '准备出发' : departure > 0 ? '待出发' : returning !== null && returning < 0 ? '已结束' : '进行中'}</span></div><div className="journey-route"><div><span>下一站</span><h2>{p.destination || '未设置'}</h2><p>{p.school || '未填写学校'}</p></div><ArrowUpRight className="journey-arrow" size={52} strokeWidth={1.2} /></div><div className="journey-metrics"><div><span>{departure !== null && departure < 0 ? '已出发' : '距出发'}</span><strong>{departure === null ? '—' : Math.abs(departure)}<small>天</small></strong></div><div><span>学期进度</span><strong>{progress === null ? '—' : progress}<small>%</small></strong></div><div><span>{returning !== null && returning < 0 ? '返程至今' : '距返程'}</span><strong>{returning === null ? '—' : Math.abs(returning)}<small>天</small></strong></div></div><div className="journey-progress"><div style={{ width: `${progress || 0}%` }} /></div><div className="journey-dates"><span>{shortDate(p.departureDate)}</span><span>{shortDate(p.returnDate)}</span></div></section>
    <div className="home-overview-grid"><section className="panel budget-summary"><div className="panel-header"><h2>本月预算</h2><Wallet size={18} /></div><span className="muted">{budget ? '剩余' : '已支出'}</span><p className="overview-number">{money(budget ? budget - spent : spent, p.baseCurrency)}</p>{budget ? <><div className="progress-track"><div style={{ width: `${Math.min(100, spent / budget * 100)}%`, background: spent > budget ? '#ad3434' : undefined }} /></div><div className="spread muted"><small>已用 {money(spent, p.baseCurrency)}</small><small>预算 {money(budget, p.baseCurrency)}</small></div></> : <p className="muted small">还未设置预算</p>}<button className="text-button" onClick={() => navigate('expenses')}>{budget ? '查看收支' : '设置预算'}<ArrowRight size={15} /></button></section>
    <section className="panel rate-summary"><div className="panel-header"><h2>今日汇率</h2><CreditCard size={18} /></div><span className="muted">1 {p.localCurrency}</span><p className="overview-number">{rate ? rate.rate.toFixed(4) : '—'} <small>{p.baseCurrency}</small></p><p className="muted small">{rate ? `${rate.date}${rate.stale ? ' · 缓存' : ''}` : rateFailed ? '暂时无法获取' : '获取中…'}</p><button className="text-button" onClick={() => navigate('exchange')}>换算<ArrowRight size={15} /></button></section></div>
    <div className="home-overview-grid"><section className="panel"><div className="panel-header"><h2>今天</h2><Clock3 size={18} /></div>{tasks.length + courses.length === 0 ? <div className="calm-empty"><CircleCheck size={26} strokeWidth={1.4} /><p>没有待办日程</p></div> : <div>{courses.map(c => <button className="home-agenda-row" key={c.id} onClick={() => navigate('courses')}><span className="agenda-period">{periodRangeLabel(c.startPeriod, c.endPeriod)}</span><span><strong>{c.name}</strong><small>{c.room || '未填教室'}</small></span><ChevronRight size={16} /></button>)}{tasks.slice(0, 3).map(t => <button className="home-agenda-row" key={t.id} onClick={() => navigate('checklists')}><ListChecks size={22} /><span><strong>{t.title}</strong><small>{t.dueDate < now ? '已逾期 · ' : '今日截止 · '}{shortDate(t.dueDate)}</small></span><ChevronRight size={16} /></button>)}</div>}</section>
    <section className="panel"><div className="panel-header"><h2>证件</h2><ShieldCheck size={18} /></div>{expiring.length ? expiring.slice(0, 3).map(d => <button className="home-agenda-row" key={d.id} onClick={() => navigate('documents')}><CreditCard size={22} /><span><strong>{d.name}</strong><small className={daysUntil(d.expiryDate, now)! <= 7 ? 'expiry-danger' : 'expiry-warning'}>{daysUntil(d.expiryDate, now)! < 0 ? '已到期' : `${daysUntil(d.expiryDate, now)} 天后到期`}</small></span><ChevronRight size={16} /></button>) : <div className="calm-empty"><ShieldCheck size={26} strokeWidth={1.4} /><p>{data.documents.length ? '近期无到期证件' : '暂无证件'}</p><button className="text-button" onClick={() => navigate('documents')}>{data.documents.length ? '查看卡包' : '新增证件'}<ArrowRight size={15} /></button></div>}</section></div>
    {(p.address || p.studentId) && <section className="personal-note"><span className="muted">随身信息</span>{p.studentId && <p>学号　{p.studentId}</p>}{p.address && <p>住址　{p.address}</p>}</section>}
  </div>;
}




