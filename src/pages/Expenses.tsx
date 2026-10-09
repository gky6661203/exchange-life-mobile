import { useMemo, useRef, useState, type FormEvent } from 'react';
import { ArrowDownLeft, ChevronLeft, ChevronRight, Pencil, Plus, ReceiptText, Trash2, Wallet } from 'lucide-react';
import { EmptyState, Field, Modal, PageHeading, SubmitButton } from '../components/ui';
import { api, deleteItem, saveItem } from '../lib/api';
import { currencies, money, shortDate, today } from '../lib/format';
import type { Expense, ModuleProps } from '../lib/types';

const categories = ['餐饮', '超市', '交通', '住宿', '学习', '旅行', '购物', '其他'];
const categoryColors = ['#232320', '#4b4b45', '#71716a', '#92928a', '#a9a99f', '#bfbfb4', '#d3d3c9', '#e6e6de'];
const messageOf = (error: unknown) => error instanceof Error ? error.message : '保存失败';
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
  const semesterTotal = expenses.filter(item => item.baseCurrency === profile.baseCurrency).reduce((total, item) => total + item.baseAmount, 0);
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
    <PageHeading title="生活记账" action={<button className="button" onClick={() => setEditing('new')}><Plus size={17} />记一笔</button>} />
    <div className="stat-grid">
      <div className="stat-card"><span className="muted">本月支出 · {profile.baseCurrency}</span><strong>{money(monthTotal, profile.baseCurrency)}</strong><span className="muted">{monthlyExpenses.length} 笔记录 · {monthLabel(month)}</span></div>
      <div className="stat-card"><span className="muted">本月可用预算</span><strong>{monthlyBudget > 0 ? money(monthlyBudget - monthTotal, profile.baseCurrency) : '尚未设置'}</strong><span className="muted">{monthlyBudget > 0 ? `预算 ${money(monthlyBudget, profile.baseCurrency)}` : '0'}</span></div>
      <div className="stat-card"><span className="muted">总预算剩余</span><strong>{profile.semesterBudget > 0 ? money(profile.semesterBudget - semesterTotal, profile.baseCurrency) : '尚未设置'}</strong><button className="button ghost" onClick={() => setBudgetOpen(true)}><Pencil size={14} />调整预算</button></div>
    </div>
    {monthlyBudget > 0 && <div className="panel" style={{ padding: '20px 24px' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}><span>本月预算使用</span><span style={{ overflowWrap: 'anywhere' }} className={monthTotal > monthlyBudget ? 'error-message' : 'muted'}>{Math.round(monthTotal / monthlyBudget * 100).toLocaleString()}%{monthTotal > monthlyBudget ? ' · 已超出预算' : ''}</span></div>
      <div role="progressbar" aria-label="本月预算使用比例" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(Math.round(monthTotal / monthlyBudget * 100), 100)} style={{ height: 5, borderRadius: 8, background: '#e9e9e2', overflow: 'hidden' }}><div style={{ height: '100%', width: `${Math.min(monthTotal / monthlyBudget * 100, 100)}%`, background: monthTotal > monthlyBudget ? '#b24b40' : '#34342e' }} /></div>
    </div>}
    <div className="finance-chart-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))', gap: 20 }}>
      <section className="panel"><div className="panel-header"><h2>每月支出</h2><span className="muted">近六个月 · {profile.baseCurrency}</span></div>
        {chartTotals.some(value => value > 0) ? <svg viewBox="0 0 420 215" role="img" aria-label={chartMonths.map((value, index) => `${monthLabel(value)}支出${money(chartTotals[index]!, profile.baseCurrency)}`).join('，')} style={{ width: '100%', display: 'block' }}>
          {[0, 1, 2].map(index => <line key={index} x1="22" x2="407" y1={40 + index * 65} y2={40 + index * 65} stroke="#eeeeea" />)}
          {chartTotals.map((total, index) => {
            const height = total / chartMaximum * 125;
            return <g key={chartMonths[index]}><title>{monthLabel(chartMonths[index]!)}：{money(total, profile.baseCurrency)}</title>{total > 0 && <rect x={37 + index * 64} y={170 - height} width="29" height={height} rx="4" fill={index === 5 ? '#30302b' : '#d8d8cf'} />}<text x={51.5 + index * 64} y="195" textAnchor="middle" fill="#85857c" fontSize="12">{Number(chartMonths[index]!.slice(5))} 月</text>{total > 0 && <text x={51.5 + index * 64} y={158 - height} textAnchor="middle" fill="#68685f" fontSize="10">{new Intl.NumberFormat('zh-CN', { notation: 'compact', maximumFractionDigits: 1 }).format(total)}</text>}</g>;
          })}
        </svg> : <EmptyState icon={Wallet} title="暂无支出" />}
      </section>
      <section className="panel"><div className="panel-header"><h2>支出分布</h2><span className="muted">{Number(month.slice(5))} 月</span></div>
        {monthTotal > 0 ? <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 28, padding: '12px 0 24px', flexWrap: 'wrap' }}>
          <div role="img" aria-label={`分类支出：${categoryTotals.map(item => `${item.category}${money(item.total, profile.baseCurrency)}`).join('，')}`} style={{ width: 156, height: 156, flexShrink: 0, borderRadius: '50%', background: `conic-gradient(${segments.join(',')})`, display: 'grid', placeItems: 'center' }}><div style={{ background: '#fff', borderRadius: '50%', width: 112, height: 112, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: 5 }}><span className="muted" style={{ fontSize: 11 }}>本月合计</span><strong style={{ fontSize: 17 }}>{Math.round(monthTotal).toLocaleString()}</strong><span className="muted" style={{ fontSize: 10 }}>{profile.baseCurrency}</span></div></div>
          <div style={{ display: 'grid', gap: 9, flex: '1 1 145px', maxWidth: 225 }}>{categoryTotals.map(item => <div key={item.category} style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 12 }}><span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: '50%', background: item.color }} /><span style={{ flex: 1 }}>{item.category}</span><span className="muted">{Math.round(item.total / monthTotal * 100)}%</span></div>)}</div>
        </div> : <EmptyState icon={ReceiptText} title={monthlyExpenses.length ? '合计为 0' : '暂无分类'} />}
      </section>
    </div>
    <section className="panel"><div className="panel-header" style={{ flexWrap: 'wrap', gap: 12 }}><h2>支出明细 <span className="muted" style={{ fontWeight: 400, fontSize: 12 }}> / {monthlyExpenses.length}</span></h2><div style={{ display: 'flex', alignItems: 'center', gap: 4 }}><button className="icon-button" aria-label="上一个月" onClick={() => setMonth(adjacentMonth(month, -1))}><ChevronLeft size={16} /></button><input type="month" aria-label="查看支出月份" value={month} onChange={event => event.target.value && setMonth(event.target.value)} style={{ maxWidth: 155, fontSize: 12, minHeight: 44 }} /><button className="icon-button" aria-label="下一个月" onClick={() => setMonth(adjacentMonth(month, 1))}><ChevronRight size={16} /></button></div></div>
      {monthlyExpenses.length ? <div>{monthlyExpenses.map(item => <div className="list-row expense-entry" key={item.id}>
        <div className="finance-entry-icon"><ArrowDownLeft size={17} /></div><div className="finance-entry-details"><strong style={{ fontSize: 13, display: 'block', overflowWrap: 'anywhere' }}>{item.note || item.category}</strong><span className="muted" style={{ fontSize: 11 }}>{shortDate(item.date)} · {item.category}</span></div><div className="finance-entry-amount"><strong style={{ fontSize: 13 }}>{money(item.amount, item.currency)}</strong>{item.currency !== item.baseCurrency && <div className="muted" style={{ fontSize: 10 }}>{money(item.baseAmount, item.baseCurrency)}</div>}</div><div className="finance-entry-actions"><button className="icon-button" aria-label={`编辑${item.note || item.category}支出`} onClick={() => setEditing(item)}><Pencil size={15} /></button><button className="icon-button" aria-label={`删除${item.note || item.category}支出`} onClick={() => setDeleting(item)}><Trash2 size={15} /></button></div>
      </div>)}</div> : <EmptyState icon={ReceiptText} title="暂无支出" action={<button className="button secondary" onClick={() => setEditing('new')}><Plus size={16} />新增</button>} />}
    </section>
    {editing && <ExpenseForm key={editing === 'new' ? 'new' : editing.id} item={editing === 'new' ? undefined : editing} {...{ data, refresh, notify }} onClose={() => setEditing(null)} />}
    {budgetOpen && <BudgetForm {...{ data, refresh, notify, month }} onClose={() => setBudgetOpen(false)} />}
    {deleting && <DeleteExpense item={deleting} refresh={refresh} notify={notify} onClose={() => setDeleting(null)} />}
  </div>;
}

