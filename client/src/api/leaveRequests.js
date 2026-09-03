import { apiRequest } from './client.js';

export function listLeaveRequests({ status, ...options } = {}) {
  const query = status ? `?status=${encodeURIComponent(status)}` : '';
  return apiRequest(`/api/leave-requests${query}`, options);
}

export function listApprovals(options) {
  return apiRequest('/api/approvals', options);
}
