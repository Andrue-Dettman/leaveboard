import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { axe } from 'jest-axe';
import DataTable from '../src/components/DataTable.jsx';

const columns = [
  { key: 'type', header: 'Type', cell: (row) => row.typeName },
  { key: 'dates', header: 'Dates', cell: (row) => `${row.startDate} to ${row.endDate}` },
  { key: 'days', header: 'Business days', cell: (row) => row.businessDays },
];

const rows = [
  { id: 1, typeName: 'Vacation', startDate: '2026-03-16', endDate: '2026-03-20', businessDays: 5 },
  { id: 2, typeName: 'Sick', startDate: '2026-05-11', endDate: '2026-05-11', businessDays: 1 },
];

function renderTable(props) {
  return render(
    <DataTable
      caption="Your leave requests, newest first"
      columns={columns}
      rows={rows}
      rowKey={(row) => row.id}
      emptyMessage="You have not asked for any leave yet."
      {...props}
    />
  );
}

describe('DataTable', () => {
  it('names the table with its caption', () => {
    renderTable();

    expect(screen.getByRole('table', { name: 'Your leave requests, newest first' })).toBeVisible();
  });

  it('renders a column header per column', () => {
    renderTable();

    expect(screen.getAllByRole('columnheader').map((header) => header.textContent)).toEqual([
      'Type',
      'Dates',
      'Business days',
    ]);
  });

  it('renders a row per record with a cell per column', () => {
    renderTable();

    const [, firstRow] = screen.getAllByRole('row');
    expect(
      within(firstRow)
        .getAllByRole('cell')
        .map((cell) => cell.textContent)
    ).toEqual(['Vacation', '2026-03-16 to 2026-03-20', '5']);
  });

  it('labels every cell so the stacked layout still says what it is showing', () => {
    renderTable();

    const [, firstRow] = screen.getAllByRole('row');
    expect(
      within(firstRow)
        .getAllByRole('cell')
        .map((cell) => cell.getAttribute('data-label'))
    ).toEqual(['Type', 'Dates', 'Business days']);
  });

  it('says so when there is nothing to show', () => {
    renderTable({ rows: [] });

    expect(screen.getByText('You have not asked for any leave yet.')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('has no accessibility violations', async () => {
    const { container } = renderTable();

    expect(await axe(container)).toHaveNoViolations();
  });
});
