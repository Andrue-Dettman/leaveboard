import { apiRequest } from './client.js';

export function listBalances(options) {
  return apiRequest('/api/balances', options);
}
