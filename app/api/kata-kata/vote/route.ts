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
  evaluateKataKataAfterElimination,
  evaluateKataKataVoteProgress,
} from '@/lib/games/kata-kata/engine';
import type {
  EliminationEntry,
  RoomDoc,
  RoomPlayerDoc,
  RoundResult,
  ServerRoundStateDoc,
} from '@/lib/games/types';

interface VoteBody {
  roomId?: string;
  action?: 'initiate' | 'cast' | 'cancel';
  targetUid?: string;
  choice?: 'yes' | 'no';
}

export async function POST(req: NextRequest) {
  try {
    const caller = await requireAuthenticatedCaller(req);
    const body = (await req.json().catch(() => null)) as VoteBody | null;
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
      if (room.gameType !== 'kata_kata') {
        throw new ApiHttpError(400, 'Ruang ini bukan permainan Kata-Kata Hari Ini.');
      }

      const players = playersSnap.docs.map((d) => d.data() as RoomPlayerDoc);
      const callerPlayer = players.find((p) => p.uid === caller.uid);
      if (!callerPlayer) {
        throw new ApiHttpError(403, 'Kamu bukan anggota ruang permainan ini.');
      }

      const eliminatedUids = room.eliminatedUids ?? [];
      const eliminatedSet = new Set(eliminatedUids);

      if (action === 'initiate') {
        if (room.status !== 'playing') {
          throw new ApiHttpError(
            409,
            'Pemungutan suara hanya bisa dimulai saat permainan berlangsung.',
          );
        }
        if (eliminatedSet.has(caller.uid)) {
          throw new ApiHttpError(
            403,
            'Pemain yang sudah tereliminasi hanya bisa menonton hingga ronde selesai.',
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
        if (eliminatedSet.has(targetPlayer.uid)) {
          throw new ApiHttpError(400, 'Pemain tersebut sudah tereliminasi.');
        }

        tx.update(roomRef, {
          status: 'voting',
          activeVote: {
            initiatorUid: caller.uid,
            initiatorName: callerPlayer.displayName.slice(0, 40),
            targetUid: targetPlayer.uid,
            targetName: targetPlayer.displayName.slice(0, 40),
            startedAtMs: Date.now(),
            votes: { [caller.uid]: 'yes' },
          },
          pendingSpyGuess: null,
          updatedAt: FieldValue.serverTimestamp(),
        });

        return {
          systemMessage: `${callerPlayer.displayName} menuduh ${targetPlayer.displayName} sebagai Penyusup!`,
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
      if (eliminatedSet.has(caller.uid)) {
        throw new ApiHttpError(403, 'Pemain yang sudah tereliminasi tidak memiliki hak suara.');
      }
      if (room.activeVote.targetUid === caller.uid) {
        throw new ApiHttpError(403, 'Pemain yang sedang dituduh tidak memiliki hak suara.');
      }

      const choice = body?.choice;
      if (choice !== 'yes' && choice !== 'no') {
        throw new ApiHttpError(400, 'Pilihan suara harus "yes" atau "no".');
      }

      const nextVotes: Record<string, 'yes' | 'no'> = {
        ...room.activeVote.votes,
        [caller.uid]: choice,
      };

      const eligibleAliveVoters = players
        .map((p) => p.uid)
        .filter((uid) => !eliminatedSet.has(uid) && uid !== room.activeVote?.targetUid);

      const evaluation = evaluateKataKataVoteProgress(nextVotes, eligibleAliveVoters);

      if (evaluation.outcome === 'acquitted') {
        tx.update(roomRef, {
          status: 'playing',
          activeVote: null,
          pendingSpyGuess: null,
          updatedAt: FieldValue.serverTimestamp(),
        });

        return {
          systemMessage: `Voting terhadap ${room.activeVote.targetName} ditolak (${callerPlayer.displayName} tidak setuju). Diskusi berlanjut!`,
        };
      }

      if (evaluation.outcome === 'convicted') {
        if (!serverStateSnap.exists) {
          throw new ApiHttpError(500, 'Status rahasia ronde pada server tidak ditemukan.');
        }

        const serverState = serverStateSnap.data() as ServerRoundStateDoc;
        const citizenWord = serverState.citizenWord ?? serverState.locationName;
        const spyWord = serverState.spyWord ?? '';
        const targetUid = room.activeVote.targetUid;
        const targetName = room.activeVote.targetName;

        const elimEval = evaluateKataKataAfterElimination({
          allPlayerUids: players.map((p) => p.uid),
          previouslyEliminatedUids: eliminatedUids,
          eliminatedUid: targetUid,
          spyUids: serverState.spyUids,
        });

        const nextEliminatedUids = [...eliminatedUids, targetUid];
        const nextEliminationLog: EliminationEntry[] = [
          ...(room.eliminationLog ?? []),
          {
            uid: targetUid,
            displayName: targetName,
            wasSpy: elimEval.wasSpy,
            eliminatedAtMs: Date.now(),
          },
        ];

        if (elimEval.outcome === 'final_spy_last_chance') {
          tx.update(roomRef, {
            status: 'spy_guess',
            eliminatedUids: nextEliminatedUids,
            eliminationLog: nextEliminationLog,
            activeVote: {
              ...room.activeVote,
              votes: nextVotes,
            },
            pendingSpyGuess: {
              spyUid: targetUid,
              spyName: targetName,
              guessedLocation: '',
              submittedAtMs: Date.now(),
            },
            updatedAt: FieldValue.serverTimestamp(),
          });

          return {
            systemMessage: `${targetName} tereliminasi dan ternyata PENYUSUP TERAKHIR! ${targetName} mendapat 1 Kesempatan Terakhir menebak Kata Warga!`,
          };
        }

        if (elimEval.outcome === 'spies_outnumber') {
          const deltas = calculateKataKataScoreDeltas({
            playerUids: players.map((p) => p.uid),
            spyUids: serverState.spyUids,
            winnerTeam: 'mata_mata',
            initiatorUid: room.activeVote.initiatorUid,
            victoryType: 'spies_outnumber',
          });

          const reason = `${targetName} tereliminasi (${elimEval.wasSpy ? 'Penyusup' : 'Warga'}). Penyusup yang tersisa kini menyamai jumlah Warga!`;

          const roundResult: RoundResult = {
            roundNumber: room.roundNumber,
            winnerTeam: 'mata_mata',
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
            eliminatedUids: nextEliminatedUids,
            eliminationLog: nextEliminationLog,
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
            systemMessage: `${reason} Tim Penyusup memenangkan ronde ini!`,
          };
        }

        // Continue multi-round elimination!
        tx.update(roomRef, {
          status: 'playing',
          eliminatedUids: nextEliminatedUids,
          eliminationLog: nextEliminationLog,
          activeVote: null,
          pendingSpyGuess: null,
          updatedAt: FieldValue.serverTimestamp(),
        });

        return {
          systemMessage: elimEval.wasSpy
            ? `${targetName} tereliminasi dan ternyata PENYUSUP! Masih ada ${elimEval.remainingSpyUids.length} Penyusup tersisa—permainan berlanjut!`
            : `${targetName} tereliminasi dan ternyata WARGA! Hati-hati, Penyusup masih berkeliaran!`,
        };
      }

      // Still pending votes
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
