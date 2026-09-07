import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import type { AppData, Collection, Course, DocumentItem, Profile, RateResult } from '../src/lib/types';
import { currency, isDate, profileSchema, schemas, todayInZone } from '../server/validation';

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  UPLOADS: R2Bucket;
}
type Variables = { owner: string };
const app = new Hono<{ Bindings: Env; Variables: Variables }>();
const collections: Collection[] = ['expenses', 'documents', 'checklists', 'courses', 'exchanges', 'places'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DAY = 86_400_000;
const defaultProfile: Profile = {
  name: '', destination: '', school: '', departureDate: '', returnDate: '', semesterStart: '', semesterEnd: '',
  baseCurrency: 'CNY', localCurrency: 'EUR', semesterBudget: 0, monthlyBudgets: {}, studentId: '', address: '', timeZone: 'Asia/Shanghai',
};

function fail(status: 400 | 401 | 403 | 404 | 409 | 413 | 503, message: string): never {
  throw new HTTPException(status, { message });
}
function jsonError(error: unknown): string {
  return error instanceof z.ZodError ? error.issues[0]?.message || '欄位格式不正確' : '資料格式不正確';
}
async function readJson<T>(c: Parameters<typeof app.fetch>[0] extends never ? never : any, schema: z.ZodType<T>): Promise<T> {
  if (!c.req.header('Content-Type')?.toLowerCase().startsWith('application/json')) fail(400, '請使用 JSON 格式');
  const text = await c.req.text();
  if (new TextEncoder().encode(text).byteLength > 128 * 1024) fail(413, '資料內容過大');
  try { return schema.parse(JSON.parse(text)); } catch (error) { fail(400, jsonError(error)); }
}
function ownerFromRequest(request: Request): string | null {
  return request.headers.get('oai-authenticated-user-email')?.trim().toLowerCase() ||
    (new URL(request.url).hostname === 'localhost' ? request.headers.get('x-exchange-local-user')?.trim().toLowerCase() || 'local@exchange.life' : null) || null;
}
async function profile(env: Env, owner: string): Promise<Profile> {
  const row = await env.DB.prepare('SELECT data FROM profiles WHERE owner=?').bind(owner).first<{ data: string }>();
  return row ? { ...defaultProfile, ...JSON.parse(row.data) } : { ...defaultProfile };
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
  if (!collections.includes(value as Collection)) fail(404, '找不到此資料類別');
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
      const data = await response.json<unknown>();
      if (!Array.isArray(data) || !data.length || data.length > 1000) throw new Error('provider');
      const valid = data.filter((row): row is { base: string; quote: string; date: string; rate: number } => !!row && typeof row === 'object' && (row as any).base === base && (row as any).quote === quote && isDate((row as any).date) && (row as any).date >= from && (row as any).date <= target && Number.isFinite((row as any).rate) && (row as any).rate > 0);
      if (!valid.length) throw new Error('provider');
      const statements = valid.map(row => env.DB.prepare('INSERT INTO rates(base,quote,date,rate,fetched_at) VALUES(?,?,?,?,?) ON CONFLICT(base,quote,date) DO UPDATE SET rate=excluded.rate,fetched_at=excluded.fetched_at').bind(base, quote, row.date, row.rate, Date.now()));
      statements.push(env.DB.prepare('INSERT INTO rate_requests(base,quote,target,fetched_at) VALUES(?,?,?,?) ON CONFLICT(base,quote,target) DO UPDATE SET fetched_at=excluded.fetched_at').bind(base, quote, target, Date.now()));
      await env.DB.batch(statements); rows = await cached();
    } catch { stale = true; }
  }
  if (!rows.length) fail(503, '暫時無法取得此幣別的可靠匯率，請稍後再試');
  const latest = rows.at(-1)!;
  if (Date.parse(`${target}T00:00:00Z`) - Date.parse(`${latest.date}T00:00:00Z`) > 7 * DAY) stale = true;
  return { base, quote, date: latest.date, rate: latest.rate, stale, history: rows.map(row => ({ date: row.date, rate: row.rate })) };
}

