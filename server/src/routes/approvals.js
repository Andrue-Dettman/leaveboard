import { Router } from 'express';
import { z } from 'zod';
import { ApiError } from '../errors.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { requireIdentity } from '../middleware/identity.js';
import { decidePendingRequest, listApprovals } from '../services/approvals.js';
import { findLeaveRequest } from '../services/leaveRequests.js';
import { idParam, parseOrThrow } from '../validation.js';

const pathSchema = z.object({ id: idParam });

const decisionSchema = z
  .object({
    decision: z.enum(['approved', 'denied'], {
      errorMap: () => ({ message: 'must be approved or denied' }),
    }),
    managerNote: z.string().max(500, 'must be 500 characters or fewer').nullish(),
  })
  .superRefine((value, ctx) => {
    // Whitespace is not a reason. An approval needs no note, so the requirement is only
    // attached to a denial.
    if (value.decision === 'denied' && !value.managerNote?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['managerNote'],
        message: 'required when denying a request',
      });
    }
  });

export const approvalsRouter = Router();

approvalsRouter.get(
  '/approvals',
  requireIdentity,
  asyncHandler(async (req, res) => {
    if (req.user.role !== 'manager') {
      throw new ApiError('FORBIDDEN', 'Only managers can view the approval queue');
    }

    res.json(await listApprovals(req.user.id));
  })
);

approvalsRouter.post(
  '/leave-requests/:id/decision',
  requireIdentity,
  asyncHandler(async (req, res) => {
    const { id } = parseOrThrow(pathSchema, req.params, 'Request path failed validation');
    const body = parseOrThrow(decisionSchema, req.body, 'Request body failed validation');

    const existing = await findLeaveRequest(id);

    if (!existing) {
      throw new ApiError('NOT_FOUND', `No leave request with id ${id}`);
    }

    const decided = await decidePendingRequest({
      id,
      managerId: req.user.id,
      decision: body.decision,
      managerNote: body.managerNote?.trim() || null,
    });

    // One message for both refusals, as with cancel. Saying which of the two applied would
    // tell a stranger whether the request is one of theirs to decide.
    if (!decided) {
      throw new ApiError('FORBIDDEN', "Only the requester's manager can decide this request");
    }

    res.json(decided);
  })
);
