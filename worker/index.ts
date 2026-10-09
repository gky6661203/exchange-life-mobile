import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import type { D1Database, R2Bucket } from '@cloudflare/workers-types';
import type { AppData, Collection, Course, DocumentItem, Profile, RateResult } from '../src/lib/types';
import { currency, isDate, profileSchema, schemas, todayInZone, watchStockSchema } from '../server/validation';
import { stockQuote } from './stocks';
import { nextBillingDate } from '../src/lib/lifestyle';
import { mountAccounts, type AccountVariables, type AccountBindings } from './accounts';

export interface Env extends AccountBindings {
  ASSETS: { fetch: (request: Request) => Promise<Response> };
  DB: D1Database;
  UPLOADS: R2Bucket;
}
type Variables = AccountVariables;
const app = new Hono<{ Bindings: Env; Variables: Variables }>();
const collections: Collection[] = ['expenses', 'documents', 'checklists', 'courses', 'exchanges', 'places', 'subscriptions', 'workouts', 'watchlist'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DAY = 86_400_000;
const defaultProfile: Profile = {
  name: '', destination: '', school: '', departureDate: '', returnDate: '', semesterStart: '', semesterEnd: '',
  baseCurrency: 'TWD', localCurrency: 'TWD', semesterBudget: 0, monthlyBudgets: {}, studentId: '', address: '', timeZone: 'Asia/Taipei',
};

function fail(status: 400 | 401 | 403 | 404 | 409 | 413 | 503, message: string): never {
  throw new HTTPException(status, { message });
}
function jsonError(error: unknown): string {
  return error instanceof z.ZodError ? error.issues[0]?.message || '字段格式不正确' : '资料格式不正确';
}
async function readJson<T>(c: Parameters<typeof app.fetch>[0] extends never ? never : any, schema: z.ZodType<T>): Promise<T> {
  if (!c.req.header('Content-Type')?.toLowerCase().startsWith('application/json')) fail(400, '请使用 JSON 格式');
  const text = await c.req.text();
  if (new TextEncoder().encode(text).byteLength > 128 * 1024) fail(413, '资料内容过大');
  try { return schema.parse(JSON.parse(text)); } catch (error) { fail(400, jsonError(error)); }
}
async function profile(env: Env, owner: string): Promise<Profile> {
  const row = await env.DB.prepare('SELECT data FROM profiles WHERE owner=?').bind(owner).first<{ data: string }>();
  if (row) return { ...defaultProfile, ...JSON.parse(row.data) };
  const account = await env.DB.prepare('SELECT name FROM accounts WHERE data_owner=?').bind(owner).first<{ name: string }>();
  return { ...defaultProfile, name: account?.name || '' };
}
async function list<T>(env: Env, owner: string, collection: Collection): Promise<T[]> {
  const result = await env.DB.prepare('SELECT data FROM items WHERE owner=? AND collection=? ORDER BY created_at,id').bind(owner, collection).all<{ data: string }>();
  return result.results.map(row => JSON.parse(row.data));
}
async function one<T>(env: Env, owner: string, collection: Collection, id: string): Promise<T | null> {
  const row = await env.DB.prepare('SELECT data FROM items WHERE owner=? AND collection=? AND id=?').bind(owner, collection, id).first<{ data: string }>();
  return row ? JSON.parse(row.data) : null;
}
function today(profileValue: Profile) { return todayInZone(Date.now(), profileValue.timeZone); }
function dateShift(date: string, days: number) { return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10); }
function collectionParam(value: string): Collection {
  if (!collections.includes(value as Collection)) fail(404, '找不到此资料类别');
  return value as Collection;
}
function idParam(value: string) { if (!UUID.test(value)) fail(404, '找不到此項目'); return value; }
async function ownerKey(owner: string) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(owner));
  return [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}
