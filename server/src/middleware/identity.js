import { query } from '../db/pool.js';
import { ApiError } from '../errors.js';
import { asyncHandler } from './asyncHandler.js';

// users.id is a SERIAL, so an id above the int4 ceiling cannot name a real row and would
// fail the lookup with an out-of-range error instead of a clean 404.
const MAX_USER_ID = 2147483647;

export const requireIdentity = asyncHandler(async (req, res, next) => {
  const header = req.get('X-User-Id')?.trim();

  if (!header) {
    throw new ApiError('MISSING_IDENTITY', 'X-User-Id header is required');
  }

  if (!/^\d+$/.test(header)) {
    throw new ApiError('MISSING_IDENTITY', 'X-User-Id header must be an integer');
  }

  const id = Number(header);

  if (id > MAX_USER_ID) {
    throw new ApiError('UNKNOWN_USER', `No user with id ${id}`);
  }

  const { rows } = await query(
    'SELECT id, name, email, role, manager_id AS "managerId" FROM users WHERE id = $1',
    [id]
  );

  if (rows.length === 0) {
    throw new ApiError('UNKNOWN_USER', `No user with id ${id}`);
  }

  req.user = rows[0];
  next();
});
