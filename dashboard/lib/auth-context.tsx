'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from './supabase';
import { api } from './api';
import { useRouter, usePathname } from 'next/navigation';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  token: string | null;
  profile: any | null;
  loading: boolean;
  isConfigured: boolean;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signUp: (email: string, password: string, metadata?: Record<string, any>) => Promise<{ error?: string; user?: any }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  token: null,
  profile: null,
  loading: true,
  isConfigured: false,
  signIn: async () => ({}),
  signUp: async () => ({}),
  signOut: async () => {},
  refreshProfile: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [profile, setProfile] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  const loadUserProfile = async () => {
    try {
      const p = await api.getProfile();
      setProfile(p);
    } catch (e) {
      console.warn('[ApplyRecall Auth] Could not fetch profile:', e);
    }
  };

  useEffect(() => {
    if (!isSupabaseConfigured) {
      // In unconfigured dev mode, check if we have an existing dev/token session or load dev profile
      const localToken = typeof window !== 'undefined' ? localStorage.getItem('applyrecall_token') : null;
      if (localToken) {
        setToken(localToken);
      }
      loadUserProfile().finally(() => setLoading(false));
      return;
    }

    // Initialize Supabase Auth session
    supabase.auth.getSession().then(({ data: { session: initialSession } }) => {
      setSession(initialSession);
      setUser(initialSession?.user ?? null);
      if (initialSession?.access_token) {
        setToken(initialSession.access_token);
        if (typeof window !== 'undefined') {
          localStorage.setItem('applyrecall_token', initialSession.access_token);
        }
        loadUserProfile().finally(() => setLoading(false));
      } else {
        if (typeof window !== 'undefined') {
          localStorage.removeItem('applyrecall_token');
        }
        setLoading(false);
      }
    });

    // Listen for auth state changes (login, logout, refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, newSession) => {
      setSession(newSession);
      setUser(newSession?.user ?? null);

      if (newSession?.access_token) {
        setToken(newSession.access_token);
        if (typeof window !== 'undefined') {
          localStorage.setItem('applyrecall_token', newSession.access_token);
        }
        await loadUserProfile();
      } else {
        setToken(null);
        setProfile(null);
        if (typeof window !== 'undefined') {
          localStorage.removeItem('applyrecall_token');
        }
      }
      setLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    if (!isSupabaseConfigured) {
      return { error: 'Supabase authentication is not configured. Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.' };
    }
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) {
      return { error: error.message };
    }
    if (data.session) {
      setSession(data.session);
      setUser(data.user);
      setToken(data.session.access_token);
      if (typeof window !== 'undefined') {
        localStorage.setItem('applyrecall_token', data.session.access_token);
      }
      await loadUserProfile();
      router.push('/');
    }
    return {};
  };

  const signUp = async (email: string, password: string, metadata?: Record<string, any>) => {
    if (!isSupabaseConfigured) {
      return { error: 'Supabase authentication is not configured.' };
    }
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: metadata || {},
      },
    });
    if (error) {
      return { error: error.message };
    }
    if (data.session) {
      setSession(data.session);
      setUser(data.user);
      setToken(data.session.access_token);
      if (typeof window !== 'undefined') {
        localStorage.setItem('applyrecall_token', data.session.access_token);
      }
      // Create profile record if metadata provided
      if (metadata?.full_name) {
        try {
          await api.updateProfile({
            full_name: metadata.full_name,
            college: metadata.college || '',
            graduation_year: metadata.graduation_year || '',
          });
        } catch (e) {
          console.warn('Profile initialization error:', e);
        }
      }
      await loadUserProfile();
      router.push('/');
    }
    return { user: data.user };
  };

  const signOut = async () => {
    if (isSupabaseConfigured) {
      await supabase.auth.signOut();
    }
    setUser(null);
    setSession(null);
    setToken(null);
    setProfile(null);
    if (typeof window !== 'undefined') {
      localStorage.removeItem('applyrecall_token');
    }
    router.push('/login');
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        token,
        profile,
        loading,
        isConfigured: isSupabaseConfigured,
        signIn,
        signUp,
        signOut,
        refreshProfile: loadUserProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
