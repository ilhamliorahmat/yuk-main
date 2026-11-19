# Yuk Main Security Specification (Phase 0)

## 1. Data Invariants
1. **Secret Isolation:** A document in `/rooms/{roomId}/rounds/{roundId}/secrets/{playerId}` MUST ONLY be readable (`get`) by the authenticated user whose `request.auth.uid == playerId` and who is an active member of `/rooms/{roomId}/players/{playerId}`. Listing `secrets` is unconditionally forbidden (`allow list: if false`).
2. **Host Authority:** Only `rooms/{roomId}.hostUid` may change `roundDurationSec`, `spyMode`, `enabledPacks`, `customLocations`, start a round (`lobby -> playing`), or finalize round outcomes (`round_end`).
3. **Member-Gated Room Visibility:** Rooms in `playing`, `voting`, `spy_guess`, or `round_end` states may ONLY be read by members present in `/rooms/{roomId}/players/{request.auth.uid}`. Public room scraping via `allow list` on `/rooms` is blocked except where `resource.data.hostUid == request.auth.uid`.
4. **Invite Code Privacy:** `/roomCodes/{code}` allows exact `get` lookups for authenticated players joining by code and forbids `list` queries.
5. **Identity & Temporal Integrity:** All user-owned documents enforce `uid == request.auth.uid` on creation, immutable `createdAt`/`uid`/`hostUid` after creation (except explicit host transfer), and `request.time` server timestamp alignment.

## 2. "Dirty Dozen" Adversarial Payloads (Must Return PERMISSION_DENIED)
1. **Cross-Player Secret Snooping:** Spy (`uid_spy`) calls `getDoc` on `/rooms/{roomId}/rounds/{roundId}/secrets/{uid_warga}` to learn the secret location.
2. **Secrets Collection Scraping:** Any player (including Host) calls `getDocs` (`list`) on `/rooms/{roomId}/rounds/{roundId}/secrets`.
3. **Identity Spoofing on Profile Create:** Attacker (`uid_a`) writes `/users/uid_b` or sets `uid: "uid_b"` in `/users/uid_a`.
4. **Shadow Field Injection on Room Update:** Player adds `{ isAdmin: true, secretLocation: "Hack" }` to `/rooms/{roomId}` during a vote update.
5. **Non-Host Round Start Hijack:** Regular member (`uid_guest`) attempts to transition `/rooms/{roomId}` from `lobby` to `playing` and overwrite `selectedLocationNames`.
6. **Self-Granted Score Inflation:** Player updates their own `/rooms/{roomId}/players/{uid}` document setting `score: 9999` or `isHost: true`.
7. **Room Code Enumeration:** Authenticated scraper calls `getDocs(collection(db, 'roomCodes'))` or `getDocs(collection(db, 'rooms'))` to harvest active lobbies.
8. **ID Poisoning / Oversized Payload:** Attacker attempts to create `/rooms/../../../evil` or a 1MB string inside `displayName` or `customLocations`.
9. **Timestamp Forgery:** Client submits `createdAt: new Date(2099, 0, 1)` instead of `serverTimestamp()`.
10. **Vote Tampering:** Player (`uid_a`) writes to `activeVote.votes.uid_b` or mutates `hostUid` while casting a vote.
11. **Non-Member Vote / Spy Guess:** Outsider not in `/rooms/{roomId}/players` attempts to write a vote or spy guess on `/rooms/{roomId}`.
12. **Unauthenticated Access:** Unauthenticated request attempts `get` or `write` on any collection.
