import { apiRequest } from './client.js';

export function listLeaveRequests({ status, ...options } = {}) {
  const query = status ? `?status=${encodeURIComponent(status)}` : '';
  return apiRequest(`/api/leave-requests${query}`, options);
}

export function createLeaveRequest({ request, ...options }) {
  return apiRequest('/api/leave-requests', { ...options, method: 'POST', body: request });
}

export function cancelLeaveRequest({ id, ...options }) {
  return apiRequest(`/api/leave-requests/${id}/cancel`, { ...options, method: 'POST' });
}

export function listApprovals(options) {
  return apiRequest('/api/approvals', options);
}
