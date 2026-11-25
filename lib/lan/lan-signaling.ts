import type { LanSdpDiagnostics, LanSignalPacket } from './lan-protocol';

const SIGNAL_PREFIX_DEFLATE = 'YMLAN1:';
const SIGNAL_PREFIX_PLAIN = 'YMLAN0:';

const LAN_STUN_SERVERS: RTCIceServer[] = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
];

interface ParsedCandidate {
  raw: string;
  foundation: string;
  protocol: 'udp' | 'tcp';
  priority: number;
  address: string;
  port: number;
  type: 'host' | 'srflx' | 'prflx' | 'relay';
  tcpType?: 'active' | 'passive' | 'so';
  score: number;
}

interface CompactMinimalSdp {
  /** ice-ufrag */
  u: string;
  /** ice-pwd */
  p: string;
  /** sha-256 fingerprint hex without colons */
  f: string;
  /** setup role: a=actpass, c=active, p=passive */
  d: 'a' | 'c' | 'p';
  /** mid (omitted if '0') */
  m?: string;
  /** sctp-port (omitted if 5000) */
  sp?: number;
  /** compact candidate tuples: "<u|t>|<ip>|<port>|<h|s>[|<a|p|s>]" */
  k: string[];
}

interface WireLanPacketV2 {
  v: 2;
  t: 'O' | 'A';
  m: CompactMinimalSdp;
  r?: string;
  g?: LanSignalPacket['g'];
  h?: string;
  u?: string;
  n?: string;
  c?: string;
  st?: 1;
}

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

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, fallback: () => T): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let done = false;
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      resolve(fallback());
    }, timeoutMs);

    promise
      .then((val) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve(val);
      })
      .catch((err) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        reject(err);
      });
  });
}

/**
 * Deadlock-safe deflate-raw compression:
 * Always drains `cs.readable` CONCURRENTLY with `writer.write()` / `writer.close()`
 * so Android Chrome Web Streams never deadlocks on internal backpressure!
 */
async function compressRaw(input: Uint8Array): Promise<Uint8Array | null> {
  if (typeof CompressionStream === 'undefined') return null;
  try {
    const run = async (): Promise<Uint8Array | null> => {
      const cs = new CompressionStream('deflate-raw');
      const readPromise = new Response(cs.readable).arrayBuffer();
      const writer = cs.writable.getWriter();
      const writePromise = (async () => {
        await writer.write(new Uint8Array(input));
        await writer.close();
      })();
      const [out] = await Promise.all([readPromise, writePromise]);
      return new Uint8Array(out);
    };
    return await withTimeout(run(), 1500, () => null);
  } catch {
    return null;
  }
}

/**
 * Deadlock-safe deflate-raw decompression with concurrent readable draining.
 */
async function decompressRaw(input: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('Browser tidak mendukung DecompressionStream untuk kode LAN terkompresi.');
  }
  const ds = new DecompressionStream('deflate-raw');
  const readPromise = new Response(ds.readable).arrayBuffer();
  const writer = ds.writable.getWriter();
  const writePromise = (async () => {
    await writer.write(new Uint8Array(input));
    await writer.close();
  })();
  const [out] = await Promise.all([readPromise, writePromise]);
  return new Uint8Array(out);
}

export function isPrivateLanIpv4(address: string): boolean {
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(address)) return true;
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(address)) return true;
  const m = address.match(/^172\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/);
  if (m) {
    const second = Number(m[1]);
    return second >= 16 && second <= 31;
  }
  return false;
}

function isIpv4Address(address: string): boolean {
  return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(address);
}

function isMdnsAddress(address: string): boolean {
  return /\.local$/i.test(address);
}

function isLoopbackOrLinkLocal(address: string): boolean {
  const lower = address.toLowerCase();
  return (
    lower === '127.0.0.1' ||
    lower === '0.0.0.0' ||
    lower === '::1' ||
    lower.startsWith('fe80:') ||
    lower.startsWith('169.254.')
  );
}

