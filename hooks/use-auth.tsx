'use client';

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { UserProfileDoc } from '@/lib/games/types';
import { apiFetch, buildPhpApiUrl, setMemoryAuthToken } from '@/lib/platform/api-client';

export interface PublicAuthUser {
  uid: string;
  username: string | null;
  displayName: string;
  avatarColor: string;
  isAnonymous: boolean;
  gamesPlayed: number;
  wins: number;
}

interface AuthResponsePayload {
  user: PublicAuthUser | null;
  token?: string;
}

interface AuthContextValue {
  user: PublicAuthUser | null;
  profile: UserProfileDoc | null;
  authReady: boolean;
  configured: boolean;
  authBusy: boolean;
  authError: string | null;
  signInAsGuest: (nickname: string) => Promise<boolean>;
  signInWithCredentials: (username: string, password: string) => Promise<boolean>;
  registerAccount: (
    username: string,
    password: string,
    displayName?: string,
  ) => Promise<boolean>;
  updateNickname: (nickname: string) => Promise<boolean>;
  signOut: () => Promise<void>;
  clearAuthError: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function toProfileDoc(u: PublicAuthUser): UserProfileDoc {
  return {
    uid: u.uid,
    displayName: u.displayName,
    avatarColor: u.avatarColor,
    isAnonymous: u.isAnonymous,
    gamesPlayed: u.gamesPlayed,
    wins: u.wins,
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<PublicAuthUser | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const offlineTimer = window.setTimeout(() => {
      if (!cancelled) setAuthReady(true);
    }, 2000);

    void apiFetch<AuthResponsePayload>(buildPhpApiUrl('auth/me'))
      .then((res) => {
        if (cancelled) return;
        setUser(res.user ?? null);
      })
      .catch(() => {
        if (!cancelled) setUser(null);
      })
      .finally(() => {
        window.clearTimeout(offlineTimer);
        if (!cancelled) setAuthReady(true);
      });

    return () => {
      cancelled = true;
      window.clearTimeout(offlineTimer);
    };
  }, []);

  const signInAsGuest = useCallback(async (nickname: string): Promise<boolean> => {
    const cleanName = nickname.trim().slice(0, 40);
    if (cleanName.length < 2) {
      setAuthError('Nama panggilan minimal 2 karakter.');
      return false;
    }

    setAuthBusy(true);
    setAuthError(null);
    try {
      if (typeof window !== 'undefined') {
        window.localStorage.setItem('yukmain_nickname', cleanName);
      }
      const res = await apiFetch<AuthResponsePayload>(buildPhpApiUrl('auth/guest'), {
        method: 'POST',
        body: JSON.stringify({ nickname: cleanName }),
      });
      if (res.token) setMemoryAuthToken(res.token);
      setUser(res.user);
      return Boolean(res.user);
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Gagal masuk sebagai tamu.');
      return false;
    } finally {
      setAuthBusy(false);
    }
  }, []);

  const signInWithCredentials = useCallback(
    async (username: string, password: string): Promise<boolean> => {
      setAuthBusy(true);
      setAuthError(null);
      try {
        const res = await apiFetch<AuthResponsePayload>(buildPhpApiUrl('auth/login'), {
          method: 'POST',
          body: JSON.stringify({ username, password }),
        });
        if (res.token) setMemoryAuthToken(res.token);
        setUser(res.user);
        return Boolean(res.user);
      } catch (err) {
        setAuthError(err instanceof Error ? err.message : 'Gagal masuk dengan akun.');
        return false;
      } finally {
        setAuthBusy(false);
      }
    },
    [],
  );

  const registerAccount = useCallback(
    async (username: string, password: string, displayName?: string): Promise<boolean> => {
      setAuthBusy(true);
      setAuthError(null);
      try {
        const res = await apiFetch<AuthResponsePayload>(buildPhpApiUrl('auth/register'), {
          method: 'POST',
          body: JSON.stringify({ username, password, displayName }),
        });
        if (res.token) setMemoryAuthToken(res.token);
        setUser(res.user);
        return Boolean(res.user);
      } catch (err) {
        setAuthError(err instanceof Error ? err.message : 'Gagal membuat akun.');
        return false;
      } finally {
        setAuthBusy(false);
      }
    },
    [],
  );

  const updateNickname = useCallback(async (nickname: string): Promise<boolean> => {
    const cleanName = nickname.trim().slice(0, 40);
    if (cleanName.length < 2) {
      setAuthError('Nama panggilan minimal 2 karakter.');
      return false;
    }

    setAuthBusy(true);
    setAuthError(null);
    try {
      if (typeof window !== 'undefined') {
        window.localStorage.setItem('yukmain_nickname', cleanName);
      }
      const res = await apiFetch<AuthResponsePayload>(buildPhpApiUrl('auth/me'), {
        method: 'PATCH',
        body: JSON.stringify({ displayName: cleanName }),
      });
      if (res.user) setUser(res.user);
      return Boolean(res.user);
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Gagal memperbarui nama panggilan.');
      return false;
    } finally {
      setAuthBusy(false);
    }
  }, []);

  const signOut = useCallback(async () => {
    try {
      await apiFetch(buildPhpApiUrl('auth/logout'), { method: 'POST' });
    } catch {
      // Ignore logout network errors
    }
    setMemoryAuthToken(null);
    setUser(null);
  }, []);

  const clearAuthError = useCallback(() => setAuthError(null), []);

  return (
    <AuthContext.Provider
      value={{
        user,
        profile: user ? toProfileDoc(user) : null,
        authReady,
        configured: true,
        authBusy,
        authError,
        signInAsGuest,
        signInWithCredentials,
        registerAccount,
        updateNickname,
        signOut,
        clearAuthError,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return ctx;
}
