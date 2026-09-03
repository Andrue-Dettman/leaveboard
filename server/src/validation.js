import { ApiError } from './errors.js';

// Zod issue paths become the `fields` keys the client attaches to inputs via
// aria-describedby, so they have to stay the request's own field names.
export function parseOrThrow(schema, value, message) {
  const result = schema.safeParse(value);

  if (result.success) {
    return result.data;
  }

  const fields = Object.fromEntries(
    result.error.issues.map((issue) => [issue.path.join('.'), issue.message])
  );

  throw new ApiError('VALIDATION_ERROR', message, fields);
}
