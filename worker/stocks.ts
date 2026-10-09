import type { D1Database } from '@cloudflare/workers-types';
import type { StockMarket, StockQuote } from '../src/lib/types';
export function marketSymbol(market: StockMarket, input: string): string {
  const symbol = input.trim().toUpperCase();
  if (market === 'TW') return /\.(TW|TWO)$/.test(symbol) ? symbol : `${symbol}.TW`;
  if (market === 'HK') return `${String(Number(symbol.replace('.HK', ''))).padStart(4, '0')}.HK`;
  if (market === 'CN') return /\.(SS|SZ)$/.test(symbol) ? symbol : `${symbol}.${/^[69]/.test(symbol) ? 'SS' : 'SZ'}`;
  return symbol.replace('.', '-');
}
export function parseQuote(payload: any, symbol: string, now = Date.now()): StockQuote {
  const result = payload?.chart?.result?.[0], meta = result?.meta;
  if (!meta || !Array.isArray(result.timestamp) || !Array.isArray(result.indicators?.quote?.[0]?.close)) throw new Error('Invalid quote');
  const closes = result.indicators.quote[0].close;
  const timeZone = typeof meta.exchangeTimezoneName === 'string' ? meta.exchangeTimezoneName : 'UTC';
  const date = (stamp: number) => new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(stamp * 1000));
  const history = result.timestamp.flatMap((stamp: number, index: number) => Number.isFinite(stamp) && stamp > 0 && Number.isFinite(closes[index]) && closes[index] > 0 ? [{ date: date(stamp), close: closes[index] as number }] : []).slice(-31) as StockQuote['history'];
  const price = meta.regularMarketPrice, stamp = meta.regularMarketTime;
  if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(stamp) || stamp <= 0 || stamp * 1000 > now + 300000 || !history.length) throw new Error('Invalid quote');
  const latestDay = date(stamp), previous = history.filter(row => row.date < latestDay).at(-1)?.close ?? null;
  const change = previous === null ? null : price - previous;
  return { symbol, name: String(meta.shortName || meta.longName || symbol).slice(0, 100), currency: String(meta.currency || '').slice(0, 10), price, previousClose: previous, change, changePercent: change === null || previous === null ? null : change / previous * 100, marketTime: new Date(stamp * 1000).toISOString(), fetchedAt: new Date(now).toISOString(), stale: false, source: 'Yahoo Finance', sourceUrl: `https://finance.yahoo.com/quote/${encodeURIComponent(symbol)}/`, history };
}
export async function stockQuote(db: D1Database, market: StockMarket, input: string, fetcher: typeof fetch = fetch, now = Date.now()): Promise<StockQuote> {
  const symbol = marketSymbol(market, input);
  const cached = await db.prepare('SELECT data,fetched_at FROM stock_quotes WHERE symbol=?').bind(symbol).first<{ data: string; fetched_at: number }>();
  if (cached && now - cached.fetched_at < 300000) return JSON.parse(cached.data);
  try {
    const response = await fetcher(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1mo`, { headers: { Accept: 'application/json', 'User-Agent': 'NewEraDashboard/1.0' }, signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error('Quote unavailable');
    const text = await response.text(); if (text.length > 2_000_000) throw new Error('Quote oversized');
    const value = parseQuote(JSON.parse(text), symbol, now);
    await db.prepare('INSERT INTO stock_quotes(symbol,data,fetched_at) VALUES(?,?,?) ON CONFLICT(symbol) DO UPDATE SET data=excluded.data,fetched_at=excluded.fetched_at').bind(symbol, JSON.stringify(value), now).run();
    return value;
  } catch (error) {
    if (cached) return { ...JSON.parse(cached.data), stale: true };
    throw error;
  }
}
