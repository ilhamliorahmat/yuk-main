'use client';

import React, { useState } from 'react';
import { LogIn, UserRound, X } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';

interface AuthDialogProps {
  open: boolean;
  onClose: () => void;
  defaultNickname?: string;
}

export function AuthDialog({ open, onClose, defaultNickname = '' }: AuthDialogProps) {
  const {
    user,
    profile,
    authBusy,
    authError,
    signInWithGoogle,
    signInAsGuest,
    updateNickname,
    signOut,
    clearAuthError,
  } = useAuth();
  const [nicknameDraft, setNicknameDraft] = useState<string | null>(null);
  const [localMsg, setLocalMsg] = useState<string | null>(null);

  if (!open) return null;

  const nickname = nicknameDraft ?? (defaultNickname || profile?.displayName || '');

  const handleClose = () => {
    setNicknameDraft(null);
    setLocalMsg(null);
    clearAuthError();
    onClose();
  };

  const handleGuestSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalMsg(null);
    clearAuthError();
    if (user) {
      const ok = await updateNickname(nickname);
      if (ok) {
        setLocalMsg('Nama panggilan berhasil diperbarui.');
        setTimeout(() => handleClose(), 450);
      }
      return;
    }
    const ok = await signInAsGuest(nickname);
    if (ok) {
      handleClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-dialog-title"
    >
      <div className="w-full sm:max-w-md bg-[#131A24] border border-slate-800 rounded-t-3xl sm:rounded-2xl p-6 space-y-5 shadow-2xl">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 id="auth-dialog-title" className="text-lg font-semibold text-white">
              {user ? 'Profil Pemain' : 'Masuk ke Yuk Main'}
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {user
                ? 'Ubah nama panggilanmu yang tampil di ruang permainan.'
                : 'Pilih akun Google atau masuk cepat sebagai tamu.'}
            </p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Tutup dialog akun"
            className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {(authError || localMsg) && (
          <div
            className={`rounded-xl px-4 py-3 text-xs leading-relaxed border ${
              authError
                ? 'bg-rose-950/50 border-rose-800/70 text-rose-200'
                : 'bg-emerald-950/50 border-emerald-800/70 text-emerald-200'
            }`}
          >
            {authError || localMsg}
          </div>
        )}

        {!user && (
          <div className="space-y-3">
            <button
              type="button"
              disabled={authBusy}
              onClick={async () => {
                clearAuthError();
                const ok = await signInWithGoogle();
                if (ok) handleClose();
              }}
              className="w-full min-h-[48px] inline-flex items-center justify-center gap-2.5 rounded-xl bg-white hover:bg-slate-100 text-slate-900 font-semibold text-sm transition-colors disabled:opacity-50"
            >
              <LogIn className="w-4 h-4" />
              <span>{authBusy ? 'Memproses...' : 'Masuk dengan Google'}</span>
            </button>

            <div className="relative flex items-center py-1">
              <div className="flex-grow border-t border-slate-800" />
              <span className="px-3 text-xs text-slate-500">atau masuk sebagai tamu</span>
              <div className="flex-grow border-t border-slate-800" />
            </div>
          </div>
        )}

        <form onSubmit={handleGuestSubmit} className="space-y-3">
          <div>
            <label htmlFor="nickname-input" className="block text-xs font-medium text-slate-300 mb-1.5">
              Nama Panggilan
            </label>
            <div className="relative">
              <UserRound className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                id="nickname-input"
                type="text"
                maxLength={40}
                value={nickname}
                onChange={(e) => setNicknameDraft(e.target.value)}
                placeholder="Contoh: Detektif Budi"
                className="w-full min-h-[46px] pl-10 pr-4 rounded-xl bg-[#0B1018] border border-slate-800 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-rose-500"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={authBusy || nickname.trim().length < 2}
            className="w-full min-h-[46px] rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-semibold text-sm transition-colors disabled:opacity-50"
          >
            {authBusy ? 'Memproses...' : user ? 'Simpan Nama Panggilan' : 'Masuk Sebagai Tamu'}
          </button>
        </form>

        {user && (
          <div className="pt-2 border-t border-slate-800 flex items-center justify-between gap-3 text-xs text-slate-400">
            <span className="truncate">
              Status: {user.isAnonymous ? 'Akun Tamu' : user.email || 'Akun Google'}
            </span>
            <button
              type="button"
              onClick={async () => {
                await signOut();
                handleClose();
              }}
              className="min-h-[40px] px-3 rounded-lg text-rose-400 hover:bg-rose-950/50 font-medium whitespace-nowrap shrink-0 transition-colors"
            >
              Keluar Akun
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
