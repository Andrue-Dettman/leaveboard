import { useEffect, useState } from 'react';
import { useAnnouncement } from '../hooks/useAnnouncer.js';

// How long the region stays empty before the new text goes in. Long enough for a screen
// reader to notice two separate changes, short enough not to feel delayed.
const RESET_MS = 120;

export default function LiveRegion() {
  const { text, sequence } = useAnnouncement();
  const [rendered, setRendered] = useState('');

  // A screen reader only speaks a live region when its content changes, so announcing the
  // same sentence twice would be silent the second time. That is a real case rather than a
  // hypothetical one: the user edits a date and the business-day count lands on the same
  // number. Clearing the region first makes every announcement a genuine change, and the
  // sequence number is what makes a repeat of identical text re-run this effect.
  useEffect(() => {
    if (!text) {
      setRendered('');
      return undefined;
    }

    setRendered('');
    const timer = setTimeout(() => setRendered(text), RESET_MS);
    return () => clearTimeout(timer);
  }, [text, sequence]);

  return (
    <div className="visually-hidden" aria-live="polite" aria-atomic="true">
      {rendered}
    </div>
  );
}
