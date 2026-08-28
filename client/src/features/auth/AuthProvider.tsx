import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AuthResponse, LoginInput, PublicUser, RegisterInput } from '@savoney/shared';
import { AuthContext, type AuthContextValue } from './auth-context';
import { api, onSessionExpired, refreshSession, setAccessToken } from '@/lib/api';
import { queryClient } from '@/lib/query-client';

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [isBootstrapping, setIsBootstrapping] = useState(true);

  /**
   * Restore the session on load.
   *
   * The access token lives in memory and is therefore gone after a reload, but
   * the httpOnly refresh cookie survives. Exchanging it here is what makes a
   * refresh feel like the user was never signed out.
   */
  useEffect(() => {
    let cancelled = false;

    const bootstrap = async () => {
      const refreshed = await refreshSession();
      if (cancelled) return;

      if (refreshed) {
        try {
          const { user: me } = await api.get<{ user: PublicUser }>('/auth/me');
          if (!cancelled) setUser(me);
        } catch {
          if (!cancelled) setUser(null);
        }
      }
      if (!cancelled) setIsBootstrapping(false);
    };

    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, []);

  // The API layer signals when a refresh has definitively failed; clear local
  // state so the router sends the user to sign-in.
  useEffect(
    () =>
      onSessionExpired(() => {
        setUser(null);
        queryClient.clear();
      }),
    [],
  );

  const applySession = useCallback((response: AuthResponse) => {
    setAccessToken(response.accessToken);
    setUser(response.user);
  }, []);

  const login = useCallback(
    async (input: LoginInput) => {
      applySession(await api.post<AuthResponse>('/auth/login', input));
    },
    [applySession],
  );

  const register = useCallback(
    async (input: RegisterInput) => {
      applySession(await api.post<AuthResponse>('/auth/register', input));
    },
    [applySession],
  );

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } finally {
      // Clear locally even if the network call failed — the user asked to be
      // signed out, and leaving them apparently logged in would be worse.
      setAccessToken(null);
      setUser(null);
      queryClient.clear();
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, isBootstrapping, login, register, logout, updateUser: setUser }),
    [user, isBootstrapping, login, register, logout],
  );

  return <AuthContext value={value}>{children}</AuthContext>;
};
