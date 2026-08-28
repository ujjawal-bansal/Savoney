import { useEffect, useState } from 'react';

export type ThemePreference = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'savoney-theme';

const prefersDark = (): boolean =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;

const readStored = (): ThemePreference => {
  if (typeof window === 'undefined') return 'system';
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored === 'light' || stored === 'dark' ? stored : 'system';
  } catch {
    // Private browsing and blocked site data both throw on access.
    return 'system';
  }
};

const applyTheme = (preference: ThemePreference): void => {
  const isDark = preference === 'dark' || (preference === 'system' && prefersDark());
  document.documentElement.classList.toggle('dark', isDark);
};

export const useTheme = () => {
  const [preference, setPreference] = useState<ThemePreference>(readStored);

  useEffect(() => {
    applyTheme(preference);
    try {
      if (preference === 'system') window.localStorage.removeItem(STORAGE_KEY);
      else window.localStorage.setItem(STORAGE_KEY, preference);
    } catch {
      // Persistence is a convenience; the theme still applies for this session.
    }
  }, [preference]);

  useEffect(() => {
    // Only follow the OS while the user has not made an explicit choice.
    if (preference !== 'system') return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => applyTheme('system');
    media.addEventListener('change', handler);
    return () => media.removeEventListener('change', handler);
  }, [preference]);

  return { preference, setPreference };
};

/**
 * Applied before React mounts, from a blocking script in index.html.
 * Deferring to the first render would paint a white screen for one frame on a
 * dark-mode load — the "theme flash".
 */
export const themeBootScript = `
(function(){try{var s=localStorage.getItem('${STORAGE_KEY}');
var d=s==='dark'||(!s&&window.matchMedia('(prefers-color-scheme: dark)').matches);
document.documentElement.classList.toggle('dark',d);}catch(e){}})();
`;
