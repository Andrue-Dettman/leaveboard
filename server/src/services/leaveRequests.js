import { query } from '../db/pool.js';

export const REQUEST_STATUSES = ['pending', 'approved', 'denied', 'cancelled'];

// Aliased in SQL rather than remapped in JavaScript, so the shape a route returns is the
// shape the query already produced.
const SELECT_REQUEST = `
  SELECT lr.id,
         lr.user_id       AS "userId",
         lr.type_id       AS "typeId",
         lt.name          AS "typeName",
         lr.start_date    AS "startDate",
         lr.end_date      AS "endDate",
         lr.business_days AS "businessDays",
         lr.note,
         lr.status,
         lr.manager_note  AS "managerNote",
         lr.created_at    AS "createdAt",
         lr.decided_at    AS "decidedAt",
         lr.decided_by    AS "decidedBy"
    FROM leave_requests lr
    JOIN leave_types lt ON lt.id = lr.type_id
`;

export async function findLeaveRequest(id) {
  const { rows } = await query(`${SELECT_REQUEST} WHERE lr.id = $1`, [id]);

  return rows[0] ?? null;
}

export async function listLeaveRequests(userId, status) {
  const params = [userId];
  let where = 'WHERE lr.user_id = $1';

  if (status) {
    params.push(status);
    where += ' AND lr.status = $2';
  }

  // The seed writes every row in one transaction, so created_at ties; the id breaks them
  // and keeps the order stable between calls.
  const { rows } = await query(
    `${SELECT_REQUEST} ${where} ORDER BY lr.created_at DESC, lr.id DESC`,
    params
  );

  return rows;
}

/**
 * The ownership and status guards are repeated in the UPDATE rather than trusted from the
 * row that was just read. Two cancels arriving together, or a cancel racing a manager's
 * decision, would both pass a check made before the write.
 */
export async function cancelPendingRequest(id, userId) {
  const { rowCount } = await query(
    `UPDATE leave_requests
        SET status = 'cancelled'
      WHERE id = $1 AND user_id = $2 AND status = 'pending'`,
    [id, userId]
  );

  return rowCount === 1 ? findLeaveRequest(id) : null;
}

export async function findLeaveType(typeId) {
  const { rows } = await query('SELECT id, name FROM leave_types WHERE id = $1', [typeId]);

  return rows[0] ?? null;
}

export async function createLeaveRequest({
  userId,
  typeId,
  startDate,
  endDate,
  businessDays,
  note,
}) {
  const { rows } = await query(
    `INSERT INTO leave_requests (user_id, type_id, start_date, end_date, business_days, note)
          VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
    [userId, typeId, startDate, endDate, businessDays, note]
  );

  return findLeaveRequest(rows[0].id);
}
