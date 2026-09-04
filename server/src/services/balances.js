import { query } from '../db/pool.js';

// The user and year filters sit in the JOIN condition rather than a WHERE clause: moving
// them to WHERE would drop every leave type the user has not booked against this year, and
// the dashboard has to show all three cards whether or not they have been used.
const BALANCES_SQL = `
  SELECT lt.id               AS "typeId",
         lt.name             AS "typeName",
         lt.annual_allowance AS "annualAllowance",
         COALESCE(SUM(lr.business_days) FILTER (WHERE lr.status = 'approved'), 0)::int AS used,
         COALESCE(SUM(lr.business_days) FILTER (WHERE lr.status = 'pending'), 0)::int  AS pending
    FROM leave_types lt
    LEFT JOIN leave_requests lr
      ON lr.type_id = lt.id
     AND lr.user_id = $1
     AND EXTRACT(YEAR FROM lr.start_date) = $2
   GROUP BY lt.id, lt.name, lt.annual_allowance
   ORDER BY lt.id
`;

/**
 * Only approved days are spent. Pending days are reported alongside so the form can warn
 * about going over without the balance moving before a manager has actually decided.
 */
export async function getBalances(userId, year) {
  const { rows } = await query(BALANCES_SQL, [userId, year]);

  return rows.map((row) => ({ ...row, remaining: row.annualAllowance - row.used }));
}
