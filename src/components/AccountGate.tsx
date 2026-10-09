import { useState, type FormEvent, type ReactNode } from 'react';
import { ArrowRight, Eye, EyeOff, LoaderCircle, ShieldCheck } from 'lucide-react';
import { api } from '../lib/api';

export default function AccountGate({ brand, onLogin }: { brand: ReactNode; onLogin: () => Promise<void> }) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState(''), [name, setName] = useState('');
  const [password, setPassword] = useState(''), [confirm, setConfirm] = useState('');
  const [visible, setVisible] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const registering = mode === 'register';
  function switchMode(next: typeof mode) { setMode(next); setError(''); setPassword(''); setConfirm(''); setVisible(false); }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setError('');
    if (registering && password !== confirm) { setError('两次输入的密码不一致'); return; }
    setBusy(true);
    try {
      await api(`/auth/${mode}`, { method: 'POST', body: JSON.stringify({ email, password, ...(registering ? { name } : {}) }) });
      setPassword(''); setConfirm(''); await onLogin();
    } catch (cause) { setError(cause instanceof Error ? cause.message : '暂时无法登录，请稍后再试'); }
    finally { setBusy(false); }
  }
  return <main className="account-page">
    <header className="account-brand">{brand}</header>
    <section className="account-intro"><div className="account-orbit" aria-hidden="true"><span>出发</span><span>生活</span><span>下一站</span><div><ArrowRight size={42} strokeWidth={1.6} /></div></div><h1>你的下一站，<br />从这里开始。</h1><p>把预算、课表和重要证件，<br />放进自己的交换生活手账。</p></section>
    <section className="account-card" aria-label="账号登录与注册">
      <div className="account-tabs" role="group" aria-label="选择登录或注册"><button type="button" aria-pressed={!registering} onClick={() => switchMode('login')} disabled={busy}>登录</button><button type="button" aria-pressed={registering} onClick={() => switchMode('register')} disabled={busy}>注册账号</button></div>
      <h2>{registering ? '建立你的生活空间' : '欢迎回来'}</h2><p className="muted">{registering ? '每个账号都有独立的手账与卡包。' : '登录后继续你的交换旅程。'}</p>
      <form onSubmit={submit}>
        {registering && <label className="field"><span>名字</span><input required autoComplete="name" maxLength={80} value={name} onChange={e => setName(e.target.value)} placeholder="怎么称呼你" disabled={busy} /></label>}
        <label className="field"><span>Email</span><input type="email" required autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} maxLength={254} value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" disabled={busy} /></label>
        <label className="field"><span>密码</span><div className="password-field"><input aria-label="密码" type={visible ? 'text' : 'password'} required autoComplete={registering ? 'new-password' : 'current-password'} minLength={registering ? 12 : 1} maxLength={256} value={password} onChange={e => setPassword(e.target.value)} placeholder={registering ? '至少 12 个字符' : '输入账号密码'} disabled={busy} /><button type="button" className="icon-button" aria-label={visible ? '隐藏密码' : '显示密码'} onClick={() => setVisible(value => !value)}>{visible ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></label>
        {registering && <label className="field"><span>确认密码</span><input type={visible ? 'text' : 'password'} autoComplete="new-password" required minLength={12} maxLength={256} value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="再输入一次密码" disabled={busy} /></label>}
        {error && <p className="error-message" role="alert">{error}</p>}
        <button className="button account-submit" type="submit" disabled={busy}>{busy && <LoaderCircle size={19} className="spin" />}{busy ? '请稍候…' : registering ? '创建账号' : '登录'}{!busy && <ArrowRight size={18} />}</button>
      </form>
      <p className="account-security"><ShieldCheck size={15} />资料仅向你的账号开放</p>
      {registering && <p className="account-note">请保存好密码。目前不提供邮件找回密码。</p>}
    </section>
    <footer className="account-footer">Exchange life · 把日子过成自己的样子</footer>
  </main>;
}
