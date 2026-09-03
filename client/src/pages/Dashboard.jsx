import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { isAbortError } from '../api/client.js';
import { listBalances } from '../api/balances.js';
import { listHolidays } from '../api/holidays.js';
import { listApprovals, listLeaveRequests } from '../api/leaveRequests.js';
import Page from '../components/Page.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import { useIdentity } from '../hooks/useIdentity.js';
import { formatDate, formatDateRange, today } from '../lib/dates.js';
import styles from './Dashboard.module.css';

const UPCOMING_LIMIT = 5;

function days(count) {
  return count === 1 ? '1 day' : `${count} days`;
}

// Leave that has started but not finished still counts as upcoming, so this compares the
// end date rather than the start.
function upcomingLeave(requests, from) {
  return requests
    .filter((request) => request.status === 'approved' || request.status === 'pending')
    .filter((request) => request.endDate >= from)
    .sort((a, b) => a.startDate.localeCompare(b.startDate))
    .slice(0, UPCOMING_LIMIT);
}

function upcomingHolidays(holidays, from) {
  return holidays.filter((holiday) => holiday.date >= from).slice(0, UPCOMING_LIMIT);
}

export default function Dashboard() {
  const { userId, currentUser } = useIdentity();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    // Waiting until the resolved user matches the chosen one keeps an employee from
    // asking for the manager queue on the render right after the identity changes.
    if (!currentUser || currentUser.id !== userId) return undefined;

    const controller = new AbortController();
    const options = { userId, signal: controller.signal };
    const year = Number(today().slice(0, 4));

    setData(null);
    setError(null);

    Promise.all([
      listBalances(options),
      listLeaveRequests(options),
      listHolidays({ ...options, year }),
      currentUser.role === 'manager' ? listApprovals(options) : Promise.resolve([]),
    ])
      .then(([balances, requests, holidays, approvals]) =>
        setData({ balances, requests, holidays, approvals })
      )
      .catch((cause) => {
        if (!isAbortError(cause)) setError(cause);
      });

    return () => controller.abort();
  }, [userId, currentUser]);

  if (error) {
    return (
      <Page title="Dashboard">
        <p className={styles.alert} role="alert">
          Your dashboard could not be loaded. Check that the API is running and reload.
        </p>
      </Page>
    );
  }

  if (!data) {
    return (
      <Page title="Dashboard">
        <p>Loading your dashboard.</p>
      </Page>
    );
  }

  const from = today();
  const leave = upcomingLeave(data.requests, from);
  const holidays = upcomingHolidays(data.holidays, from);

  return (
    <Page title="Dashboard">
      {currentUser.role === 'manager' && (
        <p className={styles.callout}>
          <Link to="/approvals">Pending approvals: {data.approvals.length}</Link>
        </p>
      )}

      <section className={styles.section} aria-labelledby="balances-heading">
        <h2 id="balances-heading">Your balances</h2>
        <ul className={styles.cards}>
          {data.balances.map((balance) => (
            <li className={styles.card} key={balance.typeId}>
              <h3 className={styles.cardTitle}>{balance.typeName}</h3>
              <p className={styles.remaining}>{days(balance.remaining)} remaining</p>
              <dl className={styles.breakdown}>
                <div className={styles.pair}>
                  <dt>Allowance</dt>
                  <dd>{balance.annualAllowance}</dd>
                </div>
                <div className={styles.pair}>
                  <dt>Used</dt>
                  <dd>{balance.used}</dd>
                </div>
                <div className={styles.pair}>
                  <dt>Pending</dt>
                  <dd>{balance.pending}</dd>
                </div>
              </dl>
            </li>
          ))}
        </ul>
      </section>

      <section className={styles.section} aria-labelledby="upcoming-heading">
        <h2 id="upcoming-heading">Upcoming leave</h2>
        {leave.length === 0 ? (
          <p className={styles.empty}>
            You have no leave booked. <Link to="/requests/new">Ask for some</Link>.
          </p>
        ) : (
          <ul className={styles.list}>
            {leave.map((request) => (
              <li className={styles.item} key={request.id}>
                <p className={styles.itemTitle}>
                  {request.typeName} <StatusBadge status={request.status} />
                </p>
                <p className={styles.itemDetail}>
                  {formatDateRange(request.startDate, request.endDate)},{' '}
                  {days(request.businessDays)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={styles.section} aria-labelledby="holidays-heading">
        <h2 id="holidays-heading">Upcoming holidays</h2>
        {holidays.length === 0 ? (
          <p className={styles.empty}>No more public holidays this year.</p>
        ) : (
          <ul className={styles.list}>
            {holidays.map((holiday) => (
              <li className={styles.item} key={holiday.date}>
                <p className={styles.itemTitle}>{holiday.name}</p>
                <p className={styles.itemDetail}>{formatDate(holiday.date)}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </Page>
  );
}
