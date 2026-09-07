import { z } from 'zod';

const knownCurrencies = new Set(Intl.supportedValuesOf('currency'));
export const currency = z.string().regex(/^[A-Z]{3}$/, '请选择有效的货币代码').refine(value => knownCurrencies.has(value), '不支持此货币代码');
export function isDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}
export const requiredDate = z.string().refine(isDate, '请填写有效日期');
const optionalDate = z.union([z.literal(''), requiredDate]);
const shortText = z.string().trim().max(200, '最多 200 个字符');
const note = z.string().trim().max(5000, '最多 5000 个字符');
const name = shortText.min(1, '请填写名称');
const money = z.number().finite().positive('金额必须大于 0').max(1_000_000_000, '金额超出上限');
const budget = z.number().finite().min(0).max(1_000_000_000);
export const passwordSchema = z.object({ password: z.string().min(12, '密码至少需要 12 个字符').max(256, '密码最多 256 个字符') });
export const loginSchema = z.object({ password: z.string().min(1).max(256) });

export const profileSchema = z.object({
  name: shortText, destination: shortText, school: shortText,
  departureDate: optionalDate, returnDate: optionalDate, semesterStart: optionalDate, semesterEnd: optionalDate,
  baseCurrency: currency, localCurrency: currency, semesterBudget: budget,
  monthlyBudgets: z.record(z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/), budget).refine(value => Object.keys(value).length <= 240, '最多设置 240 个月份'),
  studentId: shortText, address: z.string().trim().max(1000),
  timeZone: z.string().max(100).refine(value => { try { new Intl.DateTimeFormat('en', { timeZone: value }); return true; } catch { return false; } }, '请填写有效时区'),
}).superRefine((value, ctx) => {
  if (value.departureDate && value.returnDate && value.returnDate < value.departureDate) ctx.addIssue({ code: 'custom', path: ['returnDate'], message: '返程日期不能早于出发日期' });
  if (value.semesterStart && value.semesterEnd && value.semesterEnd < value.semesterStart) ctx.addIssue({ code: 'custom', path: ['semesterEnd'], message: '学期结束日期不能早于开始日期' });
});

export const schemas = {
  expenses: z.object({ amount: money, currency, category: name, note, date: requiredDate }),
  documents: z.object({ name, number: shortText, expiryDate: optionalDate, note, imageId: z.string().uuid().optional() }),
  checklists: z.object({ group: z.enum(['learning', 'travel', 'daily']), title: name, dueDate: optionalDate, done: z.boolean() }),
  courses: z.object({ name, room: shortText, teacher: shortText, weekday: z.number().int().min(1).max(7), startPeriod: z.number().int().min(1).max(16), endPeriod: z.number().int().min(1).max(16) }).refine(value => value.endPeriod >= value.startPeriod, '结束节次不能早于开始节次'),
  exchanges: z.object({ date: requiredDate, fromCurrency: currency, toCurrency: currency, fromAmount: money, toAmount: money, note }).refine(value => value.fromCurrency !== value.toCurrency, '换汇币种必须不同'),
  places: z.object({ name, category: name, address: z.string().trim().max(1000), note, visited: z.boolean() }),
};

export function todayInZone(now: number, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(now));
  return `${parts.find(part => part.type === 'year')!.value}-${parts.find(part => part.type === 'month')!.value}-${parts.find(part => part.type === 'day')!.value}`;
}




