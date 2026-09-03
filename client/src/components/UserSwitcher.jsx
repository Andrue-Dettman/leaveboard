import { useIdentity } from '../hooks/useIdentity.js';
import styles from './UserSwitcher.module.css';

export default function UserSwitcher() {
  const { users, userId, actAs } = useIdentity();

  return (
    <div className={styles.switcher}>
      <label className={styles.label} htmlFor="acting-as">
        Acting as
      </label>
      <select
        id="acting-as"
        className={styles.select}
        value={userId ?? ''}
        disabled={users.length === 0}
        onChange={(event) => actAs(Number(event.target.value))}
      >
        {users.length === 0 ? (
          <option value="">Loading people</option>
        ) : (
          users.map((user) => (
            <option key={user.id} value={user.id}>
              {user.name} ({user.role})
            </option>
          ))
        )}
      </select>
    </div>
  );
}
