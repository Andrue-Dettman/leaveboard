// client/.env is not committed, so fall back to the local API origin named in
// docs/openapi.yaml. The mock worker intercepts either way.
const baseUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

export class ApiError extends Error {
  constructor(status, payload) {
    super(payload?.error?.message ?? `The request failed with status ${status}`);
    this.name = 'ApiError';
    this.status = status;
    this.code = payload?.error?.code ?? 'UNKNOWN_ERROR';
    this.fields = payload?.error?.fields ?? {};
  }
}

export function isAbortError(error) {
  return error?.name === 'AbortError';
}

export async function apiRequest(path, { userId, method = 'GET', body, signal } = {}) {
  const headers = {};
  if (userId !== undefined && userId !== null) headers['X-User-Id'] = String(userId);
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    signal,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  // A gateway or a crashed process can answer with something that is not JSON, so an
  // unparseable body becomes a null payload rather than a thrown SyntaxError.
  const payload = await response.json().catch(() => null);

  if (!response.ok) throw new ApiError(response.status, payload);
  return payload;
}
