import { beforeEach, describe, expect, it } from 'vitest';
import { StrictMode } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { axe } from 'jest-axe';
import App from '../src/App.jsx';
import { server } from '../src/mocks/node.js';

// Rendered inside StrictMode because main.jsx mounts the app that way. StrictMode runs
// effects twice on mount, so anything that manages focus has to be idempotent, and the
// suite only proves that if it exercises the same configuration the browser gets.
function renderApp(path = '/') {
  const user = userEvent.setup();
  const view = render(
    <StrictMode>
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>
    </StrictMode>
  );
  return { user, ...view };
}

// Two calls stand behind the shell: GET /api/users fills the switcher and GET /api/me
// resolves the current user. Maria is the seeded default and she manages people, so her
// approvals link appearing means both have answered.
async function waitForShell() {
  await screen.findByRole('combobox', { name: 'Acting as' });
  await screen.findByRole('link', { name: 'Approvals' });
}

beforeEach(() => {
  window.localStorage.clear();
});

describe('app shell', () => {
  it('puts the page inside banner, navigation, main and contentinfo landmarks', async () => {
    renderApp();
    await waitForShell();

    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument();
    expect(screen.getByRole('main')).toBeInTheDocument();
    expect(screen.getByRole('contentinfo')).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });

  it('offers a skip link to the main content as the first stop in the tab order', async () => {
    const { user } = renderApp();
    await waitForShell();

    await user.tab();

    const skipLink = screen.getByRole('link', { name: 'Skip to main content' });
    expect(skipLink).toHaveFocus();
    expect(skipLink).toHaveAttribute('href', '#main');
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main');
  });

  it('marks the current page in the navigation', async () => {
    renderApp('/requests');
    await waitForShell();

    expect(screen.getByRole('link', { name: 'My requests' })).toHaveAttribute(
      'aria-current',
      'page'
    );
    expect(screen.getByRole('link', { name: 'Dashboard' })).not.toHaveAttribute('aria-current');
  });

  it('renders a not found page for an address that matches no route', async () => {
    renderApp('/nowhere');
    await waitForShell();

    expect(screen.getByRole('heading', { level: 1, name: 'Page not found' })).toBeInTheDocument();
  });

  it('leaves focus at the top of the document on first load', async () => {
    renderApp();
    await waitForShell();

    expect(document.body).toHaveFocus();
  });

  it('moves focus to the heading of the page it navigated to', async () => {
    const { user } = renderApp();
    await waitForShell();

    await user.click(screen.getByRole('link', { name: 'My requests' }));

    const heading = await screen.findByRole('heading', { level: 1, name: 'My requests' });
    await waitFor(() => expect(heading).toHaveFocus());
  });

  it('names the current page in the document title', async () => {
    const { user } = renderApp();
    await waitForShell();

    expect(document.title).toBe('Dashboard — LeaveBoard');

    await user.click(screen.getByRole('link', { name: 'New request' }));

    await waitFor(() => expect(document.title).toBe('New leave request — LeaveBoard'));
  });

  it('has no accessibility violations', async () => {
    const { container } = renderApp();
    await waitForShell();

    expect(await axe(container)).toHaveNoViolations();
  });
});

describe('identity switcher', () => {
  it('lists the seeded people and their roles', async () => {
    renderApp();
    await waitForShell();

    const select = screen.getByRole('combobox', { name: 'Acting as' });
    expect(
      within(select)
        .getAllByRole('option')
        .map((option) => option.textContent)
    ).toEqual(['Maria Alvarez (manager)', 'Sam Okafor (employee)', 'Priya Raman (employee)']);
    expect(select).toHaveValue('1');
  });

  it('shows the approvals link to a manager and hides it from an employee', async () => {
    const { user } = renderApp();
    await waitForShell();

    await user.selectOptions(screen.getByRole('combobox', { name: 'Acting as' }), '2');

    await waitFor(() =>
      expect(screen.queryByRole('link', { name: 'Approvals' })).not.toBeInTheDocument()
    );
  });

  it('remembers the chosen identity across a reload', async () => {
    const { user, unmount } = renderApp();
    await waitForShell();

    await user.selectOptions(screen.getByRole('combobox', { name: 'Acting as' }), '3');
    await waitFor(() =>
      expect(screen.queryByRole('link', { name: 'Approvals' })).not.toBeInTheDocument()
    );
    unmount();

    renderApp();

    expect(await screen.findByRole('combobox', { name: 'Acting as' })).toHaveValue('3');
  });

  it('falls back to the first seeded person when the stored identity is gone', async () => {
    window.localStorage.setItem('leaveboard.acting-as', '404');

    renderApp();
    await waitForShell();

    expect(screen.getByRole('combobox', { name: 'Acting as' })).toHaveValue('1');
  });

  it('warns in place when the people cannot be loaded', async () => {
    server.use(http.get('*/api/users', () => HttpResponse.error()));

    renderApp();

    expect(await screen.findByRole('alert')).toHaveTextContent('The API did not answer');
    expect(screen.getByRole('combobox', { name: 'Acting as' })).toBeDisabled();
  });
});
