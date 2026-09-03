import { createContext, useContext } from 'react';

export const AnnouncerContext = createContext(null);

// Call this anywhere below the provider to say something out loud, for example
// announce('This request uses 4 business days').
export function useAnnouncer() {
  const context = useContext(AnnouncerContext);
  if (!context) {
    throw new Error('useAnnouncer must be called inside an AnnouncerProvider');
  }
  return context.announce;
}

export function useAnnouncement() {
  const context = useContext(AnnouncerContext);
  return context ? context.message : '';
}
