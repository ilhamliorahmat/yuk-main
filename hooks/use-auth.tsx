'use client';

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInAnonymously,
  signInWithPopup,
  signOut as firebaseSignOut,
  updateProfile,
  type User,
} from 'firebase/auth';
import { getFirebaseServices } from '@/lib/firebase/client';
import { isFirebaseConfigured } from '@/lib/firebase/config';
import type { UserProfileDoc } from '@/lib/games/types';
import { pickAvatarColor, upsertUserProfile } from '@/lib/platform/user-profile';

interface AuthContextValue {
  user: User | null;
  profile: UserProfileDoc | null;
  authReady: boolean;
  configured: boolean;
  authBusy: boolean;
  authError: string | null;
  signInWithGoogle: () => Promise<boolean>;
  signInAsGuest: (nickname: string) => Promise<boolean>;
  updateNickname: (nickname: string) => Promise<boolean>;
  signOut: () => Promise<void>;
  clearAuthError: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function extractFirebaseErrorCode(err: unknown): string {
  if (err && typeof err === 'object' && 'code' in err && typeof err.code === 'string') {
    return err.code;
  }
  const msg = err instanceof Error ? err.message : String(err);
  const match = msg.match(/auth\/[a-z0-9-]+/i);
  return match ? match[0] : '';
}

function buildFallbackProfile(nextUser: User, cleanName?: string): UserProfileDoc {
  const savedName =
    typeof window !== 'undefined'
      ? window.localStorage.getItem('yukmain_nickname') ?? undefined
      : undefined;
  const resolvedName =
    (cleanName || nextUser.displayName || savedName || 'Pemain').trim().slice(0, 40) || 'Pemain';

  return {
    uid: nextUser.uid,
    displayName: resolvedName,
    avatarColor: pickAvatarColor(nextUser.uid),
    isAnonymous: nextUser.isAnonymous,
    gamesPlayed: 0,
    wins: 0,
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const configured = isFirebaseConfigured();
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfileDoc | null>(null);
  const [authReady, setAuthReady] = useState(!configured);
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    if (!configured) {
      return;
    }

    const { auth } = getFirebaseServices();
    if (!auth) {
      const id = window.setTimeout(() => setAuthReady(true), 0);
      return () => window.clearTimeout(id);
    }

    // Offline failsafe: never stall the app splash screen if Firebase Auth is unreachable offline
    const offlineTimer = window.setTimeout(() => {
      setAuthReady(true);
    }, 1500);

    const unsubscribe = onAuthStateChanged(auth, (nextUser) => {
      window.clearTimeout(offlineTimer);
      setUser(nextUser);
      if (nextUser) {
        const fallback = buildFallbackProfile(nextUser);
        setProfile((prev) => (prev?.uid === nextUser.uid ? prev : fallback));
        setAuthReady(true);

        if (typeof navigator === 'undefined' || navigator.onLine) {
          void upsertUserProfile(nextUser, fallback.displayName)
            .then((synced) => setProfile(synced))
            .catch((err) => {
              console.warn('[Yuk Main] Sinkronisasi profil Firestore tertunda:', err);
            });
        }
      } else {
        setProfile(null);
        setAuthReady(true);
      }
    });

    return () => {
      window.clearTimeout(offlineTimer);
      unsubscribe();
    };
  }, [configured]);

