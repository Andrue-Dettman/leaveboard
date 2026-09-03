import styles from './Field.module.css';

// Every form control in the app goes through here so the label, the hint, the error and
// the aria-describedby that ties them together cannot drift apart. `as` picks the
// element: an input by default, or a select or textarea.
export default function Field({
  id,
  label,
  hint,
  error,
  as: Control = 'input',
  children,
  ...rest
}) {
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ');

  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={id}>
        {label}
      </label>

      {hint && (
        <p className={styles.hint} id={hintId}>
          {hint}
        </p>
      )}

      <Control
        className={styles.control}
        id={id}
        aria-describedby={describedBy || undefined}
        aria-invalid={error ? true : undefined}
        {...rest}
      >
        {children}
      </Control>

      {error && (
        <p className={styles.error} id={errorId}>
          {error}
        </p>
      )}
    </div>
  );
}