function imageMime(bytes: Uint8Array): string | null {
  if (bytes.length >= 24 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png';
  if (bytes.length >= 10 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes.at(-2) === 0xff && bytes.at(-1) === 0xd9) return 'image/jpeg';
  const ascii = (start: number, end: number) => String.fromCharCode(...bytes.slice(start, end));
  if (bytes.length >= 30 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp';
  return null;
}
function toBase64(bytes: Uint8Array) {
  let output = '';
  for (let index = 0; index < bytes.length; index += 0x8000) output += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return btoa(output);
}

async function rates(env: Env, owner: string, base: string, quote: string, requested?: string): Promise<RateResult> {
  const p = await profile(env, owner), todayValue = today(p);
  const target = requested && requested < todayValue ? requested : todayValue;
  const from = dateShift(target, -29);
  if (base === quote) return { base, quote, rate: 1, date: target, stale: false, history: Array.from({ length: 30 }, (_, index) => ({ date: dateShift(from, index), rate: 1 })) };
  const cached = async () => (await env.DB.prepare('SELECT date,rate,fetched_at FROM rates WHERE base=? AND quote=? AND date>=? AND date<=? ORDER BY date').bind(base, quote, from, target).all<{ date: string; rate: number; fetched_at: number }>()).results;
  let rows = await cached();
  const request = await env.DB.prepare('SELECT fetched_at FROM rate_requests WHERE base=? AND quote=? AND target=?').bind(base, quote, target).first<{ fetched_at: number }>();
  const ttl = requested && target < todayValue ? DAY : 3_600_000;
  let stale = false;
  if (!rows.length || !request || Date.now() - request.fetched_at >= ttl) {
    try {
      const url = new URL('https://api.frankfurter.dev/v2/rates');
      url.search = new URLSearchParams({ base, quotes: quote, from, to: target }).toString();
      const response = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(12_000) });
      if (!response.ok) throw new Error('provider');
      const data = await response.json();
      if (!Array.isArray(data) || !data.length || data.length > 1000) throw new Error('provider');
      const valid = data.filter((row): row is { base: string; quote: string; date: string; rate: number } => !!row && typeof row === 'object' && (row as any).base === base && (row as any).quote === quote && isDate((row as any).date) && (row as any).date >= from && (row as any).date <= target && Number.isFinite((row as any).rate) && (row as any).rate > 0);
      if (!valid.length) throw new Error('provider');
      const statements = valid.map(row => env.DB.prepare('INSERT INTO rates(base,quote,date,rate,fetched_at) VALUES(?,?,?,?,?) ON CONFLICT(base,quote,date) DO UPDATE SET rate=excluded.rate,fetched_at=excluded.fetched_at').bind(base, quote, row.date, row.rate, Date.now()));
      statements.push(env.DB.prepare('INSERT INTO rate_requests(base,quote,target,fetched_at) VALUES(?,?,?,?) ON CONFLICT(base,quote,target) DO UPDATE SET fetched_at=excluded.fetched_at').bind(base, quote, target, Date.now()));
      await env.DB.batch(statements); rows = await cached();
    } catch { stale = true; }
  }
  if (!rows.length) fail(503, '暂时无法取得此币种的可靠汇率，请稍后再试');
  const latest = rows.at(-1)!;
  if (Date.parse(`${target}T00:00:00Z`) - Date.parse(`${latest.date}T00:00:00Z`) > 7 * DAY) stale = true;
  return { base, quote, date: latest.date, rate: latest.rate, stale, history: rows.map(row => ({ date: row.date, rate: row.rate })) };
}

