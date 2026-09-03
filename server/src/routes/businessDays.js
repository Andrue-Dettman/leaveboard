import { Router } from 'express';
import { z } from 'zod';
import { ApiError } from '../errors.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import {
  MAX_RANGE_DAYS,
  countBusinessDays,
  daysBetween,
  yearsSpanned,
} from '../services/businessDays.js';
import { getHolidays } from '../services/holidays.js';
import { calendarDate, parseOrThrow } from '../validation.js';

const querySchema = z.object({
  start: calendarDate,
  end: calendarDate,
});

export const businessDaysRouter = Router();

businessDaysRouter.get(
  '/business-days',
  asyncHandler(async (req, res) => {
    const { start, end } = parseOrThrow(querySchema, req.query, 'Request query failed validation');

    if (daysBetween(start, end) < 0) {
      throw new ApiError('VALIDATION_ERROR', 'Request query failed validation', {
        end: 'must be on or after start',
      });
    }

    if (daysBetween(start, end) >= MAX_RANGE_DAYS) {
      throw new ApiError('VALIDATION_ERROR', 'Request query failed validation', {
        end: `must be within ${MAX_RANGE_DAYS} days of start`,
      });
    }

    // A range can straddle New Year, and each year is cached separately.
    const years = yearsSpanned(start, end);
    const holidays = (await Promise.all(years.map((year) => getHolidays(year)))).flat();

    res.json(countBusinessDays(start, end, holidays));
  })
);
