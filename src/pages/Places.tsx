import { useState } from 'react';
import type { FormEvent } from 'react';
import { Bookmark, Check, MapPin, Navigation, Pencil, Plus, Trash2 } from 'lucide-react';
import { deleteItem, saveItem } from '../lib/api';
import type { ModuleProps, Place } from '../lib/types';
import { ConfirmDelete, EmptyState, Field, Modal, PageHeading, Stat, SubmitButton } from '../components/ui';

const categories = ['景點', '美食', '咖啡', '文化', '購物', '戶外', '其他'];
type PlaceDraft = Omit<Place, 'id'>;
const newDraft = (): PlaceDraft => ({ name: '', category: '景點', address: '', note: '', visited: false });

export default function Places({ data, refresh, notify }: ModuleProps) {
  const [filter, setFilter] = useState<'want' | 'visited' | 'all'>('want');
  const [editing, setEditing] = useState<Place | 'new' | null>(null);
  const [draft, setDraft] = useState<PlaceDraft>(newDraft);
  const [deleting, setDeleting] = useState<Place | null>(null);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [error, setError] = useState('');
  const [pageError, setPageError] = useState('');
  const visitedCount = data.places.filter(item => item.visited).length;
  const places = data.places.filter(item => filter === 'all' || item.visited === (filter === 'visited'));

  function openEditor(item?: Place) {
    setDraft(item ? { name: item.name, category: item.category, address: item.address, note: item.note, visited: item.visited } : newDraft());
    setError(''); setEditing(item || 'new');
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    if (!draft.name.trim()) { setError('請填寫地點名稱。'); return; }
    setBusy(true); setError('');
    try {
      const saved = await saveItem('places', { ...draft, name: draft.name.trim(), address: draft.address.trim(), note: draft.note.trim() }, editing && editing !== 'new' ? editing.id : undefined) as Place;
      setEditing(saved);
      await refresh(); setEditing(null);
      if (editing === 'new') setFilter(draft.visited ? 'visited' : 'want');
      notify(editing === 'new' ? '地點已收藏' : '地點已更新');
    } catch (cause) { setError(cause instanceof Error ? cause.message : '儲存失敗，請稍後重試'); }
    finally { setBusy(false); }
  }

  async function checkIn(item: Place) {
    if (pending.has(item.id)) return;
    setPending(value => new Set(value).add(item.id)); setPageError('');
    try {
      await saveItem('places', { name: item.name, category: item.category, address: item.address, note: item.note, visited: !item.visited }, item.id);
      await refresh(); notify(item.visited ? '已移回想去清單' : '打卡成功，收藏一段新回憶');
    } catch (cause) { setPageError(cause instanceof Error ? cause.message : '更新失敗，請稍後重試'); }
    finally { setPending(value => { const next = new Set(value); next.delete(item.id); return next; }); }
  }

  return <div className="page-stack">
    <PageHeading eyebrow="Go a little further" title="探索地圖" description="把想去的地方，變成去過的回憶。" action={<button className="button" onClick={() => openEditor()}><Plus size={17} />收藏地點</button>} />
    <div className="stat-grid"><Stat label="想去的地方" value={String(data.places.length - visitedCount).padStart(2, '0')} note="下一站的靈感" /><Stat label="已留下足跡" value={String(visitedCount).padStart(2, '0')} note="每一次出發都算數" /></div>
    <div className="filter-row"><div className="segmented" aria-label="地點狀態">{([{ id: 'want', label: '想去', count: data.places.length - visitedCount }, { id: 'visited', label: '去過', count: visitedCount }, { id: 'all', label: '全部', count: data.places.length }] as const).map(item => <button key={item.id} className={filter === item.id ? 'active' : ''} aria-pressed={filter === item.id} onClick={() => { setFilter(item.id); setPageError(''); }}>{item.label}<span>{item.count}</span></button>)}</div></div>
    {pageError && <p className="error-message" role="alert">{pageError}</p>}
    {places.length === 0 ? <EmptyState icon={filter === 'visited' ? MapPin : Bookmark} title={filter === 'visited' ? '足跡，從一次出發開始' : '下一站，想去哪裡？'} description={filter === 'visited' ? '在想去清單裡點選「已到訪」，就能在這裡回看自己的探索。' : '收藏一間咖啡店、一個景點，或任何想親自抵達的地方。'} action={filter === 'visited' && data.places.length > 0 ? <button className="button secondary" onClick={() => setFilter('want')}>看看想去的地方<Navigation size={16} /></button> : <button className="button secondary" onClick={() => openEditor()}><Plus size={17} />收藏第一個地點</button>} /> : <div className="place-grid">{places.map(item => <article className="panel place-card" key={item.id}>
      <div className="place-card-top"><span className="place-marker"><MapPin size={24} /></span><span className="pill">{item.category}</span>{item.visited && <span className="pill visited-pill"><Check size={13} />已去過</span>}</div>
      <h2>{item.name}</h2>
      {item.address ? <p className="place-address"><MapPin size={14} /><span>{item.address}</span></p> : <p className="muted">尚未填寫地址</p>}
      {item.note && <p className="place-note" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{item.note}</p>}
      <div className="place-actions"><a className="button secondary" href={`https://maps.apple.com/?q=${encodeURIComponent([item.name, item.address].filter(Boolean).join(' '))}`} target="_blank" rel="noopener noreferrer" aria-label={`在 Apple 地圖開啟${item.name}`}><Navigation size={16} />地圖</a><button className={`button ${item.visited ? 'secondary' : ''}`} disabled={pending.has(item.id)} onClick={() => void checkIn(item)}><Check size={16} />{pending.has(item.id) ? '更新中…' : item.visited ? '移回想去' : '已到訪'}</button><div className="row-actions"><button className="icon-button" disabled={pending.has(item.id)} aria-label={`編輯${item.name}`} onClick={() => openEditor(item)}><Pencil size={16} /></button><button className="icon-button danger" disabled={pending.has(item.id)} aria-label={`刪除${item.name}`} onClick={() => setDeleting(item)}><Trash2 size={16} /></button></div></div>
    </article>)}</div>}
    {editing && <Modal title={editing === 'new' ? '收藏地點' : '編輯地點'} onClose={() => { if (!busy) setEditing(null); }}>
      <form className="form-grid module-form" onSubmit={submit}>
        <Field label="地點名稱"><input autoFocus required maxLength={150} value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} placeholder="想去的地方" /></Field>
        <Field label="分類"><select value={draft.category} onChange={event => setDraft({ ...draft, category: event.target.value })}>{!categories.includes(draft.category) && <option value={draft.category}>{draft.category}</option>}{categories.map(category => <option key={category}>{category}</option>)}</select></Field>
        <Field label="地址" hint="填入城市或完整地址，讓地圖搜尋更準確。"><input maxLength={500} value={draft.address} onChange={event => setDraft({ ...draft, address: event.target.value })} placeholder="選填" /></Field>
        <Field label="筆記"><textarea rows={4} maxLength={2000} value={draft.note} onChange={event => setDraft({ ...draft, note: event.target.value })} placeholder="想去的理由、必點餐點，或到訪後的回憶" /></Field>
        <Field label="狀態"><select value={draft.visited ? 'visited' : 'want'} onChange={event => setDraft({ ...draft, visited: event.target.value === 'visited' })}><option value="want">想去</option><option value="visited">已去過</option></select></Field>
        {error && <p className="error-message" role="alert">{error}</p>}
        <div className="form-actions"><button type="button" className="button secondary" disabled={busy} onClick={() => setEditing(null)}>取消</button><SubmitButton busy={busy}>{editing === 'new' ? '加入收藏' : '儲存變更'}</SubmitButton></div>
      </form>
    </Modal>}
    {deleting && <ConfirmDelete onClose={() => setDeleting(null)} onConfirm={async () => { await deleteItem('places', deleting.id); await refresh(); setDeleting(null); notify('地點已刪除'); }} />}
  </div>;
}
