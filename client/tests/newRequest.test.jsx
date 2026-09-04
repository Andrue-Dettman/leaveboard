import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { axe } from 'jest-axe';
import App from '../src/App.jsx';
import { server } from '../src/mocks/node.js';

// The fixtures run through 2026 and the form refuses a start date in the past, so the
// clock is pinned rather than left to drift past the dates these tests use.
const TODAY = new Date('2026-09-03T09:00:00Z');

// Thanksgiving week: five weekdays with the holiday on the Thursday, so four count.
const START = '2026-11-23';
const END = '2026-11-27';

function renderForm() {
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  const view = render(
    <StrictMode>
      <MemoryRouter initialEntries={['/requests/new']}>
        <App />
      </MemoryRouter>
    </StrictMode>
  );
  return { user, ...view };
}

function liveRegion() {
  return document.querySelector('[aria-live="polite"]');
}

async function fillDates(user, start = START, end = END) {
  await user.type(screen.getByLabelText('Start date'), start);
  await user.type(screen.getByLabelText('End date'), end);
}

async function chooseType(user, name) {
  await user.selectOptions(screen.getByRole('combobox', { name: 'Leave type' }), name);
}

beforeEach(() => {
  window.localStorage.clear();
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(TODAY);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('new request form', () => {
  it('offers every leave type', async () => {
    renderForm();

    expect(await screen.findByRole('option', { name: 'Vacation' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Sick' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Personal' })).toBeInTheDocument();
  });

  it('counts the business days once both dates are set', async () => {
    const { user } = renderForm();
    await screen.findByRole('option', { name: 'Vacation' });

    expect(screen.getByText(/Pick a start and end date/)).toBeInTheDocument();

    await fillDates(user);

    expect(await screen.findByText('This request uses 4 business days.')).toBeInTheDocument();
  });

  it('announces the count through the live region', async () => {
    const { user } = renderForm();
    await screen.findByRole('option', { name: 'Vacation' });

    await fillDates(user);

    await waitFor(() =>
      expect(liveRegion()).toHaveTextContent('This request uses 4 business days.')
    );
  });

  it('warns that the range covers a public holiday without blocking it', async () => {
    const { user } = renderForm();
    await screen.findByRole('option', { name: 'Vacation' });

    await chooseType(user, 'Vacation');
    await fillDates(user);

    expect(
      await screen.findByText(/It covers Thanksgiving Day, which will not be counted./)
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send request' })).toBeEnabled();
  });

  it('warns when the request is longer than the balance left', async () => {
    const { user } = renderForm();
    await screen.findByRole('option', { name: 'Personal' });

    await chooseType(user, 'Personal');
    await fillDates(user);

    expect(
      await screen.findByText(/more than the 3 days you have left for Personal/)
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send request' })).toBeEnabled();
  });

  it('refuses a request with no leave type and focuses the type', async () => {
    const { user } = renderForm();
    await screen.findByRole('option', { name: 'Vacation' });

    await fillDates(user);
    await user.click(screen.getByRole('button', { name: 'Send request' }));

    const type = screen.getByRole('combobox', { name: 'Leave type' });
    expect(type).toHaveAccessibleDescription('Choose a leave type.');
    expect(type).toHaveAttribute('aria-invalid', 'true');
    expect(type).toHaveFocus();
  });

  it('refuses an end date before the start date', async () => {
    const { user } = renderForm();
    await screen.findByRole('option', { name: 'Vacation' });

    await chooseType(user, 'Vacation');
    await fillDates(user, '2026-11-27', '2026-11-23');
    await user.click(screen.getByRole('button', { name: 'Send request' }));

    const end = screen.getByLabelText('End date');
    expect(end).toHaveAccessibleDescription('Enter an end date on or after the start date.');
    expect(end).toHaveFocus();
  });

  it('refuses a start date in the past', async () => {
    const { user } = renderForm();
    await screen.findByRole('option', { name: 'Vacation' });

    await chooseType(user, 'Vacation');
    await fillDates(user, '2026-08-03', '2026-08-07');
    await user.click(screen.getByRole('button', { name: 'Send request' }));

    const start = screen.getByLabelText('Start date');
    expect(start).toHaveAccessibleDescription(
      'Weekends and public holidays are not counted. Enter a start date that is not in the past.'
    );
    expect(start).toHaveFocus();
  });

  it('announces why a request was not sent', async () => {
    const { user } = renderForm();
    await screen.findByRole('option', { name: 'Vacation' });

    await user.click(screen.getByRole('button', { name: 'Send request' }));

    await waitFor(() =>
      expect(liveRegion()).toHaveTextContent(
        'Your request was not sent. Choose a leave type. Enter a start date. Enter an end date.'
      )
    );
  });

  it('sends the request and moves on to the list', async () => {
    const { user } = renderForm();
    await screen.findByRole('option', { name: 'Vacation' });

    await chooseType(user, 'Vacation');
    await fillDates(user);
    await user.type(screen.getByLabelText('Note'), 'Driving to Chicago');
    await user.click(screen.getByRole('button', { name: 'Send request' }));

    expect(
      await screen.findByRole('heading', { level: 1, name: 'My requests' })
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(liveRegion()).toHaveTextContent('Your request was sent for approval.')
    );
  });

  it('puts an error from the API onto the field it belongs to', async () => {
    server.use(
      http.post('*/api/leave-requests', () =>
        HttpResponse.json(
          {
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Request body failed validation',
              fields: { endDate: 'must be on or after startDate' },
            },
          },
          { status: 400 }
        )
      )
    );

    const { user } = renderForm();
    await screen.findByRole('option', { name: 'Vacation' });

    await chooseType(user, 'Vacation');
    await fillDates(user);
    await user.click(screen.getByRole('button', { name: 'Send request' }));

    const end = await screen.findByLabelText('End date');
    await waitFor(() => expect(end).toHaveAccessibleDescription('must be on or after startDate'));
    expect(end).toHaveFocus();
  });

  it('reports a request that could not be sent at all', async () => {
    server.use(http.post('*/api/leave-requests', () => HttpResponse.error()));

    const { user } = renderForm();
    await screen.findByRole('option', { name: 'Vacation' });

    await chooseType(user, 'Vacation');
    await fillDates(user);
    await user.click(screen.getByRole('button', { name: 'Send request' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Your request could not be sent.');
  });

  it('has no accessibility violations', async () => {
    const { container, user } = renderForm();
    await screen.findByRole('option', { name: 'Vacation' });

    await chooseType(user, 'Vacation');
    await fillDates(user);
    await screen.findByText('This request uses 4 business days.');

    expect(await axe(container)).toHaveNoViolations();
  });
});
