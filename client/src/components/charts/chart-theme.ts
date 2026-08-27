import { useEffect, useState } from 'react';

/**
 * Recharts renders SVG with literal colour props, so it cannot read our CSS
 * custom properties. This hook mirrors the theme into plain values and updates
 * when the `dark` class on <html> changes.
 */
export const useChartTheme = () => {
  const [isDark, setIsDark] = useState(
    () => typeof document !== 'undefined' && document.documentElement.classList.contains('dark'),
  );

  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains('dark'));
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  return {
    isDark,
    grid: isDark ? '#1e293b' : '#e2e8f0',
    axis: isDark ? '#64748b' : '#94a3b8',
    tooltipBg: isDark ? '#131c31' : '#ffffff',
    tooltipBorder: isDark ? '#334155' : '#e2e8f0',
    text: isDark ? '#f1f5f9' : '#0f172a',
    income: isDark ? '#34d399' : '#059669',
    expense: isDark ? '#fb7185' : '#e11d48',
    brand: isDark ? '#818cf8' : '#6366f1',
  };
};

/**
 * A categorical palette used when a series has no colour of its own.
 *
 * Ordered so adjacent entries stay distinguishable under the common forms of
 * colour-vision deficiency, rather than cycling through a rainbow.
 */
export const CHART_PALETTE = [
  '#6366f1',
  '#f97316',
  '#0ea5e9',
  '#ec4899',
  '#14b8a6',
  '#8b5cf6',
  '#eab308',
  '#ef4444',
  '#22c55e',
  '#64748b',
];
