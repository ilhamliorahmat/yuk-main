import { FieldValue } from 'firebase-admin/firestore';
import { NextRequest, NextResponse } from 'next/server';
import {
  adminDb,
  ApiHttpError,
  requireAuthenticatedCaller,
  toErrorResponse,
} from '@/lib/firebase/admin';
import { dealKataKataRound, mergeWordPairPool } from '@/lib/games/kata-kata/engine';
import type { RoomDoc, RoomPlayerDoc, ServerRoundStateDoc } from '@/lib/games/types';

export async function POST(req: NextRequest) {
  try {
    const caller = await requireAuthenticatedCaller(req);
    const body = (await req.json().catch(() => null)) as { roomId?: string } | null;
    const roomId = body?.roomId?.trim();

    if (!roomId || !/^[a-zA-Z0-9_-]{4,64}$/.test(roomId)) {
      throw new ApiHttpError(400, 'ID ruang tidak valid.');
    }

    const roomRef = adminDb.collection('rooms').doc(roomId);
    const playersRef = roomRef.collection('players');
    const serverStateRef = roomRef.collection('serverState').doc('current');

    const result = await adminDb.runTransaction(async (tx) => {
      const [roomSnap, playersSnap, serverStateSnap] = await Promise.all([
        tx.get(roomRef),
        tx.get(playersRef.orderBy('joinedAt', 'asc')),
        tx.get(serverStateRef),
      ]);

      if (!roomSnap.exists) {
        throw new ApiHttpError(404, 'Ruang permainan tidak ditemukan.');
      }

      const room = roomSnap.data() as RoomDoc;
      if (room.gameType !== 'kata_kata') {
        throw new ApiHttpError(400, 'Ruang ini bukan permainan Kata-Kata Hari Ini.');
      }
      if (room.hostUid !== caller.uid) {
        throw new ApiHttpError(403, 'Hanya Host ruang yang dapat memulai ronde baru.');
      }
      if (room.status !== 'lobby' && room.status !== 'round_end') {
        throw new ApiHttpError(409, 'Ronde sedang berlangsung.');
      }

      const players = playersSnap.docs.map((d) => d.data() as RoomPlayerDoc);
      if (players.length < 3) {
        throw new ApiHttpError(
          400,
          'Minimal 3 pemain dibutuhkan untuk memulai Kata-Kata Hari Ini.',
        );
      }

      const pool = mergeWordPairPool(
        room.enabledPacks ?? ['kuliner', 'keseharian'],
        room.customWordPairs ?? [],
      );
      if (pool.length === 0) {
        throw new ApiHttpError(400, 'Paket kata kosong. Aktifkan minimal 1 paket kata.');
      }

      const prevServerState = serverStateSnap.exists
        ? (serverStateSnap.data() as ServerRoundStateDoc)
        : null;
      const previousCitizenWord =
        prevServerState?.citizenWord ?? room.lastRoundResult?.citizenWord ?? null;

      const nextRoundNumber = (room.roundNumber ?? 0) + 1;
      const roundId = `round_${nextRoundNumber}_${Date.now()}`;

      const dealt = dealKataKataRound({
        playerUids: players.map((p) => p.uid),
        pool,
        previousCitizenWord,
        spyMode: room.spyMode ?? 'single',
        roundId,
      });

      const playerMap = new Map(players.map((p) => [p.uid, p]));
      const spyNames = dealt.spyUids.map(
        (spyUid) => playerMap.get(spyUid)?.displayName ?? 'Pemain',
      );
      const firstSpeakerName =
        playerMap.get(dealt.firstSpeakerUid)?.displayName ?? 'Pemain';

      const durationSec = Math.min(1200, Math.max(120, room.roundDurationSec ?? 480));
      const roundEndsAtMs = Date.now() + durationSec * 1000;

      tx.update(roomRef, {
        status: 'playing',
        roundNumber: nextRoundNumber,
        currentRoundId: roundId,
        roundEndsAtMs,
        firstSpeakerUid: dealt.firstSpeakerUid,
        selectedLocationNames: [],
        eliminatedUids: [],
        eliminationLog: [],
        activeVote: null,
        pendingSpyGuess: null,
        updatedAt: FieldValue.serverTimestamp(),
      });

      const nextServerState: ServerRoundStateDoc = {
        roundId,
        roundNumber: nextRoundNumber,
        locationName: dealt.citizenWord,
        citizenWord: dealt.citizenWord,
        spyWord: dealt.spyWord,
        spyUids: dealt.spyUids,
        spyNames,
        createdAtMs: Date.now(),
      };
      tx.set(serverStateRef, nextServerState);

      for (const [playerUid, secret] of Object.entries(dealt.secretsByUid)) {
        const secretRef = roomRef
          .collection('rounds')
          .doc(roundId)
          .collection('secrets')
          .doc(playerUid);
        tx.set(secretRef, {
          ...secret,
          createdAt: FieldValue.serverTimestamp(),
        });
      }

      return {
        roundNumber: nextRoundNumber,
        systemMessage: `Ronde #${nextRoundNumber} Kata-Kata Hari Ini dimulai! ${firstSpeakerName} mendapat giliran memberi petunjuk pertama.`,
      };
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const { status, message } = toErrorResponse(err);
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
