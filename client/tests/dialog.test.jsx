import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import Dialog from '../src/components/Dialog.jsx';

function Harness({ triggerDisappears = false }) {
  const [open, setOpen] = useState(false);
  const [cancelled, setCancelled] = useState(false);

  return (
    <>
      {!cancelled && <button onClick={() => setOpen(true)}>Cancel request</button>}

      <Dialog open={open} title="Cancel this request?" onClose={() => setOpen(false)}>
        <p>Cancelling cannot be undone.</p>
        <button onClick={() => setOpen(false)}>Keep the request</button>
        <button
          onClick={() => {
            if (triggerDisappears) setCancelled(true);
            setOpen(false);
          }}
        >
          Cancel the request
        </button>
      </Dialog>
    </>
  );
}

async function openDialog() {
  const user = userEvent.setup();
  const view = render(<Harness />);
  await user.click(screen.getByRole('button', { name: 'Cancel request' }));
  return { user, ...view };
}

describe('Dialog', () => {
  it('stays out of the document until it is opened', () => {
    render(<Harness />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('is a modal dialog named by its heading', async () => {
    await openDialog();

    const dialog = screen.getByRole('dialog', { name: 'Cancel this request?' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
  });

  it('moves focus to the heading when it opens', async () => {
    await openDialog();

    expect(screen.getByRole('heading', { name: 'Cancel this request?' })).toHaveFocus();
  });

  it('keeps Tab inside the dialog', async () => {
    const { user } = await openDialog();

    await user.tab();
    expect(screen.getByRole('button', { name: 'Keep the request' })).toHaveFocus();

    await user.tab();
    expect(screen.getByRole('button', { name: 'Cancel the request' })).toHaveFocus();

    await user.tab();
    expect(screen.getByRole('button', { name: 'Keep the request' })).toHaveFocus();
  });

  it('keeps Shift+Tab inside the dialog', async () => {
    const { user } = await openDialog();

    await user.tab({ shift: true });
    expect(screen.getByRole('button', { name: 'Cancel the request' })).toHaveFocus();

    await user.tab({ shift: true });
    expect(screen.getByRole('button', { name: 'Keep the request' })).toHaveFocus();
  });

  it('closes on Escape', async () => {
    const { user } = await openDialog();

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('returns focus to the control that opened it', async () => {
    const { user } = await openDialog();

    await user.click(screen.getByRole('button', { name: 'Keep the request' }));

    expect(screen.getByRole('button', { name: 'Cancel request' })).toHaveFocus();
  });

  it('leaves focus alone when the control that opened it is gone', async () => {
    const user = userEvent.setup();
    render(<Harness triggerDisappears />);
    await user.click(screen.getByRole('button', { name: 'Cancel request' }));

    await user.click(screen.getByRole('button', { name: 'Cancel the request' }));

    expect(screen.queryByRole('button', { name: 'Cancel request' })).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('has no accessibility violations', async () => {
    const { container } = await openDialog();

    expect(await axe(container)).toHaveNoViolations();
  });
});