function ExpenseForm({ item, data, refresh, notify, onClose }: ModuleProps & { item?: Expense; onClose: () => void }) {
  const savedId = useRef(item?.id);
  const [values, setValues] = useState({ amount: item?.amount.toString() || '', currency: item?.currency || data.profile.localCurrency, category: item?.category || '餐饮', note: item?.note || '', date: item?.date || today(data.profile.timeZone) });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try { const result = await saveItem('expenses', { ...values, amount: Number(values.amount) }, savedId.current) as Expense; savedId.current = result.id; await refresh(); notify(item ? '支出已保存' : '已记下这笔支出'); onClose(); }
    catch (failure) { setError(messageOf(failure)); }
    finally { setBusy(false); }
  }
  return <Modal title={item ? '编辑支出' : '记一笔支出'} onClose={() => !busy && onClose()}><form onSubmit={submit} className="form-grid finance-form">
    <Field label="金额"><input type="number" inputMode="decimal" min="0.01" max="1000000000" step="0.01" required autoFocus value={values.amount} onChange={event => setValues({ ...values, amount: event.target.value })} placeholder="0.00" /></Field>
    <Field label="币种"><select value={values.currency} onChange={event => setValues({ ...values, currency: event.target.value })}>{[...new Set([...currencies, values.currency])].map(currency => <option key={currency}>{currency}</option>)}</select></Field>
    <Field label="分类"><select value={values.category} onChange={event => setValues({ ...values, category: event.target.value })}>{[...new Set([...categories, values.category])].map(category => <option key={category}>{category}</option>)}</select></Field>
    <Field label="日期"><input type="date" required max={today(data.profile.timeZone)} value={values.date} onChange={event => setValues({ ...values, date: event.target.value })} /></Field>
    <Field label="备注（选填）"><input maxLength={300} value={values.note} onChange={event => setValues({ ...values, note: event.target.value })} placeholder="这笔钱花在哪里？" /></Field>
    {values.currency !== data.profile.baseCurrency && <p className="muted small">保存时按支出日期汇率换算为 {data.profile.baseCurrency}</p>}
    {item && item.currency !== item.baseCurrency && <p className="muted" style={{ fontSize: 12 }}>原记录汇率：1 {item.currency} = {item.rate.toFixed(4)} {item.baseCurrency}（{shortDate(item.rateDate)}）</p>}
    {error && <p role="alert" className="error-message">{error}</p>}<div className="form-actions"><button type="button" className="button secondary" disabled={busy} onClick={onClose}>取消</button><SubmitButton busy={busy}>保存支出</SubmitButton></div>
  </form></Modal>;
}

