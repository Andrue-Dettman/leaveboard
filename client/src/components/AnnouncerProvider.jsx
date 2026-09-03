import { useCallback, useMemo, useState } from 'react';
import { AnnouncerContext } from '../hooks/useAnnouncer.js';

// Holds the text the live region reads out. The region itself is rendered by the shell,
// inside <main>, so that it is already in the document when the text changes: a region
// that appears with its message already in it announces nothing in most screen readers.
export function AnnouncerProvider({ children }) {
  const [message, setMessage] = useState('');

  const announce = useCallback((text) => setMessage(text), []);

  const value = useMemo(() => ({ message, announce }), [message, announce]);

  return <AnnouncerContext.Provider value={value}>{children}</AnnouncerContext.Provider>;
}
