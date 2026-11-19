import { FieldValue } from 'firebase-admin/firestore';
import { NextRequest, NextResponse } from 'next/server';
import {
  adminDb,
  ApiHttpError,
  requireAuthenticatedCaller,
  toErrorResponse,
} from '@/lib/firebase/admin';
import {
  calculateRoundScoreDeltas,
  evaluateSpyGuess,
} from '@/lib/games/spyfall/engine';
import type {
  RoomDoc,
  RoomPlayerDoc,
  RoundResult,
  ServerRoundStateDoc,
} from '@/lib/games/types';

export async function POST(req: NextRequest) {
  try {
    const caller = await requireAuthenticatedCaller(req);
    const body = (await req.json().catch(() => null)) as {
      roomId?: string;
      guessedLocation?: string;
    } | null;

    const roomId = body?.roomId?.trim();
    const guessedLocation = body?.guessedLocation?.trim().slice(0, 80);

    if (!roomId || !/^[a-zA-Z0-9_-]{4,64}$/.test(roomId)) {
      throw new ApiHttpError(400, 'ID ruang tidak valid.');
    }
    if (!guessedLocation) {
      throw new ApiHttpError(400, 'Pilih lokasi tebakan terlebih dahulu.');
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
      const players = playersSnap.docs.map((d) => d.data() as RoomPlayerDoc);
      const callerPlayer = players.find((p) => p.uid === caller.uid);

      if (!callerPlayer) {
        throw new ApiHttpError(403, 'Kamu bukan anggota ruang permainan ini.');
      }

      if (room.status !== 'playing' && room.status !== 'spy_guess') {
        throw new ApiHttpError(409, 'Tebakan lokasi tidak dapat dikirim pada status ronde saat ini.');
      }

      if (!serverStateSnap.exists) {
        throw new ApiHttpError(500, 'Status rahasia ronde pada server tidak ditemukan.');
      }
      const serverState = serverStateSnap.data() as ServerRoundStateDoc;

      if (!serverState.spyUids.includes(caller.uid)) {
        throw new ApiHttpError(403, 'Hanya Mata-Mata yang dapat menebak lokasi.');
      }

      if (
        room.status === 'spy_guess' &&
        room.activeVote &&
        room.activeVote.targetUid !== caller.uid
      ) {
        throw new ApiHttpError(
          403,
          'Hanya Mata-Mata yang sedang tertangkap yang mendapat kesempatan tebakan terakhir.',
        );
      }

      const isCorrect = evaluateSpyGuess(guessedLocation, serverState.locationName);
      const winnerTeam = isCorrect ? 'mata_mata' : 'warga';

      const deltas = calculateRoundScoreDeltas({
        playerUids: players.map((p) => p.uid),
        spyUids: serverState.spyUids,
        winnerTeam,
        initiatorUid: room.activeVote?.initiatorUid ?? null,
        victoryType: isCorrect ? 'spy_guess_correct' : 'spy_guess_wrong',
      });

      const reason = isCorrect
        ? `${callerPlayer.displayName} menebak lokasi dengan tepat (${serverState.locationName})!`
        : `Tebakan ${callerPlayer.displayName} (${guessedLocation}) meleset! Lokasi sebenarnya adalah ${serverState.locationName}.`;

      const roundResult: RoundResult = {
        roundNumber: room.roundNumber,
        winnerTeam,
        reason,
        locationName: serverState.locationName,
        guessedLocation,
        spyUids: serverState.spyUids,
        spyNames: serverState.spyNames,
        resolvedAtMs: Date.now(),
        scoresApplied: true,
      };

      tx.update(roomRef, {
        status: 'round_end',
        activeVote: null,
        pendingSpyGuess: null,
        lastRoundResult: roundResult,
        updatedAt: FieldValue.serverTimestamp(),
      });

      for (const player of players) {
        const delta = deltas[player.uid] ?? 0;
        if (delta > 0) {
          tx.update(playersRef.doc(player.uid), {
            score: FieldValue.increment(delta),
            updatedAt: FieldValue.serverTimestamp(),
          });
        }
      }

      return { systemMessage: reason };
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const { status, message } = toErrorResponse(err);
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
