import type { AnalyticsPreset } from '@savoney/shared';
import { cn } from '@/lib/cn';
import { PRESET_LABELS } from '@/features/analytics/use-analytics';

const QUICK_PRESETS: AnalyticsPreset[] = [
  'last_7_days',
  'last_30_days',
  'last_90_days',
  'this_year',
  'all_time',
];

interface RangePickerProps {
  value: AnalyticsPreset;
  onChange: (preset: AnalyticsPreset) => void;
}

export const RangePicker = ({ value, onChange }: RangePickerProps) => (
  <div
    role="radiogroup"
    aria-label="Date range"
    className="flex flex-wrap gap-1 rounded-lg border border-[var(--border-subtle)] surface-raised p-1"
  >
    {QUICK_PRESETS.map((preset) => (
      <button
        key={preset}
        type="button"
        role="radio"
        aria-checked={value === preset}
        onClick={() => onChange(preset)}
        className={cn(
          'rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors',
          value === preset
            ? 'bg-brand-600 text-white'
            : 'text-secondary hover:bg-[var(--surface-hover)] hover:text-primary',
        )}
      >
        {PRESET_LABELS[preset]}
      </button>
    ))}
  </div>
);
