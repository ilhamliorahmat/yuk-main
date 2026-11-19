'use client';

import React, { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { SpyfallRoomView } from '@/components/games/spyfall/SpyfallRoomView';
import { AuthDialog } from '@/components/hub/AuthDialog';
import { YukMainHub } from '@/components/hub/YukMainHub';
import { useAuth } from '@/hooks/use-auth';
import { joinRoomByCode } from '@/lib/platform/room-service';

function YukMainAppContent() {
  const searchParams = useSearchParams();
  const inviteCode = searchParams.get('room')?.toUpperCase() ?? '';
  const hasValidInvite = Boolean(inviteCode && /^[A-Z0-9]{6}$/.test(inviteCode));
  const { user, profile, authReady } = useAuth();

  const [activeRoomId, setActiveRoomId] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    return window.sessionStorage.getItem('yukmain_room_id');
  });
  const [autoJoinBusy, setAutoJoinBusy] = useState(false);
  const [authDismissed, setAuthDismissed] = useState(false);
  const attemptedInviteRef = useRef<string>('');

  // Auto-join when authenticated user arrives via ?room=XXXXXX invite URL
  useEffect(() => {
    if (!authReady || !hasValidInvite || !user || !profile || activeRoomId) return;
    if (attemptedInviteRef.current === `${inviteCode}:${user.uid}`) return;
    attemptedInviteRef.current = `${inviteCode}:${user.uid}`;

    let cancelled = false;
    Promise.resolve().then(() => {
      if (!cancelled) setAutoJoinBusy(true);
    });

    void joinRoomByCode({
      code: inviteCode,
      uid: user.uid,
      displayName: profile.displayName,
      avatarColor: profile.avatarColor,
    })
      .then((roomId) => {
        if (cancelled) return;
        setActiveRoomId(roomId);
        if (typeof window !== 'undefined') {
          window.sessionStorage.setItem('yukmain_room_id', roomId);
        }
      })
      .catch(() => {
        // Fall back to hub with prefilled invite code
      })
      .finally(() => {
        if (!cancelled) setAutoJoinBusy(false);
      });

    return () => {
      cancelled = true;
    };
  }, [authReady, hasValidInvite, inviteCode, user, profile, activeRoomId]);

  const handleEnterRoom = (roomId: string) => {
    setActiveRoomId(roomId);
    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem('yukmain_room_id', roomId);
    }
  };

  const handleExitRoom = () => {
    setActiveRoomId(null);
    if (typeof window !== 'undefined') {
      window.sessionStorage.removeItem('yukmain_room_id');
      if (window.location.search.includes('room=')) {
        window.history.replaceState({}, '', window.location.pathname || '/');
      }
    }
  };

  if (!authReady || autoJoinBusy) {
    return (
      <div className="min-h-screen bg-[#0B1018] text-slate-300 flex items-center justify-center p-6 text-sm">
        {autoJoinBusy ? `Bergabung ke ruang ${inviteCode}...` : 'Menyiapkan Yuk Main...'}
      </div>
    );
  }

  if (activeRoomId && user && profile) {
    return (
      <SpyfallRoomView
        roomId={activeRoomId}
        myUid={user.uid}
        myName={profile.displayName}
        onExitToHub={handleExitRoom}
      />
    );
  }

  const showInviteAuthDialog = authReady && hasValidInvite && !user && !authDismissed;

  return (
    <>
      <YukMainHub initialRoomCode={inviteCode} onEnterRoom={handleEnterRoom} />
      <AuthDialog open={showInviteAuthDialog} onClose={() => setAuthDismissed(true)} />
    </>
  );
}

export default function HomePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#0B1018] text-slate-300 flex items-center justify-center p-6 text-sm">
          Menyiapkan Yuk Main...
        </div>
      }
    >
      <YukMainAppContent />
    </Suspense>
  );
}