function parseCandidateLine(line: string, allowStun: boolean): ParsedCandidate | null {
  if (!line.startsWith('a=candidate:')) return null;
  const body = line.slice('a=candidate:'.length).trim();
  const parts = body.split(/\s+/);
  if (parts.length < 8) return null;

  const foundation = parts[0];
  const protocolRaw = parts[2]?.toLowerCase();
  if (protocolRaw !== 'udp' && protocolRaw !== 'tcp') return null;

  const priority = Number(parts[3]);
  const address = parts[4];
  const port = Number(parts[5]);
  if (!address || !Number.isFinite(port) || port < 0 || port > 65535) return null;

  const typIdx = parts.indexOf('typ');
  const typeRaw = typIdx >= 0 ? parts[typIdx + 1]?.toLowerCase() : '';
  if (typeRaw !== 'host' && typeRaw !== 'srflx' && typeRaw !== 'prflx' && typeRaw !== 'relay') {
    return null;
  }
  if (typeRaw === 'srflx' && !allowStun) return null;
  if (typeRaw === 'prflx' || typeRaw === 'relay') return null;

  const tcpTypeIdx = parts.indexOf('tcptype');
  const tcpTypeRaw = tcpTypeIdx >= 0 ? parts[tcpTypeIdx + 1]?.toLowerCase() : undefined;
  const tcpType =
    tcpTypeRaw === 'active' || tcpTypeRaw === 'passive' || tcpTypeRaw === 'so'
      ? tcpTypeRaw
      : undefined;

  if (isLoopbackOrLinkLocal(address)) return null;

  let score = 0;
  if (typeRaw === 'host' && protocolRaw === 'udp' && isPrivateLanIpv4(address)) {
    score = 120;
  } else if (typeRaw === 'host' && protocolRaw === 'udp' && isIpv4Address(address)) {
    score = 100;
  } else if (typeRaw === 'host' && protocolRaw === 'udp' && isMdnsAddress(address)) {
    score = 90;
  } else if (typeRaw === 'host' && protocolRaw === 'tcp' && isPrivateLanIpv4(address)) {
    score = 78;
  } else if (typeRaw === 'srflx' && protocolRaw === 'udp' && isIpv4Address(address)) {
    score = 70;
  } else if (typeRaw === 'host' && protocolRaw === 'udp' && address.includes(':')) {
    score = 45;
  } else if (typeRaw === 'host' && protocolRaw === 'tcp' && isMdnsAddress(address)) {
    score = 35;
  } else {
    return null;
  }

  return {
    raw: line,
    foundation: foundation || '1',
    protocol: protocolRaw,
    priority: Number.isFinite(priority) ? priority : 2122260223,
    address,
    port,
    type: typeRaw,
    tcpType,
    score,
  };
}

