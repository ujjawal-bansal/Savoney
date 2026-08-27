import { AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
import type { BudgetStatus } from '@savoney/shared';
import { Badge } from '@/components/ui';

const STATUS_META: Record<
  BudgetStatus,
  { label: string; tone: 'positive' | 'caution' | 'negative'; icon: typeof CheckCircle2 }
> = {
  on_track: { label: 'On track', tone: 'positive', icon: CheckCircle2 },
  at_risk: { label: 'At risk', tone: 'caution', icon: AlertTriangle },
  over_budget: { label: 'Over budget', tone: 'negative', icon: XCircle },
};

/** Status carries an icon and a word, never colour alone. */
export const BudgetStatusBadge = ({ status }: { status: BudgetStatus }) => {
  const { label, tone, icon: Icon } = STATUS_META[status];
  return (
    <Badge tone={tone}>
      <Icon className="size-3" aria-hidden="true" />
      {label}
    </Badge>
  );
};
