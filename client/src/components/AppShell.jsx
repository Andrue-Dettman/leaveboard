import { useEffect, useRef } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import UserSwitcher from './UserSwitcher.jsx';
import { useIdentity } from '../hooks/useIdentity.js';
import { PageHeadingContext } from '../hooks/usePageHeading.js';
import styles from './AppShell.module.css';

export default function AppShell() {
  const { currentUser, error } = useIdentity();
  const { pathname } = useLocation();
  const headingRef = useRef(null);
  const hasNavigated = useRef(false);

  // React Router leaves focus where it was, which strands a screen reader user on the
  // page they just left. Focus the new heading instead, but not on first load: doing it
  // there would put the skip link behind the user before they could reach it.
  useEffect(() => {
    if (!hasNavigated.current) {
      hasNavigated.current = true;
      return;
    }
    headingRef.current?.focus();
  }, [pathname]);

  return (
    <PageHeadingContext.Provider value={headingRef}>
      <div className={styles.shell}>
        <header className={styles.header}>
          <a className={styles.skipLink} href="#main">
            Skip to main content
          </a>

          <div className={styles.headerInner}>
            <Link className={styles.brand} to="/">
              LeaveBoard
            </Link>
            <UserSwitcher />
          </div>

          <nav className={styles.nav} aria-label="Main">
            <ul className={styles.navList}>
              <li>
                <NavLink className={styles.navLink} to="/" end>
                  Dashboard
                </NavLink>
              </li>
              <li>
                <NavLink className={styles.navLink} to="/requests" end>
                  My requests
                </NavLink>
              </li>
              <li>
                <NavLink className={styles.navLink} to="/requests/new">
                  New request
                </NavLink>
              </li>
              {currentUser?.role === 'manager' && (
                <li>
                  <NavLink className={styles.navLink} to="/approvals">
                    Approvals
                  </NavLink>
                </li>
              )}
            </ul>
          </nav>
        </header>

        <main className={styles.main} id="main" tabIndex={-1}>
          {error && (
            <p className={styles.alert} role="alert">
              The API did not answer, so the page may be empty or out of date. Check that the server
              is running and reload.
            </p>
          )}
          <Outlet />
        </main>

        <footer className={styles.footer}>
          <p className={styles.footerText}>
            LeaveBoard is a demonstration project. The people and requests in it are sample data.
          </p>
        </footer>
      </div>
    </PageHeadingContext.Provider>
  );
}
