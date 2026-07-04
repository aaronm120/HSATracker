import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { api } from '../lib/api';
import type { User } from '../types';

interface AuthState {
  user: User | null;
  token: string | null;
  isLoading: boolean;
}

export type LoginResult =
  | { status: 'success' }
  | { status: 'twoFactorRequired'; challengeToken: string };

interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<LoginResult>;
  verifyTwoFactor: (challengeToken: string, code: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  refreshUser: () => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function persistSession(token: string, user: User) {
  localStorage.setItem('hsa_token', token);
  localStorage.setItem('hsa_user', JSON.stringify(user));
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    token: localStorage.getItem('hsa_token'),
    isLoading: true,
  });

  useEffect(() => {
    const token = localStorage.getItem('hsa_token');
    const userRaw = localStorage.getItem('hsa_user');
    if (token && userRaw) {
      try {
        setState({ user: JSON.parse(userRaw), token, isLoading: false });
      } catch {
        setState({ user: null, token: null, isLoading: false });
      }
    } else {
      setState((s) => ({ ...s, isLoading: false }));
    }
  }, []);

  const login = async (email: string, password: string): Promise<LoginResult> => {
    const { data } = await api.post<
      | { token: string; user: User }
      | { twoFactorRequired: true; challengeToken: string }
    >('/auth/login', { email, password });

    if ('twoFactorRequired' in data) {
      return { status: 'twoFactorRequired', challengeToken: data.challengeToken };
    }
    persistSession(data.token, data.user);
    setState({ user: data.user, token: data.token, isLoading: false });
    return { status: 'success' };
  };

  const verifyTwoFactor = async (challengeToken: string, code: string) => {
    const { data } = await api.post<{ token: string; user: User }>('/auth/login/2fa', {
      challengeToken,
      code,
    });
    persistSession(data.token, data.user);
    setState({ user: data.user, token: data.token, isLoading: false });
  };

  const register = async (email: string, password: string) => {
    const { data } = await api.post<{ token: string; user: User }>('/auth/register', {
      email,
      password,
    });
    persistSession(data.token, data.user);
    setState({ user: data.user, token: data.token, isLoading: false });
  };

  const refreshUser = async () => {
    const { data } = await api.get<{ user: User }>('/auth/me');
    setState((s) => {
      if (s.token) localStorage.setItem('hsa_user', JSON.stringify(data.user));
      return { ...s, user: data.user };
    });
  };

  const logout = () => {
    localStorage.removeItem('hsa_token');
    localStorage.removeItem('hsa_user');
    setState({ user: null, token: null, isLoading: false });
  };

  return (
    <AuthContext.Provider
      value={{ ...state, login, verifyTwoFactor, register, refreshUser, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
