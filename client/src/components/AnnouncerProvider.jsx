import { useCallback, useMemo, useState } from 'react';
import { AnnouncerContext } from '../hooks/useAnnouncer.js';

// Holds the text the live region reads out. The region itself is rendered by the shell,
// inside <main>, so that it is already in the document when the text changes: a region
// that appears with its message already in it announces nothing in most screen readers.
export function AnnouncerProvider({ children }) {
  const [announcement, setAnnouncement] = useState({ text: '', sequence: 0 });

  // The sequence number matters: a screen reader only speaks a live region when its
  // content actually changes, so announcing the same sentence twice would be silent the
  // second time. That is a real case here rather than a hypothetical one, because the
  // user can edit a date and have the business-day count land on the same number.
  const announce = useCallback(
    (text) => setAnnouncement((current) => ({ text, sequence: current.sequence + 1 })),
    []
  );

  const value = useMemo(() => ({ ...announcement, announce }), [announcement, announce]);

  return <AnnouncerContext.Provider value={value}>{children}</AnnouncerContext.Provider>;
}
