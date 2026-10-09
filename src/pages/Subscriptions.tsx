import { useMemo, useState, type FormEvent } from 'react';
import { Bell, CalendarPlus, Check, CreditCard, ExternalLink, Pause, Pencil, Plus, Trash2 } from 'lucide-react';
import type { ModuleProps, Subscription } from '../lib/types';
import { api, deleteItem, saveItem } from '../lib/api';
import { today, money } from '../lib/format';
import { downloadCalendar, dueSubscriptions, reminderLabel } from '../lib/lifestyle';
import WalletScene from '../components/WalletScene';
import { ConfirmDelete, EmptyState, Field, Modal, PageHeading, SubmitButton } from '../components/ui';
type Draft = Omit<Subscription, 'id'>;
const empty = (date: string): Draft => ({ name: '', amount: 0, currency: 'TWD', nextRenewal: date, billingDay: Number(date.slice(-2)), intervalMonths: 1, reminderDays: 3, active: true, category: 'ai', url: '', note: '' });
export default function Subscriptions({ data, refresh, notify }: ModuleProps) {
  const date = today(data.profile.timeZone), items = [...data.subscriptions].sort((a,b) => Number(b.active) - Number(a.active) || a.nextRenewal.localeCompare(b.nextRenewal));
  const [selected, setSelected] = useState<string | null>(items[0]?.id || null), [editing, setEditing] = useState<Subscription | 'new' | null>(null);
  const [draft, setDraft] = useState<Draft>(empty(date)), [busy, setBusy] = useState(false), [pending, setPending] = useState(new Set<string>()), [error, setError] = useState('');
  const [deleting, setDeleting] = useState<Subscription | null>(null);
  const due = dueSubscriptions(items, date);
  const cards = useMemo(() => items.filter(item => item.active).map(item => ({ id:item.id, name:item.name, number:'', expiryDate:item.nextRenewal, label:'订阅卡', value:`${item.currency} ${item.amount.toFixed(2)}`, footer:item.intervalMonths === 12 ? '每年续费' : `每 ${item.intervalMonths} 个月` })), [data.subscriptions]);
  const monthly = Object.entries(items.filter(item => item.active).reduce<Record<string,number>>((sum,item) => ({ ...sum, [item.currency]:(sum[item.currency] || 0) + item.amount / item.intervalMonths }), {}));
  function open(item?: Subscription) { setDraft(item ? {...item} : empty(date)); setEditing(item || 'new'); setError(''); }
  async function submit(event: FormEvent) {
    event.preventDefault(); if (busy) return; setBusy(true); setError('');
    try { await saveItem('subscriptions', draft, editing && editing !== 'new' ? editing.id : undefined); await refresh(); setEditing(null); notify('订阅已保存'); }
    catch (cause) { setError((cause as Error).message); } finally { setBusy(false); }
  }
  async function renew(item: Subscription) {
    if (pending.has(item.id)) return;
    setPending(value => new Set(value).add(item.id)); setError('');
    try { await api(`/subscriptions/${item.id}/renew`, { method:'POST', body:JSON.stringify({nextRenewal:item.nextRenewal}) }); await refresh(); notify('已记录续费，下次日期已更新'); }
    catch (cause) { setError((cause as Error).message); } finally { setPending(value => { const next = new Set(value); next.delete(item.id); return next; }); }
  }
  return <div className="page-stack subscription-page">
    <PageHeading title="订阅卡包" description="每一笔续费，提前有数。" action={<button className="button" onClick={() => open()}><Plus size={18}/>新增</button>}/>
    <div className="era-summary-row"><div><small>每月订阅支出</small><strong>{monthly.length ? monthly.map(([currency,amount]) => money(amount,currency)).join(' / ') : '还没有订阅'}</strong></div><span className="era-counter">{items.filter(item=>item.active).length}<small>项启用</small></span></div>
    {!!due.length && <section className="renewal-alert"><Bell size={21}/><div><strong>{due.length} 项订阅需要关注</strong><p>{due.slice(0,2).map(item => `${item.name} · ${reminderLabel(item,date)}`).join('，')}</p></div></section>}
    {cards.length > 0 && <WalletScene items={cards} selected={selected} onSelect={setSelected} title="订阅卡包"/>}
    {items.length === 0 ? <EmptyState icon={CreditCard} title="让续费变得清楚" description="添加 AI 工具、健身会员或其他订阅。" action={<button className="button" onClick={()=>open()}>添加第一张订阅卡</button>}/> : <section className="panel subscription-list"><div className="panel-header"><h2>我的订阅</h2><span className="muted small">金额按原币种显示</span></div>{items.map(item=><article className={`subscription-row ${!item.active ? 'paused' : ''}`} key={item.id}><button className={`service-icon category-${item.category}`} onClick={()=>setSelected(item.id)} aria-label={`查看${item.name}订阅卡`}>{item.name.slice(0,1)}</button><div className="subscription-row-info"><strong>{item.name}</strong><small>{money(item.amount,item.currency)} / {item.intervalMonths === 12 ? '年' : item.intervalMonths === 3 ? '季' : '月'}</small><span className={due.some(value=>value.id===item.id) ? 'renewal-due' : 'muted'}>{item.active ? `${item.nextRenewal} · ${reminderLabel(item,date)}` : '已暂停提醒'}</span></div><button className="icon-button" aria-label={`编辑${item.name}`} onClick={()=>open(item)}><Pencil size={17}/></button>{item.active && <button className="renew-button" disabled={pending.has(item.id)} onClick={()=>renew(item)}><Check size={16}/>{pending.has(item.id) ? '记录中' : '已续费'}</button>}</article>)}</section>}
    {items.some(item=>item.active) && <section className="panel calendar-export"><CalendarPlus size={27}/><div><h2>让 iPhone 提前提醒你</h2><p>导出重复日程，将 .ics 作为邮件附件在 iPhone 中打开并添加到「日历」。修改后请移除旧日程，再重新导入。</p><button className="button secondary" onClick={()=>{downloadCalendar(items); notify('日历文件已导出，请在 iPhone 日历中添加');}}>导出续费提醒</button></div></section>}
    {error && !editing && <p className="error-message" role="alert">{error}</p>}
    {editing && <Modal title={editing==='new' ? '新增订阅' : '编辑订阅'} onClose={()=>{if(!busy)setEditing(null);}}><form onSubmit={submit} className="form-grid module-form">
      <Field label="订阅名称"><input required maxLength={200} placeholder="例如 ChatGPT、健身会员" value={draft.name} onChange={e=>setDraft({...draft,name:e.target.value})}/></Field>
      <div className="two-fields"><Field label="每期金额"><input required type="number" step="0.01" min="0" max="1000000000" value={draft.amount} onChange={e=>setDraft({...draft,amount:Number(e.target.value)})}/></Field><Field label="币种"><select value={draft.currency} onChange={e=>setDraft({...draft,currency:e.target.value})}>{['TWD','USD','CNY','HKD','EUR','JPY'].map(c=><option key={c}>{c}</option>)}</select></Field></div>
      <Field label="下次续费日期"><input required type="date" value={draft.nextRenewal} onChange={e=>setDraft({...draft,nextRenewal:e.target.value,billingDay:Number(e.target.value.slice(-2))})}/></Field>
      <div className="two-fields"><Field label="续费周期"><select value={draft.intervalMonths} onChange={e=>setDraft({...draft,intervalMonths:Number(e.target.value)})}><option value={1}>每月</option><option value={3}>每季</option><option value={12}>每年</option></select></Field><Field label="提前提醒"><select value={draft.reminderDays} onChange={e=>setDraft({...draft,reminderDays:Number(e.target.value)})}>{[0,1,3,7,14,30].map(n=><option key={n} value={n}>{n===0 ? '当天' : `${n} 天`}</option>)}</select></Field></div>
      <Field label="分类"><select value={draft.category} onChange={e=>setDraft({...draft,category:e.target.value as Draft['category']})}><option value="ai">AI 工具</option><option value="fitness">运动健身</option><option value="life">生活服务</option></select></Field>
      <Field label="管理网址"><input type="url" placeholder="https://…（选填）" value={draft.url} onChange={e=>setDraft({...draft,url:e.target.value})}/></Field>
      <Field label="备注"><textarea rows={2} value={draft.note} onChange={e=>setDraft({...draft,note:e.target.value})}/></Field>
      <label className="toggle-row"><span>启用续费提醒</span><input type="checkbox" checked={draft.active} onChange={e=>setDraft({...draft,active:e.target.checked})}/></label>
      {error&&<p className="error-message" role="alert">{error}</p>}<div className="form-actions"><SubmitButton busy={busy}>保存订阅</SubmitButton>{editing!=='new' && <><button type="button" className="icon-button danger" aria-label="删除订阅" onClick={()=>{setDeleting(editing);setEditing(null);}}><Trash2 size={18}/></button>{draft.url&&<a className="button secondary" href={draft.url} target="_blank" rel="noopener noreferrer"><ExternalLink size={16}/>管理订阅</a>}</>}</div>
    </form></Modal>}
    {deleting&&<ConfirmDelete onClose={()=>setDeleting(null)} onConfirm={async()=>{await deleteItem('subscriptions',deleting.id);await refresh();notify('订阅已删除');}}/>}
  </div>;
}
