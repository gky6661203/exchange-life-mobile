import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, ChangeEvent, FormEvent } from 'react';
import { ChevronDown, CreditCard, Eye, FileImage, Plus, Pencil, ShieldCheck, Trash2, Upload, X } from 'lucide-react';
import { api, apiUrl, deleteItem, saveItem } from '../lib/api';
import { daysUntil, shortDate, today } from '../lib/format';
import type { DocumentItem, ModuleProps } from '../lib/types';
import { ConfirmDelete, EmptyState, Field, Modal, PageHeading, Stat, SubmitButton } from '../components/ui';
import WalletScene from '../components/WalletScene';

type DocumentDraft = Omit<DocumentItem, 'id'>;
const emptyDraft = (): DocumentDraft => ({ name: '', number: '', expiryDate: '', note: '' });
const messageOf = (error: unknown) => error instanceof Error ? error.message : '操作失败';

async function normalizeImage(file: File): Promise<Blob> {
  if (file.size > 8 * 1024 * 1024) throw new Error('图片须小于 8 MB。');
  if (!file.type.startsWith('image/') && !/\.(jpe?g|png|webp|heic|heif)$/i.test(file.name)) throw new Error('请选择图片。');
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = objectUrl;
    try { await image.decode(); } catch { throw new Error('无法读取照片，请转成 JPG 或 PNG。'); }
    if (!image.naturalWidth || !image.naturalHeight) throw new Error('图片内容无效。');
    const scale = Math.min(1, 2400 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('暂时无法处理图片。');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.88));
    if (!blob || blob.size > 8 * 1024 * 1024) throw new Error('照片处理后仍过大。');
    return blob;
  } finally { URL.revokeObjectURL(objectUrl); }
}

