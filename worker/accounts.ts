import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { HTTPException } from 'hono/http-exception';
import type { Context, Hono } from 'hono';
import { z } from 'zod';
import type { D1Database } from '@cloudflare/workers-types';

export type AccountBindings = { DB: D1Database; APP_ORIGIN?: string; SECURE_COOKIES?: string };
export type AccountVariables = { owner: string; account: Account };
type Account = { id: string; email: string; name: string; data_owner: string; password_hash: string };
type AuthContext = Context<{ Bindings: AccountBindings; Variables: AccountVariables }>;
const COOKIE = 'exchange_account';
const SECONDS = 30 * 24 * 60 * 60;
const email = z.string().trim().toLowerCase().email('请输入有效的 Email').max(254);
const credentials = z.object({ email, password: z.string().min(1, '请输入密码').max(256) });
const registration = credentials.extend({ name: z.string().trim().min(1, '请输入名字').max(80), password: z.string().min(12, '密码至少需要 12 个字符').max(256) });
function fail(status: 400 | 401 | 403 | 409 | 413 | 429, message: string): never { throw new HTTPException(status, { message }); }
const publicAccount = (user: Account) => ({ id: user.id, email: user.email, name: user.name });
async function digest(text: string) { return Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))).toString('hex'); }
async function derive(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => scrypt(password, salt, 64, { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 }, (error, key) => error ? reject(error) : resolve(key)));
}
export async function encodePassword(password: string) {
  const salt = randomBytes(32).toString('hex');
  return `scrypt-v1:${salt}:${(await derive(password, salt)).toString('hex')}`;
}
async function matches(password: string, stored?: string) {
  const [version, salt, hash] = (stored || `scrypt-v1:${'0'.repeat(64)}:${'0'.repeat(128)}`).split(':');
  if (version !== 'scrypt-v1' || !/^[a-f0-9]{64}$/.test(salt) || !/^[a-f0-9]{128}$/.test(hash)) return false;
  const actual = await derive(password, salt);
  return timingSafeEqual(actual, Buffer.from(hash, 'hex')) && !!stored;
}
async function body<T>(c: AuthContext, schema: z.ZodType<T>): Promise<T> {
  if (!c.req.header('Content-Type')?.toLowerCase().startsWith('application/json')) fail(400, '请使用 JSON 格式');
  const text = await c.req.text();
  if (new TextEncoder().encode(text).byteLength > 4096) fail(413, '输入内容过长');
  let value: unknown;
  try { value = JSON.parse(text); } catch { fail(400, '输入格式不正确'); }
  const result = schema.safeParse(value);
  if (!result.success) fail(400, result.error.issues[0]?.message || '请输入有效资料');
  return result.data as T;
}
async function limit(c: AuthContext, identity?: string) {
  const now = Date.now(), window = Math.floor(now / 900000), ip = c.req.header('cf-connecting-ip') || 'local';
  const keys = identity ? [{ key: await digest(`email:${identity}:${window}`), max: 12 }] : [{ key: await digest(`ip:${ip}:${window}`), max: 40 }];
  await c.env.DB.prepare('DELETE FROM account_attempts WHERE expires_at<?').bind(now).run();
  for (const { key, max } of keys) {
    const row = await c.env.DB.prepare('INSERT INTO account_attempts(key,count,expires_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count').bind(key, (window + 1) * 900000).first<{ count: number }>();
    if ((row?.count || 0) > max) { c.header('Retry-After', String(Math.ceil(((window + 1) * 900000 - now) / 1000))); fail(429, '尝试次数过多，请稍后再试'); }
  }
}
export async function accountFromRequest(c: AuthContext): Promise<Account | null> {
  const token = getCookie(c, COOKIE);
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  return c.env.DB.prepare('SELECT a.* FROM accounts a JOIN account_sessions s ON s.account_id=a.id WHERE s.token_hash=? AND s.expires_at>?').bind(await digest(token), Date.now()).first<Account>();
}
async function session(c: AuthContext, account: Account) {
  const token = randomBytes(32).toString('hex'), previous = getCookie(c, COOKIE);
  const statements = [c.env.DB.prepare('DELETE FROM account_sessions WHERE expires_at<=?').bind(Date.now())];
  if (previous) statements.push(c.env.DB.prepare('DELETE FROM account_sessions WHERE token_hash=?').bind(await digest(previous)));
  statements.push(c.env.DB.prepare('INSERT INTO account_sessions(token_hash,account_id,expires_at) VALUES(?,?,?)').bind(await digest(token), account.id, Date.now() + SECONDS * 1000));
  await c.env.DB.batch(statements);
  setCookie(c, COOKIE, token, { path: '/', httpOnly: true, secure: c.env.SECURE_COOKIES === 'true' || new URL(c.req.url).protocol === 'https:', sameSite: 'Lax', maxAge: SECONDS });
}
// Legacy data may only be connected when the hosting platform proves the same Email.
// Merely registering an Email must never grant access to pre-existing records.
async function connectLegacy(c: AuthContext, account: Account) {
  const trustedEmail = c.req.header('oai-authenticated-user-email')?.trim().toLowerCase();
  if (!c.req.header('oai-authenticated-user-id') || trustedEmail !== account.email || !account.data_owner.startsWith('account:')) return;
  const existing = await c.env.DB.prepare('SELECT owner FROM profiles WHERE owner=? UNION SELECT owner FROM items WHERE owner=? LIMIT 1').bind(trustedEmail, trustedEmail).first();
  if (!existing) return;
  const current = await c.env.DB.prepare('SELECT owner FROM items WHERE owner=? LIMIT 1').bind(account.data_owner).first();
  if (current) return;
  await c.env.DB.prepare('UPDATE accounts SET data_owner=? WHERE id=?').bind(trustedEmail, account.id).run();
  account.data_owner = trustedEmail;
}
export function mountAccounts<Bindings extends AccountBindings>(app: Hono<{ Bindings: Bindings; Variables: AccountVariables }>) {
  app.use('/api/*', async (c, next) => {
    c.header('Cache-Control', 'no-store');
    const origin = c.req.header('Origin');
    const allowedOrigins = [new URL(c.req.url).origin, ...(c.env.APP_ORIGIN?.split(',').map(value => value.trim()) || [])];
    if (origin && !allowedOrigins.includes(origin)) fail(403, '此来源不允许存取资料');
    if (c.req.header('Sec-Fetch-Site') === 'cross-site') fail(403, '请从网站内操作');
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(c.req.method) && c.req.header('X-Requested-With') !== 'ExchangeLife') fail(403, '请从网站内操作');
    await next();
  });
  app.get('/api/auth/status', async c => {
    const user = await accountFromRequest(c as unknown as AuthContext);
    return c.json({ authenticated: !!user, configured: true, user: user ? publicAccount(user) : null });
  });
  app.post('/api/auth/register', async c => {
    const context = c as unknown as AuthContext;
    await limit(context);
    const input = await body(context, registration);
    await limit(context, input.email);
    const password_hash = await encodePassword(input.password), id = crypto.randomUUID();
    const account: Account = { id, email: input.email, name: input.name, password_hash, data_owner: `account:${id}` };
    const inserted = await c.env.DB.prepare('INSERT INTO accounts(id,email,name,password_hash,data_owner,created_at) VALUES(?,?,?,?,?,?) ON CONFLICT(email) DO NOTHING RETURNING id').bind(id, account.email, account.name, password_hash, account.data_owner, Date.now()).first();
    if (!inserted) fail(409, '这个 Email 已注册，请登录或使用其他 Email');
    await connectLegacy(context, account);
    await session(context, account);
    return c.json({ authenticated: true, user: publicAccount(account) }, 201);
  });
  app.post('/api/auth/login', async c => {
    const context = c as unknown as AuthContext;
    await limit(context);
    const input = await body(context, credentials);
    await limit(context, input.email);
    const account = await c.env.DB.prepare('SELECT * FROM accounts WHERE email=?').bind(input.email).first<Account>();
    if (!(await matches(input.password, account?.password_hash)) || !account) fail(401, 'Email 或密码不正确');
    await connectLegacy(context, account);
    await session(context, account);
    return c.json({ authenticated: true, user: publicAccount(account) });
  });
  app.post('/api/auth/logout', async c => {
    const token = getCookie(c, COOKIE);
    if (token) await c.env.DB.prepare('DELETE FROM account_sessions WHERE token_hash=?').bind(await digest(token)).run();
    deleteCookie(c, COOKIE, { path: '/', httpOnly: true, sameSite: 'Lax', secure: c.env.SECURE_COOKIES === 'true' || new URL(c.req.url).protocol === 'https:' });
    return c.body(null, 204);
  });
  app.use('/api/*', async (c, next) => {
    const account = await accountFromRequest(c as unknown as AuthContext);
    if (!account) fail(401, '请先登录账号');
    c.set('owner', account!.data_owner); c.set('account', account!);
    await next();
  });
}
