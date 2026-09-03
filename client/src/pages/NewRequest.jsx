import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError, isAbortError } from '../api/client.js';
import { listBalances } from '../api/balances.js';
import { createLeaveRequest } from '../api/leaveRequests.js';
import { countBusinessDays, listLeaveTypes } from '../api/reference.js';
import Field from '../components/Field.jsx';
import Page from '../components/Page.jsx';
import { useAnnouncer } from '../hooks/useAnnouncer.js';
import { useIdentity } from '../hooks/useIdentity.js';
import { today } from '../lib/dates.js';
import styles from './NewRequest.module.css';

const READOUT_DELAY = 400;
const NOTE_LIMIT = 500;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// Each field's id is the name the API uses for it, so a 400 carrying a fields object maps
// onto the form, and onto the focus order below, without a translation table.
const FIELD_ORDER = ['typeId', 'startDate', 'endDate', 'note'];

function businessDays(count) {
  return count === 1 ? '1 business day' : `${count} business days`;
}

function listNames(names) {
  if (names.length < 2) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}

function validate({ typeId, startDate, endDate }) {
  const found = {};

  if (!typeId) found.typeId = 'Choose a leave type.';

  if (!startDate) found.startDate = 'Enter a start date.';
  else if (startDate < today()) found.startDate = 'Enter a start date that is not in the past.';

  if (!endDate) found.endDate = 'Enter an end date.';
  else if (startDate && endDate < startDate) {
    found.endDate = 'Enter an end date on or after the start date.';
  }

  return found;
}

export default function NewRequest() {
  const { userId, currentUser } = useIdentity();
  const announce = useAnnouncer();
  const navigate = useNavigate();

  const [leaveTypes, setLeaveTypes] = useState([]);
  const [balances, setBalances] = useState([]);
  const [values, setValues] = useState({ typeId: '', startDate: '', endDate: '', note: '' });
  const [errors, setErrors] = useState({});
  const [preview, setPreview] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [sendFailed, setSendFailed] = useState(false);

  const { typeId, startDate, endDate, note } = values;
  const balance = balances.find((entry) => entry.typeId === Number(typeId));

  useEffect(() => {
    if (!currentUser || currentUser.id !== userId) return undefined;

    const controller = new AbortController();
    const options = { userId, signal: controller.signal };

    Promise.all([listLeaveTypes(options), listBalances(options)])
      .then(([types, loaded]) => {
        setLeaveTypes(types);
        setBalances(loaded);
      })
      .catch((cause) => {
        if (!isAbortError(cause)) setLoadFailed(true);
      });

    return () => controller.abort();
  }, [userId, currentUser]);

  // Debounced so that typing a date does not fire a request, and an announcement, per
  // keystroke. Clearing the timer on every change is what makes the delay a debounce
  // rather than a queue.
  useEffect(() => {
    if (!ISO_DATE.test(startDate) || !ISO_DATE.test(endDate) || endDate < startDate) {
      setPreview(null);
      return undefined;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => {
      countBusinessDays({ start: startDate, end: endDate, signal: controller.signal })
        .then(setPreview)
        .catch((cause) => {
          if (!isAbortError(cause)) setPreview(null);
        });
    }, READOUT_DELAY);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [startDate, endDate]);

  // One announcement carrying the count and both warnings, so a screen reader hears the
  // same thing the page shows rather than three separate interruptions.
  useEffect(() => {
    if (!preview) return;

    const parts = [`This request uses ${businessDays(preview.businessDays)}.`];
    const names = preview.holidays.map((holiday) => holiday.name);

    if (names.length > 0) {
      parts.push(`It covers ${listNames(names)}, which will not be counted.`);
    }
    if (balance && preview.businessDays > balance.remaining) {
      parts.push(`That is more than the ${balance.remaining} days left for ${balance.typeName}.`);
    }

    announce(parts.join(' '));
  }, [preview, balance, announce]);

  function handleChange(event) {
    const { id, value } = event.target;
    setValues((current) => ({ ...current, [id]: value }));
  }

  function reportErrors(found, summary) {
    setErrors(found);
    announce(summary);
    document.getElementById(FIELD_ORDER.find((name) => found[name]))?.focus();
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSendFailed(false);

    const found = validate(values);
    if (Object.keys(found).length > 0) {
      const messages = FIELD_ORDER.filter((name) => found[name]).map((name) => found[name]);
      reportErrors(found, `Your request was not sent. ${messages.join(' ')}`);
      return;
    }

    setErrors({});
    setSubmitting(true);

    try {
      await createLeaveRequest({
        userId,
        request: {
          typeId: Number(typeId),
          startDate,
          endDate,
          note: note.trim() || null,
        },
      });

      announce('Your request was sent for approval.');
      navigate('/requests');
    } catch (cause) {
      setSubmitting(false);
      const fields = cause instanceof ApiError ? cause.fields : {};

      if (Object.keys(fields).length > 0) {
        reportErrors(fields, 'Your request was not sent. Check the fields marked with an error.');
      } else {
        setSendFailed(true);
        announce('Your request could not be sent.');
      }
    }
  }

  const holidayNames = preview ? preview.holidays.map((holiday) => holiday.name) : [];
  const overBalance = Boolean(balance && preview && preview.businessDays > balance.remaining);

  return (
    <Page title="New leave request">
      {loadFailed && (
        <p className={styles.alert} role="alert">
          The leave types could not be loaded, so this form cannot be filled in. Check that the API
          is running and reload.
        </p>
      )}

      <form className={styles.form} onSubmit={handleSubmit} noValidate>
        <Field
          id="typeId"
          label="Leave type"
          as="select"
          value={typeId}
          onChange={handleChange}
          error={errors.typeId}
        >
          <option value="">Choose a leave type</option>
          {leaveTypes.map((type) => (
            <option key={type.id} value={type.id}>
              {type.name}
            </option>
          ))}
        </Field>

        <Field
          id="startDate"
          label="Start date"
          type="date"
          value={startDate}
          onChange={handleChange}
          error={errors.startDate}
          hint="Weekends and public holidays are not counted."
        />

        <Field
          id="endDate"
          label="End date"
          type="date"
          value={endDate}
          onChange={handleChange}
          error={errors.endDate}
        />

        <div className={styles.readout}>
          <p className={styles.count}>
            {preview
              ? `This request uses ${businessDays(preview.businessDays)}.`
              : 'Pick a start and end date to see how many business days this uses.'}
          </p>

          {holidayNames.length > 0 && (
            <p className={styles.warning}>
              It covers {listNames(holidayNames)}, which will not be counted.
            </p>
          )}

          {overBalance && (
            <p className={styles.warning}>
              That is more than the {balance.remaining} days you have left for {balance.typeName}.
              You can still send it.
            </p>
          )}
        </div>

        <Field
          id="note"
          label="Note"
          as="textarea"
          value={note}
          onChange={handleChange}
          error={errors.note}
          maxLength={NOTE_LIMIT}
          hint={`Optional. Up to ${NOTE_LIMIT} characters.`}
        />

        {sendFailed && (
          <p className={styles.alert} role="alert">
            Your request could not be sent. Check your connection and try again.
          </p>
        )}

        <button className={styles.submit} type="submit" disabled={submitting}>
          {submitting ? 'Sending' : 'Send request'}
        </button>
      </form>
    </Page>
  );
}
