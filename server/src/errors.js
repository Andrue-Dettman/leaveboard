const statusByCode = {
  VALIDATION_ERROR: 400,
  MISSING_IDENTITY: 400,
  UNKNOWN_USER: 404,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  UPSTREAM_ERROR: 502,
  INTERNAL_ERROR: 500,
};

// Every failure the API reports on purpose. The status comes from the code so a route
// cannot pair FORBIDDEN with a 404 by accident.
export class ApiError extends Error {
  constructor(code, message, fields) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = statusByCode[code] ?? 500;
    this.fields = fields;
  }

  toEnvelope() {
    const error = { code: this.code, message: this.message };

    if (this.fields) {
      error.fields = this.fields;
    }

    return { error };
  }
}
