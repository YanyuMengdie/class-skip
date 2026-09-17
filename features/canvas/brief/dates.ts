import type { BriefDate } from './types';

export function validTimeZone(value: string): boolean {
  try { new Intl.DateTimeFormat('en-CA', { timeZone: value }).format(); return !!value; } catch { return false; }
}
export function validDay(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T12:00:00Z`))
    && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value;
}
export function addDays(day: string, count: number): string {
  if (!validDay(day)) throw new Error('日期格式无效。');
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + count);
  return date.toISOString().slice(0, 10);
}
export function dateInZone(value: string | Date, timeZone: string): string {
  if (!validTimeZone(timeZone)) throw new Error('请选择有效的时区。');
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(typeof value === 'string' ? new Date(value) : value);
  const part = (type: string) => parts.find(p => p.type === type)!.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}
export function currentWeekStart(timeZone: string, now = new Date()): string {
  const today = dateInZone(now, timeZone);
  const weekday = new Date(`${today}T12:00:00Z`).getUTCDay();
  return addDays(today, -((weekday + 6) % 7));
}
export function briefDateKey(date: BriefDate, timeZone: string): string {
  return date.precision === 'date' ? date.value.slice(0, 10) : dateInZone(date.value, timeZone);
}
/** No inferred midnight or timezone: API instants must contain an explicit offset. */
export function canvasDate(value: unknown, timeZone: string): BriefDate | undefined {
  if (typeof value !== 'string' || !validTimeZone(timeZone)) return undefined;
  const parts = value.match(/^\d{4}-\d{2}-\d{2}T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(?:Z|[+-](\d{2}):(\d{2}))$/i);
  if (!parts || Number(parts[1]) > 23 || Number(parts[2]) > 59 || Number(parts[3] || 0) > 59
    || Number(parts[4] || 0) > 14 || Number(parts[5] || 0) > 59 || Number(parts[4]) === 14 && Number(parts[5]) !== 0
    || !validDay(value.slice(0, 10)) || !Number.isFinite(Date.parse(value))) return undefined;
  return { value, precision: 'datetime', origin: 'canvas', raw: value, timeZone };
}
