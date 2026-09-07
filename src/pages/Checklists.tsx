import { useState } from 'react';
import type { FormEvent, KeyboardEvent } from 'react';
import { ArrowRight, Check, ClipboardCheck, Pencil, Plus, Trash2 } from 'lucide-react';
import { deleteItem, saveItem } from '../lib/api';
import { daysUntil, shortDate, today } from '../lib/format';
import type { ChecklistGroup, ChecklistItem, ModuleProps } from '../lib/types';
import { ConfirmDelete, EmptyState, Field, Modal, PageHeading, SubmitButton } from '../components/ui';

const groups: { id: ChecklistGroup; name: string; description: string }[] = [
  { id: 'preparation', name: '行前準備', description: '將出發前的重要事項逐一安排好。' },
  { id: 'packing', name: '行李打包', description: '裝進行李箱的，也裝進安心。' },
  { id: 'arrival', name: '抵達安頓', description: '一步一步，讓陌生的城市成為日常。' },
  { id: 'travel', name: '旅行計畫', description: '替下一次出走，留一點期待。' },
  { id: 'closing', name: '學期收尾', description: '在回家之前，把這一段生活整理好。' },
];
type ChecklistDraft = Omit<ChecklistItem, 'id'>;

export default function Checklists({ data, refresh, notify }: ModuleProps) {
  const [group, setGroup] = useState<ChecklistGroup>('preparation');
  const [editing, setEditing] = useState<ChecklistItem | 'new' | null>(null);
  const [draft, setDraft] = useState<ChecklistDraft>({ group, title: '', dueDate: '', done: false });
  const [deleting, setDeleting] = useState<ChecklistItem | null>(null);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [error, setError] = useState('');
  const [pageError, setPageError] = useState('');
  const selectedGroup = groups.find(item => item.id === group)!;
  const items = data.checklists.filter(item => item.group === group).sort((a, b) => Number(a.done) - Number(b.done) || (a.dueDate || '9999').localeCompare(b.dueDate || '9999'));
  const done = items.filter(item => item.done).length;
  const percentage = items.length ? Math.round(done / items.length * 100) : 0;
  const currentDate = today(data.profile.timeZone);

  function openEditor(item?: ChecklistItem) {
    setDraft(item ? { group: item.group, title: item.title, dueDate: item.dueDate, done: item.done } : { group, title: '', dueDate: '', done: false });
    setError(''); setEditing(item || 'new');
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    if (!draft.title.trim()) { setError('請填寫待辦事項。'); return; }
    setBusy(true); setError('');
    try {
      const saved = await saveItem('checklists', { ...draft, title: draft.title.trim() }, editing && editing !== 'new' ? editing.id : undefined) as ChecklistItem;
      setEditing(saved);
      await refresh(); setGroup(draft.group); setEditing(null);
      notify(editing === 'new' ? '待辦已加入' : '待辦已更新');
    } catch (cause) { setError(cause instanceof Error ? cause.message : '儲存失敗，請稍後重試'); }
    finally { setBusy(false); }
  }

  async function toggle(item: ChecklistItem) {
    if (pending.has(item.id)) return;
    setPending(value => new Set(value).add(item.id)); setPageError('');
    try {
      await saveItem('checklists', { group: item.group, title: item.title, dueDate: item.dueDate, done: !item.done }, item.id);
      await refresh(); notify(item.done ? '已恢復為待完成' : '又完成了一件事');
    } catch (cause) { setPageError(cause instanceof Error ? cause.message : '更新失敗，請稍後重試'); }
    finally { setPending(value => { const next = new Set(value); next.delete(item.id); return next; }); }
  }

  function changeTab(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const nextIndex = event.key === 'ArrowRight' ? (index + 1) % groups.length : event.key === 'ArrowLeft' ? (index - 1 + groups.length) % groups.length : event.key === 'Home' ? 0 : event.key === 'End' ? groups.length - 1 : null;
    if (nextIndex === null) return;
    event.preventDefault();
    setGroup(groups[nextIndex].id); setPageError('');
    document.getElementById(`checklist-tab-${groups[nextIndex].id}`)?.focus();
  }

  return <div className="page-stack">
    <PageHeading eyebrow="One thing at a time" title="生活清單" description="把待辦放下，留心生活。" action={<button className="button" onClick={() => openEditor()}><Plus size={17} />新增待辦</button>} />
    <div className="checklist-tabs" role="tablist" aria-label="清單分類">{groups.map((item, index) => {
      const groupItems = data.checklists.filter(entry => entry.group === item.id);
      return <button key={item.id} id={`checklist-tab-${item.id}`} className={group === item.id ? 'active' : ''} role="tab" tabIndex={group === item.id ? 0 : -1} aria-selected={group === item.id} aria-controls="checklist-panel" onKeyDown={event => changeTab(event, index)} onClick={() => { setGroup(item.id); setPageError(''); }}><span>{item.name}</span><small>{groupItems.filter(entry => entry.done).length}/{groupItems.length}</small></button>;
    })}</div>
    <section id="checklist-panel" role="tabpanel" aria-labelledby={`checklist-tab-${group}`} className="panel">
      <div className="panel-header"><div><h2>{selectedGroup.name}</h2><p className="muted">{selectedGroup.description}</p></div><span className="pill">{done} / {items.length} 已完成</span></div>
      <div className="checklist-progress"><progress max={100} value={percentage} aria-label={`${selectedGroup.name}完成度`} /><span>{percentage}%</span></div>
      {pageError && <p className="error-message" role="alert">{pageError}</p>}
      {items.length === 0 ? <EmptyState icon={ClipboardCheck} title="從一件小事開始" description={`「${selectedGroup.name}」還沒有待辦，新增自己的第一個步驟。`} action={<button className="button secondary" onClick={() => openEditor()}>加入待辦<ArrowRight size={16} /></button>} /> : <div>{items.map(item => {
        const remaining = daysUntil(item.dueDate, currentDate);
        return <div className={`checklist-item ${item.done ? 'checklist-done' : ''}`} key={item.id}>
          <button className="checklist-toggle" role="checkbox" aria-checked={item.done} aria-label={`${item.done ? '取消完成' : '完成'}：${item.title}`} disabled={pending.has(item.id)} onClick={() => void toggle(item)}>{item.done && <Check size={17} />}</button>
          <div className="checklist-content"><span className="checklist-title">{item.title}</span>{item.dueDate && <span className={`pill ${!item.done && remaining !== null && remaining < 0 ? 'expiry-danger' : !item.done && remaining === 0 ? 'expiry-warning' : ''}`}>{!item.done && remaining !== null && remaining < 0 ? `逾期 ${Math.abs(remaining)} 天` : remaining === 0 ? '今天截止' : `${shortDate(item.dueDate)} 截止`}</span>}</div>
          <div className="row-actions"><button className="icon-button" aria-label={`編輯${item.title}`} disabled={pending.has(item.id)} onClick={() => openEditor(item)}><Pencil size={16} /></button><button className="icon-button danger" aria-label={`刪除${item.title}`} disabled={pending.has(item.id)} onClick={() => setDeleting(item)}><Trash2 size={16} /></button></div>
        </div>;
      })}</div>}
    </section>
    {editing && <Modal title={editing === 'new' ? '新增待辦' : '編輯待辦'} onClose={() => { if (!busy) setEditing(null); }}>
      <form className="form-grid module-form" onSubmit={submit}>
        <Field label="待辦事項"><input autoFocus required maxLength={200} value={draft.title} onChange={event => setDraft({ ...draft, title: event.target.value })} placeholder="想完成什麼事？" /></Field>
        <Field label="分類"><select value={draft.group} onChange={event => setDraft({ ...draft, group: event.target.value as ChecklistGroup })}>{groups.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
        <Field label="截止日" hint="選填；沒有期限也可以。"><input type="date" value={draft.dueDate} onChange={event => setDraft({ ...draft, dueDate: event.target.value })} /></Field>
        {error && <p className="error-message" role="alert">{error}</p>}
        <div className="form-actions"><button type="button" className="button secondary" disabled={busy} onClick={() => setEditing(null)}>取消</button><SubmitButton busy={busy}>{editing === 'new' ? '加入清單' : '儲存變更'}</SubmitButton></div>
      </form>
    </Modal>}
    {deleting && <ConfirmDelete onClose={() => setDeleting(null)} onConfirm={async () => { await deleteItem('checklists', deleting.id); await refresh(); setDeleting(null); notify('待辦已刪除'); }} />}
  </div>;
}
