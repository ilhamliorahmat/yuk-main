'use client';

import React, { useState } from 'react';
import { KeyRound, UserPlus, UserRound, X } from 'lucide-react';
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
    signInAsGuest,
    signInWithCredentials,
    registerAccount,
    updateNickname,
    signOut,
    clearAuthError,
  } = useAuth();

  const [mode, setMode] = useState<'guest' | 'login' | 'register'>('guest');
  const [nicknameDraft, setNicknameDraft] = useState<string | null>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [localMsg, setLocalMsg] = useState<string | null>(null);

  if (!open) return null;

  const nickname = nicknameDraft ?? (defaultNickname || profile?.displayName || '');

  const handleClose = () => {
    setNicknameDraft(null);
    setPassword('');
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

  const handleCredentialSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalMsg(null);
    clearAuthError();
    if (mode === 'register') {
      const ok = await registerAccount(username, password, nickname.trim() || username.trim());
      if (ok) handleClose();
    } else {
      const ok = await signInWithCredentials(username, password);
      if (ok) handleClose();
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
                : 'Masuk cepat sebagai tamu atau gunakan akun permanen untuk menyimpan statistik.'}
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
          <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-[#0B1018] border border-slate-800">
            <button
              type="button"
              onClick={() => {
                clearAuthError();
                setMode('guest');
              }}
              className={`min-h-[38px] rounded-lg text-xs font-semibold transition-colors ${
                mode === 'guest' ? 'bg-amber-400 text-slate-950' : 'text-slate-400 hover:text-white'
              }`}
            >
              Tamu Cepat
            </button>
            <button
              type="button"
              onClick={() => {
                clearAuthError();
                setMode('login');
              }}
              className={`min-h-[38px] rounded-lg text-xs font-semibold transition-colors ${
                mode === 'login' ? 'bg-amber-400 text-slate-950' : 'text-slate-400 hover:text-white'
              }`}
            >
              Masuk Akun
            </button>
            <button
              type="button"
              onClick={() => {
                clearAuthError();
                setMode('register');
              }}
              className={`min-h-[38px] rounded-lg text-xs font-semibold transition-colors ${
                mode === 'register'
                  ? 'bg-amber-400 text-slate-950'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Daftar Akun
            </button>
          </div>
        )}

        {(user || mode === 'guest') && (
          <form onSubmit={handleGuestSubmit} className="space-y-3">
            <div>
              <label
                htmlFor="nickname-input"
                className="block text-xs font-medium text-slate-300 mb-1.5"
              >
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
        )}

        {!user && (mode === 'login' || mode === 'register') && (
          <form onSubmit={handleCredentialSubmit} className="space-y-3">
            <div>
              <label
                htmlFor="username-input"
                className="block text-xs font-medium text-slate-300 mb-1.5"
              >
                Username
              </label>
              <div className="relative">
                <UserPlus className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  id="username-input"
                  type="text"
                  maxLength={32}
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="contoh: budi_detektif"
                  className="w-full min-h-[46px] pl-10 pr-4 rounded-xl bg-[#0B1018] border border-slate-800 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-amber-400/70"
                />
              </div>
            </div>

            {mode === 'register' && (
              <div>
                <label
                  htmlFor="register-displayname-input"
                  className="block text-xs font-medium text-slate-300 mb-1.5"
                >
                  Nama Tampilan
                </label>
                <input
                  id="register-displayname-input"
                  type="text"
                  maxLength={40}
                  value={nickname}
                  onChange={(e) => setNicknameDraft(e.target.value)}
                  placeholder="Nama yang tampil di meja"
                  className="w-full min-h-[46px] px-4 rounded-xl bg-[#0B1018] border border-slate-800 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-amber-400/70"
                />
              </div>
            )}

            <div>
              <label
                htmlFor="password-input"
                className="block text-xs font-medium text-slate-300 mb-1.5"
              >
                Kata Sandi
              </label>
              <div className="relative">
                <KeyRound className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  id="password-input"
                  type="password"
                  autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Minimal 6 karakter"
                  className="w-full min-h-[46px] pl-10 pr-4 rounded-xl bg-[#0B1018] border border-slate-800 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-amber-400/70"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={authBusy || username.trim().length < 3 || password.length < 6}
              className="w-full min-h-[46px] rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-semibold text-sm transition-colors disabled:opacity-50"
            >
              {authBusy
                ? 'Memproses...'
                : mode === 'register'
                  ? 'Daftar & Masuk'
                  : 'Masuk dengan Akun'}
            </button>
          </form>
        )}

        {user && (
          <div className="pt-2 border-t border-slate-800 flex items-center justify-between gap-3 text-xs text-slate-400">
            <span className="truncate">
              {user.isAnonymous
                ? 'Status: Akun Tamu'
                : `Akun: @${user.username ?? user.displayName} · ${user.gamesPlayed} main · ${user.wins} menang`}
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
