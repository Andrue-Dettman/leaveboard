import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { axe } from 'jest-axe';
import App from '../src/App.jsx';
import { server } from '../src/mocks/node.js';

// The fixtures are dated through 2026, and what counts as upcoming depends on the day the
// suite runs, so the clock is pinned rather than left to drift past them.
const TODAY = new Date('2026-09-03T09:00:00Z');

function renderApp() {
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  const view = render(
    <StrictMode>
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>
    </StrictMode>
  );
  return { user, ...view };
}

// Maria is the seeded default, so tests that need an employee switch identity first.
async function actAs(user, userId) {
  await user.selectOptions(screen.getByRole('combobox', { name: 'Acting as' }), userId);
}

function card(typeName) {
  return screen.getByRole('heading', { level: 3, name: typeName }).closest('li');
}

beforeEach(() => {
  window.localStorage.clear();
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(TODAY);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('Dashboard', () => {
  it('shows a balance card for every leave type', async () => {
    renderApp();
    await screen.findByRole('heading', { name: 'Your balances' });

    expect(
      screen.getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent)
    ).toEqual(['Vacation', 'Sick', 'Personal']);
    expect(card('Vacation')).toHaveTextContent('15 days remaining');
  });

  it('counts approved days as used and keeps pending days separate', async () => {
    const { user } = renderApp();
    await screen.findByRole('heading', { name: 'Your balances' });

    await actAs(user, '2');

    await waitFor(() => expect(card('Vacation')).toHaveTextContent('10 days remaining'));
    expect(card('Vacation')).toHaveTextContent(/Allowance\s*15/);
    expect(card('Vacation')).toHaveTextContent(/Used\s*5/);
    expect(card('Vacation')).toHaveTextContent(/Pending\s*4/);
  });

  it('lists the leave the current person has coming up', async () => {
    const { user } = renderApp();
    await screen.findByRole('heading', { name: 'Your balances' });

    await actAs(user, '2');

    const upcoming = await screen.findByRole('heading', { name: 'Upcoming leave' });
    const items = within(upcoming.parentElement).getAllByRole('listitem');
    expect(items).toHaveLength(1);
    expect(items[0]).toHaveTextContent('Vacation');
    expect(items[0]).toHaveTextContent('Pending');
    expect(items[0]).toHaveTextContent('Nov 23, 2026 to Nov 27, 2026, 4 days');
  });

  it('says so when no leave is booked', async () => {
    renderApp();

    expect(await screen.findByText(/You have no leave booked/)).toBeInTheDocument();
  });

  it('lists the next public holidays', async () => {
    renderApp();

    const holidays = await screen.findByRole('heading', { name: 'Upcoming holidays' });
    const items = within(holidays.parentElement).getAllByRole('listitem');

    expect(items).toHaveLength(5);
    expect(items[0]).toHaveTextContent('Labor Day');
    expect(items[0]).toHaveTextContent('Sep 7, 2026');
    expect(items.at(-1)).toHaveTextContent('Christmas Day');
  });

  it('tells a manager how many requests are waiting and links to the queue', async () => {
    renderApp();

    const link = await screen.findByRole('link', { name: 'Pending approvals: 2' });
    expect(link).toHaveAttribute('href', '/approvals');
  });

  it('does not offer the approvals queue to an employee', async () => {
    const { user } = renderApp();
    await screen.findByRole('link', { name: 'Pending approvals: 2' });

    await actAs(user, '3');

    await waitFor(() =>
      expect(screen.queryByRole('link', { name: /Pending approvals/ })).not.toBeInTheDocument()
    );
  });

  it('reports a dashboard that could not be loaded', async () => {
    server.use(http.get('*/api/balances', () => HttpResponse.error()));

    renderApp();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Your dashboard could not be loaded'
    );
  });

  it('has no accessibility violations', async () => {
    const { container } = renderApp();
    await screen.findByRole('heading', { name: 'Your balances' });

    expect(await axe(container)).toHaveNoViolations();
  });
});
