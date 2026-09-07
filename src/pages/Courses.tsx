import { useState } from 'react';
import type { FormEvent } from 'react';
import { BookOpen, CalendarDays, ChevronRight, MapPin, Plus, Trash2, UserRound } from 'lucide-react';
import { deleteItem, saveItem } from '../lib/api';
import { today } from '../lib/format';
import type { Course, ModuleProps } from '../lib/types';
import { ConfirmDelete, EmptyState, Field, Modal, PageHeading, Stat, SubmitButton } from '../components/ui';

const weekdays = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
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
    if (!draft.name.trim()) { setError('请填写课程名称。'); return; }
    if (!Number.isInteger(draft.weekday) || draft.weekday < 1 || draft.weekday > 7 || !Number.isInteger(draft.startPeriod) || !Number.isInteger(draft.endPeriod) || draft.startPeriod < 1 || draft.endPeriod > 16 || draft.startPeriod > draft.endPeriod) { setError('请选择有效的上课时段；结束节次须在开始节次之后或相同。'); return; }
    const conflict = data.courses.find(item => item.id !== (editing && editing !== 'new' ? editing.id : undefined) && item.weekday === draft.weekday && item.startPeriod <= draft.endPeriod && item.endPeriod >= draft.startPeriod);
    if (conflict) { setError(`这个时段与「${conflict.name}」重叠，请调整。`); return; }
    setBusy(true); setError('');
    try {
      const saved = await saveItem('courses', { ...draft, name: draft.name.trim(), room: draft.room.trim(), teacher: draft.teacher.trim() }, editing && editing !== 'new' ? editing.id : undefined) as Course;
      setEditing(saved);
      await refresh(); setEditing(null); notify(editing === 'new' ? '课程已加入课表' : '课程已保存');
    } catch (cause) { setError(cause instanceof Error ? cause.message : '保存失败'); }
    finally { setBusy(false); }
  }

  return <div className="page-stack">
    <PageHeading title="每周课表" action={<button className="button" onClick={() => openEditor()}><Plus size={17} />新增</button>} />
    <div className="stat-grid"><Stat label="每周课程" value={String(courses.length).padStart(2, '0')} note={`${new Set(courses.map(item => item.weekday)).size} 天有课`} /><Stat label="每周节数" value={String(totalPeriods).padStart(2, '0')} note="依学校节次安排" /></div>
    {courses.length === 0 && <EmptyState icon={BookOpen} title="暂无课程" action={<button className="button secondary" onClick={() => openEditor()}><Plus size={16} />添加</button>} />}
    <section className="panel timetable-panel">
      <div className="panel-header"><h2>一周一览</h2><CalendarDays size={22} /></div>
      <div className="timetable-scroll" tabIndex={0} aria-label="每周课表，可左右滑动">
        <div className="timetable" style={{ display: 'grid', gridTemplateColumns: '42px repeat(7, minmax(92px, 1fr))', gridTemplateRows: '46px repeat(16, 58px)', minWidth: 714 }}>
          <div className="timetable-period" style={{ gridColumn: 1, gridRow: 1 }}>节次</div>
          {weekdays.map((day, index) => <div key={day} className={`timetable-day ${localDay === index + 1 ? 'is-today' : ''}`} style={{ gridColumn: index + 2, gridRow: 1 }}>{day}{localDay === index + 1 && <small>今天</small>}</div>)}
          {periods.map(period => <div key={`period-${period}`} className="timetable-period" style={{ gridColumn: 1, gridRow: period + 1 }}>{String(period).padStart(2, '0')}</div>)}
          {weekdays.flatMap((_, day) => periods.map(period => <div key={`cell-${day}-${period}`} className="timetable-cell" style={{ gridColumn: day + 2, gridRow: period + 1 }} aria-hidden="true" />))}
          {courses.map(item => <button key={item.id} className={`course-block course-color-${colorFor(item.name)}`} style={{ gridColumn: item.weekday + 1, gridRow: `${item.startPeriod + 1} / span ${item.endPeriod - item.startPeriod + 1}`, zIndex: 1 }} onClick={() => openEditor(item)} aria-label={`${item.name}，${weekdays[item.weekday - 1]}第 ${item.startPeriod} 到 ${item.endPeriod} 节${item.room ? `，${item.room}` : ''}，点选编辑`}><strong>{item.name}</strong>{item.room && <span>{item.room}</span>}{item.endPeriod > item.startPeriod && <small>第 {item.startPeriod}–{item.endPeriod} 节</small>}</button>)}
        </div>
      </div>
    </section>
    {courses.length > 0 && <section className="panel course-list"><div className="panel-header"><h2>所有课程</h2><span className="muted">{courses.length} 堂</span></div>{courses.map(item => <button className="list-row course-list-row" key={item.id} onClick={() => openEditor(item)}><span className={`course-dot course-color-${colorFor(item.name)}`} /><div className="course-list-content"><strong>{item.name}</strong><div className="muted">{weekdays[item.weekday - 1]} · 第 {item.startPeriod}{item.endPeriod !== item.startPeriod ? `–${item.endPeriod}` : ''} 节</div><div className="course-meta">{item.room && <span><MapPin size={13} />{item.room}</span>}{item.teacher && <span><UserRound size={13} />{item.teacher}</span>}</div></div><ChevronRight size={18} /></button>)}</section>}
    {editing && <Modal title={editing === 'new' ? '新增课程' : '编辑课程'} onClose={() => { if (!busy) setEditing(null); }}>
      <form className="form-grid module-form" onSubmit={submit}>
        <Field label="课程名称"><input required autoFocus maxLength={150} value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} placeholder="课程名称" /></Field>
        <Field label="教室"><input maxLength={150} value={draft.room} onChange={event => setDraft({ ...draft, room: event.target.value })} placeholder="选填" /></Field>
        <Field label="教师"><input maxLength={100} value={draft.teacher} onChange={event => setDraft({ ...draft, teacher: event.target.value })} placeholder="选填" /></Field>
        <Field label="上课日"><select value={draft.weekday} onChange={event => setDraft({ ...draft, weekday: Number(event.target.value) })}>{weekdays.map((day, index) => <option value={index + 1} key={day}>{day}</option>)}</select></Field>
        <div className="form-two-columns"><Field label="开始节次"><select value={draft.startPeriod} onChange={event => { const startPeriod = Number(event.target.value); setDraft({ ...draft, startPeriod, endPeriod: Math.max(startPeriod, draft.endPeriod) }); }}>{periods.map(period => <option key={period} value={period}>第 {period} 节</option>)}</select></Field><Field label="结束节次"><select value={draft.endPeriod} onChange={event => setDraft({ ...draft, endPeriod: Number(event.target.value) })}>{periods.map(period => <option key={period} value={period} disabled={period < draft.startPeriod}>第 {period} 节</option>)}</select></Field></div>
        {error && <p className="error-message" role="alert">{error}</p>}
        <div className="form-actions"><button type="button" className="button secondary" disabled={busy} onClick={() => setEditing(null)}>取消</button><SubmitButton busy={busy}>{editing === 'new' ? '加入课表' : '保存'}</SubmitButton></div>
        {editing !== 'new' && <button type="button" className="button ghost danger" disabled={busy} onClick={() => { setDeleting(editing); setEditing(null); }}><Trash2 size={16} />删除此课程</button>}
      </form>
    </Modal>}
    {deleting && <ConfirmDelete onClose={() => setDeleting(null)} onConfirm={async () => { await deleteItem('courses', deleting.id); await refresh(); setDeleting(null); notify('课程已删除'); }} />}
  </div>;
}




