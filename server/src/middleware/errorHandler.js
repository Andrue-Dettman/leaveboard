import { ApiError } from '../errors.js';

export function notFoundHandler(req, res, next) {
  next(new ApiError('NOT_FOUND', `No route for ${req.method} ${req.path}`));
}

// Express recognises an error handler by its four parameters, so next has to stay.
export function errorHandler(error, req, res, _next) {
  if (error instanceof ApiError) {
    res.status(error.status).json(error.toEnvelope());
    return;
  }

  // express.json() rejects a body it cannot parse with a SyntaxError carrying this type.
  // That is the client's mistake, not ours, so it must not be reported as a server fault.
  if (error.type === 'entity.parse.failed') {
    const invalidBody = new ApiError('VALIDATION_ERROR', 'Request body is not valid JSON');
    res.status(invalidBody.status).json(invalidBody.toEnvelope());
    return;
  }

  console.error(error);

  const fault = new ApiError('INTERNAL_ERROR', 'Something went wrong on the server');
  res.status(fault.status).json(fault.toEnvelope());
}
