import { apiRequest } from './client.js';

export function listLeaveTypes(options) {
  return apiRequest('/api/leave-types', options);
}

export function countBusinessDays({ start, end, ...options }) {
  return apiRequest(`/api/business-days?start=${start}&end=${end}`, options);
}
