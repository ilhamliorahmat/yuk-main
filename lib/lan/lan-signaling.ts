import type { LanSignalPacket } from './lan-protocol';

const SIGNAL_PREFIX_DEFLATE = 'YMLAN1:';
const SIGNAL_PREFIX_PLAIN = 'YMLAN0:';

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const b64 =
    typeof btoa === 'function'
      ? btoa(binary)
      : Buffer.from(bytes).toString('base64');
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(str: string): Uint8Array {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (str.length % 4)) % 4);
  if (typeof atob === 'function') {
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }
  return new Uint8Array(Buffer.from(padded, 'base64'));
}

async function compressRaw(input: Uint8Array): Promise<Uint8Array | null> {
  if (typeof CompressionStream === 'undefined') return null;
  try {
    const cs = new CompressionStream('deflate-raw');
    const writer = cs.writable.getWriter();
    await writer.write(new Uint8Array(input));
    await writer.close();
    const out = await new Response(cs.readable).arrayBuffer();
    return new Uint8Array(out);
  } catch {
    return null;
  }
}

async function decompressRaw(input: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('Browser tidak mendukung DecompressionStream untuk kode LAN terkompresi.');
  }
  const ds = new DecompressionStream('deflate-raw');
  const writer = ds.writable.getWriter();
  await writer.write(new Uint8Array(input));
  await writer.close();
  const out = await new Response(ds.readable).arrayBuffer();
  return new Uint8Array(out);
}

/**
 * Strips unnecessary non-host candidates from DataChannel SDP while preserving
 * 100% browser validity across Chrome, Edge, Firefox, Android, and iOS Safari.
 */
export function compactLanSdp(rawSdp: string): string {
  const lines = rawSdp.replace(/\r\n/g, '\n').split('\n');
  const kept: string[] = [];
  let hostCandidateCount = 0;

  for (const line of lines) {
    if (!line) continue;
    if (line.startsWith('a=candidate:')) {
      // Keep only local host UDP candidates (cap at 4 to keep QR compact & clean)
      const isHost = line.includes(' typ host');
      const isUdp = /\budp\b/i.test(line);
      if (isHost && isUdp && hostCandidateCount < 4) {
        kept.push(line);
        hostCandidateCount += 1;
      }
      continue;
    }
    kept.push(line);
  }

  return `${kept.join('\r\n')}\r\n`;
}

/**
 * Encodes a LAN Offer/Answer packet into a compact QR-friendly string (`YMLAN1:...`).
 */
export async function encodeLanSignal(packet: LanSignalPacket): Promise<string> {
  const compacted: LanSignalPacket = {
    ...packet,
    s: compactLanSdp(packet.s),
  };
  const jsonBytes = new TextEncoder().encode(JSON.stringify(compacted));
  const deflated = await compressRaw(jsonBytes);

  if (deflated && deflated.length < jsonBytes.length) {
    return `${SIGNAL_PREFIX_DEFLATE}${toBase64Url(deflated)}`;
  }
  return `${SIGNAL_PREFIX_PLAIN}${toBase64Url(jsonBytes)}`;
}

/**
 * Decodes a scanned QR or pasted LAN signal string back into a validated packet.
 */
export async function decodeLanSignal(raw: string): Promise<LanSignalPacket> {
  const trimmed = raw.trim();
  let jsonBytes: Uint8Array;

  if (trimmed.startsWith(SIGNAL_PREFIX_DEFLATE)) {
    const b64 = trimmed.slice(SIGNAL_PREFIX_DEFLATE.length);
    jsonBytes = await decompressRaw(fromBase64Url(b64));
  } else if (trimmed.startsWith(SIGNAL_PREFIX_PLAIN)) {
    const b64 = trimmed.slice(SIGNAL_PREFIX_PLAIN.length);
    jsonBytes = fromBase64Url(b64);
  } else {
    throw new Error('Kode QR bukan undangan LAN Party Yuk Main yang valid.');
  }

  const parsed = JSON.parse(new TextDecoder().decode(jsonBytes)) as Partial<LanSignalPacket>;
  if (
    !parsed ||
    parsed.v !== 1 ||
    (parsed.t !== 'O' && parsed.t !== 'A') ||
    typeof parsed.s !== 'string' ||
    !parsed.s.includes('m=application')
  ) {
    throw new Error('Isi kode LAN Party rusak atau tidak lengkap.');
  }

  return parsed as LanSignalPacket;
}

/**
 * Waits for local Wi-Fi/Hotspot ICE candidates to finish gathering (zero STUN/TURN servers!).
 * Resolves immediately on `complete` or after `timeoutMs` once at least one candidate exists.
 */
export function waitForLocalIceGathering(
  pc: RTCPeerConnection,
  timeoutMs = 2400,
): Promise<void> {
  if (pc.iceGatheringState === 'complete') {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    let settled = false;
    let candidateCount = 0;

    const finish = () => {
      if (settled) return;
      settled = true;
      pc.removeEventListener('icegatheringstatechange', onStateChange);
      pc.removeEventListener('icecandidate', onCandidate);
      clearTimeout(timer);
      resolve();
    };

    const onStateChange = () => {
      if (pc.iceGatheringState === 'complete') {
        finish();
      }
    };

    const onCandidate = (ev: RTCPeerConnectionIceEvent) => {
      if (!ev.candidate) {
        finish();
      } else {
        candidateCount += 1;
        // Once we have 2+ local candidates, give a short 350ms grace window so QR pops up fast
        if (candidateCount >= 2) {
          setTimeout(finish, 350);
        }
      }
    };

    const timer = setTimeout(finish, timeoutMs);
    pc.addEventListener('icegatheringstatechange', onStateChange);
    pc.addEventListener('icecandidate', onCandidate);
  });
}

/**
 * Creates a zero-internet RTCPeerConnection configured strictly for local LAN/Hotspot Wi-Fi.
 */
export function createZeroInternetPeerConnection(): RTCPeerConnection {
  if (typeof RTCPeerConnection === 'undefined') {
    throw new Error('Peramban ini tidak mendukung WebRTC untuk Mode LAN Party.');
  }
  return new RTCPeerConnection({
    iceServers: [],
    iceCandidatePoolSize: 0,
  });
}