app.use('*', async (c, next) => {
  await next();
  c.header('X-Content-Type-Options', 'nosniff'); c.header('Referrer-Policy', 'same-origin');
  c.header('Permissions-Policy', 'camera=(self), microphone=(), geolocation=()');
});
app.get('/api/auth/status', c => c.json({ authenticated: !!ownerFromRequest(c.req.raw), configured: true, setupAllowed: false }));
app.post('/api/auth/login', c => c.json({ error: '此版本使用 Sites 帳戶保護，請重新開啟網站登入' }, 401));
app.post('/api/auth/logout', () => fail(409, '此網站由 Sites 帳戶保護，請關閉頁面以結束使用'));
app.use('/api/*', async (c, next) => {
  c.header('Cache-Control', 'no-store');
  const owner = ownerFromRequest(c.req.raw); if (!owner) fail(401, '請先登入 Sites 以存取私人資料');
  c.set('owner', owner);
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(c.req.method) && c.req.header('X-Requested-With') !== 'ExchangeLife') fail(403, '請透過應用程式操作');
  await next();
});
app.get('/api/data', async c => {
  const owner = c.get('owner');
  const values = await Promise.all(collections.map(collection => list(c.env, owner, collection)));
  return c.json({ profile: await profile(c.env, owner), ...Object.fromEntries(collections.map((collection, index) => [collection, values[index]])) } as AppData);
});
app.put('/api/profile', async c => {
  const owner = c.get('owner'), value = await readJson(c, profileSchema), current = await profile(c.env, owner);
  if (value.baseCurrency !== current.baseCurrency) {
    const count = await c.env.DB.prepare("SELECT COUNT(*) count FROM items WHERE owner=? AND collection='expenses'").bind(owner).first<{ count: number }>();
    if (count?.count) fail(409, '已有記帳資料時無法變更本位幣，以免混合不同幣別的統計');
  }
  await c.env.DB.prepare('INSERT INTO profiles(owner,data,updated_at) VALUES(?,?,?) ON CONFLICT(owner) DO UPDATE SET data=excluded.data,updated_at=excluded.updated_at').bind(owner, JSON.stringify(value), Date.now()).run();
  return c.json(value);
});
app.get('/api/rates', async c => {
  const base = currency.safeParse(c.req.query('base')), quote = currency.safeParse(c.req.query('quote')), date = c.req.query('date');
  if (!base.success || !quote.success || (date !== undefined && !isDate(date))) fail(400, '請提供有效的幣別與日期');
  const p = await profile(c.env, c.get('owner')); if (date && date > today(p)) fail(400, '日期不可晚於今天');
  return c.json(await rates(c.env, c.get('owner'), base.data, quote.data, date));
});
app.post('/api/uploads', async c => {
  const form = await c.req.formData(), file = form.get('image');
  if (!(file instanceof File)) fail(400, '請選擇證件圖片');
  if (!file.size || file.size > 8 * 1024 * 1024) fail(413, '圖片大小必須介於 1 位元組及 8 MB 之間');
  const bytes = new Uint8Array(await file.arrayBuffer()), mime = imageMime(bytes);
  if (!mime || mime !== file.type.toLowerCase()) fail(400, '圖片格式無效，請使用 JPEG、PNG 或 WebP 圖片');
  const id = crypto.randomUUID(), owner = c.get('owner'), key = `${await ownerKey(owner)}/${id}`;
  await c.env.UPLOADS.put(key, bytes, { httpMetadata: { contentType: mime }, customMetadata: { name: file.name.slice(0, 180) } });
  await c.env.DB.prepare('INSERT INTO uploads(owner,id,mime,name,created_at) VALUES(?,?,?,?,?)').bind(owner, id, mime, file.name.replace(/[\\/\x00-\x1f]/g, '_').slice(0, 180), Date.now()).run();
  return c.json({ id }, 201);
});
app.get('/api/uploads/:id', async c => {
  const id = idParam(c.req.param('id')), owner = c.get('owner');
  const meta = await c.env.DB.prepare('SELECT mime FROM uploads WHERE owner=? AND id=?').bind(owner, id).first<{ mime: string }>();
  if (!meta) fail(404, '找不到圖片');
  const object = await c.env.UPLOADS.get(`${await ownerKey(owner)}/${id}`); if (!object) fail(404, '找不到圖片');
  return new Response(object.body, { headers: { 'Content-Type': meta.mime, 'Cache-Control': 'no-store', 'Content-Disposition': 'inline', 'X-Content-Type-Options': 'nosniff' } });
});
app.get('/api/export', async c => {
  const owner = c.get('owner'), values = await Promise.all(collections.map(collection => list(c.env, owner, collection)));
  const uploads = (await c.env.DB.prepare('SELECT id,mime,name,created_at FROM uploads WHERE owner=? ORDER BY created_at').bind(owner).all<{ id: string; mime: string; name: string; created_at: number }>()).results;
  const originals = await Promise.all(uploads.map(async row => { const object = await c.env.UPLOADS.get(`${await ownerKey(owner)}/${row.id}`); return { id: row.id, name: row.name, mime: row.mime, createdAt: new Date(row.created_at).toISOString(), encoding: 'base64', data: object ? toBase64(new Uint8Array(await object.arrayBuffer())) : '' }; }));
  return c.json({ format: 'exchange-life', version: 1, exportedAt: new Date().toISOString(), profile: await profile(c.env, owner), ...Object.fromEntries(collections.map((collection, index) => [collection, values[index]])), originals });
});