function selectPrioritizedCandidates(
  rawSdp: string,
  options?: { allowStun?: boolean; allowTcpHost?: boolean; maxCandidates?: number },
): ParsedCandidate[] {
  const allowStun = options?.allowStun ?? false;
  const allowTcpHost = options?.allowTcpHost ?? true;
  const maxCandidates = options?.maxCandidates ?? 6;

  const lines = rawSdp.replace(/\r\n/g, '\n').split('\n');
  const parsed: ParsedCandidate[] = [];
  const seen = new Set<string>();

  for (const line of lines) {
    const cand = parseCandidateLine(line.trim(), allowStun);
    if (!cand) continue;
    if (!allowTcpHost && cand.protocol === 'tcp') continue;
    const dedupeKey = `${cand.protocol}|${cand.address}|${cand.port}|${cand.type}|${cand.tcpType ?? ''}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    parsed.push(cand);
  }

  parsed.sort((a, b) => b.score - a.score || b.priority - a.priority);
  return parsed.slice(0, maxCandidates);
}

/**
 * Inspects an SDP string and reports human-readable LAN diagnostic info
 * so players immediately see whether a real Wi-Fi IPv4 or only mDNS was found.
 */
export function inspectLanSdpCandidates(rawSdp: string): LanSdpDiagnostics {
  const lines = rawSdp.replace(/\r\n/g, '\n').split('\n');
  let ipv4HostCount = 0;
  let mdnsCount = 0;
  let tcpHostCount = 0;
  let srflxCount = 0;
  let ipv6Count = 0;
  const ipv4Set = new Set<string>();

  for (const rawLine of lines) {
    const line = rawLine.trim();
    const cand = parseCandidateLine(line, true);
    if (!cand) continue;

    if (cand.type === 'srflx') {
      srflxCount += 1;
      continue;
    }

    if (cand.protocol === 'tcp') {
      tcpHostCount += 1;
    }

    if (isMdnsAddress(cand.address)) {
      mdnsCount += 1;
    } else if (isIpv4Address(cand.address)) {
      if (cand.protocol === 'udp') {
        ipv4HostCount += 1;
      }
      if (isPrivateLanIpv4(cand.address)) {
        ipv4Set.add(cand.address);
      }
    } else if (cand.address.includes(':')) {
      ipv6Count += 1;
    }
  }

  const totalCandidates = ipv4HostCount + mdnsCount + tcpHostCount + srflxCount + ipv6Count;
  const sampleIpv4s = Array.from(ipv4Set).slice(0, 2);

  if (sampleIpv4s.length > 0) {
    return {
      ipv4HostCount,
      mdnsCount,
      tcpHostCount,
      srflxCount,
      ipv6Count,
      totalCandidates,
      sampleIpv4s,
      tone: 'ok',
      summary:
        srflxCount > 0
          ? `IP LAN siap (${sampleIpv4s[0]}) + STUN`
          : `IP LAN siap (${sampleIpv4s[0]})`,
    };
  }

  if (srflxCount > 0) {
    return {
      ipv4HostCount,
      mdnsCount,
      tcpHostCount,
      srflxCount,
      ipv6Count,
      totalCandidates,
      sampleIpv4s,
      tone: 'ok',
      summary: mdnsCount > 0 ? 'Jalur P2P siap (mDNS + STUN)' : 'Jalur P2P siap (STUN)',
    };
  }

  if (mdnsCount > 0 || ipv4HostCount > 0 || ipv6Count > 0) {
    return {
      ipv4HostCount,
      mdnsCount,
      tcpHostCount,
      srflxCount,
      ipv6Count,
      totalCandidates,
      sampleIpv4s,
      tone: 'warn',
      summary: 'Hanya mDNS (.local) — izinkan kamera/Wi-Fi agar IP LAN muncul langsung',
    };
  }

  return {
    ipv4HostCount,
    mdnsCount,
    tcpHostCount,
    srflxCount,
    ipv6Count,
    totalCandidates,
    sampleIpv4s,
    tone: 'error',
    summary: '0 alamat Wi-Fi lokal terdeteksi — pastikan Wi-Fi atau Hotspot aktif',
  };
}

/**
 * Strips unnecessary non-host candidates from DataChannel SDP while prioritizing
 * real private Wi-Fi IPv4 addresses ahead of IPv6/mDNS/virtual adapters.
 */
export function compactLanSdp(
  rawSdp: string,
  options?: { allowStun?: boolean; allowTcpHost?: boolean },
): string {
  const allowStun = options?.allowStun ?? false;
  const allowTcpHost = options?.allowTcpHost ?? false;

  const lines = rawSdp.replace(/\r\n/g, '\n').split('\n');
  const kept: string[] = [];

  for (const line of lines) {
    if (!line) continue;
    if (line.startsWith('a=candidate:') || line === 'a=end-of-candidates') {
      continue;
    }
    kept.push(line);
  }

  const bestCandidates = selectPrioritizedCandidates(rawSdp, {
    allowStun,
    allowTcpHost,
    maxCandidates: 6,
  });

  for (const c of bestCandidates) {
    kept.push(c.raw);
  }

  return `${kept.join('\r\n')}\r\n`;
}

function extractMinimalSdp(
  rawSdp: string,
  options?: { allowStun?: boolean },
): CompactMinimalSdp | null {
  const lines = rawSdp.replace(/\r\n/g, '\n').split('\n');
  let ufrag = '';
  let pwd = '';
  let fingerprintHex = '';
  let setup: 'a' | 'c' | 'p' = 'a';
  let mid = '0';
  let sctpPort = 5000;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line.startsWith('a=ice-ufrag:')) {
      ufrag = line.slice('a=ice-ufrag:'.length).trim();
    } else if (line.startsWith('a=ice-pwd:')) {
      pwd = line.slice('a=ice-pwd:'.length).trim();
    } else if (line.startsWith('a=fingerprint:sha-256 ')) {
      fingerprintHex = line
        .slice('a=fingerprint:sha-256 '.length)
        .trim()
        .replace(/:/g, '')
        .toUpperCase();
    } else if (line.startsWith('a=setup:')) {
      const role = line.slice('a=setup:'.length).trim();
      if (role === 'active') setup = 'c';
      else if (role === 'passive') setup = 'p';
      else setup = 'a';
    } else if (line.startsWith('a=mid:')) {
      mid = line.slice('a=mid:'.length).trim() || '0';
    } else if (line.startsWith('a=sctp-port:')) {
      const parsedPort = Number(line.slice('a=sctp-port:'.length).trim());
      if (Number.isFinite(parsedPort) && parsedPort > 0) {
        sctpPort = parsedPort;
      }
    }
  }

  if (!ufrag || !pwd || !/^[0-9A-F]{64}$/.test(fingerprintHex)) {
    return null;
  }

  const bestCandidates = selectPrioritizedCandidates(rawSdp, {
    allowStun: options?.allowStun ?? false,
    allowTcpHost: true,
    maxCandidates: 6,
  });

  const compactCandidates = bestCandidates.map((c) => {
    const proto = c.protocol === 'tcp' ? 't' : 'u';
    const typeCode = c.type === 'srflx' ? 's' : 'h';
    if (c.protocol === 'tcp' && c.tcpType) {
      const tcpCode = c.tcpType === 'active' ? 'a' : c.tcpType === 'passive' ? 'p' : 's';
      return `${proto}|${c.address}|${c.port}|${typeCode}|${tcpCode}`;
    }
    return `${proto}|${c.address}|${c.port}|${typeCode}`;
  });

  const minimal: CompactMinimalSdp = {
    u: ufrag,
    p: pwd,
    f: fingerprintHex,
    d: setup,
    k: compactCandidates,
  };
  if (mid !== '0') minimal.m = mid;
  if (sctpPort !== 5000) minimal.sp = sctpPort;
  return minimal;
}

function expandMinimalSdp(minimal: CompactMinimalSdp): string {
  const fpPairs: string[] = [];
  for (let i = 0; i < minimal.f.length; i += 2) {
    fpPairs.push(minimal.f.slice(i, i + 2));
  }
  const formattedFp = fpPairs.join(':');
  const setupRole =
    minimal.d === 'c' ? 'active' : minimal.d === 'p' ? 'passive' : 'actpass';
  const mid = minimal.m || '0';
  const sctpPort = minimal.sp || 5000;

  const lines: string[] = [
    'v=0',
    'o=- 1 2 IN IP4 127.0.0.1',
    's=-',
    't=0 0',
    `a=group:BUNDLE ${mid}`,
    'a=msid-semantic: WMS',
    'm=application 9 UDP/DTLS/SCTP webrtc-datachannel',
    'c=IN IP4 0.0.0.0',
    `a=ice-ufrag:${minimal.u}`,
    `a=ice-pwd:${minimal.p}`,
    'a=ice-options:trickle',
    `a=fingerprint:sha-256 ${formattedFp}`,
    `a=setup:${setupRole}`,
    `a=mid:${mid}`,
    `a=sctp-port:${sctpPort}`,
    'a=max-message-size:262144',
  ];

  minimal.k.forEach((entry, idx) => {
    const parts = entry.split('|');
    if (parts.length < 4) return;
    const proto = parts[0] === 't' ? 'tcp' : 'udp';
    const ip = parts[1];
    const port = Number(parts[2]);
    const type = parts[3] === 's' ? 'srflx' : 'host';
    if (!ip || !Number.isFinite(port)) return;

    const priority =
      type === 'srflx'
        ? 1686052607 - idx
        : proto === 'tcp'
          ? 1518280447 - idx
          : 2122260223 - idx;

    let candLine = `a=candidate:${idx + 1} 1 ${proto} ${priority} ${ip} ${port} typ ${type}`;
    if (type === 'srflx') {
      candLine += ' raddr 0.0.0.0 rport 0';
    }
    if (proto === 'tcp') {
      const tcpType =
        parts[4] === 'p' ? 'passive' : parts[4] === 's' ? 'so' : 'active';
      candLine += ` tcptype ${tcpType}`;
    }
    candLine += ' generation 0';
    lines.push(candLine);
  });

  lines.push('a=end-of-candidates');
  return `${lines.join('\r\n')}\r\n`;
}

/**
 * Encodes a LAN Offer/Answer packet into an ultra-compact QR-friendly string (`YMLAN1:...` or `YMLAN0:...`).
 * Uses minimal SDP v2 (~60% smaller than raw SDP) whenever possible, with automatic fallback to v1.
 */
export async function encodeLanSignal(
  packet: LanSignalPacket,
  options?: { allowStun?: boolean },
): Promise<string> {
  const allowStun = options?.allowStun ?? false;
  const minimal = extractMinimalSdp(packet.s, { allowStun });

  const wirePayload: WireLanPacketV2 | LanSignalPacket = minimal
    ? {
        v: 2,
        t: packet.t,
        m: minimal,
        ...(packet.r ? { r: packet.r } : {}),
        ...(packet.g ? { g: packet.g } : {}),
        ...(packet.h ? { h: packet.h } : {}),
        ...(packet.u ? { u: packet.u } : {}),
        ...(packet.n ? { n: packet.n } : {}),
        ...(packet.c ? { c: packet.c } : {}),
        ...(packet.st ? { st: packet.st } : {}),
      }
    : {
        ...packet,
        s: compactLanSdp(packet.s, { allowStun, allowTcpHost: true }),
      };

  const jsonBytes = new TextEncoder().encode(JSON.stringify(wirePayload));
  const deflated = await compressRaw(jsonBytes);

  if (deflated && deflated.length < jsonBytes.length) {
    return `${SIGNAL_PREFIX_DEFLATE}${toBase64Url(deflated)}`;
  }
  return `${SIGNAL_PREFIX_PLAIN}${toBase64Url(jsonBytes)}`;
}

/**
 * Decodes a scanned QR, pasted string, or quick-code mailbox signal back into a validated packet with full SDP.
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
    throw new Error('Kode bukan sinyal LAN Party Yuk Main yang valid.');
  }

  const parsed = JSON.parse(new TextDecoder().decode(jsonBytes)) as
    | Partial<LanSignalPacket>
    | Partial<WireLanPacketV2>;

  if (!parsed || (parsed.t !== 'O' && parsed.t !== 'A')) {
    throw new Error('Isi kode LAN Party rusak atau tidak lengkap.');
  }

  if (parsed.v === 2 && parsed.m && typeof parsed.m.u === 'string' && typeof parsed.m.p === 'string') {
    const reconstructedSdp = expandMinimalSdp(parsed.m);
    return {
      v: 1,
      t: parsed.t,
      s: reconstructedSdp,
      r: parsed.r,
      g: parsed.g,
      h: parsed.h,
      u: parsed.u,
      n: parsed.n,
      c: parsed.c,
      st: parsed.st,
    };
  }

  if (
    parsed.v !== 1 ||
    typeof parsed.s !== 'string' ||
    !parsed.s.includes('m=application')
  ) {
    throw new Error('Isi kode LAN Party rusak atau tidak lengkap.');
  }

  return parsed as LanSignalPacket;
}

/**
 * Attaches ICE listeners BEFORE calling `setLocalDescription`, preventing the race condition
 * where fast local candidates fire before listeners are registered.
 * Resolves once gathering completes, or shortly after a private IPv4 LAN candidate arrives.
 */
export async function setLocalDescriptionAndGatherIce(
  pc: RTCPeerConnection,
  description: RTCSessionDescriptionInit,
  options?: { timeoutMs?: number; waitForStun?: boolean },
): Promise<void> {
  const timeoutMs = options?.timeoutMs ?? 3200;
  const waitForStun = options?.waitForStun ?? false;

  const gatheringDone = new Promise<void>((resolve) => {
    let settled = false;
    let graceTimer: ReturnType<typeof setTimeout> | null = null;
    let hasPrivateIpv4 = false;
    let hasSrflx = false;

    const finish = () => {
      if (settled) return;
      settled = true;
      pc.removeEventListener('icegatheringstatechange', onStateChange);
      pc.removeEventListener('icecandidate', onCandidate);
      clearTimeout(hardTimer);
      if (graceTimer) clearTimeout(graceTimer);
      resolve();
    };

    const scheduleGrace = (ms: number) => {
      if (graceTimer) return;
      graceTimer = setTimeout(finish, ms);
    };

    const onStateChange = () => {
      if (pc.iceGatheringState === 'complete') {
        finish();
      }
    };

    const onCandidate = (ev: RTCPeerConnectionIceEvent) => {
      if (!ev.candidate) {
        finish();
        return;
      }
      const line = ev.candidate.candidate || '';
      const parsed = parseCandidateLine(`a=${line.replace(/^a=/, '')}`, true);
      if (parsed) {
        if (parsed.type === 'host' && isPrivateLanIpv4(parsed.address)) {
          hasPrivateIpv4 = true;
        }
        if (parsed.type === 'srflx') {
          hasSrflx = true;
        }
      }

      if (waitForStun) {
        if (hasPrivateIpv4 && hasSrflx) {
          scheduleGrace(350);
        } else if (hasPrivateIpv4 || hasSrflx) {
          scheduleGrace(1100);
        }
      } else if (hasPrivateIpv4) {
        scheduleGrace(450);
      }
    };

    const hardTimer = setTimeout(finish, timeoutMs);
    pc.addEventListener('icegatheringstatechange', onStateChange);
    pc.addEventListener('icecandidate', onCandidate);
  });

  await pc.setLocalDescription(description);
  if (pc.iceGatheringState === 'complete') {
    return;
  }
  await gatheringDone;
}

/**
 * Legacy helper kept for compatibility: waits for ICE gathering to finish on an already-set local description.
 */
export function waitForLocalIceGathering(
  pc: RTCPeerConnection,
  timeoutMs = 2800,
): Promise<void> {
  if (pc.iceGatheringState === 'complete') {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      pc.removeEventListener('icegatheringstatechange', onStateChange);
      pc.removeEventListener('icecandidate', onCandidate);
      clearTimeout(timer);
      resolve();
    };
    const onStateChange = () => {
      if (pc.iceGatheringState === 'complete') finish();
    };
    const onCandidate = (ev: RTCPeerConnectionIceEvent) => {
      if (!ev.candidate) finish();
    };
    const timer = setTimeout(finish, timeoutMs);
    pc.addEventListener('icegatheringstatechange', onStateChange);
    pc.addEventListener('icecandidate', onCandidate);
  });
}

/**
 * Briefly unlocks real LAN IPv4 ICE candidates on Chrome/Android if camera permission
 * is already granted (or can be granted cleanly), without blocking if camera is busy/denied.
 */
export async function warmUpLocalIpPermission(): Promise<() => void> {
  if (
    typeof navigator === 'undefined' ||
    !navigator.mediaDevices ||
    !navigator.mediaDevices.getUserMedia
  ) {
    return () => {};
  }

  try {
    // Only auto-open camera silently if permission is already 'granted' (never surprise-prompt in split-screen)
    if (navigator.permissions && typeof navigator.permissions.query === 'function') {
      const status = await navigator.permissions.query({ name: 'camera' as PermissionName });
      if (status.state !== 'granted') {
        return () => {};
      }
    } else {
      return () => {};
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 160 }, height: { ideal: 120 } },
      audio: false,
    });
    return () => {
      stream.getTracks().forEach((t) => t.stop());
    };
  } catch {
    return () => {};
  }
}

/**
 * Creates an RTCPeerConnection for LAN Party.
 * - `useStun: false`: strict 0%-internet local Wi-Fi/Hotspot only (`iceServers: []`).
 * - `useStun: true`: Home Wi-Fi Quick-Code mode (prefers local 192.168.x.x first, STUN fallback if needed).
 */
export function createLanPeerConnection(options?: { useStun?: boolean }): RTCPeerConnection {
  if (typeof RTCPeerConnection === 'undefined') {
    throw new Error('Peramban ini tidak mendukung WebRTC untuk Mode LAN Party.');
  }
  const useStun = options?.useStun ?? false;
  return new RTCPeerConnection({
    iceServers: useStun ? LAN_STUN_SERVERS : [],
    iceCandidatePoolSize: 0,
  });
}

/**
 * Creates a zero-internet RTCPeerConnection configured strictly for local LAN/Hotspot Wi-Fi.
 */
export function createZeroInternetPeerConnection(): RTCPeerConnection {
  return createLanPeerConnection({ useStun: false });
}
