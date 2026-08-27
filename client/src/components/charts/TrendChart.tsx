import { useMemo } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { format, parseISO } from 'date-fns';
import type { Currency, TrendPoint } from '@savoney/shared';
import { formatMoney } from '@savoney/shared';
import { useChartTheme } from './chart-theme';

interface TrendChartProps {
  points: TrendPoint[];
  currency: Currency;
  granularity: 'day' | 'week' | 'month';
  height?: number;
}

export const TrendChart = ({ points, currency, granularity, height = 300 }: TrendChartProps) => {
  const theme = useChartTheme();

  // Recharts wants plain numbers on the axis; minor units are converted once
  // here rather than in every tick and tooltip callback.
  const data = useMemo(
    () =>
      points.map((point) => ({
        date: point.date,
        Income: point.incomeMinor / 100,
        Expenses: point.expenseMinor / 100,
      })),
    [points],
  );

  const tickFormat = granularity === 'month' ? 'MMM' : 'd MMM';

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
        <defs>
          {/* Soft fills keep two overlapping series readable where they cross. */}
          <linearGradient id="income-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={theme.income} stopOpacity={0.28} />
            <stop offset="100%" stopColor={theme.income} stopOpacity={0.02} />
          </linearGradient>
          <linearGradient id="expense-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={theme.expense} stopOpacity={0.28} />
            <stop offset="100%" stopColor={theme.expense} stopOpacity={0.02} />
          </linearGradient>
        </defs>

        <CartesianGrid stroke={theme.grid} strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="date"
          tickFormatter={(value: string) => format(parseISO(value), tickFormat)}
          stroke={theme.axis}
          tick={{ fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          minTickGap={24}
        />
        <YAxis
          stroke={theme.axis}
          tick={{ fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          width={64}
          tickFormatter={(value: number) => formatMoney(value * 100, currency, { compact: true })}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: theme.tooltipBg,
            border: `1px solid ${theme.tooltipBorder}`,
            borderRadius: 12,
            fontSize: 12,
            color: theme.text,
          }}
          // Recharts types these loosely (ReactNode / ValueType), so the
          // narrowing happens here rather than in the parameter annotation.
          labelFormatter={(label) =>
            typeof label === 'string'
              ? format(parseISO(label), 'EEEE, d MMM yyyy')
              : String(label ?? '')
          }
          formatter={(value, name) => [
            formatMoney(typeof value === 'number' ? value * 100 : 0, currency),
            String(name ?? ''),
          ]}
        />
        <Legend iconType="circle" wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />

        <Area
          type="monotone"
          dataKey="Income"
          stroke={theme.income}
          strokeWidth={2}
          fill="url(#income-fill)"
        />
        <Area
          type="monotone"
          dataKey="Expenses"
          stroke={theme.expense}
          strokeWidth={2}
          fill="url(#expense-fill)"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
};
