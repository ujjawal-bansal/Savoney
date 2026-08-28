import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Banknote,
  PiggyBank,
  Receipt,
  TrendingDown,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import type { AnalyticsPreset, Currency } from '@savoney/shared';
import { formatMoney } from '@savoney/shared';
import { formatDate, formatSigned } from '@/lib/format';
import { useCurrentUser } from '@/features/auth/auth-context';
import { useAnalyticsSummary, useAnalyticsTrend } from '@/features/analytics/use-analytics';
import { useBudgets } from '@/features/budgets/use-budgets';
import { useTransactions } from '@/features/transactions/use-transactions';
import { PageHeader } from '@/components/PageHeader';
import { RangePicker } from '@/components/RangePicker';
import { StatCard } from '@/components/StatCard';
import { ErrorState } from '@/components/ErrorState';
import { TrendChart } from '@/components/charts/TrendChart';
import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  Progress,
  Skeleton,
} from '@/components/ui';
import { BudgetStatusBadge } from '@/features/budgets/BudgetStatusBadge';

const greeting = (): string => {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
};

export const DashboardPage = () => {
  const user = useCurrentUser();
  const currency = user.currency as Currency;
  const [preset, setPreset] = useState<AnalyticsPreset>('last_30_days');

  const summary = useAnalyticsSummary({ preset });
  const trend = useAnalyticsTrend({
    preset,
    granularity: preset === 'last_7_days' ? 'day' : 'day',
  });
  const budgets = useBudgets();
  const recent = useTransactions({ limit: 6, sort: 'occurredAt', order: 'desc' });

  if (summary.isError) {
    return <ErrorState error={summary.error} onRetry={() => void summary.refetch()} />;
  }

  const data = summary.data;
  // Budgets needing attention lead, because that is what the user can act on.
  const attention = (budgets.data ?? [])
    .filter((budget) => budget.status !== 'on_track')
    .slice(0, 4);

  return (
    <>
      <PageHeader
        eyebrow={greeting()}
        title={user.name.split(' ')[0] ?? user.name}
        description="Here is where your money stands."
        actions={<RangePicker value={preset} onChange={setPreset} />}
      />

      <section aria-label="Summary" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Income"
          value={data ? formatMoney(data.incomeMinor, currency) : 'N/A'}
          icon={TrendingUp}
          tone="positive"
          delta={data?.deltas.income}
          caption="vs. previous period"
          isLoading={summary.isPending}
        />
        <StatCard
          label="Spending"
          value={data ? formatMoney(data.expenseMinor, currency) : 'N/A'}
          icon={TrendingDown}
          tone="negative"
          delta={data?.deltas.expense}
          deltaInverted
          caption="vs. previous period"
          isLoading={summary.isPending}
        />
        <StatCard
          label="Net"
          value={data ? formatMoney(data.netMinor, currency, { signDisplay: 'always' }) : 'N/A'}
          icon={Wallet}
          tone={data && data.netMinor >= 0 ? 'positive' : 'negative'}
          delta={data?.deltas.net}
          caption="income less spending"
          isLoading={summary.isPending}
        />
        <StatCard
          label="Savings rate"
          value={data?.savingsRate == null ? 'N/A' : `${data.savingsRate.toFixed(1)}%`}
          icon={PiggyBank}
          tone="brand"
          caption={
            data ? `${formatMoney(data.averageDailySpendMinor, currency)} avg. per day` : undefined
          }
          isLoading={summary.isPending}
        />
      </section>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>Cash flow</CardTitle>
              <p className="mt-0.5 text-xs text-muted">Income against spending over the range</p>
            </div>
          </CardHeader>
          <CardContent>
            {trend.isPending ? (
              <Skeleton className="h-[300px] w-full" />
            ) : trend.data && trend.data.length > 0 ? (
              <TrendChart points={trend.data} currency={currency} granularity="day" />
            ) : (
              <EmptyState
                icon={Banknote}
                title="Nothing to chart yet"
                description="Once you record a few transactions, your cash flow will appear here."
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Where it went</CardTitle>
          </CardHeader>
          <CardContent>
            {summary.isPending ? (
              <div className="space-y-4">
                {Array.from({ length: 5 }).map((_, index) => (
                  <div key={index} className="space-y-2">
                    <Skeleton className="h-3 w-full" />
                    <Skeleton className="h-2 w-full" />
                  </div>
                ))}
              </div>
            ) : data && data.topExpenseCategories.length > 0 ? (
              <ul className="space-y-4">
                {data.topExpenseCategories.map((entry) => (
                  <li key={entry.categoryId ?? entry.name}>
                    <div className="mb-1.5 flex items-baseline justify-between gap-3">
                      <span className="flex items-center gap-2 truncate text-sm text-primary">
                        <span
                          className="size-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: entry.color }}
                          aria-hidden="true"
                        />
                        <span className="truncate">{entry.name}</span>
                      </span>
                      <span className="tabular shrink-0 text-sm font-medium text-primary">
                        {formatMoney(entry.amountMinor, currency)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Progress
                        value={entry.percentage}
                        label={`${entry.name}: ${entry.percentage.toFixed(1)}% of spending`}
                        className="h-1.5"
                      />
                      <span className="tabular w-10 shrink-0 text-right text-xs text-muted">
                        {entry.percentage.toFixed(0)}%
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                icon={Receipt}
                title="No spending recorded"
                description="Categories will rank here once you log expenses."
              />
            )}
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Recent activity</CardTitle>
            <Link
              to="/transactions"
              className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline dark:text-brand-400"
            >
              View all
              <ArrowRight className="size-3" aria-hidden="true" />
            </Link>
          </CardHeader>
          <CardContent className="pt-0">
            {recent.isPending ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, index) => (
                  <Skeleton key={index} className="h-12 w-full" />
                ))}
              </div>
            ) : recent.data && recent.data.items.length > 0 ? (
              <ul className="divide-y divide-[var(--border-subtle)]">
                {recent.data.items.map((transaction) => (
                  <li key={transaction.id} className="flex items-center gap-3 py-2.5">
                    <span
                      className="size-8 shrink-0 rounded-lg"
                      style={{ backgroundColor: `${transaction.category?.color ?? '#94a3b8'}22` }}
                      aria-hidden="true"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-primary">
                        {transaction.title}
                      </p>
                      <p className="truncate text-xs text-muted">
                        {transaction.category?.name ?? 'Uncategorised'} ·{' '}
                        {formatDate(transaction.occurredAt)}
                      </p>
                    </div>
                    <span
                      className={
                        transaction.type === 'income'
                          ? 'tabular shrink-0 text-sm font-semibold text-[var(--color-positive)] dark:text-emerald-400'
                          : 'tabular shrink-0 text-sm font-semibold text-primary'
                      }
                    >
                      {formatSigned(transaction.amountMinor, transaction.type, currency)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                icon={Receipt}
                title="No transactions yet"
                description="Add your first transaction to start tracking."
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Budgets needing attention</CardTitle>
            <Link
              to="/budgets"
              className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline dark:text-brand-400"
            >
              Manage
              <ArrowRight className="size-3" aria-hidden="true" />
            </Link>
          </CardHeader>
          <CardContent className="pt-0">
            {budgets.isPending ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, index) => (
                  <Skeleton key={index} className="h-14 w-full" />
                ))}
              </div>
            ) : attention.length > 0 ? (
              <ul className="space-y-4">
                {attention.map((budget) => (
                  <li key={budget.id}>
                    <div className="mb-1.5 flex items-baseline justify-between gap-3">
                      <span className="truncate text-sm font-medium text-primary">
                        {budget.name}
                      </span>
                      <BudgetStatusBadge status={budget.status} />
                    </div>
                    <Progress
                      value={budget.percentUsed}
                      tone={budget.status === 'over_budget' ? 'negative' : 'caution'}
                      label={`${budget.name}: ${budget.percentUsed.toFixed(0)}% used`}
                    />
                    <p className="tabular mt-1 text-xs text-muted">
                      {formatMoney(budget.spentMinor, currency)} of{' '}
                      {formatMoney(budget.amountMinor, currency)}
                      {budget.remainingMinor < 0
                        ? ` · ${formatMoney(Math.abs(budget.remainingMinor), currency)} over`
                        : ` · ${formatMoney(budget.remainingMinor, currency)} left`}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (budgets.data?.length ?? 0) > 0 ? (
              <div className="flex flex-col items-center gap-2 py-8 text-center">
                <Badge tone="positive">All on track</Badge>
                <p className="text-sm text-secondary">Every budget is within its limit.</p>
              </div>
            ) : (
              <EmptyState
                icon={PiggyBank}
                title="No budgets set"
                description="Create a budget to track spending against a limit."
              />
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
};
