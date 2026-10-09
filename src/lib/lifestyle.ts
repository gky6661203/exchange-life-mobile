import type { Subscription } from './types';
import { daysUntil } from './format';
export function nextBillingDate(date: string, billingDay: number, months: number): string {
  const [year, month] = date.split('-').map(Number);
  const first = new Date(Date.UTC(year, month - 1 + months, 1));
  const lastDay = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  return new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), Math.min(billingDay, lastDay))).toISOString().slice(0, 10);
}
export const dueSubscriptions = (items: Subscription[], today: string) => items.filter(item => item.active && (daysUntil(item.nextRenewal, today) ?? Infinity) <= item.reminderDays).sort((a, b) => a.nextRenewal.localeCompare(b.nextRenewal));
export function reminderLabel(item: Subscription, date: string) {
  const days = daysUntil(item.nextRenewal, date) || 0;
  return days < 0 ? `已逾期 ${-days} 天` : days === 0 ? '今天续费' : `${days} 天后续费`;
}
export function monthDays(month: string) { const [y, m] = month.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).getUTCDate(); }
export function weekday(date: string) { return new Date(`${date}T12:00:00Z`).getUTCDay() || 7; }
const icsEscape = (value: string) => value.replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/[,;]/g, char => `\\${char}`);
export function subscriptionCalendar(items: Subscription[]): string {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const events = items.filter(item => item.active).flatMap(item => {
    const byDays = item.billingDay > 28 ? `BYMONTHDAY=${Array.from({ length: item.billingDay - 27 }, (_, i) => i + 28).join(',')};BYSETPOS=-1` : `BYMONTHDAY=${item.billingDay}`;
    return ['BEGIN:VEVENT', `UID:subscription-${item.id}@new-era.local`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${item.nextRenewal.replaceAll('-', '')}`, `SUMMARY:${icsEscape(`${item.name} 续费`)}`, `DESCRIPTION:${icsEscape(`${item.amount} ${item.currency}，每 ${item.intervalMonths} 个月。${item.note}`)}`, `RRULE:FREQ=MONTHLY;INTERVAL=${item.intervalMonths};${byDays}`, 'BEGIN:VALARM', `TRIGGER:-P${item.reminderDays}D`, 'ACTION:DISPLAY', `DESCRIPTION:${icsEscape(`${item.name} 即将续费`)}`, 'END:VALARM', 'END:VEVENT'];
  });
  // Fold UTF-8 content lines to the iCalendar 75-octet limit.
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//New Era//Subscriptions//ZH', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', ...events, 'END:VCALENDAR'];
  return lines.map(line => {
    const parts: string[] = []; let current = '', bytes = 0;
    for (const char of line) { const size = new TextEncoder().encode(char).length; if (bytes + size > 74) { parts.push(current); current = ' '; bytes = 1; } current += char; bytes += size; }
    parts.push(current); return parts.join('\r\n');
  }).join('\r\n') + '\r\n';
}
export function downloadCalendar(items: Subscription[]) {
  const url = URL.createObjectURL(new Blob([subscriptionCalendar(items)], { type: 'text/calendar;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url; link.download = '新时代-续费提醒.ics'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 10000);
}
