import { query } from '../db/pool.js';
import { ApiError } from '../errors.js';
import { fallbackHolidays } from './holidayFallback.js';

const COUNTRY = 'US';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const UPSTREAM_BASE = 'https://date.nager.at/api/v3/PublicHolidays';
// A provider that accepts the connection and then stalls would otherwise hold the request
// open for undici's five minute default, which defeats the point of having a fallback.
const UPSTREAM_TIMEOUT_MS = 5000;

/**
 * The feed carries state-level observances beside the nationwide ones and repeats some
 * dates with different county lists. Only a nationwide holiday closes an office, and a
 * date counted twice would quietly take an extra day off somebody's balance.
 */
export function normalizeHolidays(payload) {
  const byDate = new Map();

  for (const entry of payload) {
    if (entry.global !== true || byDate.has(entry.date)) {
      continue;
    }

    byDate.set(entry.date, { date: entry.date, name: entry.localName });
  }

  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

async function readCache(year) {
  const { rows } = await query(
    'SELECT payload, fetched_at AS "fetchedAt" FROM holiday_cache WHERE year = $1 AND country = $2',
    [year, COUNTRY]
  );

  return rows[0] ?? null;
}

async function writeCache(year, holidays) {
  await query(
    `INSERT INTO holiday_cache (year, country, payload, fetched_at)
          VALUES ($1, $2, $3, now())
     ON CONFLICT (year, country)
     DO UPDATE SET payload = EXCLUDED.payload, fetched_at = EXCLUDED.fetched_at`,
    // Serialized by hand: node-postgres turns a JS array into a Postgres array literal,
    // which jsonb will not accept.
    [year, COUNTRY, JSON.stringify(holidays)]
  );
}

async function fetchUpstream(year) {
  const response = await fetch(`${UPSTREAM_BASE}/${year}/${COUNTRY}`, {
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`Nager.Date responded ${response.status}`);
  }

  return normalizeHolidays(await response.json());
}

export async function getHolidays(year) {
  const cached = await readCache(year);

  if (cached && Date.now() - new Date(cached.fetchedAt).getTime() < CACHE_TTL_MS) {
    return cached.payload;
  }

  try {
    const holidays = await fetchUpstream(year);

    // Caching is an optimisation, so a failed write must not discard holidays that were
    // already fetched successfully.
    await writeCache(year, holidays).catch((error) => {
      console.warn(`Could not cache holidays for ${year}: ${error.message}`);
    });

    return holidays;
  } catch (error) {
    console.warn(`Could not refresh holidays for ${year}: ${error.message}`);

    // A stale copy beats no holidays: business-day counts stay stable and the page still
    // renders while the provider is down.
    if (cached) {
      return cached.payload;
    }

    // Deliberately not cached, so the next request tries upstream again instead of
    // treating the fallback as a fresh answer for the next 24 hours.
    if (fallbackHolidays[year]) {
      return fallbackHolidays[year];
    }

    throw new ApiError('UPSTREAM_ERROR', `Could not load holidays for ${year}`);
  }
}
