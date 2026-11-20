# Yuk Main Security Specification (Phase 0)

## 1. Data Invariants
1. **Secret Isolation & Selective Numpang Ownership:** A document in `/rooms/{roomId}/rounds/{roundId}/secrets/{playerId}` MUST ONLY be readable (`get`) during active play by an active room member who owns that seat (`request.auth.uid == playerId` or `players/{playerId}.controllerUid == request.auth.uid`). Listing `secrets` is unconditionally forbidden (`allow list: if false`). Read-only `Layar Panggung` cast displays never join `/players` and are denied secret reads until `status == 'round_end'`.
2. **Host, Phase Controller & In-Room Game Switch Authority:** Only `rooms/{roomId}.hostUid` may change lobby settings, switch `gameType` between games in `lobby`/`round_end`, open/close `Rekap Permainan`, start a round (`lobby -> playing`), or finalize round outcomes — EXCEPT in `fakta_hari_ini`, where phase transitions are strictly restricted to `faktaState.phaseControllerUid` (preferring a non-co-seated Bluffer when Host is Penebak).
3. **Public Stage Visibility vs Collection Scraping:** Exact `get` on `/rooms/{roomId}` (which contains strictly zero active secrets) supports read-only `Layar Panggung` displays resolved via `/roomCodes/{code}`, while `allow list` on `/rooms` remains locked to `resource.data.hostUid == request.auth.uid`.
4. **Invite Code Privacy:** `/roomCodes/{code}` allows exact `get` lookups for authenticated players/stage displays joining by code and forbids `list` queries.
5. **Identity, BRB & Temporal Integrity:** All user-owned documents enforce `uid == request.auth.uid` on creation, immutable `createdAt`/`uid` after creation, and `request.time` server timestamp alignment. `Numpang` co-seats may only be created in `lobby` by an active room member with `isHost == false` and `controllerUid == request.auth.uid`. Players may only toggle `isBrb` on their own seats.
6. **Dial & Suit Duel Submission Isolation:** Each seat owner (or their `Numpang` controller) may only write `/rooms/{roomId}/rounds/{roundId}/submissions/{playerId}` with bounded integer `guessValue` (`0..100`) during `satu_frekuensi` or `suitPick in ['batu', 'gunting', 'kertas']` during an active `Rekap Permainan` tiebreaker duel.
7. **Zero-Leak Bluffer Awareness, Bounded Scoring & 15s Auto-Reset:** In `fakta_hari_ini`, the `penebak` secret omits all fact and truth-teller fields. Per-transaction score increments are capped at `+11` for `fakta_hari_ini` and `+6` for all other games; score resets to `0` are restricted to Host game-switches, recaps, or expired empty-room auto-resets (`>= 15s` after last real player leaves/disconnects, ignoring `isStage: true` displays).

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
