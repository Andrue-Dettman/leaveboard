import { Router } from 'express';
import { query } from '../db/pool.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { requireIdentity } from '../middleware/identity.js';

export const usersRouter = Router();

usersRouter.get(
  '/users',
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `SELECT id, name, email, role, manager_id AS "managerId"
         FROM users
        ORDER BY id`
    );

    res.json(rows);
  })
);

usersRouter.get(
  '/me',
  requireIdentity,
  asyncHandler(async (req, res) => {
    const { id, name, email, role, managerId } = req.user;
    let manager = null;

    if (managerId !== null) {
      const { rows } = await query('SELECT id, name FROM users WHERE id = $1', [managerId]);
      manager = rows[0] ?? null;
    }

    res.json({ id, name, email, role, managerId, manager });
  })
);
