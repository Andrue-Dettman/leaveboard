import { z } from 'zod';
import { ApiError } from './errors.js';
import { DATE_PATTERN, isCalendarDate } from './services/businessDays.js';

// Zod issue paths become the `fields` keys the client attaches to inputs via
// aria-describedby, so they have to stay the request's own field names. Where a field
// collects more than one issue the first is kept, because it describes the more basic
// problem: "must be a date in YYYY-MM-DD form" is more useful than a comparison failure
// against a value that was never a date.
export function parseOrThrow(schema, value, message) {
  const result = schema.safeParse(value);

  if (result.success) {
    return result.data;
  }

  const fields = {};

  for (const issue of result.error.issues) {
    const field = issue.path.join('.');

    if (!(field in fields)) {
      fields[field] = issue.message;
    }
  }

  throw new ApiError('VALIDATION_ERROR', message, fields);
}

// Every id column in this schema is a SERIAL. An id past the int4 ceiling cannot name a row
// and would fail the query with an out-of-range error rather than a clean 404.
const MAX_INT4 = 2147483647;

// Path parameters arrive as strings. The regex failing does not stop the refinement from
// running, so the bounds check has to tolerate NaN; parseOrThrow keeps the first message.
export const idParam = z
  .string()
  .regex(/^\d+$/, 'must be a positive integer')
  .transform(Number)
  .refine((id) => id >= 1 && id <= MAX_INT4, 'must be a positive integer');

// A chain of .regex().refine() would run both checks, because a failed string check is not
// fatal in Zod, and report whichever message came last. One branch keeps the message
// specific to what is actually wrong with the value.
export const calendarDate = z
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
