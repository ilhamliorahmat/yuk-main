import { FieldValue } from 'firebase-admin/firestore';
import { NextRequest, NextResponse } from 'next/server';
import {
  adminDb,
  ApiHttpError,
  requireAuthenticatedCaller,
  toErrorResponse,
} from '@/lib/firebase/admin';
import { calculateKataKataScoreDeltas } from '@/lib/games/kata-kata/engine';
import type {
  RoomDoc,
  RoomPlayerDoc,
  RoundResult,
  ServerRoundStateDoc,
} from '@/lib/games/types';

interface ResolveBody {
  roomId?: string;
  action?: 'timeout' | 'return_lobby';
}

export async function POST(req: NextRequest) {
  try {
    const caller = await requireAuthenticatedCaller(req);
    const body = (await req.json().catch(() => null)) as ResolveBody | null;
    const roomId = body?.roomId?.trim();
    const action = body?.action;

    if (!roomId || !/^[a-zA-Z0-9_-]{4,64}$/.test(roomId)) {
      throw new ApiHttpError(400, 'ID ruang tidak valid.');
    }
    if (action !== 'timeout' && action !== 'return_lobby') {
      throw new ApiHttpError(400, 'Aksi penyelesaian tidak valid.');
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

      if (action === 'return_lobby') {
        if (room.hostUid !== caller.uid) {
          throw new ApiHttpError(403, 'Hanya Host yang dapat mengembalikan ruang ke lobi.');
        }

        tx.update(roomRef, {
          status: 'lobby',
          activeVote: null,
          pendingSpyGuess: null,
          eliminatedUids: [],
          eliminationLog: [],
          updatedAt: FieldValue.serverTimestamp(),
        });

        return { systemMessage: 'Host mengembalikan ruang permainan ke lobi.' };
      }

      if (room.status === 'round_end' || room.status === 'lobby') {
        return { systemMessage: null };
      }

      const timerExpired = room.roundEndsAtMs > 0 && Date.now() >= room.roundEndsAtMs - 1500;
      if (!timerExpired && room.hostUid !== caller.uid) {
        throw new ApiHttpError(
          409,
          'Waktu ronde belum habis. Hanya Host yang dapat mengakhiri ronde lebih awal.',
        );
      }

      if (!serverStateSnap.exists) {
        throw new ApiHttpError(500, 'Status rahasia ronde pada server tidak ditemukan.');
      }

      const serverState = serverStateSnap.data() as ServerRoundStateDoc;
      const citizenWord = serverState.citizenWord ?? serverState.locationName;
      const spyWord = serverState.spyWord ?? '';

      const spyStalledOnGuess = room.status === 'spy_guess';
      const winnerTeam = spyStalledOnGuess ? 'warga' : 'mata_mata';
      const victoryType = spyStalledOnGuess ? 'all_spies_eliminated' : 'timeout';
      const reason = spyStalledOnGuess
        ? 'Penyusup terakhir tertangkap dan tidak berhasil menebak Kata Warga tepat waktu!'
        : 'Waktu habis! Penyusup berhasil menyamar hingga akhir ronde.';

      const deltas = calculateKataKataScoreDeltas({
        playerUids: players.map((p) => p.uid),
        spyUids: serverState.spyUids,
        winnerTeam,
        initiatorUid: room.activeVote?.initiatorUid ?? null,
        victoryType,
      });

      const roundResult: RoundResult = {
        roundNumber: room.roundNumber,
        winnerTeam,
        reason,
        locationName: citizenWord,
        guessedLocation: null,
        citizenWord,
        spyWord,
        guessedWord: null,
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
