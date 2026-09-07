import assert from 'node:assert/strict';
import test from 'node:test';
import { harness } from './helpers.js';

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jOZkAAAAASUVORK5CYII=', 'base64');
function upload(bytes: Uint8Array = PNG, type = 'image/png', name = 'passport.png') {
  const form = new FormData(); form.append('image', new Blob([new Uint8Array(bytes)], { type }), name); return form;
}

test('private originals require authentication and exports include the exact image bytes', async t => {
  const server = await harness(); t.after(server.close); await server.login();
  const saved = await server.request('/uploads', 'POST', upload()); assert.equal(saved.status, 201);
  const { id } = await saved.json();
  const image = await server.request(`/uploads/${id}`);
  assert.equal(image.status, 200); assert.equal(image.headers.get('Content-Type'), 'image/png'); assert.equal(image.headers.get('Cache-Control'), 'no-store'); assert.equal(image.headers.get('X-Content-Type-Options'), 'nosniff');
  assert.deepEqual(Buffer.from(await image.arrayBuffer()), PNG);
  const document = await server.request('/documents', 'POST', { name: 'Passport', number: '', expiryDate: '', note: '', imageId: id }); assert.equal(document.status, 201);
  assert.equal((await server.request(`/uploads/${id}`, 'DELETE')).status, 409);
  const exported = await server.request('/export'); assert.match(exported.headers.get('Content-Disposition')!, /attachment/);
  const data = await exported.json(); assert.equal(data.version, 1); assert.equal(data.documents[0].imageId, id); assert.equal(data.originals[0].mime, 'image/png'); assert.equal(data.originals[0].data, PNG.toString('base64'));
  const cookie = server.cookie; server.setCookie(''); assert.equal((await server.request(`/uploads/${id}`)).status, 401); server.setCookie(cookie);
  const item = await document.json(); assert.equal((await server.request(`/documents/${item.id}`, 'DELETE')).status, 204);
  assert.equal((await server.request(`/uploads/${id}`)).status, 404);
});

test('SVG, spoofed MIME, invalid image bytes, excessive dimensions and oversized uploads are rejected', async t => {
  const server = await harness(); t.after(server.close); await server.login();
  assert.equal((await server.request('/uploads', 'POST', upload(Buffer.from('<svg onload="alert(1)"></svg>'), 'image/svg+xml', 'evil.svg'))).status, 400);
  assert.equal((await server.request('/uploads', 'POST', upload(PNG, 'image/jpeg', 'spoof.jpg'))).status, 400);
  assert.equal((await server.request('/uploads', 'POST', upload(Buffer.from('not an image')))).status, 400);
  const hugeDimensions = Buffer.from(PNG); hugeDimensions.writeUInt32BE(15000, 16);
  assert.equal((await server.request('/uploads', 'POST', upload(hugeDimensions))).status, 400);
  assert.equal((await server.request('/uploads', 'POST', upload(new Uint8Array(8 * 1024 * 1024 + 1)))).status, 413);
  const missingImage = await server.request('/documents', 'POST', { name: 'ID', number: '', expiryDate: '', note: '', imageId: '00000000-0000-4000-8000-000000000001' }); assert.equal(missingImage.status, 400);
  assert.deepEqual((await (await server.request('/export')).json()).originals, []);
});

test('replacing document images removes only unreferenced old originals', async t => {
  const server = await harness(); t.after(server.close); await server.login();
  const first = await (await server.request('/uploads', 'POST', upload())).json();
  const second = await (await server.request('/uploads', 'POST', upload())).json();
  const doc = { name: 'ID', number: '', expiryDate: '', note: '', imageId: first.id };
  const record = await (await server.request('/documents', 'POST', doc)).json();
  const shared = await (await server.request('/documents', 'POST', doc)).json();
  assert.equal((await server.request(`/documents/${record.id}`, 'PUT', { ...doc, imageId: second.id })).status, 200);
  assert.equal((await server.request(`/uploads/${first.id}`)).status, 200);
  assert.equal((await server.request(`/documents/${shared.id}`, 'DELETE')).status, 204);
  assert.equal((await server.request(`/uploads/${first.id}`)).status, 404);
  assert.equal((await server.request(`/uploads/${second.id}`)).status, 200);
});
