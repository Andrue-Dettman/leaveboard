import { useCallback, useEffect, useState } from 'react';
import { isAbortError } from '../api/client.js';
import { decideLeaveRequest, listApprovals } from '../api/leaveRequests.js';
import DataTable from '../components/DataTable.jsx';
import Dialog from '../components/Dialog.jsx';
import Field from '../components/Field.jsx';
import Page from '../components/Page.jsx';
import { useAnnouncer } from '../hooks/useAnnouncer.js';
import { useIdentity } from '../hooks/useIdentity.js';
import { usePageHeadingRef } from '../hooks/usePageHeading.js';
import { formatDate, formatDateRange } from '../lib/dates.js';
import styles from './Approvals.module.css';

function describe(request) {
  return `${request.requester.name}'s ${request.typeName} request starting ${formatDate(
    request.startDate
  )}`;
}

export default function Approvals() {
  const { userId, currentUser } = useIdentity();
  const announce = useAnnouncer();
  const headingRef = usePageHeadingRef();

  const [queue, setQueue] = useState(null);
  const [loadFailed, setLoadFailed] = useState(false);

  const [deciding, setDeciding] = useState(null);
  const [decision, setDecision] = useState('approved');
  const [managerNote, setManagerNote] = useState('');
  const [noteError, setNoteError] = useState(null);
  const [inFlight, setInFlight] = useState(false);
  const [decisionFailed, setDecisionFailed] = useState(false);

  const isManager = currentUser?.role === 'manager';

  const load = useCallback(
    async (signal) => {
      const loaded = await listApprovals({ userId, signal });
      setQueue(loaded);
      return loaded;
    },
    [userId]
  );

  useEffect(() => {
    if (!currentUser || currentUser.id !== userId || !isManager) return undefined;

    const controller = new AbortController();

    load(controller.signal).catch((cause) => {
      if (!isAbortError(cause)) setLoadFailed(true);
    });

    return () => controller.abort();
  }, [userId, currentUser, isManager, load]);

  function openDecision(request) {
    setDeciding(request);
    setDecision('approved');
    setManagerNote('');
    setNoteError(null);
    setDecisionFailed(false);
  }

  async function submitDecision(event) {
    event.preventDefault();

    // The server refuses a denial without a note, but catching it here means the reader
    // hears why without a round trip, and focus can land on the field that needs them.
    if (decision === 'denied' && !managerNote.trim()) {
      setNoteError('A note is required when denying a request.');
      document.getElementById('manager-note')?.focus();
      return;
    }

    setNoteError(null);
    setDecisionFailed(false);
    setInFlight(true);

    try {
      const decided = await decideLeaveRequest({
        userId,
        id: deciding.id,
        decision,
        managerNote: managerNote.trim() || null,
      });

      // Reloading rather than dropping the row locally keeps the queue honest if something
      // else changed it. The dialog closes last, so focus falls back to the heading once
      // the row that opened it has gone.
      await load();
      announce(
        `${describe(deciding)} was ${decided.status === 'approved' ? 'approved' : 'denied'}.`
      );
      setDeciding(null);
    } catch {
      setDecisionFailed(true);
      announce('The decision could not be saved.');
    } finally {
      setInFlight(false);
    }
  }

  if (currentUser && !isManager) {
    return (
      <Page title="Approvals">
        <p className={styles.notice}>
          Only managers have an approval queue. You are acting as {currentUser.name}, who does not
          manage anyone. Switch to Maria in the header to see this page.
        </p>
      </Page>
    );
  }

  const columns = [
    { key: 'requester', header: 'Requester', cell: (request) => request.requester.name },
    { key: 'type', header: 'Type', cell: (request) => request.typeName },
    {
      key: 'dates',
      header: 'Dates',
      cell: (request) => formatDateRange(request.startDate, request.endDate),
    },
    { key: 'days', header: 'Business days', cell: (request) => request.businessDays },
    {
      key: 'submitted',
      header: 'Submitted',
      cell: (request) => formatDate(request.createdAt.slice(0, 10)),
    },
    {
      key: 'actions',
      header: 'Actions',
      cell: (request) => (
        // The visible word repeats on every row, so the rest of the name is carried in text
        // only a screen reader reads rather than replacing the label outright.
        <button className={styles.decide} type="button" onClick={() => openDecision(request)}>
          Decide<span className="visually-hidden"> {describe(request)}</span>
        </button>
      ),
    },
  ];

  return (
    <Page title="Approvals">
      {loadFailed && (
        <p className={styles.alert} role="alert">
          The approval queue could not be loaded. Check that the API is running and reload.
        </p>
      )}

      {queue === null ? (
        <p>Loading the approval queue.</p>
      ) : (
        <DataTable
          caption="Pending requests from your direct reports, oldest first"
          columns={columns}
          rows={queue}
          rowKey={(request) => request.id}
          emptyMessage="Nothing is waiting on you."
        />
      )}

      {deciding && (
        <Dialog
          open
          title="Decide this request"
          onClose={() => setDeciding(null)}
          returnFocusTo={headingRef}
        >
          <p>
            {deciding.requester.name}, {deciding.typeName},{' '}
            {formatDateRange(deciding.startDate, deciding.endDate)}, {deciding.businessDays}{' '}
            business days.
          </p>

          {deciding.note && <p className={styles.requesterNote}>&ldquo;{deciding.note}&rdquo;</p>}

          {decisionFailed && (
            <p className={styles.alert} role="alert">
              The decision could not be saved. Try again.
            </p>
          )}

          <form onSubmit={submitDecision}>
            <fieldset className={styles.choice}>
              <legend>Decision</legend>

              <label className={styles.radio}>
                <input
                  type="radio"
                  name="decision"
                  value="approved"
                  checked={decision === 'approved'}
                  onChange={() => setDecision('approved')}
                />
                Approve
              </label>

              <label className={styles.radio}>
                <input
                  type="radio"
                  name="decision"
                  value="denied"
                  checked={decision === 'denied'}
                  onChange={() => setDecision('denied')}
                />
                Deny
              </label>
            </fieldset>

            <Field
              id="manager-note"
              label={decision === 'denied' ? 'Note (required)' : 'Note (optional)'}
              as="textarea"
              rows={3}
              maxLength={500}
              value={managerNote}
              error={noteError}
              onChange={(event) => setManagerNote(event.target.value)}
            />

            <div className={styles.dialogActions}>
              <button
                className={styles.secondary}
                type="button"
                onClick={() => setDeciding(null)}
                disabled={inFlight}
              >
                Back to the queue
              </button>
              <button className={styles.primary} type="submit" disabled={inFlight}>
                Save the decision
              </button>
            </div>
          </form>
        </Dialog>
      )}
    </Page>
  );
}
