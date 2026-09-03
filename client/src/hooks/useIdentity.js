import { createContext, useContext } from 'react';

export const IdentityContext = createContext(null);

export function useIdentity() {
  const identity = useContext(IdentityContext);
  if (!identity) {
    throw new Error('useIdentity must be called inside an IdentityProvider');
  }
  return identity;
}
