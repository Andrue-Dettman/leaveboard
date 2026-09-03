// Every date the API deals in is a calendar date with no time and no timezone. Parsing
// one with new Date('2026-03-16') gives midnight UTC, so formatting has to be pinned to
// UTC as well or a viewer in a western timezone sees the day before.
const formatter = new Intl.DateTimeFormat('en-US', {
  timeZone: 'UTC',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

export function formatDate(iso) {
  return formatter.format(new Date(`${iso}T00:00:00Z`));
}

export function formatDateRange(startDate, endDate) {
  if (startDate === endDate) return formatDate(startDate);
  return `${formatDate(startDate)} to ${formatDate(endDate)}`;
}

// Today where the reader is, not in UTC: "upcoming" should change when their own day
// does. Built from the local parts rather than toISOString for that reason.
export function today() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}