app.use('*', async (c, next) => {
  await next();
  c.header('X-Content-Type-Options', 'nosniff'); c.header('Referrer-Policy', 'same-origin');
  c.header('Permissions-Policy', 'camera=(self), microphone=(), geolocation=()');
});
mountAccounts(app);
app.get('/api/data', async c => {
  const owner = c.get('owner');
  const values = await Promise.all(collections.map(collection => list(c.env, owner, collection)));
  return c.json({ profile: await profile(c.env, owner), ...Object.fromEntries(collections.map((collection, index) => [collection, values[index]])) } as AppData);
});
app.get('/api/stocks/quote', async c => {
  const input = watchStockSchema.safeParse({ market: c.req.query('market') || 'TW', symbol: c.req.query('symbol'), name: '' });
  if (!input.success) fail(400, '请输入有效的市场和股票代码');
  try { return c.json(await stockQuote(c.env.DB, input.data.market, input.data.symbol)); }
  catch { fail(503, '暂时无法取得行情，请稍后刷新或查看原始行情页面'); }
});
app.post('/api/subscriptions/:id/renew', async c => {
  const id = idParam(c.req.param('id')), owner = c.get('owner');
  const row = await one<import('../src/lib/types').Subscription>(c.env, owner, 'subscriptions', id);
  if (!row) fail(404, '找不到此订阅');
  const input = await readJson(c, z.object({ nextRenewal: z.string() }));
  if (input.nextRenewal !== row.nextRenewal) fail(409, '续费日期已更新，请刷新后再试');
  const updated = { ...row, nextRenewal: nextBillingDate(row.nextRenewal, row.billingDay, row.intervalMonths) };
  const result = await c.env.DB.prepare("UPDATE items SET data=?,updated_at=? WHERE owner=? AND collection='subscriptions' AND id=? AND data=?").bind(JSON.stringify(updated), Date.now(), owner, id, JSON.stringify(row)).run();
  if (!result.meta.changes) fail(409, '订阅已更新，请刷新后再试');
  return c.json(updated);
});
app.put('/api/profile', async c => {
  const owner = c.get('owner'), value = await readJson(c, profileSchema), current = await profile(c.env, owner);
  if (value.baseCurrency !== current.baseCurrency) {
    const count = await c.env.DB.prepare("SELECT COUNT(*) count FROM items WHERE owner=? AND collection='expenses'").bind(owner).first<{ count: number }>();
    if (count?.count) fail(409, '已有记账资料时无法变更本位币，以免混合不同币种的统计');
  }
  await c.env.DB.prepare('INSERT INTO profiles(owner,data,updated_at) VALUES(?,?,?) ON CONFLICT(owner) DO UPDATE SET data=excluded.data,updated_at=excluded.updated_at').bind(owner, JSON.stringify(value), Date.now()).run();
  return c.json(value);
});
app.get('/api/rates', async c => {
  const base = currency.safeParse(c.req.query('base')), quote = currency.safeParse(c.req.query('quote')), date = c.req.query('date');
  if (!base.success || !quote.success || (date !== undefined && !isDate(date))) fail(400, '请提供有效的币种与日期');
  const p = await profile(c.env, c.get('owner')); if (date && date > today(p)) fail(400, '日期不可晚于今天');
  return c.json(await rates(c.env, c.get('owner'), base.data, quote.data, date));
});
app.post('/api/uploads', async c => {
  const form = await c.req.formData(), file = form.get('image');
  if (!(file instanceof File)) fail(400, '请选择证件图片');
  if (!file.size || file.size > 8 * 1024 * 1024) fail(413, '图片大小必须介于 1 字节及 8 MB 之间');
  const bytes = new Uint8Array(await file.arrayBuffer()), mime = imageMime(bytes);
  if (!mime || mime !== file.type.toLowerCase()) fail(400, '图片格式无效，请使用 JPEG、PNG 或 WebP 图片');
  const id = crypto.randomUUID(), owner = c.get('owner'), key = `${await ownerKey(owner)}/${id}`;
  await c.env.UPLOADS.put(key, bytes, { httpMetadata: { contentType: mime }, customMetadata: { name: file.name.slice(0, 180) } });
  await c.env.DB.prepare('INSERT INTO uploads(owner,id,mime,name,created_at) VALUES(?,?,?,?,?)').bind(owner, id, mime, file.name.replace(/[\\/\x00-\x1f]/g, '_').slice(0, 180), Date.now()).run();
  return c.json({ id }, 201);
});
app.get('/api/uploads/:id', async c => {
  const id = idParam(c.req.param('id')), owner = c.get('owner');
  const meta = await c.env.DB.prepare('SELECT mime FROM uploads WHERE owner=? AND id=?').bind(owner, id).first<{ mime: string }>();
  if (!meta) fail(404, '找不到图片');
  const object = await c.env.UPLOADS.get(`${await ownerKey(owner)}/${id}`); if (!object) fail(404, '找不到图片');
  return new Response(object.body as unknown as ReadableStream, { headers: { 'Content-Type': meta.mime, 'Cache-Control': 'no-store', 'Content-Disposition': 'inline', 'X-Content-Type-Options': 'nosniff' } });
});
app.get('/api/export', async c => {
  const owner = c.get('owner'), values = await Promise.all(collections.map(collection => list(c.env, owner, collection)));
  const uploads = (await c.env.DB.prepare('SELECT id,mime,name,created_at FROM uploads WHERE owner=? ORDER BY created_at').bind(owner).all<{ id: string; mime: string; name: string; created_at: number }>()).results;
  const originals = await Promise.all(uploads.map(async row => { const object = await c.env.UPLOADS.get(`${await ownerKey(owner)}/${row.id}`); return { id: row.id, name: row.name, mime: row.mime, createdAt: new Date(row.created_at).toISOString(), encoding: 'base64', data: object ? toBase64(new Uint8Array(await object.arrayBuffer())) : '' }; }));
  return c.json({ format: 'exchange-life', version: 1, exportedAt: new Date().toISOString(), profile: await profile(c.env, owner), ...Object.fromEntries(collections.map((collection, index) => [collection, values[index]])), originals });
});

