import { apiRequest } from './client.js';

export function listUsers(options) {
  return apiRequest('/api/users', options);
}

export function getCurrentUser(options) {
  return apiRequest('/api/me', options);
}
