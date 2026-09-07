import { useState } from 'react';
import type { FormEvent } from 'react';
import { BookOpen, CalendarDays, ChevronRight, MapPin, Plus, Trash2, UserRound } from 'lucide-react';
import { deleteItem, saveItem } from '../lib/api';
import { today } from '../lib/format';
import type { Course, ModuleProps } from '../lib/types';
import { ConfirmDelete, EmptyState, Field, Modal, PageHeading, Stat, SubmitButton } from '../components/ui';

const weekdays = ['週一', '週二', '週三', '週四', '週五', '週六', '週日'];
const periods = Array.from({ length: 16 }, (_, index) => index + 1);
type CourseDraft = Omit<Course, 'id'>;
function colorFor(name: string) { return [...name].reduce((value, char) => value + char.charCodeAt(0), 0) % 6; }

export default function Courses({ data, refresh, notify }: ModuleProps) {
  const localDay = new Date(`${today(data.profile.timeZone)}T12:00:00`).getDay() || 7;
  const [editing, setEditing] = useState<Course | 'new' | null>(null);
  const [draft, setDraft] = useState<CourseDraft>({ name: '', room: '', teacher: '', weekday: localDay, startPeriod: 1, endPeriod: 1 });
  const [deleting, setDeleting] = useState<Course | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const courses = [...data.courses].sort((a, b) => a.weekday - b.weekday || a.startPeriod - b.startPeriod);
  const totalPeriods = courses.reduce((value, item) => value + item.endPeriod - item.startPeriod + 1, 0);

  function openEditor(item?: Course, weekday = localDay, period = 1) {
    setDraft(item ? { name: item.name, room: item.room, teacher: item.teacher, weekday: item.weekday, startPeriod: item.startPeriod, endPeriod: item.endPeriod } : { name: '', room: '', teacher: '', weekday, startPeriod: period, endPeriod: period });
    setError(''); setEditing(item || 'new');
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    if (!draft.name.trim()) { setError('請填寫課程名稱。'); return; }
    if (!Number.isInteger(draft.weekday) || draft.weekday < 1 || draft.weekday > 7 || !Number.isInteger(draft.startPeriod) || !Number.isInteger(draft.endPeriod) || draft.startPeriod < 1 || draft.endPeriod > 16 || draft.startPeriod > draft.endPeriod) { setError('請選擇有效的上課時段；結束節次須在開始節次之後或相同。'); return; }
    const conflict = data.courses.find(item => item.id !== (editing && editing !== 'new' ? editing.id : undefined) && item.weekday === draft.weekday && item.startPeriod <= draft.endPeriod && item.endPeriod >= draft.startPeriod);
    if (conflict) { setError(`這個時段與「${conflict.name}」（第 ${conflict.startPeriod}–${conflict.endPeriod} 節）重疊，請調整節次。`); return; }
    setBusy(true); setError('');
    try {
      const saved = await saveItem('courses', { ...draft, name: draft.name.trim(), room: draft.room.trim(), teacher: draft.teacher.trim() }, editing && editing !== 'new' ? editing.id : undefined) as Course;
      setEditing(saved);
      await refresh(); setEditing(null); notify(editing === 'new' ? '課程已加入課表' : '課程已更新');
    } catch (cause) { setError(cause instanceof Error ? cause.message : '儲存失敗，請稍後重試'); }
    finally { setBusy(false); }
  }

  return <div className="page-stack">
    <PageHeading eyebrow="Make room to learn" title="每週課表" description="安排學習，也留一些空白給自己。" action={<button className="button" onClick={() => openEditor()}><Plus size={17} />新增課程</button>} />
    <div className="stat-grid"><Stat label="每週課程" value={String(courses.length).padStart(2, '0')} note={`${new Set(courses.map(item => item.weekday)).size} 天有課`} /><Stat label="每週節數" value={String(totalPeriods).padStart(2, '0')} note="依學校節次安排" /></div>
    {courses.length === 0 && <EmptyState icon={BookOpen} title="新學期，從這裡開始" description="加入課程名稱、教室與節次，建立屬於你的每週課表。" action={<button className="button secondary" onClick={() => openEditor()}><Plus size={16} />新增第一堂課</button>} />}
    <section className="panel timetable-panel">
      <div className="panel-header"><div><h2>一週一覽</h2><p className="muted">左右滑動查看整週，點選課程編輯。</p></div><CalendarDays size={22} /></div>
      <div className="timetable-scroll" tabIndex={0} aria-label="每週課表，可左右滑動">
        <div className="timetable" style={{ display: 'grid', gridTemplateColumns: '42px repeat(7, minmax(92px, 1fr))', gridTemplateRows: '46px repeat(16, 58px)', minWidth: 714 }}>
          <div className="timetable-period" style={{ gridColumn: 1, gridRow: 1 }}>節次</div>
          {weekdays.map((day, index) => <div key={day} className={`timetable-day ${localDay === index + 1 ? 'is-today' : ''}`} style={{ gridColumn: index + 2, gridRow: 1 }}>{day}{localDay === index + 1 && <small>今天</small>}</div>)}
          {periods.map(period => <div key={`period-${period}`} className="timetable-period" style={{ gridColumn: 1, gridRow: period + 1 }}>{String(period).padStart(2, '0')}</div>)}
          {weekdays.flatMap((_, day) => periods.map(period => <div key={`cell-${day}-${period}`} className="timetable-cell" style={{ gridColumn: day + 2, gridRow: period + 1 }} aria-hidden="true" />))}
          {courses.map(item => <button key={item.id} className={`course-block course-color-${colorFor(item.name)}`} style={{ gridColumn: item.weekday + 1, gridRow: `${item.startPeriod + 1} / span ${item.endPeriod - item.startPeriod + 1}`, zIndex: 1 }} onClick={() => openEditor(item)} aria-label={`${item.name}，${weekdays[item.weekday - 1]}第 ${item.startPeriod} 到 ${item.endPeriod} 節${item.room ? `，${item.room}` : ''}，點選編輯`}><strong>{item.name}</strong>{item.room && <span>{item.room}</span>}{item.endPeriod > item.startPeriod && <small>第 {item.startPeriod}–{item.endPeriod} 節</small>}</button>)}
        </div>
      </div>
    </section>
    {courses.length > 0 && <section className="panel course-list"><div className="panel-header"><h2>所有課程</h2><span className="muted">{courses.length} 堂</span></div>{courses.map(item => <button className="list-row course-list-row" key={item.id} onClick={() => openEditor(item)}><span className={`course-dot course-color-${colorFor(item.name)}`} /><div className="course-list-content"><strong>{item.name}</strong><div className="muted">{weekdays[item.weekday - 1]} · 第 {item.startPeriod}{item.endPeriod !== item.startPeriod ? `–${item.endPeriod}` : ''} 節</div><div className="course-meta">{item.room && <span><MapPin size={13} />{item.room}</span>}{item.teacher && <span><UserRound size={13} />{item.teacher}</span>}</div></div><ChevronRight size={18} /></button>)}</section>}
    {editing && <Modal title={editing === 'new' ? '新增課程' : '編輯課程'} onClose={() => { if (!busy) setEditing(null); }}>
      <form className="form-grid module-form" onSubmit={submit}>
        <Field label="課程名稱"><input required autoFocus maxLength={150} value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} placeholder="課程名稱" /></Field>
        <Field label="教室"><input maxLength={150} value={draft.room} onChange={event => setDraft({ ...draft, room: event.target.value })} placeholder="選填，例如教學樓與教室編號" /></Field>
        <Field label="授課教師"><input maxLength={100} value={draft.teacher} onChange={event => setDraft({ ...draft, teacher: event.target.value })} placeholder="選填" /></Field>
        <Field label="上課日"><select value={draft.weekday} onChange={event => setDraft({ ...draft, weekday: Number(event.target.value) })}>{weekdays.map((day, index) => <option value={index + 1} key={day}>{day}</option>)}</select></Field>
        <div className="form-two-columns"><Field label="開始節次"><select value={draft.startPeriod} onChange={event => { const startPeriod = Number(event.target.value); setDraft({ ...draft, startPeriod, endPeriod: Math.max(startPeriod, draft.endPeriod) }); }}>{periods.map(period => <option key={period} value={period}>第 {period} 節</option>)}</select></Field><Field label="結束節次"><select value={draft.endPeriod} onChange={event => setDraft({ ...draft, endPeriod: Number(event.target.value) })}>{periods.map(period => <option key={period} value={period} disabled={period < draft.startPeriod}>第 {period} 節</option>)}</select></Field></div>
        <p className="muted">同一門課若每週上課兩天，請分別新增兩個時段。</p>
        {error && <p className="error-message" role="alert">{error}</p>}
        <div className="form-actions"><button type="button" className="button secondary" disabled={busy} onClick={() => setEditing(null)}>取消</button><SubmitButton busy={busy}>{editing === 'new' ? '加入課表' : '儲存變更'}</SubmitButton></div>
        {editing !== 'new' && <button type="button" className="button ghost danger" disabled={busy} onClick={() => { setDeleting(editing); setEditing(null); }}><Trash2 size={16} />刪除此課程</button>}
      </form>
    </Modal>}
    {deleting && <ConfirmDelete onClose={() => setDeleting(null)} onConfirm={async () => { await deleteItem('courses', deleting.id); await refresh(); setDeleting(null); notify('課程已刪除'); }} />}
  </div>;
}
