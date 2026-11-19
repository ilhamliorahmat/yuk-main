# Yuk Main — Indonesian Multiplayer Party Game Hub

> **Current Release:** `3.0.0` (`Version.Iteration.build`)  
> **License:** PolyForm Noncommercial License 1.0.0 — Copyright © 2026 **Ilham Liorahmat**

[Read in English](#english) · [Baca dalam Bahasa Indonesia](#bahasa-indonesia)

---

<a id="english"></a>

## English

**Yuk Main** is an Indonesian-localized, mobile-first multiplayer party game hub built with **Next.js 15 (App Router)**, **React 19**, **Tailwind CSS v4**, and **Firebase** (Authentication, Cloud Firestore, and Realtime Database).

It brings together **4 Indonesian party games** under one modular hub — **Game #1: Yang Bener Yang Mana**, **Game #2: Kata-Kata Hari Ini**, **Game #3: Satu Frekuensi**, and **Game #4: Fakta Hari Ini** — powered by a **100% Browser-Side Firebase Transaction Game Master** (`client-game-master.ts`), real-time RTDB chat & presence, custom content builders, and automated static export deployment to **InfinityFree** on the **Firebase Spark Free Plan** (zero Cloud Functions and zero billing card required).

### Key Features
- **Modular 4-Game Party Registry:** Extensible game catalog (`lib/games/registry.ts`), 2×2 hub showcase (`YukMainHub.tsx`), and single-subscription `ActiveRoomContainer` routing rooms cleanly by `gameType`.
- **Game #1 — Yang Bener Yang Mana** *(internal ID: `spyfall` · 3–12 players)*:
  - 26 curated Indonesian locations across 3 packs (*Nusantara & Kota*, *Klasik & Profesi*, *Seru & Fantasi*) plus a Host custom location & role builder.
  - **Privacy Shield Role Card** (tap to peek/hide on mobile) and interactive location deduction checklist.
- **Game #2 — Kata-Kata Hari Ini** *(internal ID: `kata_kata` · 3–12 players)*:
  - **True Blind-Spy Secrecy:** Even the Penyusup does not know they are a Penyusup—every player receives a secret word on an identical card, and `/secrets/{playerId}` strictly omits `isSpy`.
  - **Multi-Spy Mechanism:** Supports `1 Penyusup`, `2 Penyusup` (auto-enabled at ≥5 players), or `Acak (1–2)` with fairness clamping.
  - **Multi-Round Elimination & Last-Chance Guess:** Accusation voting eliminates players one by one; when the final Penyusup is caught, they get **1 Last-Chance Guess** to type **Kata Warga** and steal the win.
  - 36 curated Indonesian word pairs across 3 packs (*Kuliner & Jajanan*, *Keseharian & Tongkrongan*, *Hiburan, Alam & Budaya*) plus a Host **Custom Word-Pair Builder**.
- **Game #3 — Satu Frekuensi** *(internal ID: `satu_frekuensi` · 2–12 players)*:
  - **Telepathy Spectrum Dial:** Rotating **Penerawang** sees a secret target (`0–100`) on an Indonesian dual-pole spectrum and gives 1 clue; all other players lock their guess on an interactive **180° Frequency Dial** (drag pointer, slider, and `-5 / -1 / +1 / +5` precision buttons).
  - **Endless / Host-Paced Flow:** Zero countdown timer—rounds are built for relaxed conversation and only advance (`Petunjuk → Putar Dial → Reveal`) when the **Host** clicks **Fase Selanjutnya**.
  - **Proximity Scoring:** `±4` Bullseye (`+4`), `±10` Close (`+3`), `±16` Near (`+2`), plus a Penerawang bonus of `+1` per scoring guesser (capped at `+4`).
  - 80 curated Indonesian spectrums across 3 packs (*Tongkrongan*, *Kuliner & Jajanan*, *Budaya & Tren*) plus a Host **Custom Spectrum Builder**.
- **Game #4 — Fakta Hari Ini** *(internal ID: `fakta_hari_ini` · 3–12 players)*:
  - **Sequential Guesser Rotation & 2-Step Cards:** Every round starts with a public announcement card (`"[Name] jadi Penebak!"`). Once dismissed, the **Penebak** sees a spoiler-free Detective card, while all **Tim Bluffer** members receive a real fun fact with its twist wrapped in parentheses `(...)` (highlighting their space for improvisation).
  - **Random Truth-Teller & Full Bluffer Team Awareness:** Exactly 1 Bluffer is randomly appointed as **Pembawa Fakta Asli** (no FCFS race). Every Bluffer knows who the Pembawa Fakta is on their secret card and player panel, while that identity stays completely isolated from the Penebak.
  - **Team-Aligned Scoring:** If the **Penebak** picks the Pembawa Fakta, Penebak wins `+(N - 1)` points (`N` = total players, Bluffers get `0`). If the Penebak guesses wrong, **all `N - 1` Bluffers** (including the Pembawa Fakta) earn `+1` point together as a unified team.
  - **Endless Pacing + Host-Is-Guesser Safeguard:** No countdown timer. Normally the Host presses **Fase Selanjutnya**, except when the **Host is the Penebak**—the button is locked for the Host and a random non-guesser Bluffer is appointed as **Pengendali Fase** (with automatic failover if they leave).
  - 75 curated fun facts across 3 packs (*Hukum & Sejarah*, *Nusantara Unik*, *Sains & Alam*) plus a Host **Custom Fact Builder**.
- **Pure Client-Side Static Export Architecture:**
  - **Production (InfinityFree + Firebase Spark Free Plan):** Next.js static export (`STATIC_EXPORT=true` → `output: 'export'` → `./out/`) built with Bun and auto-deployed via FTPS. All game rounds, votes, dial locks, guesses, and atomic score updates run purely via Firestore transactions (`client-game-master.ts`) plus RTDB chat & `onDisconnect()` presence.
  - **Local / Dev Preview:** Standard Next.js mode (`output: 'standalone'`) running the exact same client-side Firebase stack with zero backend Node.js API routes.

---

### Project Structure

```text
yuk-main/
├── .github/
│   └── workflows/
│       └── deploy-infinityfree.yml        # CI/CD: test, lint, static export & FTPS upload to InfinityFree
├── app/
│   ├── globals.css                        # Tailwind CSS v4 styles & font stacks
│   ├── layout.tsx                         # Root layout (ErrorBoundary + AuthProvider + Indonesian metadata)
│   ├── not-found.tsx                      # Localized 404 page (static 404.html fallback)
│   └── page.tsx                           # Entry point (Hub vs ActiveRoomContainer + ?room=CODE auto-join)
├── components/
│   ├── ErrorBoundary.tsx                  # React error boundary for graceful recovery
│   ├── hub/
│   │   ├── AuthDialog.tsx                 # Google Sign-In & Anonymous Guest nickname modal
│   │   └── YukMainHub.tsx                 # Hero switcher, join-by-code form, and 2×2 game catalog
│   └── games/
│       ├── ActiveRoomContainer.tsx        # Single-subscription room shell routing all 4 game views
│       ├── spyfall/                       # Game #1: Yang Bener Yang Mana UI
│       │   ├── LobbySettingsPanel.tsx     # Duration, Spy mode, location packs & custom location builder
│       │   ├── PlayersAndVotePanel.tsx    # Roster, live scores, RTDB presence dot & accusation triggers
│       │   ├── RoomChatPanel.tsx          # Shared real-time RTDB chat & quick prompt pills
│       │   └── SpyfallRoomView.tsx        # 3-column desktop / 3-tab mobile Spyfall room
│       ├── kata-kata/                     # Game #2: Kata-Kata Hari Ini UI
│       │   ├── KataKataLobbySettings.tsx  # Duration, Multi-Spy mode, word packs & custom pair builder
│       │   ├── KataKataPlayersPanel.tsx   # Elimination tracker, live scores & accusation triggers
│       │   └── KataKataRoomView.tsx       # Blind-Spy card, voting & Last-Chance Guess view
│       ├── satu-frekuensi/                # Game #3: Satu Frekuensi UI
│       │   ├── FrequencyDial.tsx          # Interactive 180° semicircle dial, zones & spring needles
│       │   ├── SatuFrekuensiLobbySettings.tsx # Spectrum packs & custom spectrum builder
│       │   ├── SatuFrekuensiPlayersPanel.tsx  # Penerawang badge, dial lock indicators & live scores
│       │   └── SatuFrekuensiRoomView.tsx  # Host-paced clue, dialing & multi-pin reveal room
│       └── fakta-hari-ini/                # Game #4: Fakta Hari Ini UI
│           ├── FaktaHariIniLobbySettings.tsx  # Fact packs & custom parenthetical fact builder
│           ├── FaktaHariIniPlayersPanel.tsx   # Penebak, Pengendali Fase & Bluffer-only Pembawa Fakta badge
│           └── FaktaHariIniRoomView.tsx   # Announcement card, parenthetical fact card & guess reveal
├── hooks/
│   ├── use-auth.tsx                       # Firebase Auth context (Google + Anonymous Guest)
│   ├── use-mobile.ts                      # Responsive viewport helper
│   └── use-room-session.ts                # Live Firestore + RTDB subscriptions for an active room
├── lib/
│   ├── firebase/
│   │   ├── client.ts                      # Firebase Web SDK singleton (Auth, Firestore, RTDB)
│   │   ├── config.ts                      # Environment-driven Firebase Web SDK config
│   │   └── errors.ts                      # Structured FirestoreErrorInfo diagnostics
│   ├── games/
│   │   ├── registry.ts                    # Extensible 4-game party catalog metadata
│   │   ├── types.ts                       # Shared TypeScript interfaces for rooms, secrets & round state
│   │   ├── spyfall/                       # Game #1 engine, 26 locations & 9 Vitest specs
│   │   ├── kata-kata/                     # Game #2 engine, 36 word pairs & 9 Vitest specs
│   │   ├── satu-frekuensi/                # Game #3 engine, 80 spectrums & 6 Vitest specs
│   │   └── fakta-hari-ini/                # Game #4 engine, 75 facts & 7 Vitest specs
│   └── platform/
│       ├── chat-presence.ts               # RTDB chat messaging & onDisconnect() online presence
│       ├── client-game-master.ts          # 100% browser-side Firestore transaction Game Master (all 4 games)
│       ├── room-service.ts                # Room CRUD, host/controller failover & game action wrappers
│       └── user-profile.ts                # User profile persistence helper
├── public/
│   └── .htaccess                          # Apache rules for InfinityFree (HTTPS, 404 fallback, caching)
├── src/assets/images/                     # Cover artwork & emblem assets for all 4 games
├── database.rules.json                    # Firebase Realtime Database security rules
├── firebase-blueprint.json                # Schema blueprint for all Firestore entities & paths
├── firebase.json & .firebaserc            # Firebase CLI config (Firestore & RTDB rules)
├── firestore.rules                        # Zero-Trust Firestore security rules for all 4 games
├── next.config.ts                         # Dual config: STATIC_EXPORT=true (InfinityFree) vs standalone
├── security_spec.md                       # Security invariants & adversarial threat model
├── CONTRIBUTING.md                        # Contribution guidelines & Contributor License Grant
├── LICENSE                                # PolyForm Noncommercial License 1.0.0
└── README.md                              # Bilingual documentation & version changelog
```

---

### Data Structure (Hybrid Firestore + RTDB)

Yuk Main splits persistent structured game state (**Cloud Firestore**) from high-frequency ephemeral chat and disconnect-aware presence (**Firebase Realtime Database**).

#### 1. Cloud Firestore Collections

| Path | Document Schema / Key Fields | Client Security & Access Rules |
| :--- | :--- | :--- |
| `/users/{userId}` | `uid`, `displayName`, `avatarColor`, `isAnonymous`, `gamesPlayed`, `wins`, `createdAt`, `updatedAt` | Owner `get`, `create`, `update` (no `list` / `delete`) |
| `/roomCodes/{code}` | `code` (6-char uppercase), `roomId`, `hostUid`, `gameType`, `createdAt` | Signed-in exact `get`; Host `create`/`delete` (no `list`) |
| `/rooms/{roomId}` | `id`, `code`, `gameType` (`spyfall \| kata_kata \| satu_frekuensi \| fakta_hari_ini`), `hostUid`, `status` (`lobby \| playing \| voting \| spy_guess \| round_end`), `roundNumber`, `currentRoundId`, `roundDurationSec`, `roundEndsAtMs`, `firstSpeakerUid`, `spyMode`, `enabledPacks`, `selectedLocationNames`, `customLocations`, `customWordPairs`, `customSpectrums`, `customFacts`, `eliminatedUids`, `eliminationLog`, `activeVote`, `pendingSpyGuess`, `frequencyState`, `faktaState`, `lastRoundResult`, `createdAt`, `updatedAt` | Members/lobby `get`; Host creates & edits lobby settings; phase/round transitions enforced per game (in `fakta_hari_ini`, phase advances are strictly restricted to `faktaState.phaseControllerUid`, never a Host who is currently `guesserUid`) |
| `/rooms/{roomId}/players/{playerId}` | `uid`, `roomId`, `displayName`, `avatarColor`, `isHost`, `score`, `isReady`, `joinedAt`, `updatedAt` | Members `get`/`list` (scoped by `roomId`); self `create` (`score: 0`) & profile `update`; per-transaction score increments capped (`+11` max for `fakta_hari_ini`, `+6` max for other games) |
| `/rooms/{roomId}/rounds/{roundId}/secrets/{playerId}` | `uid`, `roundId`, `gameType`, plus game-specific secret payload: Game #1 (`isSpy`, `locationName`, `roleName`), Game #2 (`secretWord` only — **`isSpy` omitted**), Game #3 (`isPsychic`, `targetPosition` for Penerawang only), Game #4 (`role`: `penebak \| bluffer`; Bluffers get `isTruthTeller`, `truthTellerUid`, `truthTellerName`, `factTitle`, `factStatement`, `factTwist` while `penebak` receives **zero** fact/truth-teller fields) | Owning player `get` while active; room members `get` on `round_end`; **`list` unconditionally blocked** |
| `/rooms/{roomId}/rounds/{roundId}/submissions/{playerId}` | `uid`, `roundId`, `dialPosition` (`0..100`), `submittedAtMs`, `updatedAt` | Used by **Satu Frekuensi**; members `get`/`list`; each player may only create/update their own `playerId` document during `frequencyState.phase == 'dialing'` |
| `/rooms/{roomId}/serverState/current` | `roundId`, `roundNumber`, `locationName`, `citizenWord`, `spyWord`, `spyUids[]`, `spyNames[]`, `targetPosition`, `psychicUid`, `guesserUid`, `truthTellerUid`, `truthTellerName`, `factTitle`, `factStatement`, `factTwist`, `createdAtMs` | Authorized round resolution state (read/written only by authorized Host / Phase Controller transactions per game rules) |

#### 2. Firebase Realtime Database (RTDB) Paths

| Path | Payload Fields | Purpose |
| :--- | :--- | :--- |
| `/chats/{roomId}/{messageId}` | `senderUid`, `senderName`, `text` (1–300 chars), `type` (`chat \| system`), `createdAt` | Real-time in-room discussion and system event announcements |
| `/presence/{roomId}/{uid}` | `uid`, `displayName`, `online` (`boolean`), `lastSeen` | Live online/offline dots using RTDB `onDisconnect()` hooks |

---

### Local Development & Deployment

#### Local Setup
1. Copy `.env.example` to `.env.local` and fill in your Firebase Web SDK credentials.
2. Run tests, lint, and dev server:
   ```bash
   bun install
   bun run test   # Runs 31 Vitest engine unit tests across all 4 games
   bun run lint   # Runs ESLint + @firebase/eslint-plugin-security-rules on firestore.rules
   bun run dev    # Starts Next.js on http://localhost:3000
   ```
3. To verify the static export bundle locally (InfinityFree output in `./out/`):
   ```bash
   NODE_ENV=production STATIC_EXPORT=true bun run build
   ```

#### Automated Deployment (InfinityFree + Firebase Spark Free Plan)
Create **one** GitHub Repository Secret named **`YUK_MAIN_DEPLOY_SECRETS`** (*Settings → Secrets and variables → Actions*):

```json
{
  "ftp": {
    "server": "ftpupload.net",
    "username": "if0_xxxxxxxx",
    "password": "YOUR_FTP_PASSWORD",
    "serverDir": "/htdocs/"
  },
  "firebase": {
    "apiKey": "YOUR_FIREBASE_API_KEY",
    "authDomain": "YOUR_PROJECT.firebaseapp.com",
    "projectId": "YOUR_PROJECT_ID",
    "storageBucket": "YOUR_STORAGE_BUCKET",
    "messagingSenderId": "YOUR_SENDER_ID",
    "appId": "YOUR_APP_ID",
    "measurementId": "YOUR_MEASUREMENT_ID",
    "databaseURL": "https://YOUR_PROJECT-default-rtdb.asia-southeast1.firebasedatabase.app"
  }
}
```
- **Zero Cloud Functions / Zero Billing Card Needed:** Yuk Main runs 100% on the Firebase Spark free plan using browser-side Firestore transactions and Realtime Database.
- Add your InfinityFree domain to **Firebase Console → Authentication → Settings → Authorized domains**, and publish the latest `firestore.rules` (Firestore Rules) + `database.rules.json` (Realtime Database Rules) whenever rules are updated.

---

### Versioning System (`Version.Iteration.build`)

Yuk Main uses a 3-segment versioning format: **`Version.Iteration.build`**

| Segment | Meaning | When to Increment |
| :--- | :--- | :--- |
| **`Version`** | Major platform milestone | Launching new party games in the Yuk Main catalog (e.g., Game #2, Games #3 & #4), breaking schema changes, or major platform rewrites. |
| **`Iteration`** | Feature or architecture milestone | Adding major gameplay capabilities, architecture upgrades, new content packs, or CI/CD hosting pipelines. |
| **`build`** | Patch / maintenance build | Bug fixes, security rule refinements, authentication/proxy resilience patches, build hardening, and documentation updates. |

#### Changelog

- **`3.0.0`** — Dual-game platform expansion (4 games total):
  - Launched **Game #3: Satu Frekuensi** (2–12 players, interactive 180° Frequency Dial with proximity scoring `±4 / ±10 / ±16`, Host-paced endless turns, 80 Indonesian spectrums across 3 packs + custom spectrum builder, per-player `/submissions/{playerId}` dial isolation, and 6 Vitest specs).
  - Launched **Game #4: Fakta Hari Ini** (3–12 players, sequential Guesser rotation, 2-step Announcement → Parenthetical Fact card sequence, 75 curated fun facts across 3 packs + custom fact builder, random Pembawa Fakta with full Bluffer Team Awareness and zero leak to Penebak, team-aligned `+(N-1)` vs `+1` scoring, endless Host/Phase-Controller pacing with Host-is-Guesser random Bluffer safeguard + disconnect failover, and 7 Vitest specs).
  - Expanded Hub to a balanced 2×2 catalog with bespoke artwork, updated `firestore.rules`, `firebase-blueprint.json`, `security_spec.md`, and verified 31/31 unit tests + clean InfinityFree static export.
- **`2.0.0`** — Major platform expansion: rebranded Game #1 to **Yang Bener Yang Mana**, launched **Game #2: Kata-Kata Hari Ini** (true Blind-Spy word deduction with zero `isSpy` leakage, Multi-Spy `1 / 2 / Acak` mode, 36 Indonesian word pairs across 3 packs + custom pair builder, multi-round elimination voting, and final-Penyusup Last-Chance Guess), migrated to 100% client-side Spark-compatible `client-game-master.ts`, updated `firestore.rules`, and switched CI workflows to Bun (`bun.lock`) + InfinityFree FTP defaults.
- **`1.2.1`** — Unified GitHub Actions secret (`YUK_MAIN_DEPLOY_SECRETS`) with automatic `::add-mask::` protection, configurable `ftp.serverDir`, optional `site.basePath` subfolder support, bilingual `README.md`, `CONTRIBUTING.md`, and PolyForm Noncommercial `LICENSE`.
- **`1.2.0`** — Added InfinityFree static export pipeline (`STATIC_EXPORT=true`, `public/.htaccess`) and GitHub Actions FTPS auto-deployment.
- **`1.1.2`** — Hardened Next.js standalone production builds (`app/not-found.tsx`) and fixed proxy `HTTP 405` vote errors.
- **`1.1.1`** — Fixed Firestore `players` list query rule compliance (`where('roomId', '==', roomId)`), clean listener teardown on room leave, Anonymous/Google Auth error reporting, and `AuthDialog` auto-close.
- **`1.1.0`** — Hardened Firestore security rules (`secrets` isolation, bounded `score` validation, and zero-trust room visibility).
- **`1.0.0`** — Initial launch of **Yuk Main** hub and Game #1 (now **Yang Bener Yang Mana**) with 26 Indonesian locations across 3 packs, custom location/role builder, 9 Vitest engine specs, Privacy Shield role card, and Hybrid Cloud Firestore + RTDB chat & presence.

---

### License & Commercial Rights

- **Public License:** [PolyForm Noncommercial License 1.0.0](./LICENSE) — **Copyright © 2026 Ilham Liorahmat**.
- **Permitted for everyone:** You may view, fork, modify, self-host, and share your own version for **personal, educational, hobby, and non-commercial** purposes, and submit Pull Requests under [CONTRIBUTING.md](./CONTRIBUTING.md).
- **Monetization Prohibited Without Permission:** Commercial use or monetization (including ads, paywalls, paid hosting, or reselling) is **strictly prohibited** for everyone except the original copyright owner (**Ilham Liorahmat**), unless granted separate written commercial permission.

---

<a id="bahasa-indonesia"></a>

## Bahasa Indonesia

**Yuk Main** adalah platform hub permainan pesta multipemain berbahasa Indonesia (*mobile-first*) yang dibangun dengan **Next.js 15 (App Router)**, **React 19**, **Tailwind CSS v4**, dan **Firebase** (Authentication, Cloud Firestore, dan Realtime Database).

Platform ini menyatukan **4 permainan pesta Indonesia** dalam satu hub modular — **Game #1: Yang Bener Yang Mana**, **Game #2: Kata-Kata Hari Ini**, **Game #3: Satu Frekuensi**, dan **Game #4: Fakta Hari Ini** — ditenagai **Game Master Transaksi Firestore 100% Sisi Browser** (`client-game-master.ts`), obrolan & kehadiran RTDB waktu nyata, pembuat konten kustom, serta *auto-deployment* statis ke **InfinityFree** di paket gratis **Firebase Spark** (tanpa Cloud Functions dan tanpa kartu kredit).

### Fitur Utama
- **Registri Modular 4 Game:** Katalog game (`lib/games/registry.ts`), etalase grid 2×2 (`YukMainHub.tsx`), dan `ActiveRoomContainer` berlangganan tunggal yang merutekan ruang permainan berdasarkan `gameType`.
- **Game #1 — Yang Bener Yang Mana** *(ID internal: `spyfall` · 3–12 pemain)*:
  - 26 lokasi Indonesia pilihan dalam 3 paket (*Nusantara & Kota*, *Klasik & Profesi*, *Seru & Fantasi*) ditambah pembuat lokasi & peran kustom oleh Host.
  - **Kartu Identitas Privasi (*Privacy Shield*)** dan daftar centang deduksi lokasi interaktif.
- **Game #2 — Kata-Kata Hari Ini** *(ID internal: `kata_kata` · 3–12 pemain)*:
  - **Penyusup Buta Sejati:** Bahkan Penyusup tidak tahu dirinya adalah Penyusup—semua pemain menerima satu kata rahasia di kartu identik, dan `/secrets/{playerId}` sama sekali tidak memuat field `isSpy`.
  - **Mekanisme Multi-Spy:** Mendukung `1 Penyusup`, `2 Penyusup` (otomatis aktif saat ≥5 pemain), atau `Acak (1–2)` dengan penjaga keseimbangan.
  - **Eliminasi Bertahap & Kesempatan Terakhir:** Voting tuduhan mengeliminasi pemain satu per satu; saat Penyusup terakhir tertangkap, ia mendapat **1 Kesempatan Terakhir** menebak **Kata Warga** untuk membalikkan kemenangan.
  - 36 pasangan kata Indonesia dalam 3 paket (*Kuliner & Jajanan*, *Keseharian & Tongkrongan*, *Hiburan, Alam & Budaya*) ditambah **Pembuat Pasangan Kata Kustom**.
- **Game #3 — Satu Frekuensi** *(ID internal: `satu_frekuensi` · 2–12 pemain)*:
  - **Dial Spektrum Telepati:** **Penerawang** bergilir melihat titik target rahasia (`0–100`) pada spektrum dua kutub dan memberi 1 petunjuk; pemain lain mengunci tebakannya di **Dial Frekuensi 180°** interaktif (geser sentuh/mouse, slider, dan tombol presisi `-5 / -1 / +1 / +5`).
  - **Tanpa Timer (Kendali Penuh Host):** Bebas hitung mundur agar cocok jadi game ngobrol santai—fase (`Petunjuk → Putar Dial → Reveal`) hanya berpindah saat **Host** menekan **Fase Selanjutnya**.
  - **Skor Proksimitas:** `±4` Tepat Sasaran (`+4`), `±10` Dekat (`+3`), `±16` Lumayan (`+2`), ditambah bonus Penerawang `+1` per penebak yang mencetak poin (maks. `+4`).
  - 80 spektrum Indonesia dalam 3 paket (*Tongkrongan*, *Kuliner & Jajanan*, *Budaya & Tren*) ditambah **Pembuat Spektrum Kustom**.
- **Game #4 — Fakta Hari Ini** *(ID internal: `fakta_hari_ini` · 3–12 pemain)*:
  - **Rotasi Penebak Berurutan & Kartu 2 Tahap:** Setiap ronde dibuka dengan kartu pengumuman publik (`"[Nama] jadi Penebak!"`). Setelah ditutup, **Penebak** melihat kartu Detektif bebas spoiler, sedangkan seluruh **Tim Bluffer** menerima fakta unik dengan twist di dalam tanda kurung `(...)` beserta panduan ruang kreativitas.
  - **Pembawa Fakta Acak & Kesadaran Penuh Tim Bluffer:** Sistem menunjuk tepat 1 orang dari Tim Bluffer secara acak sebagai **Pembawa Fakta Asli** (tanpa berebut/FCFS). Seluruh Tim Bluffer dapat melihat siapa Pembawa Fakta di kartu rahasia dan panel pemain, sementara informasi itu tertutup total dari Penebak.
  - **Skor Berbasis Tim:** Jika **Penebak** berhasil menunjuk Pembawa Fakta, Penebak mendapat `+(N - 1)` poin (`N` = total pemain, Tim Bluffer `0`). Jika Penebak salah pilih, **seluruh `N - 1` anggota Tim Bluffer** (termasuk Pembawa Fakta) kompak mendapat `+1` poin.
  - **Tanpa Timer + Pengaman *Host-is-Guesser*:** Normalnya Host menekan **Fase Selanjutnya**, namun jika **Host sedang menjadi Penebak**, tombol tersebut dikunci bagi Host dan satu Bluffer acak ditunjuk sebagai **Pengendali Fase** (lengkap dengan pengalihan otomatis bila ia keluar ruang).
  - 75 fakta unik dalam 3 paket (*Hukum & Sejarah*, *Nusantara Unik*, *Sains & Alam*) ditambah **Pembuat Fakta Kustom**.
- **Arsitektur Ekspor Statis 100% Sisi Klien:**
  - **Produksi (InfinityFree + Firebase Spark Gratis):** Ekspor statis Next.js (`STATIC_EXPORT=true` → `output: 'export'` → `./out/`) dibangun dengan Bun dan diunggah otomatis via FTPS. Seluruh logika ronde, voting, kunci dial, tebakan, dan pembaruan skor berjalan atomik melalui transaksi Firestore di browser (`client-game-master.ts`) dipadukan chat & kehadiran `onDisconnect()` RTDB.
  - **Pratinjau / Pengembangan Lokal:** Mode Next.js standar (`output: 'standalone'`) yang menjalankan alur Firebase sisi klien yang persis sama tanpa rute API Node.js.

---

### Struktur Proyek

```text
yuk-main/
├── .github/
│   └── workflows/
│       └── deploy-infinityfree.yml        # CI/CD: tes, lint, build statis & upload FTPS ke InfinityFree
├── app/
│   ├── globals.css                        # Konfigurasi Tailwind CSS v4 & tipografi
│   ├── layout.tsx                         # Layout utama (ErrorBoundary + AuthProvider + metadata ID)
│   ├── not-found.tsx                      # Halaman 404 berbahasa Indonesia (fallback 404.html)
│   └── page.tsx                           # Halaman masuk (Beranda Hub / ActiveRoomContainer + auto-join ?room=)
├── components/
│   ├── ErrorBoundary.tsx                  # Penangkap error React agar UI tetap pulih rapi
│   ├── hub/
│   │   ├── AuthDialog.tsx                 # Modal Masuk Google & Masuk Sebagai Tamu (Anonymous)
│   │   └── YukMainHub.tsx                 # Hero switcher, form gabung kode 6 huruf & katalog grid 2×2
│   └── games/
│       ├── ActiveRoomContainer.tsx        # Pembungkus ruang tunggal yang merutekan seluruh 4 tampilan game
│       ├── spyfall/                       # UI Game #1: Yang Bener Yang Mana
│       │   ├── LobbySettingsPanel.tsx     # Durasi ronde, mode Mata-Mata, paket & lokasi kustom
│       │   ├── PlayersAndVotePanel.tsx    # Daftar pemain, skor, titik online RTDB & tombol Tuduh
│       │   ├── RoomChatPanel.tsx          # Obrolan RTDB bersama & inspirasi pertanyaan cepat
│       │   └── SpyfallRoomView.tsx        # Ruang main 3 kolom desktop / 3 tab ponsel
│       ├── kata-kata/                     # UI Game #2: Kata-Kata Hari Ini
│       │   ├── KataKataLobbySettings.tsx  # Durasi, mode Multi-Spy, paket kata & pembuat pasangan kustom
│       │   ├── KataKataPlayersPanel.tsx   # Pelacak eliminasi, skor & tombol tuduhan
│       │   └── KataKataRoomView.tsx       # Kartu Penyusup Buta, voting & tebakan Kesempatan Terakhir
│       ├── satu-frekuensi/                # UI Game #3: Satu Frekuensi
│       │   ├── FrequencyDial.tsx          # Dial setengah lingkaran 180° interaktif, zona skor & jarum pegas
│       │   ├── SatuFrekuensiLobbySettings.tsx # Paket spektrum & pembuat spektrum kustom
│       │   ├── SatuFrekuensiPlayersPanel.tsx  # Lencana Penerawang, status kunci dial & skor
│       │   └── SatuFrekuensiRoomView.tsx  # Alur petunjuk, putar dial & reveal multi-pin kendali Host
│       └── fakta-hari-ini/                # UI Game #4: Fakta Hari Ini
│           ├── FaktaHariIniLobbySettings.tsx  # Paket fakta & pembuat fakta berkurung kustom
│           ├── FaktaHariIniPlayersPanel.tsx   # Lencana Penebak, Pengendali Fase & Pembawa Fakta (khusus Bluffer)
│           └── FaktaHariIniRoomView.tsx   # Kartu pengumuman, kartu fakta berkurung & panel tebakan Penebak
├── hooks/
│   ├── use-auth.tsx                       # Konteks autentikasi Firebase (Google + Tamu)
│   ├── use-mobile.ts                      # Deteksi ukuran layar mobile
│   └── use-room-session.ts                # Langganan real-time Firestore & RTDB ruang permainan
├── lib/
│   ├── firebase/
│   │   ├── client.ts                      # Singleton Firebase Web SDK (Auth, Firestore, RTDB)
│   │   ├── config.ts                      # Konfigurasi Firebase Web SDK berbasis environment variable
│   │   └── errors.ts                      # Pelaporan error Firestore terstruktur
│   ├── games/
│   │   ├── registry.ts                    # Katalog modular 4 permainan Yuk Main
│   │   ├── types.ts                       # Definisi TypeScript untuk ruang, pemain, kartu & status ronde
│   │   ├── spyfall/                       # Mesin Game #1, 26 lokasi & 9 unit test Vitest
│   │   ├── kata-kata/                     # Mesin Game #2, 36 pasangan kata & 9 unit test Vitest
│   │   ├── satu-frekuensi/                # Mesin Game #3, 80 spektrum & 6 unit test Vitest
│   │   └── fakta-hari-ini/                # Mesin Game #4, 75 fakta & 7 unit test Vitest
│   └── platform/
│       ├── chat-presence.ts               # Obrolan RTDB & kehadiran otomatis onDisconnect()
│       ├── client-game-master.ts          # Game Master transaksi Firestore 100% sisi browser (seluruh 4 game)
│       ├── room-service.ts                # CRUD ruang, pengalihan Host/Pengendali Fase & pembungkus aksi game
│       └── user-profile.ts                # Utilitas penyimpanan profil pengguna
├── public/
│   └── .htaccess                          # Aturan Apache InfinityFree (HTTPS, 404.html, cache aset)
├── src/assets/images/                     # Ilustrasi sampul & emblem untuk keempat permainan
├── database.rules.json                    # Aturan keamanan Firebase Realtime Database
├── firebase-blueprint.json                # Cetak biru skema seluruh entitas & path Firestore
├── firebase.json & .firebaserc            # Konfigurasi Firebase CLI (Firestore & RTDB)
├── firestore.rules                        # Aturan keamanan Firestore Zero-Trust untuk seluruh 4 game
├── next.config.ts                         # Konfigurasi ganda: STATIC_EXPORT=true vs standalone
├── security_spec.md                       # Spesifikasi keamanan & model ancaman
├── CONTRIBUTING.md                        # Panduan kontribusi & Hibah Lisensi Kontributor
├── LICENSE                                # PolyForm Noncommercial License 1.0.0
└── README.md                              # Dokumentasi dwibahasa & catatan versi
```

---

### Struktur Data (Hibrida Firestore + RTDB)

Yuk Main memisahkan status permainan terstruktur (**Cloud Firestore**) dari obrolan frekuensi tinggi dan status kehadiran real-time (**Firebase Realtime Database**).

#### 1. Koleksi Cloud Firestore

| Path | Field Utama | Aturan Keamanan & Akses Klien |
| :--- | :--- | :--- |
| `/users/{userId}` | `uid`, `displayName`, `avatarColor`, `isAnonymous`, `gamesPlayed`, `wins`, `createdAt`, `updatedAt` | Hanya pemilik: `get`, `create`, `update` (tanpa `list`/`delete`) |
| `/roomCodes/{code}` | `code` (6 karakter kapital), `roomId`, `hostUid`, `gameType`, `createdAt` | Pengguna masuk: `get` kode persis; Host: `create`/`delete` (tanpa `list`) |
| `/rooms/{roomId}` | `id`, `code`, `gameType` (`spyfall \| kata_kata \| satu_frekuensi \| fakta_hari_ini`), `hostUid`, `status` (`lobby \| playing \| voting \| spy_guess \| round_end`), `roundNumber`, `currentRoundId`, `roundDurationSec`, `roundEndsAtMs`, `firstSpeakerUid`, `spyMode`, `enabledPacks`, `selectedLocationNames`, `customLocations`, `customWordPairs`, `customSpectrums`, `customFacts`, `eliminatedUids`, `eliminationLog`, `activeVote`, `pendingSpyGuess`, `frequencyState`, `faktaState`, `lastRoundResult`, `createdAt`, `updatedAt` | Anggota/lobi: `get`; Host membuat ruang & mengatur lobi; perpindahan fase divalidasi per game (pada `fakta_hari_ini`, tombol fase hanya sah bagi `faktaState.phaseControllerUid`, bukan Host yang sedang menjadi `guesserUid`) |
| `/rooms/{roomId}/players/{playerId}` | `uid`, `roomId`, `displayName`, `avatarColor`, `isHost`, `score`, `isReady`, `joinedAt`, `updatedAt` | Anggota: `get`/`list` (wajib filter `roomId`); pemain sendiri: `create` (`score: 0`) & ubah profil; batas kenaikan skor per transaksi dibatasi (maks. `+11` untuk `fakta_hari_ini`, maks. `+6` untuk game lain) |
| `/rooms/{roomId}/rounds/{roundId}/secrets/{playerId}` | `uid`, `roundId`, `gameType`, ditambah payload rahasia per game: Game #1 (`isSpy`, `locationName`, `roleName`), Game #2 (`secretWord` saja — **tanpa `isSpy`**), Game #3 (`isPsychic`, `targetPosition` khusus Penerawang), Game #4 (`role`: `penebak \| bluffer`; Tim Bluffer menerima `isTruthTeller`, `truthTellerUid`, `truthTellerName`, `factTitle`, `factStatement`, `factTwist` sedangkan `penebak` menerima **nol** informasi fakta/Pembawa Fakta) | Hanya pemilik kartu saat ronde berjalan; semua anggota ruang saat `round_end`; **`list` diblokir total** |
| `/rooms/{roomId}/rounds/{roundId}/submissions/{playerId}` | `uid`, `roundId`, `dialPosition` (`0..100`), `submittedAtMs`, `updatedAt` | Digunakan oleh **Satu Frekuensi**; anggota dapat membaca; setiap pemain hanya dapat menulis dokumen `playerId` miliknya sendiri saat `frequencyState.phase == 'dialing'` |
| `/rooms/{roomId}/serverState/current` | `roundId`, `roundNumber`, `locationName`, `citizenWord`, `spyWord`, `spyUids[]`, `spyNames[]`, `targetPosition`, `psychicUid`, `guesserUid`, `truthTellerUid`, `truthTellerName`, `factTitle`, `factStatement`, `factTwist`, `createdAtMs` | Status resolusi ronde terotorisasi (hanya dibaca/ditulis oleh transaksi Host / Pengendali Fase sesuai aturan keamanan masing-masing game) |

#### 2. Path Firebase Realtime Database (RTDB)

| Path | Field Payload | Fungsi |
| :--- | :--- | :--- |
| `/chats/{roomId}/{messageId}` | `senderUid`, `senderName`, `text` (1–300 karakter), `type` (`chat \| system`), `createdAt` | Obrolan diskusi pemain dan pengumuman sistem secara instan |
| `/presence/{roomId}/{uid}` | `uid`, `displayName`, `online` (`boolean`), `lastSeen` | Indikator online/offline otomatis berbasis `onDisconnect()` |

---

### Pengembangan Lokal & Auto-Deployment

#### Menjalankan Secara Lokal
1. Salin `.env.example` menjadi `.env.local` lalu isi konfigurasi Firebase Web SDK milikmu.
2. Jalankan pengujian, lint, dan server lokal:
   ```bash
   bun install
   bun run test   # Menjalankan 31 unit test Vitest untuk seluruh 4 game
   bun run lint   # Menjalankan ESLint + validasi keamanan firestore.rules
   bun run dev    # Menjalankan Next.js di http://localhost:3000
   ```
3. Untuk memverifikasi hasil ekspor statis secara lokal (output InfinityFree di `./out/`):
   ```bash
   NODE_ENV=production STATIC_EXPORT=true bun run build
   ```

#### Auto-Deployment (InfinityFree + Firebase Spark Gratis)
Buat **satu** GitHub Repository Secret bernama **`YUK_MAIN_DEPLOY_SECRETS`** (*Settings → Secrets and variables → Actions*) dengan format JSON `ftp` dan `firebase` seperti pada bagian Bahasa Inggris di atas:
- Isi `ftp.serverDir` sesuai direktori tujuan di InfinityFree (misalnya `"/htdocs/"` atau `"/subdomain.rf.gd/htdocs/"`).
- **Tanpa Cloud Functions & Tanpa Kartu Kredit:** Yuk Main berjalan 100% di paket gratis Firebase Spark menggunakan transaksi Firestore sisi klien dan Realtime Database.
- Pastikan domain InfinityFree sudah didaftarkan di **Firebase Console → Authentication → Settings → Authorized domains**, lalu publikasikan `firestore.rules` (Firestore Rules) dan `database.rules.json` (Realtime Database Rules) setiap kali ada pembaruan aturan.

---

### Sistem Penomoran Versi (`Version.Iteration.build`)

Yuk Main menggunakan format penomoran 3 bagian: **`Version.Iteration.build`**

| Bagian | Arti | Kapan Dinaikkan |
| :--- | :--- | :--- |
| **`Version`** | Tonggak besar platform | Penambahan permainan pesta baru ke katalog Yuk Main (misalnya Game #2, Game #3 & #4), perubahan skema besar, atau perombakan arsitektur inti. |
| **`Iteration`** | Iterasi fitur / infrastruktur | Penambahan fitur permainan baru, peningkatan arsitektur, paket konten baru, atau jalur deployment/CI baru. |
| **`build`** | Build perbaikan / pemeliharaan | Perbaikan bug, pengetatan aturan keamanan, ketahanan autentikasi/jaringan, perbaikan build, dan pembaruan dokumentasi. |

#### Riwayat Pembaruan (Changelog)

- **`3.0.0`** — Ekspansi ganda platform (total 4 permainan):
  - Peluncuran **Game #3: Satu Frekuensi** (2–12 pemain, Dial Frekuensi 180° interaktif dengan skor proksimitas `±4 / ±10 / ±16`, ritme tanpa timer kendali Host, 80 spektrum Indonesia dalam 3 paket + pembuat spektrum kustom, isolasi submisi dial `/submissions/{playerId}`, dan 6 unit test Vitest).
  - Peluncuran **Game #4: Fakta Hari Ini** (3–12 pemain, rotasi Penebak berurutan, kartu 2 tahap Pengumuman → Fakta Berkurung, 75 fakta unik dalam 3 paket + pembuat fakta kustom, Pembawa Fakta acak dengan kesadaran penuh Tim Bluffer dan nol kebocoran ke Penebak, skor tim `+(N-1)` vs `+1`, ritme tanpa timer dengan pengaman *Host-is-Guesser* + pengalihan Pengendali Fase otomatis, dan 7 unit test Vitest).
  - Pembaruan Hub menjadi katalog 2×2 lengkap dengan sampul & emblem baru, pembaruan `firestore.rules`, `firebase-blueprint.json`, `security_spec.md`, serta verifikasi 31/31 unit test + *static export* InfinityFree.
- **`2.0.0`** — Ekspansi besar platform: rebranding Game #1 menjadi **Yang Bener Yang Mana**, peluncuran **Game #2: Kata-Kata Hari Ini** (penyusup kata buta tanpa kebocoran `isSpy`, Multi-Spy `1 / 2 / Acak`, 36 pasangan kata Indonesia dalam 3 paket + pembuat pasangan kustom, eliminasi bertahap, dan Kesempatan Terakhir menebak Kata Warga), migrasi ke `client-game-master.ts` 100% sisi klien (Spark gratis), pembaruan `firestore.rules`, serta migrasi CI ke Bun (`bun.lock`) + FTP InfinityFree.
- **`1.2.1`** — Konsolidasi seluruh kredensial ke satu GitHub Secret JSON (`YUK_MAIN_DEPLOY_SECRETS`) dengan masking otomatis `::add-mask::`, dukungan `ftp.serverDir` kustom, opsi `site.basePath`, `README.md` dwibahasa, `CONTRIBUTING.md`, dan lisensi PolyForm Noncommercial 1.0.0.
- **`1.2.0`** — Penambahan jalur build statis InfinityFree (`STATIC_EXPORT=true`, `public/.htaccess`) dan workflow auto-deploy FTPS GitHub Actions.
- **`1.1.2`** — Penguatan build standalone Next.js (`app/not-found.tsx`) dan perbaikan error `HTTP 405` saat voting.
- **`1.1.1`** — Perbaikan query daftar pemain (`where('roomId', '==', roomId)`) agar sesuai aturan keamanan Firestore, pembersihan listener saat keluar ruang, pelaporan kode error Auth, dan penutupan otomatis `AuthDialog`.
- **`1.1.0`** — Pengetatan aturan keamanan Firestore (isolasi `secrets`, validasi batas `score`, dan visibilitas ruang berbasis anggota).
- **`1.0.0`** — Peluncuran perdana hub **Yuk Main** dan Game #1 (kini **Yang Bener Yang Mana**) dengan 26 lokasi Indonesia dalam 3 paket, pembuat lokasi/peran kustom, 9 unit test Vitest, Kartu Privasi, serta arsitektur hibrida Cloud Firestore + RTDB.

---

### Lisensi & Hak Komersial

- **Lisensi Publik:** [PolyForm Noncommercial License 1.0.0](./LICENSE) — **Hak Cipta © 2026 Ilham Liorahmat**.
- **Diperbolehkan untuk publik:** Siapa pun boleh melihat kode, melakukan *fork*, memodifikasi, men-host sendiri secara gratis untuk keperluan **pribadi, pendidikan, hobi, dan non-komersial**, serta mengirimkan Pull Request sesuai [CONTRIBUTING.md](./CONTRIBUTING.md).
- **Larangan Monetisasi Tanpa Izin:** Penggunaan komersial atau monetisasi dalam bentuk apa pun (termasuk iklan, *paywall*, hosting berbayar, atau penjualan ulang) **dilarang keras** bagi siapa pun selain pemilik hak cipta asli (**Ilham Liorahmat**), kecuali dengan izin komersial tertulis terpisah.
