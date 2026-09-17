import { describe, expect, it } from 'vitest';
import { addDays, briefDateKey, canvasDate, currentWeekStart, dateInZone, validDay, validTimeZone } from './dates';
import type { BriefDate } from './types';

const zone = 'America/Toronto';
describe('Canvas report calendar dates', () => {
  it('uses the course/user timezone on both sides of UTC midnight', () => {
    expect(dateInZone('2026-09-21T01:00:00Z', zone)).toBe('2026-09-20');
    expect(dateInZone('2026-09-20T20:00:00Z', 'Asia/Shanghai')).toBe('2026-09-21');
    expect(currentWeekStart(zone, new Date('2026-09-21T01:00:00Z'))).toBe('2026-09-14');
    expect(currentWeekStart('Asia/Shanghai', new Date('2026-09-20T20:00:00Z'))).toBe('2026-09-21');
  });
  it('handles daylight saving changes without treating one day as a fixed number of local hours', () => {
    expect(dateInZone('2026-03-08T04:30:00Z', zone)).toBe('2026-03-07');
    expect(dateInZone('2026-03-08T07:30:00Z', zone)).toBe('2026-03-08');
    expect(dateInZone('2026-11-01T05:30:00Z', zone)).toBe('2026-11-01');
    expect(dateInZone('2026-11-01T06:30:00Z', zone)).toBe('2026-11-01');
    expect(addDays('2026-03-07', 2)).toBe('2026-03-09');
    expect(addDays('2026-10-31', 2)).toBe('2026-11-02');
  });
  it('keeps an all-day date on its literal day instead of moving it across zones', () => {
    const date: BriefDate = { value: '2026-09-21', precision: 'date', origin: 'document', raw: 'September 21, 2026', timeZone: zone };
    expect(briefDateKey(date, 'America/Los_Angeles')).toBe('2026-09-21');
    const instant = canvasDate('2026-09-21T01:00:00Z', zone)!;
    expect(briefDateKey(instant, zone)).toBe('2026-09-20');
  });
  it('accepts exact API timestamps and preserves offsets without inventing midnight', () => {
    const raw = '2026-09-21T23:59:00-04:00';
    expect(canvasDate(raw, zone)).toEqual({ value: raw, precision: 'datetime', origin: 'canvas', raw, timeZone: zone });
    expect(canvasDate('2026-09-21T23:59:00.001Z', zone)?.value).toBe('2026-09-21T23:59:00.001Z');
  });
  it.each([null, undefined, 0, '', '2026-09-21', '2026-09-21T23:59:00', 'September 21, 2026', '2026-09-21T23:59:00 EDT'])('rejects an API date without an explicit offset: %s', value => {
    expect(canvasDate(value, zone)).toBeUndefined();
  });
  it.each(['2026-02-29', '2026-02-30', '2026-13-01', '2026-00-01', '2026-09-00', '2026-9-1', 'not-a-date'])('rejects invalid calendar date %s', value => {
    expect(validDay(value)).toBe(false);
    expect(() => addDays(value, 1)).toThrow();
    expect(canvasDate(`${value}T12:00:00Z`, zone)).toBeUndefined();
  });
  it('supports leap days and year boundaries', () => {
    expect(validDay('2028-02-29')).toBe(true);
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(currentWeekStart(zone, new Date('2027-01-01T17:00:00Z'))).toBe('2026-12-28');
  });
  it('rejects invalid clock and offset values rather than normalizing another day', () => {
    for (const value of ['2026-09-21T24:00:00Z', '2026-09-21T23:60:00Z', '2026-09-21T23:59:60Z', '2026-09-21T23:59:00+15:00', '2026-09-21T23:59:00+14:30']) {
      expect(canvasDate(value, zone), value).toBeUndefined();
    }
  });
  it('does not attach an invalid display timezone to a confirmed timestamp', () => {
    expect(validTimeZone('Invalid/Zone')).toBe(false);
    expect(validTimeZone('')).toBe(false);
    expect(() => dateInZone('2026-09-21T00:00:00Z', 'Invalid/Zone')).toThrow();
    expect(canvasDate('2026-09-21T00:00:00Z', 'Invalid/Zone')).toBeUndefined();
  });
});