function BudgetForm({ data, month, refresh, notify, onClose }: ModuleProps & { month: string; onClose: () => void }) {
  const [semesterBudget, setSemesterBudget] = useState(String(data.profile.semesterBudget || ''));
  const [monthlyBudget, setMonthlyBudget] = useState(String(data.profile.monthlyBudgets[month] || ''));
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try { await api('/profile', { method: 'PUT', body: JSON.stringify({ ...data.profile, semesterBudget: Number(semesterBudget || 0), monthlyBudgets: { ...data.profile.monthlyBudgets, [month]: Number(monthlyBudget || 0) } }) }); await refresh(); notify('预算已保存'); onClose(); }
    catch (failure) { setError(messageOf(failure)); } finally { setBusy(false); }
  }
  return <Modal title="预算" onClose={() => !busy && onClose()}><form className="form-grid finance-form" onSubmit={submit}><Field label="总预算"><input type="number" inputMode="decimal" min="0" max="1000000000" step="0.01" autoFocus value={semesterBudget} onChange={event => setSemesterBudget(event.target.value)} placeholder="0.00" /></Field><Field label={`${monthLabel(month)}预算`}><input type="number" inputMode="decimal" min="0" max="1000000000" step="0.01" value={monthlyBudget} onChange={event => setMonthlyBudget(event.target.value)} placeholder="0.00" /></Field>{error && <p className="error-message" role="alert">{error}</p>}<div className="form-actions"><button type="button" className="button secondary" disabled={busy} onClick={onClose}>取消</button><SubmitButton busy={busy}>保存预算</SubmitButton></div></form></Modal>;
}

function DeleteExpense({ item, refresh, notify, onClose }: { item: Expense; refresh: () => Promise<void>; notify: (message: string) => void; onClose: () => void }) {
  const removed = useRef(false);
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  async function remove() { setBusy(true); setError(''); try { if (!removed.current) { await deleteItem('expenses', item.id); removed.current = true; } await refresh(); notify('支出已删除'); onClose(); } catch (failure) { setError(messageOf(failure)); } finally { setBusy(false); } }
  return <Modal title="删除支出？" onClose={() => !busy && onClose()}><p>{item.note || item.category} · {money(item.amount, item.currency)}</p>{error && <p role="alert" className="error-message">{error}</p>}<div className="form-actions"><button className="button secondary" disabled={busy} onClick={onClose}>取消</button><button className="button danger" disabled={busy} onClick={remove}>{busy ? '删除中…' : '删除'}</button></div></Modal>;
}
