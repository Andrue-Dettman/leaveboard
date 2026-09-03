import styles from './StatusBadge.module.css';

const labels = {
  pending: 'Pending',
  approved: 'Approved',
  denied: 'Denied',
  cancelled: 'Cancelled',
};

// The colour is decoration. The word is what carries the status, so it is always there.
export default function StatusBadge({ status }) {
  return <span className={`${styles.badge} ${styles[status]}`}>{labels[status]}</span>;
}
