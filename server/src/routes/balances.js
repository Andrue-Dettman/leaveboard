import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { requireIdentity } from '../middleware/identity.js';
import { getBalances } from '../services/balances.js';

export const balancesRouter = Router();

balancesRouter.get(
  '/balances',
  requireIdentity,
  asyncHandler(async (req, res) => {
    res.json(await getBalances(req.user.id, new Date().getFullYear()));
  })
);
