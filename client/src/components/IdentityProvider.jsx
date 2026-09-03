import { useCallback, useEffect, useMemo, useState } from 'react';
import { isAbortError } from '../api/client.js';
import { getCurrentUser, listUsers } from '../api/users.js';
import { IdentityContext } from '../hooks/useIdentity.js';

const STORAGE_KEY = 'leaveboard.acting-as';

function readStoredId() {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored === null ? null : Number(stored);
  } catch {
    // Storage is unavailable in some private browsing modes. The switcher still works,
    // it just forgets the choice between reloads.
    return null;
  }
}

function storeId(id) {
  try {
    window.localStorage.setItem(STORAGE_KEY, String(id));
  } catch {
    // See readStoredId.
  }
}

// There is no login: identity is the seeded user id sent as X-User-Id on every request.
// The reasoning is in docs/adr/0001-no-auth.md.
export function IdentityProvider({ children }) {
  const [users, setUsers] = useState([]);
  const [userId, setUserId] = useState(readStoredId);
  const [currentUser, setCurrentUser] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    const controller = new AbortController();

    listUsers({ signal: controller.signal })
      .then((loaded) => {
        setUsers(loaded);
        // A stored id that is no longer seeded would 404 every later call, so fall back
        // to the first user whenever the stored one is missing.
        setUserId((current) =>
          loaded.some((user) => user.id === current) ? current : (loaded[0]?.id ?? null)
        );
      })
      .catch((cause) => {
        if (!isAbortError(cause)) setError(cause);
      });

    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (userId === null) return undefined;
    const controller = new AbortController();

    getCurrentUser({ userId, signal: controller.signal })
      .then(setCurrentUser)
      .catch((cause) => {
        if (!isAbortError(cause)) setError(cause);
      });

    return () => controller.abort();
  }, [userId]);

  const actAs = useCallback((id) => {
    setUserId(id);
    storeId(id);
  }, []);

  const value = useMemo(
    () => ({ users, userId, currentUser, error, actAs }),
    [users, userId, currentUser, error, actAs]
  );

  return <IdentityContext.Provider value={value}>{children}</IdentityContext.Provider>;
}
