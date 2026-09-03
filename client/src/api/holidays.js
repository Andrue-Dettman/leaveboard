import { apiRequest } from './client.js';

export function listHolidays({ year, ...options }) {
  return apiRequest(`/api/holidays?year=${year}`, options);
}
