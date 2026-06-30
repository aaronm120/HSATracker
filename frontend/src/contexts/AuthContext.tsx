import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { api } from '../lib/api';
import type { User } from '../types';

interface AuthState {
  user: User | null;
  token: string | null;
  isLoading: boolean;
}

interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

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

  const login = async (email: string, password: string) => {
    const { data } = await api.post<{ token: string; user: User }>('/auth/login', {
      email,
      password,
    });
    localStorage.setItem('hsa_token', data.token);
    localStorage.setItem('hsa_user', JSON.stringify(data.user));
    setState({ user: data.user, token: data.token, isLoading: false });
  };

  const register = async (email: string, password: string) => {
    const { data } = await api.post<{ token: string; user: User }>('/auth/register', {
      email,
      password,
    });
    localStorage.setItem('hsa_token', data.token);
    localStorage.setItem('hsa_user', JSON.stringify(data.user));
    setState({ user: data.user, token: data.token, isLoading: false });
  };

  const logout = () => {
    localStorage.removeItem('hsa_token');
    localStorage.removeItem('hsa_user');
    setState({ user: null, token: null, isLoading: false });
  };

  return (
    <AuthContext.Provider value={{ ...state, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
