'use client';

import React, { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ActiveRoomContainer } from '@/components/games/ActiveRoomContainer';
import { AuthDialog } from '@/components/hub/AuthDialog';
import { YukMainHub } from '@/components/hub/YukMainHub';
import { useAuth } from '@/hooks/use-auth';
import {
  checkAndResetExpiredRoomSession,
  joinRoomAsStageDisplay,
  joinRoomByCode,
} from '@/lib/platform/room-service';

function YukMainAppContent() {
  const searchParams = useSearchParams();
  const inviteCode = searchParams.get('room')?.toUpperCase() ?? '';
  const wantsStageDisplay =
    searchParams.get('stage') === '1' || searchParams.get('stage') === 'true';
  const hasValidInvite = Boolean(inviteCode && /^[A-Z0-9]{6}$/.test(inviteCode));
  const { user, profile, authReady } = useAuth();

  const [activeRoomId, setActiveRoomId] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    return window.sessionStorage.getItem('yukmain_room_id');
  });
  const [isStageDisplay, setIsStageDisplay] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.sessionStorage.getItem('yukmain_room_stage') === '1';
  });
  const [autoJoinBusy, setAutoJoinBusy] = useState(false);
  const [authDismissed, setAuthDismissed] = useState(false);
  const attemptedInviteRef = useRef<string>('');
  const checkedResumeRef = useRef<string>('');

  // Check 15-second empty-room auto-reset when resuming a persisted room session
  useEffect(() => {
    if (!authReady || !activeRoomId || !user || isStageDisplay) return;
    const resumeKey = `${activeRoomId}:${user.uid}`;
    if (checkedResumeRef.current === resumeKey) return;
    checkedResumeRef.current = resumeKey;

    void checkAndResetExpiredRoomSession(activeRoomId, user.uid).catch(() => {});
  }, [authReady, activeRoomId, user, isStageDisplay]);

  // Auto-join when authenticated user arrives via ?room=XXXXXX or ?room=XXXXXX&stage=1
  useEffect(() => {
    if (!authReady || !hasValidInvite || !user || !profile || activeRoomId) return;
    const attemptKey = `${inviteCode}:${user.uid}:${wantsStageDisplay ? 'stage' : 'player'}`;
    if (attemptedInviteRef.current === attemptKey) return;
    attemptedInviteRef.current = attemptKey;

    let cancelled = false;
    Promise.resolve().then(() => {
      if (!cancelled) setAutoJoinBusy(true);
    });

    const joinPromise = wantsStageDisplay
      ? joinRoomAsStageDisplay({ code: inviteCode }).then((res) => res.roomId)
      : joinRoomByCode({
          code: inviteCode,
          uid: user.uid,
          displayName: profile.displayName,
          avatarColor: profile.avatarColor,
        });

    void joinPromise
      .then((roomId) => {
        if (cancelled) return;
        setActiveRoomId(roomId);
        setIsStageDisplay(wantsStageDisplay);
        if (typeof window !== 'undefined') {
          window.sessionStorage.setItem('yukmain_room_id', roomId);
          window.sessionStorage.setItem('yukmain_room_stage', wantsStageDisplay ? '1' : '0');
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
  }, [authReady, hasValidInvite, inviteCode, wantsStageDisplay, user, profile, activeRoomId]);

  const handleEnterRoom = (
    roomId: string,
    options?: { isStageDisplay?: boolean },
  ) => {
    const stageFlag = Boolean(options?.isStageDisplay);
    setActiveRoomId(roomId);
    setIsStageDisplay(stageFlag);
    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem('yukmain_room_id', roomId);
      window.sessionStorage.setItem('yukmain_room_stage', stageFlag ? '1' : '0');
    }
  };

  const handleExitRoom = () => {
    setActiveRoomId(null);
    setIsStageDisplay(false);
    if (typeof window !== 'undefined') {
      window.sessionStorage.removeItem('yukmain_room_id');
      window.sessionStorage.removeItem('yukmain_room_stage');
      if (window.location.search.includes('room=')) {
        window.history.replaceState({}, '', window.location.pathname || '/');
      }
    }
  };

  if (!authReady || autoJoinBusy) {
    return (
      <div className="min-h-screen bg-[#0B1018] text-slate-300 flex items-center justify-center p-6 text-sm">
        {autoJoinBusy
          ? wantsStageDisplay
            ? `Membuka Layar Panggung ${inviteCode}...`
            : `Bergabung ke ruang ${inviteCode}...`
          : 'Menyiapkan Yuk Main...'}
      </div>
    );
  }

  if (activeRoomId && user && profile) {
    return (
      <ActiveRoomContainer
        roomId={activeRoomId}
        myUid={user.uid}
        myName={profile.displayName}
        isStageDisplay={isStageDisplay}
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
