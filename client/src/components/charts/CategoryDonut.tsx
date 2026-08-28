import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import type { CategoryBreakdownEntry, Currency } from '@savoney/shared';
import { formatMoney } from '@savoney/shared';
import { CHART_PALETTE, useChartTheme } from './chart-theme';

interface CategoryDonutProps {
  entries: CategoryBreakdownEntry[];
  currency: Currency;
  height?: number;
  /** Rendered in the hole — usually the range total. */
  centerLabel?: string;
  centerValue?: string;
}

export const CategoryDonut = ({
  entries,
  currency,
  height = 260,
  centerLabel,
  centerValue,
}: CategoryDonutProps) => {
  const theme = useChartTheme();

  return (
    <div className="relative">
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Pie
            data={entries}
            dataKey="amountMinor"
            nameKey="name"
            innerRadius="62%"
            outerRadius="90%"
            paddingAngle={2}
            strokeWidth={0}
          >
            {entries.map((entry, index) => (
              // Prefer the category's own colour so the donut matches the
              // legend and the transaction list.
              <Cell
                key={entry.categoryId ?? index}
                fill={entry.color || CHART_PALETTE[index % CHART_PALETTE.length]}
              />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              backgroundColor: theme.tooltipBg,
              border: `1px solid ${theme.tooltipBorder}`,
              borderRadius: 12,
              fontSize: 12,
              color: theme.text,
            }}
            formatter={(value, name) => [
              formatMoney(typeof value === 'number' ? value : 0, currency),
              String(name ?? ''),
            ]}
          />
        </PieChart>
      </ResponsiveContainer>

      {centerValue && (
        // Purely decorative duplicate of data already in the list beside it.
        <div
          className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"
          aria-hidden="true"
        >
          {centerLabel && <span className="text-xs text-muted">{centerLabel}</span>}
          <span className="tabular text-xl font-semibold text-primary">{centerValue}</span>
        </div>
      )}
    </div>
  );
};
