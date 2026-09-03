import '@testing-library/jest-dom/vitest';
import { afterAll, afterEach, beforeAll, expect } from 'vitest';
import { toHaveNoViolations } from 'jest-axe';
import { server } from './src/mocks/node.js';
import { resetMockData } from './src/mocks/handlers.js';

expect.extend(toHaveNoViolations);

// An unhandled request means the client called something the contract does not describe,
// so fail loudly rather than letting the test see a silent network error.
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));

afterEach(() => {
  server.resetHandlers();
  resetMockData();
});

afterAll(() => server.close());
