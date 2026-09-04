import { StrictMode } from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { axe } from 'jest-axe';
import App from '../src/App.jsx';

function renderMissingPage() {
  const user = userEvent.setup();
  const view = render(
    <StrictMode>
      <MemoryRouter initialEntries={['/nothing-here']}>
        <App />
      </MemoryRouter>
    </StrictMode>
  );
  return { user, ...view };
}

describe('unknown address', () => {
  it('says the address matched no page', async () => {
    renderMissingPage();

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Page not found' })
    ).toBeInTheDocument();
  });

  it('offers a way back to the dashboard', async () => {
    const { user } = renderMissingPage();

    await user.click(await screen.findByRole('link', { name: 'Go to the dashboard' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();
  });

  it('has no accessibility violations', async () => {
    const { container } = renderMissingPage();

    await screen.findByRole('heading', { level: 1, name: 'Page not found' });
    expect(await axe(container)).toHaveNoViolations();
  });
});
