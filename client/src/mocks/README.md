# Mock API

MSW handlers matching `docs/openapi.yaml`, used to build the client before the real API
exists and to keep tests off the network afterwards.

`handlers.js` holds mutable state, so creating, cancelling, and deciding a request change
what later calls return. Call `resetMockData()` between tests.

In the browser the worker starts from `main.jsx` when `VITE_USE_MOCKS` is `true`. It needs
the service worker script in `public/`, which `npx msw init client/public --save` writes.

In tests `client/vitest.setup.js` starts the node server for the whole run.
