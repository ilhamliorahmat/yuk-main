import { FieldValue } from 'firebase-admin/firestore';
import { NextRequest, NextResponse } from 'next/server';
import {
  adminDb,
  ApiHttpError,
  requireAuthenticatedCaller,
  toErrorResponse,
} from '@/lib/firebase/admin';
import {
  calculateKataKataScoreDeltas,
  evaluateKataKataLastChanceGuess,
} from '@/lib/games/kata-kata/engine';
import type {
  RoomDoc,
  RoomPlayerDoc,
  RoundResult,
  ServerRoundStateDoc,
} from '@/lib/games/types';

interface GuessBody {
  roomId?: string;
  guessedWord?: string;
  surrender?: boolean;
}

export async function POST(req: NextRequest) {
  try {
    const caller = await requireAuthenticatedCaller(req);
    const body = (await req.json().catch(() => null)) as GuessBody | null;
    const roomId = body?.roomId?.trim();
    const surrender = Boolean(body?.surrender);
    const guessedWord =
      typeof body?.guessedWord === 'string' ? body.guessedWord.trim().slice(0, 80) : '';

    if (!roomId || !/^[a-zA-Z0-9_-]{4,64}$/.test(roomId)) {
      throw new ApiHttpError(400, 'ID ruang tidak valid.');
    }
    if (!surrender && !guessedWord) {
      throw new ApiHttpError(400, 'Ketik tebakan Kata Warga terlebih dahulu.');
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

      const players = playersSnap.docs.map((d) => d.data() as RoomPlayerDoc);
      const callerPlayer = players.find((p) => p.uid === caller.uid);
      if (!callerPlayer) {
        throw new ApiHttpError(403, 'Kamu bukan anggota ruang permainan ini.');
      }
      if (room.status !== 'spy_guess' || !room.pendingSpyGuess) {
        throw new ApiHttpError(409, 'Tidak ada fase Kesempatan Terakhir yang aktif.');
      }
      if (room.pendingSpyGuess.spyUid !== caller.uid) {
        throw new ApiHttpError(
          403,
          'Hanya Penyusup terakhir yang tertangkap yang dapat mengirimkan tebakan.',
        );
      }
      if (!serverStateSnap.exists) {
        throw new ApiHttpError(500, 'Status rahasia ronde pada server tidak ditemukan.');
      }

      const serverState = serverStateSnap.data() as ServerRoundStateDoc;
      const citizenWord = serverState.citizenWord ?? serverState.locationName;
      const spyWord = serverState.spyWord ?? '';

      const isCorrect =
        !surrender && evaluateKataKataLastChanceGuess(guessedWord, citizenWord);
      const winnerTeam = isCorrect ? 'mata_mata' : 'warga';

      const deltas = calculateKataKataScoreDeltas({
        playerUids: players.map((p) => p.uid),
        spyUids: serverState.spyUids,
        winnerTeam,
        initiatorUid: room.activeVote?.initiatorUid ?? null,
        victoryType: isCorrect ? 'last_chance_correct' : 'last_chance_wrong',
      });

      const reason = surrender
        ? `${callerPlayer.displayName} menyerah pada Kesempatan Terakhir! Tim Warga menang.`
        : isCorrect
          ? `${callerPlayer.displayName} berhasil menebak Kata Warga ("${citizenWord}") di Kesempatan Terakhir dan membalikkan kemenangan!`
          : `Tebakan ${callerPlayer.displayName} ("${guessedWord}") meleset! Kata Warga sebenarnya adalah "${citizenWord}".`;

      const roundResult: RoundResult = {
        roundNumber: room.roundNumber,
        winnerTeam,
        reason,
        locationName: citizenWord,
        guessedLocation: surrender ? null : guessedWord,
        citizenWord,
        spyWord,
        guessedWord: surrender ? null : guessedWord,
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
