import { useState } from 'react';
import type { FormEvent } from 'react';
import { Bookmark, Check, MapPin, Navigation, Pencil, Plus, Trash2 } from 'lucide-react';
import { deleteItem, saveItem } from '../lib/api';
import type { ModuleProps, Place } from '../lib/types';
import { ConfirmDelete, EmptyState, Field, Modal, PageHeading, Stat, SubmitButton } from '../components/ui';

const categories = ['景点', '美食', '咖啡', '文化', '购物', '户外', '其他'];
type PlaceDraft = Omit<Place, 'id'>;
const newDraft = (): PlaceDraft => ({ name: '', category: '景点', address: '', note: '', visited: false });

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
    if (!draft.name.trim()) { setError('请填写地点名称。'); return; }
    setBusy(true); setError('');
    try {
      const saved = await saveItem('places', { ...draft, name: draft.name.trim(), address: draft.address.trim(), note: draft.note.trim() }, editing && editing !== 'new' ? editing.id : undefined) as Place;
      setEditing(saved);
      await refresh(); setEditing(null);
      if (editing === 'new') setFilter(draft.visited ? 'visited' : 'want');
      notify(editing === 'new' ? '地点已收藏' : '地点已保存');
    } catch (cause) { setError(cause instanceof Error ? cause.message : '保存失败，请稍后重试'); }
    finally { setBusy(false); }
  }

  async function checkIn(item: Place) {
    if (pending.has(item.id)) return;
    setPending(value => new Set(value).add(item.id)); setPageError('');
    try {
      await saveItem('places', { name: item.name, category: item.category, address: item.address, note: item.note, visited: !item.visited }, item.id);
      await refresh(); notify(item.visited ? '已移回想去清单' : '打卡成功，收藏一段新回忆');
    } catch (cause) { setPageError(cause instanceof Error ? cause.message : '更新失败，请稍后重试'); }
    finally { setPending(value => { const next = new Set(value); next.delete(item.id); return next; }); }
  }

  return <div className="page-stack">
    <PageHeading title="探索地图" action={<button className="button" onClick={() => openEditor()}><Plus size={17} />新增</button>} />
    <div className="stat-grid"><Stat label="想去" value={String(data.places.length - visitedCount).padStart(2, '0')} /><Stat label="去过" value={String(visitedCount).padStart(2, '0')} /></div>
    <div className="filter-row"><div className="segmented" aria-label="地点状态">{([{ id: 'want', label: '想去', count: data.places.length - visitedCount }, { id: 'visited', label: '去过', count: visitedCount }, { id: 'all', label: '全部', count: data.places.length }] as const).map(item => <button key={item.id} className={filter === item.id ? 'active' : ''} aria-pressed={filter === item.id} onClick={() => { setFilter(item.id); setPageError(''); }}>{item.label}<span>{item.count}</span></button>)}</div></div>
    {pageError && <p className="error-message" role="alert">{pageError}</p>}
    {places.length === 0 ? <EmptyState icon={filter === 'visited' ? MapPin : Bookmark} title={filter === 'visited' ? '暂无足迹' : '暂无地点'} action={filter === 'visited' && data.places.length > 0 ? <button className="button secondary" onClick={() => setFilter('want')}>想去<Navigation size={16} /></button> : <button className="button secondary" onClick={() => openEditor()}><Plus size={17} />添加</button>} /> : <div className="place-grid">{places.map(item => <article className="panel place-card" key={item.id}>
      <div className="place-card-top"><span className="place-marker"><MapPin size={24} /></span><span className="pill">{item.category}</span>{item.visited && <span className="pill visited-pill"><Check size={13} />已去过</span>}</div>
      <h2>{item.name}</h2>
      {item.address ? <p className="place-address"><MapPin size={14} /><span>{item.address}</span></p> : <p className="muted">尚未填写地址</p>}
      {item.note && <p className="place-note" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{item.note}</p>}
      <div className="place-actions"><a className="button secondary" href={`https://maps.apple.com/?q=${encodeURIComponent([item.name, item.address].filter(Boolean).join(' '))}`} target="_blank" rel="noopener noreferrer" aria-label={`在 Apple 地图打开${item.name}`}><Navigation size={16} />地图</a><button className={`button ${item.visited ? 'secondary' : ''}`} disabled={pending.has(item.id)} onClick={() => void checkIn(item)}><Check size={16} />{pending.has(item.id) ? '更新中…' : item.visited ? '移回想去' : '已到访'}</button><div className="row-actions"><button className="icon-button" disabled={pending.has(item.id)} aria-label={`编辑${item.name}`} onClick={() => openEditor(item)}><Pencil size={16} /></button><button className="icon-button danger" disabled={pending.has(item.id)} aria-label={`删除${item.name}`} onClick={() => setDeleting(item)}><Trash2 size={16} /></button></div></div>
    </article>)}</div>}
    {editing && <Modal title={editing === 'new' ? '收藏地点' : '编辑地点'} onClose={() => { if (!busy) setEditing(null); }}>
      <form className="form-grid module-form" onSubmit={submit}>
        <Field label="地点名称"><input autoFocus required maxLength={150} value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} placeholder="想去的地方" /></Field>
        <Field label="分类"><select value={draft.category} onChange={event => setDraft({ ...draft, category: event.target.value })}>{!categories.includes(draft.category) && <option value={draft.category}>{draft.category}</option>}{categories.map(category => <option key={category}>{category}</option>)}</select></Field>
        <Field label="地址"><input maxLength={500} value={draft.address} onChange={event => setDraft({ ...draft, address: event.target.value })} placeholder="选填" /></Field>
        <Field label="笔记"><textarea rows={4} maxLength={2000} value={draft.note} onChange={event => setDraft({ ...draft, note: event.target.value })} placeholder="想去的理由、必点餐点，或到访后的回忆" /></Field>
        <Field label="状态"><select value={draft.visited ? 'visited' : 'want'} onChange={event => setDraft({ ...draft, visited: event.target.value === 'visited' })}><option value="want">想去</option><option value="visited">已去过</option></select></Field>
        {error && <p className="error-message" role="alert">{error}</p>}
        <div className="form-actions"><button type="button" className="button secondary" disabled={busy} onClick={() => setEditing(null)}>取消</button><SubmitButton busy={busy}>{editing === 'new' ? '加入收藏' : '保存变更'}</SubmitButton></div>
      </form>
    </Modal>}
    {deleting && <ConfirmDelete onClose={() => setDeleting(null)} onConfirm={async () => { await deleteItem('places', deleting.id); await refresh(); setDeleting(null); notify('地点已删除'); }} />}
  </div>;
}




