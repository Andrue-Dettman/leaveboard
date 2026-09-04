import { query } from '../db/pool.js';
import { REQUEST_COLUMNS, findLeaveRequest } from './leaveRequests.js';

// A manager's queue is defined by who reports to them, not by anything on the request row,
// so the filter is the requester's manager_id. Oldest first: the queue is worked from the
// top and the person who has waited longest should be there.
const APPROVALS_SQL = `
  SELECT ${REQUEST_COLUMNS},
         json_build_object('id', u.id, 'name', u.name) AS requester
    FROM leave_requests lr
    JOIN leave_types lt ON lt.id = lr.type_id
    JOIN users u ON u.id = lr.user_id
   WHERE u.manager_id = $1
     AND lr.status = 'pending'
   ORDER BY lr.created_at, lr.id
`;

export async function listApprovals(managerId) {
  const { rows } = await query(APPROVALS_SQL, [managerId]);

  return rows;
}

/**
 * The same shape as the cancel guard: the reporting line and the pending check are part of
 * the UPDATE rather than trusted from a row read a moment earlier. Two managers deciding at
 * once, or a decision racing the requester's cancel, would both pass a check made before
 * the write, and the second one would silently overwrite the first.
 */
export async function decidePendingRequest({ id, managerId, decision, managerNote }) {
  const { rowCount } = await query(
    `UPDATE leave_requests lr
        SET status = $3,
            manager_note = $4,
            decided_at = now(),
            decided_by = $2
       FROM users u
      WHERE lr.id = $1
        AND u.id = lr.user_id
        AND u.manager_id = $2
        AND lr.status = 'pending'`,
    [id, managerId, decision, managerNote]
  );

  return rowCount === 1 ? findLeaveRequest(id) : null;
}
