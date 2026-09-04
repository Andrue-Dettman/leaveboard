import { useEffect, useId, useRef } from 'react';
import styles from './Dialog.module.css';

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

export default function Dialog({ open, title, onClose, returnFocusTo, children }) {
  const dialogRef = useRef(null);
  const headingRef = useRef(null);
  const openerRef = useRef(null);
  const headingId = useId();

  useEffect(() => {
    if (!open) return undefined;

    openerRef.current = document.activeElement;
    headingRef.current?.focus();
    const fallback = returnFocusTo?.current;

    return () => {
      // Focus returns to whatever opened the dialog, including when the list behind it
      // has re-rendered. When the action removed that control from the page — cancelling
      // a request takes its own cancel button away — the caller says where focus should
      // land instead, because it is the one that knows.
      const opener = openerRef.current;
      if (opener?.isConnected) opener.focus();
      else fallback?.focus();
    };
  }, [open, returnFocusTo]);

  useEffect(() => {
    if (!open) return undefined;
    const dialog = dialogRef.current;

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        onClose();
        return;
      }

      if (event.key !== 'Tab') return;

      const focusable = [...dialog.querySelectorAll(FOCUSABLE)];
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }

      const first = focusable[0];
      const last = focusable.at(-1);
      const active = document.activeElement;

      // The heading holds focus when the dialog opens and is not itself tabbable, so
      // anything outside the list counts as sitting before the first control.
      if (event.shiftKey && (active === first || !focusable.includes(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }

    dialog.addEventListener('keydown', handleKeyDown);
    return () => dialog.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className={styles.backdrop}>
      <div
        className={styles.dialog}
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
      >
        <h2 className={styles.title} id={headingId} ref={headingRef} tabIndex={-1}>
          {title}
        </h2>
        {children}
      </div>
    </div>
  );
}
