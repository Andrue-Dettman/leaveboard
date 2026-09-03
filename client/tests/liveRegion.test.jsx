import { describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { AnnouncerProvider } from '../src/components/AnnouncerProvider.jsx';
import LiveRegion from '../src/components/LiveRegion.jsx';
import { useAnnouncer } from '../src/hooks/useAnnouncer.js';

function Speaker() {
  const announce = useAnnouncer();
  return <button onClick={() => announce('This request uses 4 business days')}>Count days</button>;
}

function renderRegion() {
  const user = userEvent.setup();
  const view = render(
    <AnnouncerProvider>
      <LiveRegion />
      <Speaker />
    </AnnouncerProvider>
  );
  return { user, region: view.container.querySelector('[aria-live="polite"]'), ...view };
}

describe('LiveRegion', () => {
  it('is in the document and empty before anything is announced', () => {
    const { region } = renderRegion();

    expect(region).toBeInTheDocument();
    expect(region).toBeEmptyDOMElement();
  });

  it('reads out what was announced', async () => {
    const { user, region } = renderRegion();

    await user.click(screen.getByRole('button', { name: 'Count days' }));

    await waitFor(() => expect(region).toHaveTextContent('This request uses 4 business days'));
  });

  it('announces politely and as a whole', () => {
    const { region } = renderRegion();

    expect(region).toHaveAttribute('aria-live', 'polite');
    expect(region).toHaveAttribute('aria-atomic', 'true');
  });

  it('has no accessibility violations', async () => {
    const { container, user } = renderRegion();

    await user.click(screen.getByRole('button', { name: 'Count days' }));
    await waitFor(() => expect(container.querySelector('[aria-live]')).not.toBeEmptyDOMElement());

    expect(await axe(container)).toHaveNoViolations();
  });
  it('announces again when the same sentence is repeated', async () => {
    const { user, region } = renderRegion();
    const say = () => user.click(screen.getByRole('button', { name: 'Count days' }));

    await say();
    await waitFor(() => expect(region).toHaveTextContent('This request uses 4 business days'));

    // The user edits a date and the count lands on the same number. The region has to
    // change for a screen reader to read it out a second time.
    await say();
    await waitFor(() => expect(region).toBeEmptyDOMElement());
    await waitFor(() => expect(region).toHaveTextContent('This request uses 4 business days'));
  });
});
