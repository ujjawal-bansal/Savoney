import { render, screen } from '@testing-library/react';
import { TrendingDown, TrendingUp } from 'lucide-react';
import { describe, expect, it } from 'vitest';
import { StatCard } from './StatCard';

describe('StatCard', () => {
  it('renders the label and value', () => {
    render(<StatCard label="Income" value="$4,200.00" icon={TrendingUp} />);
    expect(screen.getByText('Income')).toBeInTheDocument();
    expect(screen.getByText('$4,200.00')).toBeInTheDocument();
  });

  it('shows a skeleton instead of the value while loading', () => {
    render(<StatCard label="Income" value="$4,200.00" icon={TrendingUp} isLoading />);
    expect(screen.queryByText('$4,200.00')).not.toBeInTheDocument();
  });

  it('renders the delta with an explicit sign, not colour alone', () => {
    render(<StatCard label="Income" value="$100" icon={TrendingUp} delta={12.4} />);
    // The sign carries the meaning for anyone who cannot distinguish the hues.
    expect(screen.getByText('+12.4%')).toBeInTheDocument();
  });

  it('renders a negative delta', () => {
    render(<StatCard label="Spending" value="$100" icon={TrendingDown} delta={-8.1} />);
    expect(screen.getByText('-8.1%')).toBeInTheDocument();
  });

  it('omits the delta when there is no basis for comparison', () => {
    render(<StatCard label="Income" value="$100" icon={TrendingUp} delta={null} />);
    expect(screen.queryByText(/%/)).not.toBeInTheDocument();
  });

  it('treats rising spending as bad and rising income as good', () => {
    const { unmount } = render(
      <StatCard label="Spending" value="$100" icon={TrendingDown} delta={20} deltaInverted />,
    );
    const spendingDelta = screen.getByText('+20.0%');
    // Inverted: a rise in spending is styled as the negative outcome.
    expect(spendingDelta.className).toMatch(/negative|rose/);
    unmount();

    render(<StatCard label="Income" value="$100" icon={TrendingUp} delta={20} />);
    expect(screen.getByText('+20.0%').className).toMatch(/positive|emerald/);
  });
});
