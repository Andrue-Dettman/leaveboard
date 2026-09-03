import { Router } from 'express';
import { z } from 'zod';
import { ApiError } from '../errors.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import {
  DATE_PATTERN,
  countBusinessDays,
  daysBetween,
  isCalendarDate,
  yearsSpanned,
} from '../services/businessDays.js';
import { getHolidays } from '../services/holidays.js';
import { parseOrThrow } from '../validation.js';

// A leave request is bounded by an annual allowance, so a range this long is a mistake
// rather than a request. Without the cap one call could fan out to a hundred years of
// holiday lookups against a third-party service.
const MAX_RANGE_DAYS = 366;

// A chain of .regex().refine() would run both checks, because a failed string check is not
// fatal in Zod, and report whichever message came last. One branch keeps the message
// specific to what is actually wrong with the value.
const calendarDate = z
  .string({ required_error: 'is required', invalid_type_error: 'must be a single date' })
  .superRefine((value, ctx) => {
    if (!DATE_PATTERN.test(value)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'must be a date in YYYY-MM-DD form' });
      return;
    }

    if (!isCalendarDate(value)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'must be a real calendar date' });
    }
  });

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
