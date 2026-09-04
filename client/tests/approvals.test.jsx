import { StrictMode } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { axe } from 'jest-axe';
import App from '../src/App.jsx';
import { server } from '../src/mocks/node.js';

function renderQueue() {
  const user = userEvent.setup();
  const view = render(
    <StrictMode>
      <MemoryRouter initialEntries={['/approvals']}>
        <App />
      </MemoryRouter>
    </StrictMode>
  );
  return { user, ...view };
}

function liveRegion() {
  return document.querySelector('[aria-live="polite"]');
}

function requestersInOrder() {
  // The first row is the header, so it is dropped before reading the requester column.
  const [, ...body] = screen.getAllByRole('row');
  return body.map((row) => within(row).getAllByRole('cell')[0].textContent);
}

async function openDecisionDialog(
  user,
  name = "Decide Sam Okafor's Vacation request starting Nov 23, 2026"
) {
  const trigger = await screen.findByRole('button', { name });
  await user.click(trigger);
  return trigger;
}

beforeEach(() => {
  // Maria manages Sam and Priya, so the queue only exists when acting as her.
  window.localStorage.clear();
  window.localStorage.setItem('leaveboard.acting-as', '1');
});

describe('approvals queue', () => {
  it('lists pending requests from direct reports, oldest first', async () => {
    renderQueue();

    await screen.findByRole('table');
    expect(requestersInOrder()).toEqual(['Sam Okafor', 'Priya Raman']);
  });

  it('shows the details a decision needs', async () => {
    renderQueue();

    const table = await screen.findByRole('table');
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((header) => header.textContent)
    ).toEqual(['Requester', 'Type', 'Dates', 'Business days', 'Submitted', 'Actions']);

    const row = within(table).getByRole('cell', { name: 'Sam Okafor' }).closest('tr');
    expect(within(row).getByRole('cell', { name: 'Nov 23, 2026 to Nov 27, 2026' })).toBeVisible();
    expect(within(row).getByRole('cell', { name: '4' })).toBeVisible();
  });

  it('says so when nothing is waiting', async () => {
    server.use(http.get('*/api/approvals', () => HttpResponse.json([])));
    renderQueue();

    expect(await screen.findByText('Nothing is waiting on you.')).toBeVisible();
  });

  it('has no accessibility violations', async () => {
    const { container } = renderQueue();

    await screen.findByRole('table');
    expect(await axe(container)).toHaveNoViolations();
  });

  it('tells an employee the page is not theirs instead of showing an empty queue', async () => {
    window.localStorage.setItem('leaveboard.acting-as', '2');
    renderQueue();

    expect(
      await screen.findByText(/Only managers have an approval queue/, { exact: false })
    ).toBeVisible();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('approves a request and announces it', async () => {
    const { user } = renderQueue();
    await openDecisionDialog(user);

    await user.click(screen.getByRole('button', { name: 'Save the decision' }));

    await waitFor(() => {
      expect(liveRegion()).toHaveTextContent(
        "Sam Okafor's Vacation request starting Nov 23, 2026 was approved."
      );
    });
    expect(requestersInOrder()).toEqual(['Priya Raman']);
  });

  it('sends the decision the manager picked', async () => {
    const { user } = renderQueue();
    await openDecisionDialog(user);

    await user.click(screen.getByRole('radio', { name: 'Deny' }));
    await user.type(screen.getByLabelText('Note (required)'), 'We need coverage that week.');
    await user.click(screen.getByRole('button', { name: 'Save the decision' }));

    await waitFor(() => {
      expect(liveRegion()).toHaveTextContent(/was denied\./);
    });
  });

  it('refuses to deny without a note and moves focus to it', async () => {
    const { user } = renderQueue();
    await openDecisionDialog(user);

    await user.click(screen.getByRole('radio', { name: 'Deny' }));
    await user.click(screen.getByRole('button', { name: 'Save the decision' }));

    const note = screen.getByLabelText('Note (required)');
    expect(note).toHaveAccessibleDescription('A note is required when denying a request.');
    expect(note).toHaveAttribute('aria-invalid', 'true');
    expect(note).toHaveFocus();

    // Nothing left the queue, because nothing was decided.
    expect(requestersInOrder()).toEqual(['Sam Okafor', 'Priya Raman']);
  });

  it('does not accept whitespace as a denial note', async () => {
    const { user } = renderQueue();
    await openDecisionDialog(user);

    await user.click(screen.getByRole('radio', { name: 'Deny' }));
    await user.type(screen.getByLabelText('Note (required)'), '   ');
    await user.click(screen.getByRole('button', { name: 'Save the decision' }));

    expect(screen.getByLabelText('Note (required)')).toHaveAttribute('aria-invalid', 'true');
  });

  it('closes on Escape and hands focus back to the row that opened it', async () => {
    const { user } = renderQueue();
    const trigger = await openDecisionDialog(user);

    await user.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });

  it('keeps the row and says so when the decision cannot be saved', async () => {
    server.use(
      http.post('*/api/leave-requests/:id/decision', () =>
        HttpResponse.json(
          { error: { code: 'INTERNAL_ERROR', message: 'Something went wrong' } },
          { status: 500 }
        )
      )
    );

    const { user } = renderQueue();
    await openDecisionDialog(user);
    await user.click(screen.getByRole('button', { name: 'Save the decision' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The decision could not be saved. Try again.'
    );
    await waitFor(() => {
      expect(liveRegion()).toHaveTextContent('The decision could not be saved.');
    });
  });

  it('reports a queue that cannot be loaded', async () => {
    server.use(
      http.get('*/api/approvals', () =>
        HttpResponse.json(
          { error: { code: 'INTERNAL_ERROR', message: 'Something went wrong' } },
          { status: 500 }
        )
      )
    );

    renderQueue();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The approval queue could not be loaded.'
    );
  });
});
