import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import Field from '../src/components/Field.jsx';

describe('Field', () => {
  it('labels the control it renders', async () => {
    const user = userEvent.setup();
    render(<Field id="start-date" label="Start date" />);

    const input = screen.getByRole('textbox', { name: 'Start date' });
    await user.type(input, '2026-03-16');

    expect(input).toHaveValue('2026-03-16');
  });

  it('describes the control with its hint', () => {
    render(
      <Field
        id="start-date"
        label="Start date"
        hint="Weekends and public holidays are not counted"
      />
    );

    expect(screen.getByRole('textbox', { name: 'Start date' })).toHaveAccessibleDescription(
      'Weekends and public holidays are not counted'
    );
  });

  it('marks an invalid control and describes it with the error', () => {
    render(<Field id="end-date" label="End date" error="must be on or after the start date" />);

    const input = screen.getByRole('textbox', { name: 'End date' });
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('must be on or after the start date');
  });

  it('describes the control with the hint and the error together', () => {
    render(
      <Field
        id="note"
        label="Note"
        hint="Optional, up to 500 characters"
        error="must be 500 characters or fewer"
        as="textarea"
      />
    );

    expect(screen.getByRole('textbox', { name: 'Note' })).toHaveAccessibleDescription(
      'Optional, up to 500 characters must be 500 characters or fewer'
    );
  });

  it('leaves a valid control unmarked', () => {
    render(<Field id="start-date" label="Start date" />);

    const input = screen.getByRole('textbox', { name: 'Start date' });
    expect(input).not.toHaveAttribute('aria-invalid');
    expect(input).not.toHaveAttribute('aria-describedby');
  });

  it('renders a select when asked for one', async () => {
    const user = userEvent.setup();
    render(
      <Field id="leave-type" label="Leave type" as="select" defaultValue="1">
        <option value="1">Vacation</option>
        <option value="2">Sick</option>
      </Field>
    );

    const select = screen.getByRole('combobox', { name: 'Leave type' });
    await user.selectOptions(select, '2');

    expect(select).toHaveValue('2');
  });

  it('has no accessibility violations', async () => {
    const { container } = render(
      <Field
        id="end-date"
        label="End date"
        hint="The last day you will be away"
        error="must be on or after the start date"
      />
    );

    expect(await axe(container)).toHaveNoViolations();
  });
});
