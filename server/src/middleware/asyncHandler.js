// Express 4 does not forward a rejected promise to the error handler, so every async
// route has to hand its rejection to next itself.
export function asyncHandler(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}
