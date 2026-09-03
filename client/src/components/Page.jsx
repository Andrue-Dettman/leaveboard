import { useEffect } from 'react';
import { usePageHeadingRef } from '../hooks/usePageHeading.js';

// Wraps every routed page so the document title, the single <h1>, and the focus target
// the shell uses after a route change all stay in one place.
export default function Page({ title, children }) {
  const headingRef = usePageHeadingRef();

  useEffect(() => {
    document.title = `${title} — LeaveBoard`;
  }, [title]);

  return (
    <>
      <h1 ref={headingRef} tabIndex={-1}>
        {title}
      </h1>
      {children}
    </>
  );
}
