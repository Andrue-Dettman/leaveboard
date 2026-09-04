const MS_PER_DAY = 24 * 60 * 60 * 1000;

// A leave request is bounded by an annual allowance, so a range longer than this is a
// mistake rather than a request. It also stops one call fanning out to a century of
// holiday lookups against a third-party service.
export const MAX_RANGE_DAYS = 366;

// Calendar dates are compared and stepped in UTC throughout. Parsing 'YYYY-MM-DD' with the
// Date constructor gives UTC midnight, which lands on the previous day once the server is
// west of Greenwich, and UTC has no daylight saving so a day is always exactly MS_PER_DAY.
function toUtcTime(date) {
  const [year, month, day] = date.split('-').map(Number);
  return Date.UTC(year, month - 1, day);
}

function toDate(time) {
  return new Date(time).toISOString().slice(0, 10);
}

export const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// Rejects the dates the pattern cannot: 2026-02-30 and 2026-13-01 are both well formed and
// both roll over into a different date than the one asked for.
export function isCalendarDate(value) {
  return DATE_PATTERN.test(value) && toDate(toUtcTime(value)) === value;
}

// Today as a UTC calendar date. Every other date in the system is timezone-free, so the
// reference point for "in the past" has to be too, rather than following the server's clock.
export function today() {
  return toDate(Date.now());
}

export function isWeekend(date) {
  const dayOfWeek = new Date(toUtcTime(date)).getUTCDay();
  return dayOfWeek === 0 || dayOfWeek === 6;
}

export function daysBetween(startDate, endDate) {
  return (toUtcTime(endDate) - toUtcTime(startDate)) / MS_PER_DAY;
}

export function yearsSpanned(startDate, endDate) {
  const years = [];

  for (let year = Number(startDate.slice(0, 4)); year <= Number(endDate.slice(0, 4)); year += 1) {
    years.push(year);
  }

  return years;
}

/**
 * Weekdays in [startDate, endDate] inclusive, minus the holidays that fall on one. A
 * holiday landing on a weekend is not reported, because it never counted as a business day
 * for it to be excluded from.
 */
export function countBusinessDays(startDate, endDate, holidays) {
  const byDate = new Map(holidays.map((holiday) => [holiday.date, holiday]));
  const observed = [];
  let businessDays = 0;

  for (let time = toUtcTime(startDate); time <= toUtcTime(endDate); time += MS_PER_DAY) {
    const date = toDate(time);

    if (isWeekend(date)) {
      continue;
    }

    const holiday = byDate.get(date);

    if (holiday) {
      observed.push(holiday);
      continue;
    }

    businessDays += 1;
  }

  return { businessDays, holidays: observed };
}
