# Yuk Main Security Specification (Phase 0)

## 1. Data Invariants
1. **Secret Isolation:** A document in `/rooms/{roomId}/rounds/{roundId}/secrets/{playerId}` MUST ONLY be readable (`get`) by the authenticated user whose `request.auth.uid == playerId` and who is an active member of `/rooms/{roomId}/players/{playerId}`. Listing `secrets` is unconditionally forbidden (`allow list: if false`).
2. **Host & Phase Controller Authority:** Only `rooms/{roomId}.hostUid` may change lobby settings (`roundDurationSec`, `spyMode`, `enabledPacks`, `customLocations`, `customSpectrums`, `customFacts`), start a round (`lobby -> playing`), or finalize round outcomes (`round_end`) — EXCEPT in `fakta_hari_ini`, where phase transitions (`announcement -> briefing -> reveal`) are strictly restricted to `faktaState.phaseControllerUid` (which is never the `guesserUid` when the Host is playing as Penebak).
3. **Member-Gated Room Visibility:** Rooms in `playing`, `voting`, `spy_guess`, or `round_end` states may ONLY be read by members present in `/rooms/{roomId}/players/{request.auth.uid}`. Public room scraping via `allow list` on `/rooms` is blocked except where `resource.data.hostUid == request.auth.uid`.
4. **Invite Code Privacy:** `/roomCodes/{code}` allows exact `get` lookups for authenticated players joining by code and forbids `list` queries.
5. **Identity & Temporal Integrity:** All user-owned documents enforce `uid == request.auth.uid` on creation, immutable `createdAt`/`uid`/`hostUid` after creation (except explicit host transfer), and `request.time` server timestamp alignment.
6. **Dial Submission Isolation (`satu_frekuensi`):** Each player may only write their own `/rooms/{roomId}/rounds/{roundId}/submissions/{playerId}` document (`request.auth.uid == playerId`) with bounded integer `dialPosition` (`0..100`) while `frequencyState.phase == 'dialing'`, preventing cross-player dial tampering.
7. **Zero-Leak Bluffer Awareness & Bounded Scoring (`fakta_hari_ini`):** The `penebak` secret document contains no `factTitle`, `factStatement`, `factTwist`, or `truthTellerUid`. Only `bluffer` secret documents receive the shared `truthTellerUid`/`truthTellerName` awareness. Per-transaction score increments are capped at `+11` for `fakta_hari_ini` (max `N - 1` for 12 players) and `+6` for all other games.

## 2. "Dirty Dozen" Adversarial Payloads (Must Return PERMISSION_DENIED)
1. **Cross-Player Secret Snooping:** Spy (`uid_spy`) or Penebak (`uid_guesser`) calls `getDoc` on `/rooms/{roomId}/rounds/{roundId}/secrets/{uid_other}` to learn the secret location, dial target, or Pembawa Fakta.
2. **Secrets Collection Scraping:** Any player (including Host) calls `getDocs` (`list`) on `/rooms/{roomId}/rounds/{roundId}/secrets`.
3. **Identity Spoofing on Profile Create:** Attacker (`uid_a`) writes `/users/uid_b` or sets `uid: "uid_b"` in `/users/uid_a`.
4. **Shadow Field Injection on Room Update:** Player adds `{ isAdmin: true, secretLocation: "Hack" }` to `/rooms/{roomId}` during a vote or phase update.
5. **Non-Host Round Start / Unauthorized Phase Advance:** Regular member attempts to transition `/rooms/{roomId}` from `lobby` to `playing`, or a Host who is currently `guesserUid` in `fakta_hari_ini` attempts to advance `faktaState.phase`.
6. **Self-Granted Score Inflation:** Player updates their own `/rooms/{roomId}/players/{uid}` document setting `score: 9999` or `isHost: true`.
7. **Room Code Enumeration:** Authenticated scraper calls `getDocs(collection(db, 'roomCodes'))` or `getDocs(collection(db, 'rooms'))` to harvest active lobbies.
8. **ID Poisoning / Oversized Payload:** Attacker attempts to create `/rooms/../../../evil` or a 1MB string inside `displayName`, `customLocations`, `customSpectrums`, or `customFacts`.
9. **Timestamp Forgery:** Client submits `createdAt: new Date(2099, 0, 1)` instead of `serverTimestamp()`.
10. **Vote / Dial Tampering:** Player (`uid_a`) writes to `activeVote.votes.uid_b` or `/submissions/uid_b`, or mutates `hostUid` while casting a vote/guess.
11. **Non-Member Vote / Guess:** Outsider not in `/rooms/{roomId}/players` attempts to write a vote, dial submission, or guess on `/rooms/{roomId}`.
12. **Unauthenticated Access:** Unauthenticated request attempts `get` or `write` on any collection.
