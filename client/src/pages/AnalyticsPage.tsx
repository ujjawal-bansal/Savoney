import { useState } from 'react';
import { ChartPie, TrendingDown, TrendingUp, Wallet } from 'lucide-react';
import type { AnalyticsPreset, CategoryBreakdownEntry, Currency } from '@savoney/shared';
import { formatMoney } from '@savoney/shared';
import { formatDate } from '@/lib/format';
import { cn } from '@/lib/cn';
import { useCurrentUser } from '@/features/auth/auth-context';
import {
  useAnalyticsBreakdown,
  useAnalyticsSummary,
  useAnalyticsTrend,
} from '@/features/analytics/use-analytics';
import { PageHeader } from '@/components/PageHeader';
import { RangePicker } from '@/components/RangePicker';
import { StatCard } from '@/components/StatCard';
import { ErrorState } from '@/components/ErrorState';
import { TrendChart } from '@/components/charts/TrendChart';
import { CategoryDonut } from '@/components/charts/CategoryDonut';
import { Card, CardContent, CardHeader, CardTitle, EmptyState, Skeleton } from '@/components/ui';

type Granularity = 'day' | 'week' | 'month';

export const AnalyticsPage = () => {
  const user = useCurrentUser();
  const currency = user.currency as Currency;

  const [preset, setPreset] = useState<AnalyticsPreset>('last_90_days');
  const [granularity, setGranularity] = useState<Granularity>('week');

  const summary = useAnalyticsSummary({ preset });
  const breakdown = useAnalyticsBreakdown({ preset });
  const trend = useAnalyticsTrend({ preset, granularity });

  if (summary.isError) {
    return <ErrorState error={summary.error} onRetry={() => void summary.refetch()} />;
  }

  const data = summary.data;
  const expenseTotal =
    breakdown.data?.expense.reduce((sum, entry) => sum + entry.amountMinor, 0) ?? 0;
  const incomeTotal =
    breakdown.data?.income.reduce((sum, entry) => sum + entry.amountMinor, 0) ?? 0;

  return (
    <>
      <PageHeader
        eyebrow="Insights"
        title="Analytics"
        description="How your income and spending have moved."
        actions={<RangePicker value={preset} onChange={setPreset} />}
      />

      <section aria-label="Totals" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Income"
          value={data ? formatMoney(data.incomeMinor, currency) : 'N/A'}
          icon={TrendingUp}
          tone="positive"
          delta={data?.deltas.income}
          isLoading={summary.isPending}
        />
        <StatCard
          label="Spending"
          value={data ? formatMoney(data.expenseMinor, currency) : 'N/A'}
          icon={TrendingDown}
          tone="negative"
          delta={data?.deltas.expense}
          deltaInverted
          isLoading={summary.isPending}
        />
        <StatCard
          label="Net"
          value={data ? formatMoney(data.netMinor, currency, { signDisplay: 'always' }) : 'N/A'}
          icon={Wallet}
          tone={data && data.netMinor >= 0 ? 'positive' : 'negative'}
          delta={data?.deltas.net}
          isLoading={summary.isPending}
        />
        <StatCard
          label="Transactions"
          value={data ? data.transactionCount.toLocaleString() : 'N/A'}
          icon={ChartPie}
          tone="brand"
          caption={
            data?.largestExpense
              ? `Largest: ${formatMoney(data.largestExpense.amountMinor, currency)}`
              : undefined
          }
          isLoading={summary.isPending}
        />
      </section>

      <Card className="mt-6">
        <CardHeader>
          <div>
            <CardTitle>Income vs. spending</CardTitle>
            <p className="mt-0.5 text-xs text-muted">
              {data && `${formatDate(data.range.from)} to ${formatDate(data.range.to)}`}
            </p>
          </div>
          <div
            role="radiogroup"
            aria-label="Chart granularity"
            className="flex gap-0.5 rounded-lg border border-[var(--border-subtle)] p-0.5"
          >
            {(['day', 'week', 'month'] as const).map((option) => (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={granularity === option}
                onClick={() => setGranularity(option)}
                className={cn(
                  'rounded-md px-2.5 py-1 text-xs font-medium capitalize transition-colors',
                  granularity === option
                    ? 'bg-[var(--surface-hover)] text-primary'
                    : 'text-muted hover:text-secondary',
                )}
              >
                {option}
              </button>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          {trend.isPending ? (
            <Skeleton className="h-[320px] w-full" />
          ) : trend.data && trend.data.length > 0 ? (
            <TrendChart
              points={trend.data}
              currency={currency}
              granularity={granularity}
              height={320}
            />
          ) : (
            <EmptyState
              icon={ChartPie}
              title="Nothing in this range"
              description="Try a wider date range."
            />
          )}
        </CardContent>
      </Card>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <BreakdownCard
          title="Spending by category"
          entries={breakdown.data?.expense ?? []}
          total={expenseTotal}
          currency={currency}
          isLoading={breakdown.isPending}
        />
        <BreakdownCard
          title="Income by category"
          entries={breakdown.data?.income ?? []}
          total={incomeTotal}
          currency={currency}
          isLoading={breakdown.isPending}
        />
      </div>
    </>
  );
};

interface BreakdownCardProps {
  title: string;
  entries: CategoryBreakdownEntry[];
  total: number;
  currency: Currency;
  isLoading: boolean;
}

const BreakdownCard = ({ title, entries, total, currency, isLoading }: BreakdownCardProps) => (
  <Card>
    <CardHeader>
      <CardTitle>{title}</CardTitle>
    </CardHeader>
    <CardContent>
      {isLoading ? (
        <Skeleton className="h-[260px] w-full" />
      ) : entries.length === 0 ? (
        <EmptyState
          icon={ChartPie}
          title="Nothing recorded"
          description="No data for this range."
        />
      ) : (
        <>
          <CategoryDonut
            entries={entries}
            currency={currency}
            centerLabel="Total"
            centerValue={formatMoney(total, currency, { compact: true })}
          />

          {/* The list is the accessible equivalent of the donut — the same
              numbers, readable without seeing the chart. */}
          <ul className="mt-4 space-y-2">
            {entries.slice(0, 8).map((entry) => (
              <li key={entry.categoryId ?? entry.name} className="flex items-center gap-2 text-sm">
                <span
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: entry.color }}
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1 truncate text-secondary">{entry.name}</span>
                <span className="tabular shrink-0 text-xs text-muted">
                  {entry.percentage.toFixed(1)}%
                </span>
                <span className="tabular w-24 shrink-0 text-right font-medium text-primary">
                  {formatMoney(entry.amountMinor, currency)}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </CardContent>
  </Card>
);
