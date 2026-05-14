'use client';

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { api } from './api';
import type { User } from '@/types';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (data: RegisterData) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

interface RegisterData {
  name: string;
  email: string;
  password: string;
  role: string;
  phone?: string;
  pan?: string;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser]       = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const refreshUser = useCallback(async () => {
    try {
      const data = await api.get<User>('/auth/me');
      setUser(data);
    } catch {
      setUser(null);
      localStorage.removeItem('ff_access_token');
      localStorage.removeItem('ff_refresh_token');
    }
  }, []);

  useEffect(() => {
    const token = localStorage.getItem('ff_access_token');
    if (token) {
      refreshUser().finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [refreshUser]);

  const login = async (email: string, password: string) => {
    const data = await api.post<any>('/auth/login', { email, password });
    localStorage.setItem('ff_access_token',  data.accessToken);
    localStorage.setItem('ff_refresh_token', data.refreshToken);
    setUser(data.user);
    router.push('/dashboard/marketplace');
  };

  const register = async (payload: RegisterData) => {
    const data = await api.post<any>('/auth/register', payload);
    localStorage.setItem('ff_access_token',  data.accessToken);
    localStorage.setItem('ff_refresh_token', data.refreshToken);
    setUser(data.user);
    router.push('/dashboard/marketplace');
  };

  const logout = async () => {
    try { await api.post('/auth/logout', {}); } catch { /* ignore */ }
    localStorage.removeItem('ff_access_token');
    localStorage.removeItem('ff_refresh_token');
    setUser(null);
    router.push('/login');
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