  const signInWithGoogle = useCallback(async (): Promise<boolean> => {
    const { auth } = getFirebaseServices();
    if (!auth) {
      setAuthError('Konfigurasi Firebase belum lengkap.');
      return false;
    }

    setAuthBusy(true);
    setAuthError(null);
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      const cred = await signInWithPopup(auth, provider);
      const fallback = buildFallbackProfile(cred.user);
      setProfile(fallback);
      void upsertUserProfile(cred.user, fallback.displayName)
        .then((synced) => setProfile(synced))
        .catch(() => {});
      return true;
    } catch (err) {
      const code = extractFirebaseErrorCode(err);
      if (code === 'auth/unauthorized-domain') {
        setAuthError(
          `Domain pratinjau ini belum ditambahkan ke Authorized Domains di Firebase Console yuk-main (${code}).`,
        );
      } else if (code === 'auth/popup-closed-by-user') {
        setAuthError('Login Google dibatalkan.');
      } else if (code === 'auth/popup-blocked') {
        setAuthError(
          `Popup login diblokir oleh peramban atau iframe (${code}). Izinkan popup atau gunakan Masuk Sebagai Tamu.`,
        );
      } else if (code === 'auth/operation-not-allowed') {
        setAuthError(
          `Provider Google Sign-In belum aktif di Firebase Console yuk-main (${code}).`,
        );
      } else {
        const detail = code || (err instanceof Error ? err.message : 'unknown');
        setAuthError(`Gagal masuk dengan Google (${detail}).`);
      }
      return false;
    } finally {
      setAuthBusy(false);
    }
  }, []);

  const signInAsGuest = useCallback(async (nickname: string): Promise<boolean> => {
    const cleanName = nickname.trim().slice(0, 40);
    if (cleanName.length < 2) {
      setAuthError('Nama panggilan minimal 2 karakter.');
      return false;
    }

    const { auth } = getFirebaseServices();
    if (!auth) {
      setAuthError('Konfigurasi Firebase belum lengkap.');
      return false;
    }

    setAuthBusy(true);
    setAuthError(null);
    try {
      if (typeof window !== 'undefined') {
        window.localStorage.setItem('yukmain_nickname', cleanName);
      }
      const cred = await signInAnonymously(auth);
      await updateProfile(cred.user, { displayName: cleanName }).catch(() => {});
      const fallback = buildFallbackProfile(cred.user, cleanName);
      setProfile(fallback);
      void upsertUserProfile(cred.user, cleanName)
        .then((synced) => setProfile(synced))
        .catch(() => {});
      return true;
    } catch (err) {
      const code = extractFirebaseErrorCode(err);
      if (
        code === 'auth/operation-not-allowed' ||
        code === 'auth/admin-restricted-operation'
      ) {
        setAuthError(
          `Mode Tamu (Anonymous Auth) belum diaktifkan di Firebase Console yuk-main (${code}). Aktifkan Authentication -> Sign-in method -> Anonymous.`,
        );
      } else if (code === 'auth/unauthorized-domain') {
        setAuthError(
          `Domain pratinjau ini belum masuk Authorized Domains di Firebase Console yuk-main (${code}).`,
        );
      } else {
        const detail = code || (err instanceof Error ? err.message : 'unknown');
        setAuthError(`Gagal masuk sebagai tamu (${detail}).`);
      }
      return false;
    } finally {
      setAuthBusy(false);
    }
  }, []);

  const updateNickname = useCallback(
    async (nickname: string): Promise<boolean> => {
      const cleanName = nickname.trim().slice(0, 40);
      if (!user || cleanName.length < 2) return false;
      if (typeof window !== 'undefined') {
        window.localStorage.setItem('yukmain_nickname', cleanName);
      }
      setProfile((prev) =>
        prev ? { ...prev, displayName: cleanName } : buildFallbackProfile(user, cleanName),
      );
      try {
        const updated = await upsertUserProfile(user, cleanName);
        setProfile(updated);
      } catch (err) {
        console.warn('[Yuk Main] Gagal memperbarui nama di Firestore:', err);
      }
      return true;
    },
    [user],
  );

  const signOut = useCallback(async () => {
    const { auth } = getFirebaseServices();
    if (!auth) return;
    await firebaseSignOut(auth);
    setProfile(null);
  }, []);

  const clearAuthError = useCallback(() => setAuthError(null), []);

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        authReady,
        configured,
        authBusy,
        authError,
        signInWithGoogle,
        signInAsGuest,
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
