import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { countBusinessDays } from '../src/services/businessDays.js';
import { getHolidays } from '../src/services/holidays.js';

vi.mock('../src/db/pool.js', () => ({ query: vi.fn() }));
vi.mock('../src/services/holidays.js', () => ({ getHolidays: vi.fn() }));

// Reference points in 2026: Nov 21 is a Saturday, Nov 23 a Monday, Nov 26 Thanksgiving,
// Nov 27 a Friday, Jul 4 a Saturday, Dec 28 a Monday and Jan 1 2027 a Friday.
const thanksgiving = { date: '2026-11-26', name: 'Thanksgiving Day' };
const christmas = { date: '2026-12-25', name: 'Christmas Day' };
const newYear2027 = { date: '2027-01-01', name: "New Year's Day" };

describe('countBusinessDays', () => {
  it('counts a single weekday as one day', () => {
    expect(countBusinessDays('2026-11-23', '2026-11-23', [])).toEqual({
      businessDays: 1,
      holidays: [],
    });
  });

  it('counts a single Saturday as no days', () => {
    expect(countBusinessDays('2026-11-21', '2026-11-21', []).businessDays).toBe(0);
  });

  it('counts a single Sunday as no days', () => {
    expect(countBusinessDays('2026-11-22', '2026-11-22', []).businessDays).toBe(0);
  });

  it('counts a full Monday to Friday week as five days', () => {
    expect(countBusinessDays('2026-11-23', '2026-11-27', []).businessDays).toBe(5);
  });

  it('counts a weekend on its own as no days', () => {
    expect(countBusinessDays('2026-11-21', '2026-11-22', []).businessDays).toBe(0);
  });

  it('skips the weekend inside a two week range', () => {
    expect(countBusinessDays('2026-11-16', '2026-11-27', []).businessDays).toBe(10);
  });

  it('counts a range that starts on a weekend from the first weekday', () => {
    expect(countBusinessDays('2026-11-21', '2026-11-27', []).businessDays).toBe(5);
  });

  it('counts a range that ends on a weekend up to the last weekday', () => {
    expect(countBusinessDays('2026-11-23', '2026-11-29', []).businessDays).toBe(5);
  });

  it('excludes a holiday falling on a weekday and reports it', () => {
    expect(countBusinessDays('2026-11-23', '2026-11-27', [thanksgiving])).toEqual({
      businessDays: 4,
      holidays: [thanksgiving],
    });
  });

  it('ignores a holiday that falls on a weekend', () => {
    const independenceDay = { date: '2026-07-04', name: 'Independence Day' };

    expect(countBusinessDays('2026-06-29', '2026-07-05', [independenceDay])).toEqual({
      businessDays: 5,
      holidays: [],
    });
  });

  it('ignores a holiday outside the range', () => {
    expect(countBusinessDays('2026-11-23', '2026-11-25', [thanksgiving])).toEqual({
      businessDays: 3,
      holidays: [],
    });
  });

  it('reports the holidays it excluded in date order', () => {
    const result = countBusinessDays('2026-12-21', '2027-01-01', [newYear2027, christmas]);

    expect(result.businessDays).toBe(8);
    expect(result.holidays).toEqual([christmas, newYear2027]);
  });

  it('counts a range that crosses into the next year', () => {
    expect(countBusinessDays('2026-12-28', '2027-01-01', [newYear2027])).toEqual({
      businessDays: 4,
      holidays: [newYear2027],
    });
  });
});

describe('GET /api/business-days', () => {
  beforeEach(() => {
    getHolidays.mockReset();
    getHolidays.mockResolvedValue([]);
  });

  it('returns the count and the holidays it excluded', async () => {
    getHolidays.mockResolvedValue([thanksgiving]);

    const res = await request(createApp()).get(
      '/api/business-days?start=2026-11-23&end=2026-11-27'
    );

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ businessDays: 4, holidays: [thanksgiving] });
  });

  it('does not require an identity header', async () => {
    const res = await request(createApp()).get(
      '/api/business-days?start=2026-11-23&end=2026-11-23'
    );

    expect(res.status).toBe(200);
    expect(getHolidays).toHaveBeenCalled();
  });

  it('asks for the holidays of every year the range touches', async () => {
    await request(createApp()).get('/api/business-days?start=2026-12-28&end=2027-01-01');

    expect(getHolidays).toHaveBeenCalledWith(2026);
    expect(getHolidays).toHaveBeenCalledWith(2027);
  });

  it('rejects an end date before the start date', async () => {
    const res = await request(createApp()).get(
      '/api/business-days?start=2026-11-27&end=2026-11-23'
    );

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request query failed validation',
        fields: { end: 'must be on or after start' },
      },
    });
    expect(getHolidays).not.toHaveBeenCalled();
  });

  it('rejects a missing start date', async () => {
    const res = await request(createApp()).get('/api/business-days?end=2026-11-27');

    expect(res.status).toBe(400);
    expect(res.body.error.fields).toEqual({ start: 'is required' });
    expect(getHolidays).not.toHaveBeenCalled();
  });

  it('rejects a date that is not in YYYY-MM-DD form', async () => {
    const res = await request(createApp()).get(
      '/api/business-days?start=23%2F11%2F2026&end=2026-11-27'
    );

    expect(res.status).toBe(400);
    expect(res.body.error.fields).toEqual({ start: 'must be a date in YYYY-MM-DD form' });
  });

  it('rejects a date that does not exist on the calendar', async () => {
    const res = await request(createApp()).get(
      '/api/business-days?start=2026-02-30&end=2026-03-02'
    );

    expect(res.status).toBe(400);
    expect(res.body.error.fields).toEqual({ start: 'must be a real calendar date' });
  });

  it('rejects a range longer than a year', async () => {
    const res = await request(createApp()).get(
      '/api/business-days?start=2026-01-01&end=2027-06-01'
    );

    expect(res.status).toBe(400);
    expect(res.body.error.fields).toEqual({ end: 'must be within 366 days of start' });
    expect(getHolidays).not.toHaveBeenCalled();
  });

  it('counts a single day', async () => {
    const res = await request(createApp()).get(
      '/api/business-days?start=2026-11-23&end=2026-11-23'
    );

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ businessDays: 1, holidays: [] });
  });
});
