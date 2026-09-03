import { Router } from 'express';
import { query } from '../db/pool.js';
import { asyncHandler } from '../middleware/asyncHandler.js';

export const leaveTypesRouter = Router();

leaveTypesRouter.get(
  '/leave-types',
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `SELECT id, name, annual_allowance AS "annualAllowance"
         FROM leave_types
        ORDER BY id`
    );

    res.json(rows);
  })
);
