import { createContext, use } from 'react';
import type { LoginInput, PublicUser, RegisterInput } from '@savoney/shared';

export interface AuthContextValue {
  user: PublicUser | null;
  /** True until the initial session-restore attempt settles. */
  isBootstrapping: boolean;
  login: (input: LoginInput) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  logout: () => Promise<void>;
  updateUser: (user: PublicUser) => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export const useAuth = (): AuthContextValue => {
  const context = use(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};

/** The signed-in user, for components that only render behind a route guard. */
export const useCurrentUser = (): PublicUser => {
  const { user } = useAuth();
  if (!user) throw new Error('useCurrentUser used outside an authenticated route');
  return user;
};