async function saveItem(c: any) {
  const collection = collectionParam(c.req.param('collection')), owner = c.get('owner');
  let id = c.req.method === 'PUT' ? idParam(c.req.param('id')) : crypto.randomUUID();
  const previous = c.req.method === 'PUT' ? await one<any>(c.env, owner, collection, id) : null;
  if (c.req.method === 'PUT' && !previous) fail(404, '找不到此項目');
  const value: any = await readJson(c, schemas[collection] as z.ZodType<any>), item: any = { ...value, id };
  const p = await profile(c.env, owner);
  if (collection === 'workouts') {
    if (item.date > today(p)) fail(400, '未来的日期不能提前打卡');
    if (previous && item.date !== previous.date) fail(409, '请在对应日期重新打卡');
    if (c.req.method === 'POST') {
      const hash = await ownerKey(`${owner}:workout:${item.date}`);
      id = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
      item.id = id;
    }
  }
  if (collection === 'expenses') {
    if (item.date > today(p)) fail(400, '支出日期不能晚于今天');
    const result = await rates(c.env, owner, item.currency, p.baseCurrency, item.date); if (result.stale) fail(503, '目前只能取得过期汇率，请稍后再保存这笔支出');
    item.rate = result.rate; item.baseAmount = Math.round((item.amount * result.rate + Number.EPSILON) * 100) / 100; item.baseCurrency = p.baseCurrency; item.rateDate = result.date;
  }
  if (collection === 'exchanges' && item.date > today(p)) fail(400, '换汇日期不能晚于今天');
  if (collection === 'documents' && item.imageId) {
    const exists = await c.env.DB.prepare('SELECT id FROM uploads WHERE owner=? AND id=?').bind(owner, item.imageId).first(); if (!exists) fail(400, '证件图片不存在，请重新上传');
  }
  if (collection === 'courses') {
    const courses = await list<Course>(c.env, owner, 'courses');
    if (courses.some(course => course.id !== id && course.weekday === item.weekday && course.startPeriod <= item.endPeriod && course.endPeriod >= item.startPeriod)) fail(409, '这个时段已有课程，请调整星期或节次');
  }
  const now = Date.now();
  await c.env.DB.prepare('INSERT INTO items(owner,collection,id,data,created_at,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(owner,collection,id) DO UPDATE SET data=excluded.data,updated_at=excluded.updated_at').bind(owner, collection, id, JSON.stringify(item), previous ? (await c.env.DB.prepare('SELECT created_at FROM items WHERE owner=? AND collection=? AND id=?').bind(owner, collection, id).first())?.created_at || now : now, now).run();
  if (collection === 'documents' && previous?.imageId && previous.imageId !== item.imageId) await removeUpload(c.env, owner, previous.imageId);
  return c.json(item, c.req.method === 'POST' ? 201 : 200);
}
async function removeUpload(env: Env, owner: string, id: string) {
  const reference = await env.DB.prepare("SELECT id FROM items WHERE owner=? AND collection='documents' AND json_extract(data,'$.imageId')=? LIMIT 1").bind(owner, id).first();
  if (!reference) { await env.DB.prepare('DELETE FROM uploads WHERE owner=? AND id=?').bind(owner, id).run(); await env.UPLOADS.delete(`${await ownerKey(owner)}/${id}`); }
}
app.post('/api/:collection', saveItem);
app.put('/api/:collection/:id', saveItem);
app.delete('/api/:collection/:id', async c => {
  const collection = collectionParam(c.req.param('collection')), id = idParam(c.req.param('id')), owner = c.get('owner');
  const item = await one<DocumentItem>(c.env, owner, collection, id); if (!item) fail(404, '找不到此項目');
  await c.env.DB.prepare('DELETE FROM items WHERE owner=? AND collection=? AND id=?').bind(owner, collection, id).run();
  if (collection === 'documents' && item.imageId) await removeUpload(c.env, owner, item.imageId);
  return c.body(null, 204);
});
app.all('/api/*', c => c.json({ error: '找不到此 API' }, 404));
app.notFound(c => c.env.ASSETS.fetch(c.req.raw));
app.onError((error, c) => error instanceof HTTPException ? c.json({ error: error.message }, error.status) : (console.error('[exchange-life]', error instanceof Error ? error.name : 'UnknownError'), c.json({ error: '服务器暂时无法完成操作，请稍后再试' }, 500)));

export default app;
