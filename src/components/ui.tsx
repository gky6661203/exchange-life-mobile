import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { X, LoaderCircle, Trash2, type LucideIcon } from 'lucide-react';
export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const id = useId();
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose); closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const timer = setTimeout(() => (ref.current?.querySelector<HTMLElement>('input,select,textarea') || ref.current?.querySelector<HTMLElement>('button'))?.focus(), 70);
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeRef.current();
      if (event.key !== 'Tab') return;
      const elements = Array.from(ref.current?.querySelectorAll<HTMLElement>('button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex="0"]') || []).filter(el => el.getClientRects().length);
      const first = elements[0], last = elements.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', keydown);
    return () => { clearTimeout(timer); document.body.style.overflow = previousOverflow; document.removeEventListener('keydown', keydown); previous?.focus(); };
  }, []);
  return <div className="modal-backdrop" onClick={e => { if (e.target === e.currentTarget) onClose(); }}><div className="modal" role="dialog" aria-modal="true" aria-label={title} aria-labelledby={id} ref={ref}><div className="modal-handle" /><div className="modal-header"><h2 id={id}>{title}</h2><button className="icon-button" onClick={onClose} aria-label="关闭"><X size={20} /></button></div><div className="modal-body">{children}</div></div></div>;
}
export function PageHeading({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: string; action?: ReactNode }) {
  return <header className="page-heading"><div>{eyebrow && <p className="page-eyebrow">{eyebrow}</p>}<h1>{title}</h1>{description && <p className="page-description">{description}</p>}</div>{action && <div className="page-heading-action">{action}</div>}</header>;
}
export function EmptyState({ icon: Icon, title, description, action }: { icon: LucideIcon; title: string; description?: string; action?: ReactNode }) {
  return <div className="empty-state"><div className="empty-icon"><Icon size={27} strokeWidth={1.4} /></div><h3>{title}</h3>{description && <p>{description}</p>}{action}</div>;
}
export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return <label className="field"><span>{label}</span>{children}{hint && <small className="muted">{hint}</small>}</label>;
}
export function SubmitButton({ busy, children }: { busy: boolean; children: ReactNode }) { return <button className="button" type="submit" disabled={busy}>{busy && <LoaderCircle size={16} className="spin" />}{busy ? '保存中…' : children}</button>; }
export function Stat({ label, value, note }: { label: string; value: ReactNode; note?: ReactNode }) { return <div className="stat-card"><span className="muted">{label}</span><strong>{value}</strong>{note && <small className="muted">{note}</small>}</div>; }
export function ConfirmDelete({ onConfirm, onClose }: { onConfirm: () => Promise<void>; onClose: () => void }) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  return <Modal title="删除？" onClose={onClose}>{error && <p className="error-message" role="alert">{error}</p>}<div className="form-actions"><button className="button secondary" disabled={busy} onClick={onClose}>取消</button><button className="button danger" disabled={busy} onClick={async () => { setBusy(true); try { await onConfirm(); onClose(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }}><Trash2 size={16} />{busy ? '删除中…' : '删除'}</button></div></Modal>;
}




