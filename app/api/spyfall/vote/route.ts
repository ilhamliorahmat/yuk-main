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
  evaluateVoteProgress,
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
      action?: 'initiate' | 'cast' | 'cancel';
      targetUid?: string;
      choice?: 'yes' | 'no';
    } | null;

    const roomId = body?.roomId?.trim();
    const action = body?.action;

    if (!roomId || !/^[a-zA-Z0-9_-]{4,64}$/.test(roomId)) {
      throw new ApiHttpError(400, 'ID ruang tidak valid.');
    }
    if (action !== 'initiate' && action !== 'cast' && action !== 'cancel') {
      throw new ApiHttpError(400, 'Aksi voting tidak valid.');
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

      if (action === 'initiate') {
        if (room.status !== 'playing') {
          throw new ApiHttpError(
            409,
            'Pemungutan suara hanya bisa dimulai saat permainan berlangsung.',
          );
        }
        const targetUid = body?.targetUid?.trim();
        const targetPlayer = players.find((p) => p.uid === targetUid);
        if (!targetPlayer) {
          throw new ApiHttpError(404, 'Pemain tertuduh tidak ditemukan di ruang ini.');
        }
        if (targetPlayer.uid === caller.uid) {
          throw new ApiHttpError(400, 'Kamu tidak bisa menuduh dirimu sendiri.');
        }

        tx.update(roomRef, {
          status: 'voting',
          activeVote: {
            initiatorUid: caller.uid,
            initiatorName: callerPlayer.displayName.slice(0, 40),
            targetUid: targetPlayer.uid,
            targetName: targetPlayer.displayName.slice(0, 40),
            startedAtMs: Date.now(),
            votes: {
              [caller.uid]: 'yes',
            },
          },
          pendingSpyGuess: null,
          updatedAt: FieldValue.serverTimestamp(),
        });

        return {
          systemMessage: `${callerPlayer.displayName} menuduh ${targetPlayer.displayName} sebagai Mata-Mata!`,
        };
      }

      if (action === 'cancel') {
        if (room.hostUid !== caller.uid) {
          throw new ApiHttpError(403, 'Hanya Host yang dapat membatalkan voting.');
        }
        if (room.status !== 'voting' && room.status !== 'spy_guess') {
          throw new ApiHttpError(409, 'Tidak ada voting aktif untuk dibatalkan.');
        }

        tx.update(roomRef, {
          status: 'playing',
          activeVote: null,
          pendingSpyGuess: null,
          updatedAt: FieldValue.serverTimestamp(),
        });

        return {
          systemMessage: 'Host membatalkan voting dan melanjutkan ronde.',
        };
      }

      // action === 'cast'
      if (room.status !== 'voting' || !room.activeVote) {
        throw new ApiHttpError(409, 'Tidak ada pemungutan suara yang sedang berlangsung.');
      }
      if (room.activeVote.targetUid === caller.uid) {
        throw new ApiHttpError(403, 'Pemain yang sedang dituduh tidak memiliki hak suara.');
      }
      const choice = body?.choice;
      if (choice !== 'yes' && choice !== 'no') {
        throw new ApiHttpError(400, 'Pilihan suara harus "yes" atau "no".');
      }

      const nextVotes = {
        ...room.activeVote.votes,
        [caller.uid]: choice,
      };
      const eligibleVoters = players
        .map((p) => p.uid)
        .filter((uid) => uid !== room.activeVote?.targetUid);

      const evaluation = evaluateVoteProgress(nextVotes, eligibleVoters);

      if (evaluation.outcome === 'acquitted') {
        tx.update(roomRef, {
          status: 'playing',
          activeVote: null,
          pendingSpyGuess: null,
          updatedAt: FieldValue.serverTimestamp(),
        });

        return {
          systemMessage: `Voting terhadap ${room.activeVote.targetName} ditolak (${callerPlayer.displayName} tidak setuju). Permainan berlanjut!`,
        };
      }

      if (evaluation.outcome === 'convicted') {
        if (!serverStateSnap.exists) {
          throw new ApiHttpError(500, 'Status rahasia ronde pada server tidak ditemukan.');
        }
        const serverState = serverStateSnap.data() as ServerRoundStateDoc;
        const isTargetSpy = serverState.spyUids.includes(room.activeVote.targetUid);

        if (!isTargetSpy) {
          // Innocent convicted: Spy wins immediately!
          const deltas = calculateRoundScoreDeltas({
            playerUids: players.map((p) => p.uid),
            spyUids: serverState.spyUids,
            winnerTeam: 'mata_mata',
            initiatorUid: room.activeVote.initiatorUid,
            victoryType: 'false_accusation',
          });

          const roundResult: RoundResult = {
            roundNumber: room.roundNumber,
            winnerTeam: 'mata_mata',
            reason: `Warga salah menuduh ${room.activeVote.targetName} yang bukan Mata-Mata!`,
            locationName: serverState.locationName,
            guessedLocation: null,
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

          return {
            systemMessage: `${room.activeVote.targetName} ternyata WARGA! Tim Mata-Mata memenangkan ronde ini!`,
          };
        }

        // Actual Spy convicted: give Spy one last chance to guess the location
        tx.update(roomRef, {
          status: 'spy_guess',
          activeVote: {
            ...room.activeVote,
            votes: nextVotes,
          },
          pendingSpyGuess: null,
          updatedAt: FieldValue.serverTimestamp(),
        });

        return {
          systemMessage: `Semua pemilih sepakat menuduh ${room.activeVote.targetName}! Mata-Mata mendapat kesempatan terakhir menebak lokasi.`,
        };
      }

      // Still pending more votes
      tx.update(roomRef, {
        activeVote: {
          ...room.activeVote,
          votes: nextVotes,
        },
        updatedAt: FieldValue.serverTimestamp(),
      });

      return { systemMessage: null };
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const { status, message } = toErrorResponse(err);
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
