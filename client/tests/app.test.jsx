import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { axe } from 'jest-axe';
import App from '../src/App.jsx';

describe('App', () => {
  it('renders the application heading', () => {
    render(<App />);

    expect(screen.getByRole('heading', { level: 1, name: 'LeaveBoard' })).toBeInTheDocument();
  });

  it('has no accessibility violations', async () => {
    const { container } = render(<App />);

    expect(await axe(container)).toHaveNoViolations();
  });
});