export default function Documents({ data, refresh, notify }: ModuleProps) {
  const [expanded, setExpanded] = useState<string | null>(data.documents[0]?.id || null);
  const [editing, setEditing] = useState<DocumentItem | 'new' | null>(null);
  const [draft, setDraft] = useState<DocumentDraft>(emptyDraft);
  const [deleting, setDeleting] = useState<DocumentItem | null>(null);
  const [photo, setPhoto] = useState<DocumentItem | null>(null);
  const [imageBlob, setImageBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [imageBusy, setImageBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const imageGeneration = useRef(0);
  const currentDate = today(data.profile.timeZone);
  const expiring = data.documents.filter(item => { const days = daysUntil(item.expiryDate, currentDate); return days !== null && days <= 30; });

  useEffect(() => {
    if (!imageBlob) { setPreviewUrl(''); return; }
    const url = URL.createObjectURL(imageBlob);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [imageBlob]);

  function openEditor(item?: DocumentItem) {
    imageGeneration.current += 1;
    setImageBusy(false); setImageBlob(null); setError('');
    setDraft(item ? { name: item.name, number: item.number, expiryDate: item.expiryDate, note: item.note, imageId: item.imageId } : emptyDraft());
    setEditing(item || 'new');
  }

  function closeEditor() {
    if (busy) return;
    imageGeneration.current += 1;
    setEditing(null); setImageBlob(null); setImageBusy(false);
  }

  async function selectImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const generation = ++imageGeneration.current;
    setImageBusy(true); setError('');
    try {
      const blob = await normalizeImage(file);
      if (generation === imageGeneration.current) setImageBlob(blob);
    } catch (cause) {
      if (generation === imageGeneration.current) setError(messageOf(cause));
    } finally {
      if (generation === imageGeneration.current) setImageBusy(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || imageBusy) return;
    if (!draft.name.trim()) { setError('请填写证件名称。'); return; }
    setBusy(true); setError('');
    try {
      let imageId = draft.imageId;
      if (imageBlob) {
        const formData = new FormData();
        formData.append('image', imageBlob, 'document.jpg');
        const upload = await api<{ id: string }>('/uploads', { method: 'POST', body: formData });
        imageId = upload.id;
        setDraft(value => ({ ...value, imageId }));
        setImageBlob(null);
      }
      const saved = await saveItem('documents', { ...draft, name: draft.name.trim(), number: draft.number.trim(), note: draft.note.trim(), imageId: imageId || undefined }, editing && editing !== 'new' ? editing.id : undefined) as DocumentItem;
      setEditing(saved);
      await refresh();
      setEditing(null); setImageBlob(null);
      notify(editing === 'new' ? '证件已加入' : '证件已保存');
    } catch (cause) { setError(messageOf(cause)); }
    finally { setBusy(false); }
  }

  function expiryLabel(item: DocumentItem) {
    const days = daysUntil(item.expiryDate, currentDate);
    if (days === null) return <span className="pill">无到期日</span>;
    return <span className={`pill ${days <= 7 ? 'expiry-danger' : days <= 30 ? 'expiry-warning' : ''}`}>
      {days < 0 ? `已过期 ${Math.abs(days)} 天` : days === 0 ? '今日到期' : days <= 30 ? `${days} 天后到期` : `${shortDate(item.expiryDate)} 到期`}
    </span>;
  }

  const editorPhoto = previewUrl || (draft.imageId ? apiUrl(`/uploads/${encodeURIComponent(draft.imageId)}`) : '');

  return <div className="page-stack wallet-page">
    <PageHeading title="证件卡包" action={<button className="button" onClick={() => openEditor()}><Plus size={17} />新增</button>} />
    <div className="stat-grid">
      <Stat label="证件" value={String(data.documents.length).padStart(2, '0')} />
      <Stat label="临期" value={String(expiring.length).padStart(2, '0')} />
    </div>
    {data.documents.length === 0 ? <EmptyState icon={ShieldCheck} title="暂无证件" description="添加护照、签证或学生证。" action={<button className="button secondary" onClick={() => openEditor()}><Plus size={17} />添加</button>} /> :
      <><WalletScene items={data.documents} selected={expanded} onSelect={setExpanded} /><div className="document-wallet">{data.documents.map((item, index) => <article className={`document-card document-card-${index % 4} ${expanded === item.id ? 'selected' : ''}`} style={{ '--card-index': index } as CSSProperties} key={item.id}>
        <button className="document-card-top" onClick={() => setExpanded(expanded === item.id ? null : item.id)} aria-expanded={expanded === item.id} aria-controls={`document-${item.id}`}>
          <div className="document-card-heading"><CreditCard size={25} /><span>卡片 {String(index + 1).padStart(2, '0')}</span><ChevronDown size={18} style={{ transform: expanded === item.id ? 'rotate(180deg)' : undefined }} /></div>
          <h2>{item.name}</h2>
          <div className="document-number">{item.number ? (expanded === item.id ? item.number : item.number.length > 4 ? `•••• ${item.number.slice(-4)}` : '••••') : '未填号码'}</div>
          {expiryLabel(item)}
          {item.imageId && <span className="document-photo-chip"><FileImage size={14} />照片</span>}
        </button>
        {expanded === item.id && <div className="document-details" id={`document-${item.id}`}>
          {item.expiryDate && <p className="muted">到期日 · {shortDate(item.expiryDate)}</p>}
          {item.note && <p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{item.note}</p>}
          {item.imageId ? <button className="document-photo" onClick={() => setPhoto(item)} aria-label={`放大${item.name}照片`}><img src={apiUrl(`/uploads/${encodeURIComponent(item.imageId)}`)} alt={`${item.name}照片`} loading="lazy" /><span><Eye size={16} />查看照片</span></button> : <div className="document-photo-placeholder"><FileImage size={24} /><span>未加照片</span></div>}
          <div className="row-actions"><button className="button secondary" onClick={() => openEditor(item)}><Pencil size={15} />编辑</button><button className="icon-button danger" aria-label={`删除${item.name}`} onClick={() => setDeleting(item)}><Trash2 size={17} /></button></div>
        </div>}
      </article>)}</div></>}
    {editing && <Modal title={editing === 'new' ? '新增证件' : '编辑证件'} onClose={closeEditor}>
      <form className="form-grid module-form" onSubmit={submit}>
        <Field label="证件名称"><input autoFocus required maxLength={100} value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} placeholder="例如：护照" /></Field>
        <Field label="证件号码"><input maxLength={150} autoCapitalize="characters" autoComplete="off" value={draft.number} onChange={event => setDraft({ ...draft, number: event.target.value })} placeholder="选填" /></Field>
        <Field label="到期日"><input type="date" value={draft.expiryDate} onChange={event => setDraft({ ...draft, expiryDate: event.target.value })} /></Field>
        <Field label="备注"><textarea rows={3} maxLength={2000} value={draft.note} onChange={event => setDraft({ ...draft, note: event.target.value })} placeholder="选填" /></Field>
        <div className="field"><span>证件照片</span>
          {editorPhoto && <div className="photo-preview"><img src={editorPhoto} alt="证件照片预览" /><button type="button" className="icon-button" aria-label="移除照片" disabled={busy || imageBusy} onClick={() => { setImageBlob(null); setDraft({ ...draft, imageId: '' }); }}><X size={17} /></button></div>}
          <label className="button secondary" style={{ position: 'relative', overflow: 'hidden' }}><Upload size={17} />{imageBusy ? '处理中…' : editorPhoto ? '更换照片' : '选择照片'}<input type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" onChange={selectImage} disabled={busy || imageBusy} aria-label="选择证件照片" style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }} /></label>
        </div>
        {error && <p className="error-message" role="alert">{error}</p>}
        <div className="form-actions"><button type="button" className="button secondary" onClick={closeEditor} disabled={busy}>取消</button><SubmitButton busy={busy || imageBusy}>{editing === 'new' ? '新增证件' : '保存'}</SubmitButton></div>
      </form>
    </Modal>}
    {photo && <Modal title={photo.name} onClose={() => setPhoto(null)}><div className="fullscreen-photo"><img src={apiUrl(`/uploads/${encodeURIComponent(photo.imageId || '')}`)} alt={`${photo.name}证件照片`} /></div></Modal>}
    {deleting && <ConfirmDelete onClose={() => setDeleting(null)} onConfirm={async () => { await deleteItem('documents', deleting.id); await refresh(); setDeleting(null); notify('证件已删除'); }} />}
  </div>;
}




