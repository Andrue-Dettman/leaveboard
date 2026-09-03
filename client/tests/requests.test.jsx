import { StrictMode } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { axe } from 'jest-axe';
import App from '../src/App.jsx';
import { server } from '../src/mocks/node.js';

function renderList() {
  const user = userEvent.setup();
  const view = render(
    <StrictMode>
      <MemoryRouter initialEntries={['/requests']}>
        <App />
      </MemoryRouter>
    </StrictMode>
  );
  return { user, ...view };
}

function liveRegion() {
  return document.querySelector('[aria-live="polite"]');
}

function rowsInOrder() {
  // The first row is the header, so it is dropped before reading the type column.
  const [, ...body] = screen.getAllByRole('row');
  return body.map((row) => within(row).getAllByRole('cell')[1].textContent);
}

async function openCancelDialog(user) {
  const trigger = await screen.findByRole('button', {
    name: 'Cancel the Vacation request starting Nov 23, 2026',
  });
  await user.click(trigger);
  return trigger;
}

beforeEach(() => {
  // Maria has no leave of her own, so these run as Sam, who has one of each status.
  window.localStorage.clear();
  window.localStorage.setItem('leaveboard.acting-as', '2');
});

describe('requests list', () => {
  it('lists the current user requests with their details', async () => {
    renderList();

    const table = await screen.findByRole('table');
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((header) => header.textContent)
    ).toEqual(['Type', 'Dates', 'Business days', 'Status', 'Submitted', 'Actions']);

    const row = within(table)
      .getByRole('cell', { name: 'Mar 16, 2026 to Mar 20, 2026' })
      .closest('tr');
    expect(within(row).getByText('Vacation')).toBeInTheDocument();
    expect(within(row).getByText('Approved')).toBeInTheDocument();
    expect(within(row).getByText('5')).toBeInTheDocument();
  });

  it('sorts by start date in both directions', async () => {
    const { user } = renderList();
    await screen.findByRole('table');

    expect(rowsInOrder()).toEqual([
      'Mar 16, 2026 to Mar 20, 2026',
      'May 11, 2026',
      'Nov 23, 2026 to Nov 27, 2026',
    ]);

    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Sort by start date' }),
      'latest'
    );

    expect(rowsInOrder()).toEqual([
      'Nov 23, 2026 to Nov 27, 2026',
      'May 11, 2026',
      'Mar 16, 2026 to Mar 20, 2026',
    ]);
  });

  it('filters by status and says how many are left', async () => {
    const { user } = renderList();
    await screen.findByRole('table');

    await user.selectOptions(screen.getByRole('combobox', { name: 'Status' }), 'pending');

    await waitFor(() => expect(rowsInOrder()).toEqual(['Nov 23, 2026 to Nov 27, 2026']));
    await waitFor(() => expect(liveRegion()).toHaveTextContent('Showing 1 request, pending.'));
  });

  it('says so when a filter matches nothing', async () => {
    const { user } = renderList();
    await screen.findByRole('table');

    await user.selectOptions(screen.getByRole('combobox', { name: 'Status' }), 'cancelled');

    expect(await screen.findByText('No requests match this filter.')).toBeInTheDocument();
  });

  it('offers to cancel a pending request and nothing else', async () => {
    renderList();
    await screen.findByRole('table');

    expect(
      await screen.findByRole('button', {
        name: 'Cancel the Vacation request starting Nov 23, 2026',
      })
    ).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /^Cancel the/ })).toHaveLength(1);
  });

  it('describes the request in the confirmation dialog', async () => {
    const { user } = renderList();
    await screen.findByRole('table');

    await openCancelDialog(user);

    const dialog = screen.getByRole('dialog', { name: 'Cancel this request?' });
    expect(dialog).toHaveTextContent('Vacation, Nov 23, 2026 to Nov 27, 2026, 4 business days.');
  });

  it('keeps the request and returns focus to the button when dismissed', async () => {
    const { user } = renderList();
    await screen.findByRole('table');

    const trigger = await openCancelDialog(user);
    await user.click(screen.getByRole('button', { name: 'Keep the request' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    // Scoped to the table because the status filter offers an option of the same name.
    expect(within(screen.getByRole('table')).getByText('Pending')).toBeInTheDocument();
  });

  it('cancels the request, announces it, and parks focus on the heading', async () => {
    const { user } = renderList();
    await screen.findByRole('table');

    await openCancelDialog(user);
    await user.click(screen.getByRole('button', { name: 'Cancel the request' }));

    await waitFor(() =>
      expect(within(screen.getByRole('table')).getByText('Cancelled')).toBeInTheDocument()
    );
    await waitFor(() =>
      expect(liveRegion()).toHaveTextContent(
        'Your Vacation request starting Nov 23, 2026 was cancelled.'
      )
    );
    // The button that opened the dialog went away with the pending status, so focus falls
    // back to the page heading rather than to the body.
    expect(screen.getByRole('heading', { level: 1, name: 'My requests' })).toHaveFocus();
  });

  it('keeps the dialog open when the cancellation fails', async () => {
    server.use(http.post('*/api/leave-requests/:id/cancel', () => HttpResponse.error()));

    const { user } = renderList();
    await screen.findByRole('table');

    await openCancelDialog(user);
    await user.click(screen.getByRole('button', { name: 'Cancel the request' }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('alert')).toHaveTextContent(
      'The request could not be cancelled'
    );
    await waitFor(() =>
      expect(liveRegion()).toHaveTextContent('The request could not be cancelled.')
    );
  });

  it('reports a list that could not be loaded', async () => {
    server.use(http.get('*/api/leave-requests', () => HttpResponse.error()));

    renderList();

    expect(await screen.findByRole('alert')).toHaveTextContent('Your requests could not be loaded');
  });

  it('has no accessibility violations', async () => {
    const { container } = renderList();
    await screen.findByRole('table');

    expect(await axe(container)).toHaveNoViolations();
  });

  it('has no accessibility violations with the dialog open', async () => {
    const { container, user } = renderList();
    await screen.findByRole('table');

    await openCancelDialog(user);

    expect(await axe(container)).toHaveNoViolations();
  });
});
