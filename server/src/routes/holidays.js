import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { getHolidays } from '../services/holidays.js';
import { parseOrThrow } from '../validation.js';

const querySchema = z.object({
  year: z
    .string()
    .regex(/^\d{4}$/, 'must be a four-digit year')
    .transform(Number)
    .refine((year) => year >= 2000 && year <= 2100, 'must be between 2000 and 2100')
    .optional(),
});

export const holidaysRouter = Router();

holidaysRouter.get(
  '/holidays',
  asyncHandler(async (req, res) => {
    const { year } = parseOrThrow(querySchema, req.query, 'Request query failed validation');

    res.json(await getHolidays(year ?? new Date().getFullYear()));
  })
);
