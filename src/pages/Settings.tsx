import { useState, type FormEvent } from 'react';
import { Download, LogOut, ArrowUpRight, Smartphone, Check, FileChartColumn } from 'lucide-react';
import type { ModuleProps, Page, Profile } from '../lib/types';
import { api } from '../lib/api';
import { currencies, today } from '../lib/format';
import { PageHeading, Field, SubmitButton } from '../components/ui';
export default function Settings({ data, refresh, notify, navigate, logout }: ModuleProps & { navigate: (page: Page) => void; logout: () => void }) {
  const [form, setForm] = useState<Profile>({ ...data.profile });
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [exporting, setExporting] = useState(false);
  const set = (key: keyof Profile, value: string) => setForm(f => ({ ...f, [key]: value }));
  async function save(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try { await api('/profile', { method: 'PUT', body: JSON.stringify(form) }); await refresh(); notify('交换旅程已保存'); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function exportData() {
    setExporting(true); setError('');
    try { const value = await api('/export'); const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `exchange-life-${today()}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 3000); notify('已导出所有资料与证件原件'); } catch (e) { setError((e as Error).message); } finally { setExporting(false); }
  }
  return <div className="page-stack"><PageHeading title="设置" />
  <form onSubmit={save} className="settings-form"><section className="panel"><div className="panel-header"><h2>关于你与下一站</h2><span className="pill">私人资料</span></div><div className="form-grid"><Field label="怎么称呼你"><input value={form.name} onChange={e => set('name', e.target.value)} maxLength={80} placeholder="你的名字" autoComplete="given-name" /></Field><Field label="交换目的地"><input value={form.destination} onChange={e => set('destination', e.target.value)} maxLength={120} placeholder="城市、国家" /></Field><Field label="交换学校"><input value={form.school} onChange={e => set('school', e.target.value)} maxLength={160} placeholder="学校名称" /></Field><Field label="学号"><input value={form.studentId} onChange={e => set('studentId', e.target.value)} maxLength={80} placeholder="开学后再补充也可以" /></Field></div><Field label="住宿地址"><textarea value={form.address} onChange={e => set('address', e.target.value)} maxLength={500} placeholder="随时可以查到的当地地址" rows={2} /></Field></section>
  <section className="panel"><div className="panel-header"><h2>旅程的时间</h2><span className="muted small">日程以当地时区计算</span></div><div className="form-grid"><Field label="出发日期"><input type="date" value={form.departureDate} onChange={e => set('departureDate', e.target.value)} /></Field><Field label="返程日期"><input type="date" min={form.departureDate || undefined} value={form.returnDate} onChange={e => set('returnDate', e.target.value)} /></Field><Field label="学期开始"><input type="date" value={form.semesterStart} onChange={e => set('semesterStart', e.target.value)} /></Field><Field label="学期结束"><input type="date" min={form.semesterStart || undefined} value={form.semesterEnd} onChange={e => set('semesterEnd', e.target.value)} /></Field><Field label="当地时区"><select value={form.timeZone} onChange={e => set('timeZone', e.target.value)}>{['Asia/Shanghai','Asia/Taipei','Asia/Hong_Kong','Asia/Tokyo','Asia/Seoul','Asia/Singapore','Asia/Bangkok','Europe/London','Europe/Paris','Europe/Berlin','Europe/Amsterdam','Europe/Stockholm','Europe/Zurich','America/New_York','America/Chicago','America/Denver','America/Los_Angeles','America/Toronto','America/Vancouver','Australia/Sydney','Pacific/Auckland'].map(t => <option key={t} value={t}>{t.replaceAll('_', ' ')}</option>)}</select></Field></div></section>
  <section className="panel"><div className="panel-header"><h2>币种</h2></div><div className="form-grid"><Field label="本位币"><select disabled={data.expenses.length > 0} value={form.baseCurrency} onChange={e => set('baseCurrency', e.target.value)}>{currencies.map(c => <option key={c}>{c}</option>)}</select></Field><Field label="当地币种"><select value={form.localCurrency} onChange={e => set('localCurrency', e.target.value)}>{currencies.map(c => <option key={c}>{c}</option>)}</select></Field></div></section>
  {error && <p className="error-message" role="alert">{error}</p>}<div className="form-actions"><SubmitButton busy={busy}><Check size={17} />保存设置</SubmitButton></div></form>
  <section className="panel"><div className="panel-header"><h2>导出</h2></div><button className="settings-action" onClick={() => navigate('report')}><FileChartColumn size={22} /><span><strong>交换总结</strong></span><ArrowUpRight size={18} /></button><button className="settings-action" onClick={exportData} disabled={exporting}><Download size={22} /><span><strong>{exporting ? '整理中…' : '导出资料'}</strong></span><ArrowUpRight size={18} /></button></section>
  <section className="panel install-panel"><Smartphone size={26} strokeWidth={1.4} /><div><h2>加入 iPhone 主屏幕</h2></div></section>
  <div className="spread settings-footer"><span className="muted small">Exchange life · v1.0</span><button className="button secondary" onClick={logout}><LogOut size={16} />退出</button></div></div>;
}




