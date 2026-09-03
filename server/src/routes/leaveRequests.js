import { Router } from 'express';
import { z } from 'zod';
import { ApiError } from '../errors.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { requireIdentity } from '../middleware/identity.js';
import {
  MAX_RANGE_DAYS,
  countBusinessDays,
  daysBetween,
  today,
  yearsSpanned,
} from '../services/businessDays.js';
import { getHolidays } from '../services/holidays.js';
import {
  REQUEST_STATUSES,
  createLeaveRequest,
  findLeaveType,
  listLeaveRequests,
} from '../services/leaveRequests.js';
import { calendarDate, parseOrThrow } from '../validation.js';

const listQuerySchema = z.object({
  status: z
    .enum(REQUEST_STATUSES, {
      errorMap: () => ({ message: `must be one of ${REQUEST_STATUSES.join(', ')}` }),
    })
    .optional(),
});

const newRequestSchema = z
  .object({
    typeId: z.number({ required_error: 'is required', invalid_type_error: 'must be a leave type' }),
    startDate: calendarDate,
    endDate: calendarDate,
    note: z.string().max(500, 'must be 500 characters or fewer').nullish(),
  })
  .superRefine((value, ctx) => {
    if (value.endDate < value.startDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['endDate'],
        message: 'must be on or after startDate',
      });
    }

    if (value.startDate < today()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['startDate'],
        message: 'must not be in the past',
      });
    }

    if (daysBetween(value.startDate, value.endDate) >= MAX_RANGE_DAYS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['endDate'],
        message: `must be within ${MAX_RANGE_DAYS} days of startDate`,
      });
    }
  });

export const leaveRequestsRouter = Router();

leaveRequestsRouter.get(
  '/leave-requests',
  requireIdentity,
  asyncHandler(async (req, res) => {
    const { status } = parseOrThrow(listQuerySchema, req.query, 'Request query failed validation');

    res.json(await listLeaveRequests(req.user.id, status));
  })
);

leaveRequestsRouter.post(
  '/leave-requests',
  requireIdentity,
  asyncHandler(async (req, res) => {
    const body = parseOrThrow(newRequestSchema, req.body, 'Request body failed validation');

    // Checked with a query rather than by catching the foreign key violation, so the client
    // gets a field-level message instead of a 500.
    const leaveType = await findLeaveType(body.typeId);

    if (!leaveType) {
      throw new ApiError('VALIDATION_ERROR', 'Request body failed validation', {
        typeId: 'must name a leave type that exists',
      });
    }

    const years = yearsSpanned(body.startDate, body.endDate);
    const holidays = (await Promise.all(years.map((year) => getHolidays(year)))).flat();

    // Counted here and stored, so a later change to upstream holiday data cannot silently
    // rewrite how much leave someone already booked. Going over the remaining balance is
    // not an error: the client warns, and the manager decides.
    const { businessDays } = countBusinessDays(body.startDate, body.endDate, holidays);

    const created = await createLeaveRequest({
      userId: req.user.id,
      typeId: body.typeId,
      startDate: body.startDate,
      endDate: body.endDate,
      businessDays,
      note: body.note ?? null,
    });

    res.status(201).json(created);
  })
);
