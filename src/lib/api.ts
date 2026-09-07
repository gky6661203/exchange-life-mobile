const base = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
export function apiUrl(path: string) { return `${base}/api${path}`; }
export async function api<T = unknown>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body && !(options.body instanceof FormData)) headers.set('Content-Type', 'application/json');
  headers.set('X-Requested-With', 'ExchangeLife');
  const response = await fetch(apiUrl(path), { ...options, headers, credentials: 'include' });
  if (!response.ok) {
    const value = await response.json().catch(() => ({}));
    if (response.status === 401) window.dispatchEvent(new Event('session-expired'));
    throw new Error(value.error || '联网暂时中断，请稍后再试');
  }
  return response.status === 204 ? undefined as T : response.json();
}
export const saveItem = (collection: string, value: unknown, id?: string) => api(`/${collection}${id ? `/${id}` : ''}`, { method: id ? 'PUT' : 'POST', body: JSON.stringify(value) });
export const deleteItem = (collection: string, id: string) => api(`/${collection}/${id}`, { method: 'DELETE' });




