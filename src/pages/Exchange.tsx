import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { ArrowDownUp, ArrowRight, ArrowUpRight, Banknote, ChartNoAxesCombined, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { EmptyState, Field, Modal, PageHeading, SubmitButton } from '../components/ui';
import { api, deleteItem, saveItem } from '../lib/api';
import { currencies, money, shortDate, today } from '../lib/format';
import type { ExchangeRecord, ModuleProps, RateResult } from '../lib/types';

const messageOf = (error: unknown) => error instanceof Error ? error.message : '联网失败';
const rateNumber = (value: number) => new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 6 }).format(value);

export default function Exchange({ data, refresh, notify }: ModuleProps) {
  const { profile, exchanges } = data;
  const [rates, setRates] = useState<RateResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [rateError, setRateError] = useState('');
  const [retry, setRetry] = useState(0);
  const [reversed, setReversed] = useState(false);
  const [amount, setAmount] = useState('');
  const [editing, setEditing] = useState<ExchangeRecord | 'new' | null>(null);
  const [deleting, setDeleting] = useState<ExchangeRecord | null>(null);
  useEffect(() => {
    const update = () => { if (navigator.onLine && document.visibilityState === 'visible') setRetry(value => value + 1); };
    const interval = setInterval(update, 60 * 60 * 1000);
    window.addEventListener('focus', update);
    return () => { clearInterval(interval); window.removeEventListener('focus', update); };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setRateError(''); setRates(null);
    api<RateResult>(`/rates?base=${encodeURIComponent(profile.localCurrency)}&quote=${encodeURIComponent(profile.baseCurrency)}`, { signal: controller.signal })
      .then(result => { if (!controller.signal.aborted) setRates(result); })
      .catch(error => { if (!controller.signal.aborted) setRateError(messageOf(error)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [profile.localCurrency, profile.baseCurrency, retry]);
  const fromCurrency = reversed ? profile.baseCurrency : profile.localCurrency;
  const toCurrency = reversed ? profile.localCurrency : profile.baseCurrency;
  const converted = rates && amount !== '' ? Number(amount) * (reversed ? 1 / rates.rate : rates.rate) : null;
  const samePair = exchanges.filter(item => item.fromCurrency === profile.baseCurrency && item.toCurrency === profile.localCurrency);
  const paid = samePair.reduce((sum, item) => sum + item.fromAmount, 0);
  const received = samePair.reduce((sum, item) => sum + item.toAmount, 0);
  const weightedRate = received > 0 ? paid / received : null;
  const sortedRecords = useMemo(() => [...exchanges].sort((a, b) => b.date.localeCompare(a.date)), [exchanges]);
  const history = rates?.history.filter(point => Number.isFinite(point.rate) && point.rate > 0).sort((a, b) => a.date.localeCompare(b.date)) || [];
  const firstRate = history[0]?.rate;
  const lastRate = history.at(-1)?.rate;
  const change = firstRate && lastRate ? (lastRate - firstRate) / firstRate * 100 : null;

  function swap() {
    if (converted !== null && Number.isFinite(converted)) setAmount(String(Number(converted.toFixed(6))));
    setReversed(value => !value);
  }

  return <div className="page-stack">
    <PageHeading title="汇率与换汇" action={<button className="button" onClick={() => setEditing('new')}><Plus size={17} />新增</button>} />
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 310px), 1fr))', gap: 20 }}>
      <section className="panel"><div className="panel-header"><h2>货币换算</h2><button className="icon-button" aria-label="更新汇率" disabled={loading} onClick={() => setRetry(value => value + 1)}><RefreshCw size={15} className={loading ? 'spin' : ''} /></button></div>
        <div style={{ padding: '6px 0 20px' }}><div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>1 {profile.localCurrency}</div><div style={{ display: 'flex', gap: 10, alignItems: 'baseline' }}><strong style={{ fontSize: 39, fontWeight: 500, letterSpacing: '-1.5px' }}>{loading ? '…' : rates ? rateNumber(rates.rate) : '—'}</strong><span className="muted">{profile.baseCurrency}</span></div><div className="muted" style={{ fontSize: 11, marginTop: 8 }}>{rates ? `${shortDate(rates.date)}${rates.stale ? ' · 缓存' : ''}` : loading ? '获取中…' : '暂无汇率'}</div></div>
        <Field label={`持有金额 · ${fromCurrency}`}><div style={{ position: 'relative' }}><input type="number" inputMode="decimal" min="0" step="any" max="1000000000" value={amount} placeholder="输入金额" onChange={event => setAmount(event.target.value)} style={{ width: '100%', paddingRight: 68 }} /><span className="muted" style={{ position: 'absolute', right: 15, top: '50%', transform: 'translateY(-50%)', fontSize: 12 }}>{fromCurrency}</span></div></Field>
        <div style={{ display: 'flex', justifyContent: 'center', margin: '7px 0' }}><button className="icon-button" aria-label={`切换为 ${toCurrency} 换算 ${fromCurrency}`} onClick={swap}><ArrowDownUp size={17} /></button></div>
        <div style={{ background: '#f4f4ee', borderRadius: 12, padding: '17px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}><output aria-live="polite" aria-label="换算结果" style={{ fontSize: 24, fontWeight: 500 }}>{converted !== null && Number.isFinite(converted) && converted >= 0 ? new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 }).format(converted) : '—'}</output><span className="muted" style={{ fontSize: 12 }}>{toCurrency}</span></div>
        {rateError && <p className="error-message" role="status" style={{ fontSize: 12 }}>{rateError}</p>}
      </section>
      <section className="panel"><div className="panel-header"><h2>近 30 天汇率</h2><span className="muted" style={{ fontSize: 11 }}>{profile.localCurrency} / {profile.baseCurrency}</span></div>
        {history.length >= 2 ? <><div style={{ paddingTop: 10 }}><span style={{ fontSize: 26, letterSpacing: '-0.8px' }}>{rateNumber(lastRate!)}</span><span className="muted" style={{ fontSize: 11, marginLeft: 12 }}>{change! > 0 ? '+' : ''}{change!.toFixed(2)}% · 30 天</span></div><RateChart points={history} currency={profile.baseCurrency} /></> : <EmptyState icon={ChartNoAxesCombined} title={loading ? '加载中' : '暂无报价'} />}
      </section>
    </div>
    <div className="stat-grid">
      <div className="stat-card"><span className="muted">累计换入 · {profile.localCurrency}</span><strong>{money(received, profile.localCurrency)}</strong><span className="muted">{samePair.length} 笔 {profile.baseCurrency} → {profile.localCurrency}</span></div>
      <div className="stat-card"><span className="muted">累计投入 · {profile.baseCurrency}</span><strong>{money(paid, profile.baseCurrency)}</strong><span className="muted">依实际支付金额计算</span></div>
      <div className="stat-card"><span className="muted">加权平均换汇成本</span><strong>{weightedRate !== null ? rateNumber(weightedRate) : '—'}</strong><span className="muted">{weightedRate !== null ? `1 ${profile.localCurrency} = ${rateNumber(weightedRate)} ${profile.baseCurrency}` : '记下第一笔换汇后开始计算'}</span></div>
    </div>
    <section className="panel"><div className="panel-header"><h2>换汇记录 <span className="muted" style={{ fontSize: 12, fontWeight: 400 }}> / {exchanges.length}</span></h2><Banknote size={18} className="muted" /></div>
      {sortedRecords.length ? <div>{sortedRecords.map(item => <div key={item.id} className="list-row" style={{ display: 'flex', gap: 12, alignItems: 'center' }}><div style={{ width: 40, height: 40, flexShrink: 0, borderRadius: 12, display: 'grid', placeItems: 'center', background: '#f3f3ed' }}><ArrowUpRight size={17} /></div><div style={{ flex: 1, minWidth: 0 }}><div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 7, fontSize: 13, fontWeight: 550 }}><span>{money(item.fromAmount, item.fromCurrency)}</span><ArrowRight size={12} className="muted" /><span>{money(item.toAmount, item.toCurrency)}</span></div><div className="muted" style={{ fontSize: 11, marginTop: 5, overflowWrap: 'anywhere' }}>{shortDate(item.date)}{item.note ? ` · ${item.note}` : ''}</div><div className="muted" style={{ fontSize: 10, marginTop: 4 }}>1 {item.toCurrency} = {rateNumber(item.fromAmount / item.toAmount)} {item.fromCurrency}</div></div><button className="icon-button" aria-label={`编辑 ${shortDate(item.date)} 换汇记录`} onClick={() => setEditing(item)}><Pencil size={15} /></button><button className="icon-button" aria-label={`删除 ${shortDate(item.date)} 换汇记录`} onClick={() => setDeleting(item)}><Trash2 size={15} /></button></div>)}</div> : <EmptyState icon={Banknote} title="暂无换汇记录" action={<button className="button secondary" onClick={() => setEditing('new')}><Plus size={16} />新增</button>} />}
    </section>
    {editing && <ExchangeForm key={editing === 'new' ? 'new' : editing.id} item={editing === 'new' ? undefined : editing} {...{ data, refresh, notify }} onClose={() => setEditing(null)} />}
    {deleting && <DeleteExchange item={deleting} refresh={refresh} notify={notify} onClose={() => setDeleting(null)} />}
  </div>;
}

function RateChart({ points, currency }: { points: RateResult['history']; currency: string }) {
  const minimum = Math.min(...points.map(point => point.rate));
  const maximum = Math.max(...points.map(point => point.rate));
  const padding = (maximum - minimum) * 0.18 || maximum * 0.01 || 0.01;
  const low = minimum - padding; const high = maximum + padding;
  const firstTime = Date.parse(points[0]!.date);
  const duration = Date.parse(points.at(-1)!.date) - firstTime || 1;
  const xy = points.map(point => [54 + (Date.parse(point.date) - firstTime) / duration * 340, 161 - (point.rate - low) / (high - low) * 122]);
  const line = xy.map(([x, y], index) => `${index ? 'L' : 'M'}${x!.toFixed(2)},${y!.toFixed(2)}`).join(' ');
  return <svg viewBox="0 0 420 215" role="img" aria-label={`${points[0]!.date}至${points.at(-1)!.date}汇率走势。最低 ${rateNumber(minimum)}、最高 ${rateNumber(maximum)} ${currency}`} style={{ width: '100%', display: 'block', marginTop: 8 }}>
    {[0, 1, 2].map(index => <g key={index}><line x1="54" x2="394" y1={39 + index * 61} y2={39 + index * 61} stroke="#eeeeea" /><text x="46" y={43 + index * 61} textAnchor="end" fontSize="9" fill="#94948b">{rateNumber(high - index / 2 * (high - low))}</text></g>)}
    <path d={`${line} L394,161 L54,161 Z`} fill="#f4f4ed" /><path d={line} fill="none" stroke="#44443a" strokeWidth="2" strokeLinejoin="round" />
    <circle cx={xy.at(-1)![0]} cy={xy.at(-1)![1]} r="3.5" fill="#44443a" />
    <text x="54" y="192" fontSize="11" fill="#85857b">{points[0]!.date.slice(5).replace('-', '.')}</text><text x="394" y="192" textAnchor="end" fontSize="11" fill="#85857b">{points.at(-1)!.date.slice(5).replace('-', '.')}</text>
  </svg>;
}

function ExchangeForm({ item, data, refresh, notify, onClose }: ModuleProps & { item?: ExchangeRecord; onClose: () => void }) {
  const [values, setValues] = useState({ date: item?.date || today(data.profile.timeZone), fromCurrency: item?.fromCurrency || data.profile.baseCurrency, toCurrency: item?.toCurrency || data.profile.localCurrency, fromAmount: item?.fromAmount.toString() || '', toAmount: item?.toAmount.toString() || '', note: item?.note || '' });
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault(); setError('');
    if (values.fromCurrency === values.toCurrency) { setError('请选择两种不同的币种'); return; }
    setBusy(true);
    try { await saveItem('exchanges', { ...values, fromAmount: Number(values.fromAmount), toAmount: Number(values.toAmount) }, item?.id); await refresh(); notify(item ? '换汇记录已保存' : '换汇记录已保存'); onClose(); }
    catch (failure) { setError(messageOf(failure)); } finally { setBusy(false); }
  }
  const options = [...new Set([...currencies, values.fromCurrency, values.toCurrency])];
  return <Modal title={item ? '编辑换汇记录' : '记录一次换汇'} onClose={() => !busy && onClose()}><form className="form-grid" onSubmit={submit}>
    <Field label="换汇日期"><input type="date" required max={today(data.profile.timeZone)} value={values.date} onChange={event => setValues({ ...values, date: event.target.value })} /></Field>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 110px', gap: 12 }}><Field label="实际支付金额（含手续费）"><input type="number" inputMode="decimal" min="0.01" max="1000000000" step="0.01" required autoFocus value={values.fromAmount} placeholder="0.00" onChange={event => setValues({ ...values, fromAmount: event.target.value })} /></Field><Field label="支付币种"><select value={values.fromCurrency} onChange={event => setValues({ ...values, fromCurrency: event.target.value })}>{options.map(currency => <option key={currency}>{currency}</option>)}</select></Field></div>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 110px', gap: 12 }}><Field label="实际收到金额"><input type="number" inputMode="decimal" min="0.01" max="1000000000" step="0.01" required value={values.toAmount} placeholder="0.00" onChange={event => setValues({ ...values, toAmount: event.target.value })} /></Field><Field label="收到币种"><select value={values.toCurrency} onChange={event => setValues({ ...values, toCurrency: event.target.value })}>{options.map(currency => <option key={currency}>{currency}</option>)}</select></Field></div>
    {Number(values.fromAmount) > 0 && Number(values.toAmount) > 0 && <p className="muted" style={{ fontSize: 12 }}>实际成本：1 {values.toCurrency} = {rateNumber(Number(values.fromAmount) / Number(values.toAmount))} {values.fromCurrency}</p>}
    <Field label="备注（选填）"><input maxLength={300} value={values.note} onChange={event => setValues({ ...values, note: event.target.value })} placeholder="例如：银行、机场" /></Field>
    {error && <p className="error-message" role="alert">{error}</p>}<div className="form-actions"><button className="button secondary" type="button" disabled={busy} onClick={onClose}>取消</button><SubmitButton busy={busy}>保存记录</SubmitButton></div>
  </form></Modal>;
}

function DeleteExchange({ item, refresh, notify, onClose }: { item: ExchangeRecord; refresh: () => Promise<void>; notify: (message: string) => void; onClose: () => void }) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  async function remove() { setBusy(true); setError(''); try { await deleteItem('exchanges', item.id); await refresh(); notify('换汇记录已删除'); onClose(); } catch (failure) { setError(messageOf(failure)); } finally { setBusy(false); } }
  return <Modal title="删除换汇？" onClose={() => !busy && onClose()}><p>{money(item.fromAmount, item.fromCurrency)} → {money(item.toAmount, item.toCurrency)}</p>{error && <p className="error-message" role="alert">{error}</p>}<div className="form-actions"><button className="button secondary" disabled={busy} onClick={onClose}>取消</button><button className="button danger" disabled={busy} onClick={remove}>{busy ? '删除中…' : '删除'}</button></div></Modal>;
}




