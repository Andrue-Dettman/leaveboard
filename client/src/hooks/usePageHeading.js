import { createContext, useContext } from 'react';

// The shell moves focus to the current page heading after a route change, so pages hand
// their <h1> back through this ref rather than the shell hunting for it in the DOM.
export const PageHeadingContext = createContext(null);

export function usePageHeadingRef() {
  return useContext(PageHeadingContext);
}
