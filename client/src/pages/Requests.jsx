import { useCallback, useEffect, useRef, useState } from 'react';
import { isAbortError } from '../api/client.js';
import { cancelLeaveRequest, listLeaveRequests } from '../api/leaveRequests.js';
import DataTable from '../components/DataTable.jsx';
import Dialog from '../components/Dialog.jsx';
import Field from '../components/Field.jsx';
import Page from '../components/Page.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import { useAnnouncer } from '../hooks/useAnnouncer.js';
import { useIdentity } from '../hooks/useIdentity.js';
import { usePageHeadingRef } from '../hooks/usePageHeading.js';
import { formatDate, formatDateRange } from '../lib/dates.js';
import styles from './Requests.module.css';

const STATUSES = [
  { value: '', label: 'All statuses' },
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'denied', label: 'Denied' },
  { value: 'cancelled', label: 'Cancelled' },
];

function describe(request) {
  return `${request.typeName} request starting ${formatDate(request.startDate)}`;
}

export default function Requests() {
  const { userId, currentUser } = useIdentity();
  const announce = useAnnouncer();
  const headingRef = usePageHeadingRef();

  const [status, setStatus] = useState('');
  const [order, setOrder] = useState('soonest');
  const [requests, setRequests] = useState(null);
  const [loadFailed, setLoadFailed] = useState(false);

  const [cancelling, setCancelling] = useState(null);
  const [cancelInFlight, setCancelInFlight] = useState(false);
  const [cancelFailed, setCancelFailed] = useState(false);

  // The first load is the page arriving, which the reader already knows about. Only a
  // filter they chose themselves is worth announcing.
  const announceCount = useRef(false);

  const load = useCallback(
    async (signal) => {
      const loaded = await listLeaveRequests({ userId, status: status || undefined, signal });
      setRequests(loaded);
      return loaded;
    },
    [userId, status]
  );

  useEffect(() => {
    if (!currentUser || currentUser.id !== userId) return undefined;

    const controller = new AbortController();

    load(controller.signal)
      .then((loaded) => {
        if (!announceCount.current) return;
        announceCount.current = false;

        const label = STATUSES.find((option) => option.value === status).label.toLowerCase();
        announce(
          loaded.length === 1
            ? `Showing 1 request, ${label}.`
            : `Showing ${loaded.length} requests, ${label}.`
        );
      })
      .catch((cause) => {
        if (!isAbortError(cause)) setLoadFailed(true);
      });

    return () => controller.abort();
  }, [userId, currentUser, status, load, announce]);

  function handleFilter(event) {
    announceCount.current = true;
    setStatus(event.target.value);
  }

  async function confirmCancel() {
    setCancelFailed(false);
    setCancelInFlight(true);

    try {
      const cancelled = await cancelLeaveRequest({ userId, id: cancelling.id });

      // Reload before closing, and reload rather than patch the row: with a status filter
      // on, a cancelled request may not belong in the list at all. Closing last also means
      // the row's cancel button is already gone when the dialog hands focus back, so it
      // falls through to the heading instead of landing on a button about to disappear.
      await load();
      announce(`Your ${describe(cancelled)} was cancelled.`);
      setCancelling(null);
    } catch {
      setCancelFailed(true);
      announce('The request could not be cancelled.');
    } finally {
      setCancelInFlight(false);
    }
  }

  const columns = [
    { key: 'type', header: 'Type', cell: (request) => request.typeName },
    {
      key: 'dates',
      header: 'Dates',
      cell: (request) => formatDateRange(request.startDate, request.endDate),
    },
    { key: 'days', header: 'Business days', cell: (request) => request.businessDays },
    {
      key: 'status',
      header: 'Status',
      cell: (request) => <StatusBadge status={request.status} />,
    },
    {
      key: 'submitted',
      header: 'Submitted',
      cell: (request) => formatDate(request.createdAt.slice(0, 10)),
    },
    {
      key: 'actions',
      header: 'Actions',
      cell: (request) =>
        request.status === 'pending' ? (
          // The visible word is the same on every row, so the rest of the name is carried
          // in text only a screen reader reads. An aria-label would replace the visible
          // word instead of extending it.
          <button className={styles.cancel} type="button" onClick={() => setCancelling(request)}>
            Cancel<span className="visually-hidden"> the {describe(request)}</span>
          </button>
        ) : null,
    },
  ];

  const shown = requests
    ? [...requests].sort((a, b) =>
        order === 'soonest'
          ? a.startDate.localeCompare(b.startDate)
          : b.startDate.localeCompare(a.startDate)
      )
    : [];

  return (
    <Page title="My requests">
      {loadFailed && (
        <p className={styles.alert} role="alert">
          Your requests could not be loaded. Check that the API is running and reload.
        </p>
      )}

      <div className={styles.controls}>
        <Field id="status" label="Status" as="select" value={status} onChange={handleFilter}>
          {STATUSES.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Field>

        <Field
          id="order"
          label="Sort by start date"
          as="select"
          value={order}
          onChange={(event) => setOrder(event.target.value)}
        >
          <option value="soonest">Soonest first</option>
          <option value="latest">Latest first</option>
        </Field>
      </div>

      {requests === null ? (
        <p>Loading your requests.</p>
      ) : (
        <DataTable
          caption={`Your leave requests, ${order === 'soonest' ? 'soonest' : 'latest'} first`}
          columns={columns}
          rows={shown}
          rowKey={(request) => request.id}
          emptyMessage={
            status ? 'No requests match this filter.' : 'You have not asked for any leave yet.'
          }
        />
      )}

      {cancelling && (
        <Dialog
          open
          title="Cancel this request?"
          onClose={() => setCancelling(null)}
          returnFocusTo={headingRef}
        >
          <p>
            {cancelling.typeName}, {formatDateRange(cancelling.startDate, cancelling.endDate)},{' '}
            {cancelling.businessDays} business days. Cancelling cannot be undone.
          </p>

          {cancelFailed && (
            <p className={styles.alert} role="alert">
              The request could not be cancelled. Try again.
            </p>
          )}

          <div className={styles.dialogActions}>
            <button
              className={styles.secondary}
              type="button"
              onClick={() => setCancelling(null)}
              disabled={cancelInFlight}
            >
              Keep the request
            </button>
            <button
              className={styles.danger}
              type="button"
              onClick={confirmCancel}
              disabled={cancelInFlight}
            >
              Cancel the request
            </button>
          </div>
        </Dialog>
      )}
    </Page>
  );
}
