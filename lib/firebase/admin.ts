import { getApp, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import type { NextRequest } from 'next/server';

const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'yuk-main';
const databaseId = process.env.NEXT_PUBLIC_FIREBASE_DATABASE_ID;

function getAdminApp(): App {
  if (getApps().length > 0) {
    return getApp();
  }
  return initializeApp({ projectId });
}

export const adminApp: App = getAdminApp();

export const adminDb: Firestore =
  databaseId && databaseId !== '(default)'
    ? getFirestore(adminApp, databaseId)
    : getFirestore(adminApp);

export const adminAuth: Auth = getAuth(adminApp);

export interface AuthenticatedCaller {
  uid: string;
  name: string;
  isAnonymous: boolean;
}

export class ApiHttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function requireAuthenticatedCaller(
  req: NextRequest,
): Promise<AuthenticatedCaller> {
  const customToken = req.headers.get('x-firebase-token')?.trim();
  const authHeader = req.headers.get('authorization') || '';
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  const token = customToken || match?.[1]?.trim();

  if (!token) {
    throw new ApiHttpError(401, 'Sesi autentikasi tidak ditemukan. Silakan masuk kembali.');
  }

  let decoded;
  try {
    decoded = await adminAuth.verifyIdToken(token);
  } catch {
    throw new ApiHttpError(401, 'Token sesi tidak valid atau kedaluwarsa. Muat ulang halaman.');
  }

  const provider = decoded.firebase?.sign_in_provider;
  const isAllowed = provider === 'anonymous' || decoded.email_verified === true;
  if (!isAllowed) {
    throw new ApiHttpError(403, 'Akun belum terverifikasi untuk bermain.');
  }

  return {
    uid: decoded.uid,
    name: (typeof decoded.name === 'string' && decoded.name.trim()) || 'Pemain',
    isAnonymous: provider === 'anonymous',
  };
}

export function toErrorResponse(err: unknown): { status: number; message: string } {
  if (err instanceof ApiHttpError) {
    return { status: err.status, message: err.message };
  }

  const rawMessage = err instanceof Error ? err.message : String(err);
  const code = (err as { code?: unknown })?.code;

  if (
    code === 7 ||
    code === 'permission-denied' ||
    rawMessage.includes('PERMISSION_DENIED') ||
    rawMessage.includes('7 PERMISSION_DENIED')
  ) {
    return {
      status: 503,
      message:
        'Server Game Master belum memiliki izin akses Firestore (roles/datastore.user) di project yuk-main.',
    };
  }

  return {
    status: 500,
    message: rawMessage || 'Terjadi kesalahan pada Server Game Master.',
  };
}
