export const currencies = ['CNY', 'TWD', 'HKD', 'EUR', 'USD', 'GBP', 'JPY', 'KRW', 'SGD', 'AUD', 'CAD', 'CHF', 'SEK', 'DKK', 'NOK', 'THB'];
export function today(timeZone?: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timeZone || undefined, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}
export function money(amount: number, currency: string) {
  return new Intl.NumberFormat('zh-CN', { style: 'currency', currency, maximumFractionDigits: 2 }).format(amount);
}
export function daysUntil(date: string, from = today()) {
  if (!date) return null;
  return Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);
}
export function shortDate(date: string) { return date ? date.replaceAll('-', '.') : '尚未设置'; }




