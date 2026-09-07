import { useMemo, useRef, useState, type FormEvent } from 'react';
import { ArrowDownLeft, ChevronLeft, ChevronRight, Pencil, Plus, ReceiptText, Trash2, Wallet } from 'lucide-react';
import { EmptyState, Field, Modal, PageHeading, SubmitButton } from '../components/ui';
import { api, deleteItem, saveItem } from '../lib/api';
import { currencies, money, shortDate, today } from '../lib/format';
import type { Expense, ModuleProps } from '../lib/types';

const categories = ['餐飲', '超市', '交通', '住宿', '學習', '旅行', '購物', '其他'];
const categoryColors = ['#232320', '#4b4b45', '#71716a', '#92928a', '#a9a99f', '#bfbfb4', '#d3d3c9', '#e6e6de'];
const messageOf = (error: unknown) => error instanceof Error ? error.message : '儲存失敗，請稍後再試';
const monthLabel = (month: string) => `${month.slice(0, 4)} 年 ${Number(month.slice(5))} 月`;
function adjacentMonth(month: string, direction: number) {
  const date = new Date(`${month}-01T12:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + direction);
  return date.toISOString().slice(0, 7);
}

export default function Expenses({ data, refresh, notify, initialCreate = false }: ModuleProps & { initialCreate?: boolean }) {
  const { profile, expenses } = data;
  const [month, setMonth] = useState(() => today(profile.timeZone).slice(0, 7));
  const [editing, setEditing] = useState<Expense | 'new' | null>(initialCreate ? 'new' : null);
  const [budgetOpen, setBudgetOpen] = useState(false);
  const [deleting, setDeleting] = useState<Expense | null>(null);
  const monthlyExpenses = useMemo(() => expenses.filter(item => item.date.startsWith(month)).sort((a, b) => b.date.localeCompare(a.date)), [expenses, month]);
  const monthTotal = monthlyExpenses.reduce((total, item) => total + item.baseAmount, 0);
  const semesterTotal = expenses.filter(item => (!profile.semesterStart || item.date >= profile.semesterStart) && (!profile.semesterEnd || item.date <= profile.semesterEnd)).reduce((total, item) => total + item.baseAmount, 0);
  const monthlyBudget = profile.monthlyBudgets[month] || 0;
  const categoryTotals = categories.map((category, index) => ({ category, color: categoryColors[index]!, total: monthlyExpenses.filter(item => item.category === category).reduce((sum, item) => sum + item.baseAmount, 0) })).filter(item => item.total > 0);
  const customCategories = [...new Set(monthlyExpenses.map(item => item.category))].filter(category => !categories.includes(category));
  customCategories.forEach(category => categoryTotals.push({ category, color: '#b2b2aa', total: monthlyExpenses.filter(item => item.category === category).reduce((sum, item) => sum + item.baseAmount, 0) }));
  const chartMonths = Array.from({ length: 6 }, (_, index) => adjacentMonth(month, index - 5));
  const chartTotals = chartMonths.map(value => expenses.filter(item => item.date.startsWith(value)).reduce((sum, item) => sum + item.baseAmount, 0));
  const chartMaximum = Math.max(...chartTotals, 1);
  let cumulative = 0;
  const segments = categoryTotals.filter(item => item.total > 0).map(item => {
    const start = cumulative;
    cumulative += item.total / monthTotal * 100;
    return `${item.color} ${start}% ${cumulative}%`;
  });

  return <div className="page-stack">
    <PageHeading eyebrow="Money, mindfully" title="生活記帳" description="記錄每一筆日常，把預算留給真正想做的事。" action={<button className="button" onClick={() => setEditing('new')}><Plus size={17} />記一筆</button>} />
    <div className="stat-grid">
      <div className="stat-card"><span className="muted">本月支出 · {profile.baseCurrency}</span><strong>{money(monthTotal, profile.baseCurrency)}</strong><span className="muted">{monthlyExpenses.length} 筆記錄 · {monthLabel(month)}</span></div>
      <div className="stat-card"><span className="muted">本月可用預算</span><strong>{monthlyBudget > 0 ? money(monthlyBudget - monthTotal, profile.baseCurrency) : '尚未設定'}</strong><span className="muted">{monthlyBudget > 0 ? `預算 ${money(monthlyBudget, profile.baseCurrency)}` : '為這個月安排一份預算'}</span></div>
      <div className="stat-card"><span className="muted">學期剩餘預算</span><strong>{profile.semesterBudget > 0 ? money(profile.semesterBudget - semesterTotal, profile.baseCurrency) : '尚未設定'}</strong><button className="button ghost" onClick={() => setBudgetOpen(true)}><Pencil size={14} />調整預算</button></div>
    </div>
    {monthlyBudget > 0 && <div className="panel" style={{ padding: '20px 24px' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}><span>本月預算使用</span><span style={{ overflowWrap: 'anywhere' }} className={monthTotal > monthlyBudget ? 'error-message' : 'muted'}>{Math.round(monthTotal / monthlyBudget * 100).toLocaleString()}%{monthTotal > monthlyBudget ? ' · 已超出預算' : ''}</span></div>
      <div role="progressbar" aria-label="本月預算使用比例" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(Math.round(monthTotal / monthlyBudget * 100), 100)} style={{ height: 5, borderRadius: 8, background: '#e9e9e2', overflow: 'hidden' }}><div style={{ height: '100%', width: `${Math.min(monthTotal / monthlyBudget * 100, 100)}%`, background: monthTotal > monthlyBudget ? '#b24b40' : '#34342e' }} /></div>
    </div>}
    <div className="finance-chart-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))', gap: 20 }}>
      <section className="panel"><div className="panel-header"><h2>每月支出</h2><span className="muted">近六個月 · {profile.baseCurrency}</span></div>
        {chartTotals.some(value => value > 0) ? <svg viewBox="0 0 420 215" role="img" aria-label={chartMonths.map((value, index) => `${monthLabel(value)}支出${money(chartTotals[index]!, profile.baseCurrency)}`).join('，')} style={{ width: '100%', display: 'block' }}>
          {[0, 1, 2].map(index => <line key={index} x1="22" x2="407" y1={40 + index * 65} y2={40 + index * 65} stroke="#eeeeea" />)}
          {chartTotals.map((total, index) => {
            const height = total / chartMaximum * 125;
            return <g key={chartMonths[index]}><title>{monthLabel(chartMonths[index]!)}：{money(total, profile.baseCurrency)}</title>{total > 0 && <rect x={37 + index * 64} y={170 - height} width="29" height={height} rx="4" fill={index === 5 ? '#30302b' : '#d8d8cf'} />}<text x={51.5 + index * 64} y="195" textAnchor="middle" fill="#85857c" fontSize="12">{Number(chartMonths[index]!.slice(5))} 月</text>{total > 0 && <text x={51.5 + index * 64} y={158 - height} textAnchor="middle" fill="#68685f" fontSize="10">{new Intl.NumberFormat('zh-TW', { notation: 'compact', maximumFractionDigits: 1 }).format(total)}</text>}</g>;
          })}
        </svg> : <EmptyState icon={Wallet} title="讓日常慢慢有跡可循" description="開始記帳後，這裡會呈現近六個月的實際支出。" />}
      </section>
      <section className="panel"><div className="panel-header"><h2>支出分布</h2><span className="muted">{Number(month.slice(5))} 月</span></div>
        {monthTotal > 0 ? <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 28, padding: '12px 0 24px', flexWrap: 'wrap' }}>
          <div role="img" aria-label={`分類支出：${categoryTotals.map(item => `${item.category}${money(item.total, profile.baseCurrency)}`).join('，')}`} style={{ width: 156, height: 156, flexShrink: 0, borderRadius: '50%', background: `conic-gradient(${segments.join(',')})`, display: 'grid', placeItems: 'center' }}><div style={{ background: '#fff', borderRadius: '50%', width: 112, height: 112, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: 5 }}><span className="muted" style={{ fontSize: 11 }}>本月合計</span><strong style={{ fontSize: 17 }}>{Math.round(monthTotal).toLocaleString()}</strong><span className="muted" style={{ fontSize: 10 }}>{profile.baseCurrency}</span></div></div>
          <div style={{ display: 'grid', gap: 9, flex: '1 1 145px', maxWidth: 225 }}>{categoryTotals.map(item => <div key={item.category} style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 12 }}><span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: '50%', background: item.color }} /><span style={{ flex: 1 }}>{item.category}</span><span className="muted">{Math.round(item.total / monthTotal * 100)}%</span></div>)}</div>
        </div> : <EmptyState icon={ReceiptText} title={monthlyExpenses.length ? '本月換算合計為 0' : '這個月，還是一張白紙'} description={monthlyExpenses.length ? '微小外幣支出換算至本位幣後可能四捨五入為 0，原始金額仍保留於明細。' : '記下第一筆消費，就能看見生活的重心。'} />}
      </section>
    </div>
    <section className="panel"><div className="panel-header" style={{ flexWrap: 'wrap', gap: 12 }}><h2>支出明細 <span className="muted" style={{ fontWeight: 400, fontSize: 12 }}> / {monthlyExpenses.length}</span></h2><div style={{ display: 'flex', alignItems: 'center', gap: 4 }}><button className="icon-button" aria-label="上一個月" onClick={() => setMonth(adjacentMonth(month, -1))}><ChevronLeft size={16} /></button><input type="month" aria-label="查看支出月份" value={month} onChange={event => event.target.value && setMonth(event.target.value)} style={{ maxWidth: 155, fontSize: 12, minHeight: 44 }} /><button className="icon-button" aria-label="下一個月" onClick={() => setMonth(adjacentMonth(month, 1))}><ChevronRight size={16} /></button></div></div>
      {monthlyExpenses.length ? <div>{monthlyExpenses.map(item => <div className="list-row expense-entry" key={item.id}>
        <div className="finance-entry-icon"><ArrowDownLeft size={17} /></div><div className="finance-entry-details"><strong style={{ fontSize: 13, display: 'block', overflowWrap: 'anywhere' }}>{item.note || item.category}</strong><span className="muted" style={{ fontSize: 11 }}>{shortDate(item.date)} · {item.category}</span></div><div className="finance-entry-amount"><strong style={{ fontSize: 13 }}>{money(item.amount, item.currency)}</strong>{item.currency !== item.baseCurrency && <div className="muted" style={{ fontSize: 10 }}>{money(item.baseAmount, item.baseCurrency)}</div>}</div><div className="finance-entry-actions"><button className="icon-button" aria-label={`編輯${item.note || item.category}支出`} onClick={() => setEditing(item)}><Pencil size={15} /></button><button className="icon-button" aria-label={`刪除${item.note || item.category}支出`} onClick={() => setDeleting(item)}><Trash2 size={15} /></button></div>
      </div>)}</div> : <EmptyState icon={ReceiptText} title="還沒有支出記錄" description="從一杯咖啡、一張車票開始，記下交換生活。" action={<button className="button secondary" onClick={() => setEditing('new')}><Plus size={16} />新增支出</button>} />}
      <p className="muted" style={{ fontSize: 11, margin: '16px 0 0', lineHeight: 1.7 }}>外幣支出依消費日可取得的最近匯率換算，並保留原始幣別與換算匯率。</p>
    </section>
    {editing && <ExpenseForm key={editing === 'new' ? 'new' : editing.id} item={editing === 'new' ? undefined : editing} {...{ data, refresh, notify }} onClose={() => setEditing(null)} />}
    {budgetOpen && <BudgetForm {...{ data, refresh, notify, month }} onClose={() => setBudgetOpen(false)} />}
    {deleting && <DeleteExpense item={deleting} refresh={refresh} notify={notify} onClose={() => setDeleting(null)} />}
  </div>;
}

function ExpenseForm({ item, data, refresh, notify, onClose }: ModuleProps & { item?: Expense; onClose: () => void }) {
  const savedId = useRef(item?.id);
  const [values, setValues] = useState({ amount: item?.amount.toString() || '', currency: item?.currency || data.profile.localCurrency, category: item?.category || '餐飲', note: item?.note || '', date: item?.date || today(data.profile.timeZone) });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try { const result = await saveItem('expenses', { ...values, amount: Number(values.amount) }, savedId.current) as Expense; savedId.current = result.id; await refresh(); notify(item ? '支出已更新' : '已記下這筆支出'); onClose(); }
    catch (failure) { setError(messageOf(failure)); }
    finally { setBusy(false); }
  }
  return <Modal title={item ? '編輯支出' : '記一筆支出'} onClose={() => !busy && onClose()}><form onSubmit={submit} className="form-grid finance-form">
    <Field label="金額"><input type="number" inputMode="decimal" min="0.01" max="1000000000" step="0.01" required autoFocus value={values.amount} onChange={event => setValues({ ...values, amount: event.target.value })} placeholder="0.00" /></Field>
    <Field label="幣別"><select value={values.currency} onChange={event => setValues({ ...values, currency: event.target.value })}>{[...new Set([...currencies, values.currency])].map(currency => <option key={currency}>{currency}</option>)}</select></Field>
    <Field label="分類"><select value={values.category} onChange={event => setValues({ ...values, category: event.target.value })}>{[...new Set([...categories, values.category])].map(category => <option key={category}>{category}</option>)}</select></Field>
    <Field label="日期"><input type="date" required max={today(data.profile.timeZone)} value={values.date} onChange={event => setValues({ ...values, date: event.target.value })} /></Field>
    <Field label="備註（選填）"><input maxLength={300} value={values.note} onChange={event => setValues({ ...values, note: event.target.value })} placeholder="這筆錢花在哪裡？" /></Field>
    {item && item.currency !== item.baseCurrency && <p className="muted" style={{ fontSize: 12 }}>原記錄匯率：1 {item.currency} = {item.rate.toFixed(4)} {item.baseCurrency}（{shortDate(item.rateDate)}）</p>}
    {error && <p role="alert" className="error-message">{error}</p>}<div className="form-actions"><button type="button" className="button secondary" disabled={busy} onClick={onClose}>取消</button><SubmitButton busy={busy}>儲存支出</SubmitButton></div>
  </form></Modal>;
}

function BudgetForm({ data, month, refresh, notify, onClose }: ModuleProps & { month: string; onClose: () => void }) {
  const [semesterBudget, setSemesterBudget] = useState(String(data.profile.semesterBudget || ''));
  const [monthlyBudget, setMonthlyBudget] = useState(String(data.profile.monthlyBudgets[month] || ''));
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try { await api('/profile', { method: 'PUT', body: JSON.stringify({ ...data.profile, semesterBudget: Number(semesterBudget || 0), monthlyBudgets: { ...data.profile.monthlyBudgets, [month]: Number(monthlyBudget || 0) } }) }); await refresh(); notify('預算已更新'); onClose(); }
    catch (failure) { setError(messageOf(failure)); } finally { setBusy(false); }
  }
  return <Modal title="安排你的生活預算" onClose={() => !busy && onClose()}><form className="form-grid finance-form" onSubmit={submit}><p className="muted">以 {data.profile.baseCurrency} 計算。填寫 0 或留空可取消預算。</p><Field label="學期總預算"><input type="number" inputMode="decimal" min="0" max="1000000000" step="0.01" autoFocus value={semesterBudget} onChange={event => setSemesterBudget(event.target.value)} placeholder="0.00" /></Field><Field label={`${monthLabel(month)}預算`}><input type="number" inputMode="decimal" min="0" max="1000000000" step="0.01" value={monthlyBudget} onChange={event => setMonthlyBudget(event.target.value)} placeholder="0.00" /></Field>{error && <p className="error-message" role="alert">{error}</p>}<div className="form-actions"><button type="button" className="button secondary" disabled={busy} onClick={onClose}>取消</button><SubmitButton busy={busy}>儲存預算</SubmitButton></div></form></Modal>;
}

function DeleteExpense({ item, refresh, notify, onClose }: { item: Expense; refresh: () => Promise<void>; notify: (message: string) => void; onClose: () => void }) {
  const removed = useRef(false);
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  async function remove() { setBusy(true); setError(''); try { if (!removed.current) { await deleteItem('expenses', item.id); removed.current = true; } await refresh(); notify('支出已刪除'); onClose(); } catch (failure) { setError(messageOf(failure)); } finally { setBusy(false); } }
  return <Modal title="刪除這筆支出？" onClose={() => !busy && onClose()}><p>{item.note || item.category} · {money(item.amount, item.currency)}</p><p className="muted">刪除後無法復原，預算與統計會一併更新。</p>{error && <p role="alert" className="error-message">{error}</p>}<div className="form-actions"><button className="button secondary" disabled={busy} onClick={onClose}>保留</button><button className="button danger" disabled={busy} onClick={remove}>{busy ? '刪除中…' : '確認刪除'}</button></div></Modal>;
}
