'use client';

import type { User } from 'firebase/auth';
import { doc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { getFirebaseServices } from '@/lib/firebase/client';
import { handleFirestoreError, OperationType } from '@/lib/firebase/errors';
import type { UserProfileDoc } from '@/lib/games/types';

const AVATAR_COLORS = [
  '#DC2626',
  '#D97706',
  '#059669',
  '#0284C7',
  '#4F46E5',
  '#9333EA',
  '#DB2777',
  '#0D9488',
];

export function pickAvatarColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

export async function upsertUserProfile(
  user: User,
  preferredName?: string,
): Promise<UserProfileDoc> {
  const { auth, db } = getFirebaseServices();
  if (!db) throw new Error('Firebase belum terkonfigurasi.');

  const userRef = doc(db, 'users', user.uid);
  const path = `users/${user.uid}`;
  const cleanName =
    (preferredName ?? user.displayName ?? 'Pemain').trim().slice(0, 40) || 'Pemain';
  const avatarColor = pickAvatarColor(user.uid);

  try {
    return await runTransaction(db, async (tx) => {
      const snap = await tx.get(userRef);
      if (!snap.exists()) {
        const payload: UserProfileDoc = {
          uid: user.uid,
          displayName: cleanName,
          avatarColor,
          isAnonymous: user.isAnonymous,
          gamesPlayed: 0,
          wins: 0,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };
        tx.set(userRef, payload);
        return payload;
      }

      const existing = snap.data() as UserProfileDoc;
      if (
        preferredName &&
        preferredName.trim() &&
        preferredName.trim() !== existing.displayName
      ) {
        tx.update(userRef, {
          displayName: cleanName,
          updatedAt: serverTimestamp(),
        });
        return { ...existing, displayName: cleanName };
      }
      return existing;
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path, auth);
  }
}
