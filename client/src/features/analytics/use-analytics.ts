import { useQuery } from '@tanstack/react-query';
import type {
  AnalyticsBreakdown,
  AnalyticsPreset,
  AnalyticsSummary,
  TrendPoint,
} from '@savoney/shared';
import { api, toQueryString } from '@/lib/api';
import { queryKeys } from '@/lib/query-client';

export interface AnalyticsParams {
  preset: AnalyticsPreset;
  from?: string;
  to?: string;
  categoryId?: string;
}

export const useAnalyticsSummary = (params: AnalyticsParams) =>
  useQuery({
    queryKey: queryKeys.analyticsSummary(params),
    queryFn: () => api.get<AnalyticsSummary>(`/analytics/summary${toQueryString(params)}`),
  });

export const useAnalyticsBreakdown = (params: AnalyticsParams) =>
  useQuery({
    queryKey: queryKeys.analyticsBreakdown(params),
    queryFn: () => api.get<AnalyticsBreakdown>(`/analytics/breakdown${toQueryString(params)}`),
  });

export const useAnalyticsTrend = (
  params: AnalyticsParams & { granularity: 'day' | 'week' | 'month' },
) =>
  useQuery({
    queryKey: queryKeys.analyticsTrend(params),
    queryFn: () =>
      api
        .get<{ points: TrendPoint[] }>(`/analytics/trend${toQueryString(params)}`)
        .then((response) => response.points),
  });

export const PRESET_LABELS: Record<AnalyticsPreset, string> = {
  last_7_days: 'Last 7 days',
  last_30_days: 'Last 30 days',
  last_90_days: 'Last 90 days',
  this_month: 'This month',
  last_month: 'Last month',
  this_year: 'This year',
  all_time: 'All time',
  custom: 'Custom range',
};