async function saveItem(c: any) {
  const collection = collectionParam(c.req.param('collection')), owner = c.get('owner');
  const id = c.req.method === 'PUT' ? idParam(c.req.param('id')) : crypto.randomUUID();
  const previous = c.req.method === 'PUT' ? await one<any>(c.env, owner, collection, id) : null;
  if (c.req.method === 'PUT' && !previous) fail(404, '找不到此項目');
  const value: any = await readJson(c, schemas[collection] as z.ZodType<any>), item: any = { ...value, id };
  const p = await profile(c.env, owner);
  if (collection === 'expenses') {
    if (item.date > today(p)) fail(400, '支出日期不能晚於今天');
    const result = await rates(c.env, owner, item.currency, p.baseCurrency, item.date); if (result.stale) fail(503, '目前只能取得過期匯率，請稍後再儲存這筆支出');
    item.rate = result.rate; item.baseAmount = Math.round((item.amount * result.rate + Number.EPSILON) * 100) / 100; item.baseCurrency = p.baseCurrency; item.rateDate = result.date;
  }
  if (collection === 'exchanges' && item.date > today(p)) fail(400, '換匯日期不能晚於今天');
  if (collection === 'documents' && item.imageId) {
    const exists = await c.env.DB.prepare('SELECT id FROM uploads WHERE owner=? AND id=?').bind(owner, item.imageId).first(); if (!exists) fail(400, '證件圖片不存在，請重新上傳');
  }
  if (collection === 'courses') {
    const courses = await list<Course>(c.env, owner, 'courses');
    if (courses.some(course => course.id !== id && course.weekday === item.weekday && course.startPeriod <= item.endPeriod && course.endPeriod >= item.startPeriod)) fail(409, '這個時段已有課程，請調整星期或節次');
  }
  const now = Date.now();
  await c.env.DB.prepare('INSERT INTO items(owner,collection,id,data,created_at,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(owner,collection,id) DO UPDATE SET data=excluded.data,updated_at=excluded.updated_at').bind(owner, collection, id, JSON.stringify(item), previous ? (await c.env.DB.prepare('SELECT created_at FROM items WHERE owner=? AND collection=? AND id=?').bind(owner, collection, id).first<{ created_at: number }>())?.created_at || now : now, now).run();
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
app.onError((error, c) => error instanceof HTTPException ? c.json({ error: error.message }, error.status) : (console.error('[exchange-life]', error instanceof Error ? error.name : 'UnknownError'), c.json({ error: '伺服器暫時無法完成操作，請稍後再試' }, 500)));

export default app;
