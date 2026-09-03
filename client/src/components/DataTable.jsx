import styles from './DataTable.module.css';

// One table serves both layouts. Below 640px the rows stack into cards and each cell
// shows its column name from data-label, so nothing scrolls sideways. Stacking means
// overriding display on the rows and cells, which strips those two elements of their
// implicit table semantics, so they carry their roles explicitly. Nothing else does.
/* eslint-disable jsx-a11y/no-interactive-element-to-noninteractive-role */
export default function DataTable({ caption, columns, rows, rowKey, emptyMessage }) {
  if (rows.length === 0) {
    return <p className={styles.empty}>{emptyMessage}</p>;
  }

  return (
    <table className={styles.table}>
      <caption className={styles.caption}>{caption}</caption>

      <thead className={styles.head}>
        <tr>
          {columns.map((column) => (
            <th className={styles.columnHeader} key={column.key} scope="col">
              {column.header}
            </th>
          ))}
        </tr>
      </thead>

      <tbody>
        {rows.map((row) => (
          <tr className={styles.row} key={rowKey(row)} role="row">
            {columns.map((column) => (
              <td className={styles.cell} key={column.key} role="cell" data-label={column.header}>
                {column.cell(row)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
