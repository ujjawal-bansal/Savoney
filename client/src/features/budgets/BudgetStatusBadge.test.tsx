import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BudgetStatusBadge } from './BudgetStatusBadge';

describe('BudgetStatusBadge', () => {
  it.each([
    ['on_track', 'On track'],
    ['at_risk', 'At risk'],
    ['over_budget', 'Over budget'],
  ] as const)('renders %s as readable text', (status, label) => {
    render(<BudgetStatusBadge status={status} />);
    // Status must be legible as words, not conveyed by colour alone.
    expect(screen.getByText(label)).toBeInTheDocument();
  });
});
