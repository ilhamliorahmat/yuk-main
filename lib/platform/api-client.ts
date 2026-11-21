'use client';

let inMemoryAuthToken: string | null = null;

type RoomSyncListener = () => void;
const roomSyncListeners = new Map<string, Set<RoomSyncListener>>();

export function setMemoryAuthToken(token: string | null): void {
  inMemoryAuthToken = token;
}

export function getMemoryAuthToken(): string | null {
  return inMemoryAuthToken;
}

export function notifyRoomMutated(roomId: string): void {
  const listeners = roomSyncListeners.get(roomId);
  if (!listeners) return;
  for (const cb of listeners) {
    try {
      cb();
    } catch {
      // Ignore subscriber error
    }
  }
}

export function subscribeRoomMutation(roomId: string, listener: RoomSyncListener): () => void {
  let set = roomSyncListeners.get(roomId);
  if (!set) {
    set = new Set();
    roomSyncListeners.set(roomId, set);
  }
  set.add(listener);
  return () => {
    const current = roomSyncListeners.get(roomId);
    if (!current) return;
    current.delete(listener);
    if (current.size === 0) {
      roomSyncListeners.delete(roomId);
    }
  };
}

export function buildPhpApiUrl(
  route: string,
  query?: Record<string, string | number | boolean | undefined>,
): string {
  const base = (process.env.NEXT_PUBLIC_API_BASE_URL ?? '').replace(/\/+$/, '');
  const cleanRoute = route.replace(/^\/+/, '');
  const params = new URLSearchParams();
  params.set('r', cleanRoute);

  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined) continue;
      params.set(k, String(v));
    }
  }

  return `${base}/api/index.php?${params.toString()}`;
}

export class ApiRequestError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
  }
}

export async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers ?? {});
  if (!headers.has('X-Requested-With')) {
    headers.set('X-Requested-With', 'XMLHttpRequest');
  }
  if (!headers.has('Content-Type') && init?.body && typeof init.body === 'string') {
    headers.set('Content-Type', 'application/json');
  }
  if (inMemoryAuthToken && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${inMemoryAuthToken}`);
  }

  const res = await fetch(url, {
    ...init,
    headers,
    credentials: 'include',
  });

  const text = await res.text();
  if (text.trimStart().startsWith('<?php')) {
    throw new ApiRequestError(
      'Server PHP belum aktif di pratinjau ini. Upload folder out/ ke hosting PHP + MySQL, atau gunakan Mode LAN Wi-Fi.',
      503,
    );
  }

  let parsed: Record<string, unknown> = {};
  if (text) {
    try {
      parsed = JSON.parse(text) as Record<string, unknown>;
    } catch {
      parsed = {};
    }
  }

  if (!res.ok) {
    const errMsg =
      typeof parsed.error === 'string' && parsed.error
        ? parsed.error
        : `Permintaan gagal (${res.status}).`;
    throw new ApiRequestError(errMsg, res.status);
  }

  return parsed as T;
}
