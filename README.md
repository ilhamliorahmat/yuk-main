# Yuk Main — Indonesian Multiplayer Party Game Hub

> **Current Release:** `2.0.0` (`Version.Iteration.build`)  
> **License:** PolyForm Noncommercial License 1.0.0 — Copyright © 2026 **Ilham Liorahmat**

[Read in English](#english) · [Baca dalam Bahasa Indonesia](#bahasa-indonesia)

---

<a id="english"></a>

## English

**Yuk Main** is an Indonesian-localized, mobile-first multiplayer party game hub built with **Next.js 15 (App Router)**, **React 19**, **Tailwind CSS v4**, and **Firebase** (Authentication, Cloud Firestore, Realtime Database, and Cloud Functions v2).

It includes **Game #1: Yang Bener Yang Mana** (location & role deduction) and **Game #2: Kata-Kata Hari Ini** (true Blind-Spy word deduction with Multi-Spy & Last-Chance Guess), powered by a **Server-Side Blind-Host Game Master**, real-time RTDB chat & presence, custom content builders, and automated static deployment to **InfinityFree**.

### Key Features
- **Modular Party Game Registry:** Clean game registry (`lib/games/registry.ts`) and single-subscription `ActiveRoomContainer` routing rooms by `gameType`.
- **Game #1 — Yang Bener Yang Mana** *(internal ID: `spyfall`)*:
  - 26 curated Indonesian locations across 3 packs (*Nusantara & Kota*, *Klasik & Profesi*, *Seru & Fantasi*) plus Host custom location & role creator.
  - **Privacy Shield Role Card** (tap to peek/hide on mobile) and interactive location deduction checklist.
- **Game #2 — Kata-Kata Hari Ini** *(internal ID: `kata_kata`)*:
  - **True Blind-Spy Secrecy:** Even the Penyusup does not know they are a Penyusup—every player receives a secret word on an identical card, and `/secrets/{playerId}` strictly omits `isSpy` so even browser DevTools inspection reveals zero role hints.
  - **Multi-Spy Mechanism:** Supports `1 Penyusup`, `2 Penyusup` (auto-enabled at ≥5 players), or `Acak (1–2)` with server-side fairness clamping.
  - **Multi-Round Elimination & Last-Chance Guess:** Accusation voting eliminates players one by one (revealing Warga/Penyusup status); when the final Penyusup is caught, they get **1 Last-Chance Guess** to type **Kata Warga** and steal the win!
  - 36 curated Indonesian word pairs across 3 packs (*Kuliner & Jajanan*, *Keseharian & Tongkrongan*, *Hiburan, Alam & Budaya*) plus a Host **Custom Word-Pair Builder**.
- **Blind-Host Server Game Master & Real-Time Chat:** Round dealing, voting, eliminations, last-chance guesses, and atomic score increments run server-side via Firebase Admin SDK (`serverState/current` is blocked from all browsers), paired with RTDB instant chat & `onDisconnect()` presence.
- **Dual Deployment Architecture:**
  - **Production (InfinityFree + Firebase Spark Free Plan):** Static Next.js export (`output: 'export'` → `./out/`) built with Bun and auto-deployed to InfinityFree via FTP using **`client_host` mode** (100% pure browser Firebase Client SDK transactions—zero Cloud Functions and zero billing card required; optional Firebase Blaze Cloud Functions v2 `functions` mode also included).
  - **Local / Dev Preview:** Standard Next.js server mode (`output: 'standalone'`) using local `/api/{spyfall,kata-kata}/*` routes.

---

### Project Structure

```text
yuk-main/
├── .github/
│   └── workflows/
│       ├── deploy-infinityfree.yml        # CI/CD: test, lint, static export & FTPS upload to InfinityFree
│       └── deploy-firebase-functions.yml  # CI/CD: build & deploy Cloud Functions v2 to Firebase
├── app/
│   ├── api/spyfall/                       # Preview/Node backend GM endpoints (excluded during static export)
│   │   ├── start/route.ts                 # Deal round, write serverState & isolated per-player secrets
│   │   ├── vote/route.ts                  # Initiate, cast, cancel accusation votes & verify convictions
│   │   ├── guess/route.ts                 # Validate Spy location guesses & apply scores
│   │   └── resolve/route.ts               # Resolve round timeout / force-end / return to lobby
│   ├── globals.css                        # Tailwind CSS v4 styles & font stacks
│   ├── layout.tsx                         # Root layout (ErrorBoundary + AuthProvider + Indonesian metadata)
│   ├── not-found.tsx                      # Localized 404 page (static 404.html fallback)
│   └── page.tsx                           # Entry point (Hub vs active Spyfall room + ?room=CODE auto-join)
├── components/
│   ├── ErrorBoundary.tsx                  # React error boundary for graceful recovery
│   ├── hub/
│   │   ├── AuthDialog.tsx                 # Google Sign-In & Anonymous Guest nickname modal
│   │   └── YukMainHub.tsx                 # Landing hero, join-by-code form, and game catalog
│   └── games/spyfall/
│       ├── LobbySettingsPanel.tsx         # Duration, Spy mode, location packs & custom location builder
│       ├── PlayersAndVotePanel.tsx        # Roster, live scores, RTDB presence dot & accusation triggers
│       ├── RoomChatPanel.tsx              # Real-time RTDB chat & quick Spyfall question prompts
│       └── SpyfallRoomView.tsx            # Tactical 3-column desktop / 3-tab mobile game room
├── functions/                             # Firebase Cloud Functions v2 backend (production Game Master)
│   ├── src/
│   │   ├── index.ts                       # Callable functions: spyfallStart, spyfallVote, spyfallGuess, spyfallResolve
│   │   └── shared/                        # Auto-synced pure TypeScript engine & types from lib/games/
│   ├── package.json
│   └── tsconfig.json
├── hooks/
│   ├── use-auth.tsx                       # Firebase Auth context (Google + Anonymous Guest)
│   ├── use-mobile.ts                      # Responsive viewport helper
│   └── use-room-session.ts                # Live Firestore + RTDB subscriptions for an active room
├── lib/
│   ├── firebase/
│   │   ├── admin.ts                       # Firebase Admin SDK singleton & token verifier (preview API routes)
│   │   ├── client.ts                      # Firebase Web SDK singleton (Auth, Firestore, RTDB, Functions)
│   │   ├── config.ts                      # Environment-driven Firebase & Game Master transport config
│   │   └── errors.ts                      # Structured FirestoreErrorInfo diagnostics
│   ├── games/
│   │   ├── registry.ts                    # Extensible party game catalog metadata
│   │   ├── types.ts                       # Shared TypeScript interfaces for rooms, players, secrets & serverState
│   │   └── spyfall/
│   │       ├── engine.ts                  # Pure Spyfall rules engine (dealing, voting, guessing, scoring)
│   │       ├── locations-id.ts            # 26 Indonesian locations across 3 packs + quick questions
│   │       └── __tests__/engine.test.ts   # Vitest unit test suite (9 tests)
│   └── platform/
│       ├── chat-presence.ts               # RTDB chat messaging & onDisconnect() online presence
│       └── room-service.ts                # Room CRUD + dual-transport Game Master caller (Functions / API)
├── public/
│   └── .htaccess                          # Apache rules for InfinityFree (HTTPS, 404 fallback, caching)
├── src/assets/images/                     # Cover artwork & game emblem assets
├── database.rules.json                    # Firebase Realtime Database security rules
├── firebase-blueprint.json                # Schema blueprint for all Firestore entities & paths
├── firebase.json & .firebaserc            # Firebase CLI config (Firestore, RTDB, Cloud Functions v2)
├── firestore.rules                        # Hardened Zero-Trust Firestore security rules
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

| Path | Document Schema / Key Fields | Client Access | Server / Admin SDK |
| :--- | :--- | :--- | :--- |
| `/users/{userId}` | `uid`, `displayName`, `avatarColor`, `isAnonymous`, `gamesPlayed`, `wins`, `createdAt`, `updatedAt` | Owner `get`, `create`, `update` (no `list` / `delete`) | Full access |
| `/roomCodes/{code}` | `code` (6-char uppercase), `roomId`, `hostUid`, `gameType`, `createdAt` | Signed-in exact `get`; Host `create`/`delete` (no `list`) | Full access |
| `/rooms/{roomId}` | `id`, `code`, `gameType` (`spyfall \| kata_kata`), `hostUid`, `status` (`lobby \| playing \| voting \| spy_guess \| round_end`), `roundNumber`, `currentRoundId`, `roundDurationSec`, `roundEndsAtMs`, `firstSpeakerUid`, `spyMode`, `enabledPacks`, `selectedLocationNames`, `customLocations`, `customWordPairs`, `eliminatedUids`, `eliminationLog`, `activeVote`, `pendingSpyGuess`, `lastRoundResult`, `createdAt`, `updatedAt` | Members/lobby `get`; Host `create`, lobby-settings `update`, `hostUid` transfer, `delete` | Transitions round status, votes, eliminations, timers & `lastRoundResult` |
| `/rooms/{roomId}/players/{playerId}` | `uid`, `roomId`, `displayName`, `avatarColor`, `isHost`, `score`, `isReady`, `joinedAt`, `updatedAt` | Members `get`/`list` (scoped by `roomId`); self `create` (`score: 0`) & profile `update`; **client `score` writes blocked** | Atomic `FieldValue.increment` score updates |
| `/rooms/{roomId}/rounds/{roundId}/secrets/{playerId}` | `uid`, `roundId`, `gameType`, (`isSpy`, `locationName`, `roleName` for Game #1) OR (`secretWord` only for Game #2 — **`isSpy` omitted**), `createdAt` | Owning player `get` while active; room members `get` when `status == 'round_end'`; **`list` & `write` blocked** | Writes all per-player secret cards during deal |
| `/rooms/{roomId}/serverState/current` | `roundId`, `roundNumber`, `locationName`, `citizenWord`, `spyWord`, `spyUids[]`, `spyNames[]`, `createdAtMs` | **Completely blocked (`allow read, write: if false`)** | Stores true location/words & Spy identities for blind-Host verification |

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
   bun run test   # Runs 18 Vitest engine unit tests (Yang Bener Yang Mana + Kata-Kata Hari Ini)
   bun run lint   # Runs ESLint + @firebase/eslint-plugin-security-rules on firestore.rules
   bun run dev    # Starts Next.js on http://localhost:3000
   ```

#### Automated Deployment (InfinityFree + Firebase Cloud Functions v2 & Firestore Rules)
Create **one** GitHub Repository Secret named **`YUK_MAIN_DEPLOY_SECRETS`** (*Settings → Secrets and variables → Actions*):

```json
{
  "ftp": {
    "server": "ftpupload.net",
    "username": "if0_xxxxxxxx",
    "password": "YOUR_FTP_PASSWORD",
    "serverDir": "/htdocs/"
  },
  "site": {
    "basePath": ""
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
  },
  "firebaseServiceAccount": {
    "type": "service_account",
    "project_id": "YOUR_PROJECT_ID",
    "private_key_id": "...",
    "private_key": "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n",
    "client_email": "firebase-adminsdk-xxxxx@YOUR_PROJECT_ID.iam.gserviceaccount.com",
    "client_id": "...",
    "auth_uri": "https://accounts.google.com/o/oauth2/auth",
    "token_uri": "https://oauth2.googleapis.com/token"
  }
}
```
- Leave `"basePath": ""` when hosted at a domain or subdomain root (set `"/folder"` only if hosted inside a URL subfolder).
- Generate the **full** Service Account JSON from **Firebase Console → Project Settings → Service accounts → Generate new private key** and paste the entire object into `"firebaseServiceAccount"` (both `client_email` and `private_key` are required by Google Cloud Auth). The Firebase workflow automatically deploys **both Cloud Functions v2 and `firestore.rules`** (`--only functions,firestore:rules`).
- Add your InfinityFree domain to **Firebase Console → Authentication → Settings → Authorized domains** and publish `database.rules.json` in Realtime Database Rules.

---

### Versioning System (`Version.Iteration.build`)

Yuk Main uses a 3-segment versioning format: **`Version.Iteration.build`**

| Segment | Meaning | When to Increment |
| :--- | :--- | :--- |
| **`Version`** | Major platform milestone | Launching a new party game in the Yuk Main catalog (e.g., Game #2), breaking schema changes, or major platform rewrites. |
| **`Iteration`** | Feature or architecture milestone | Adding major gameplay capabilities, backend architecture upgrades, new location packs, or CI/CD hosting pipelines. |
| **`build`** | Patch / maintenance build | Bug fixes, security rule refinements, authentication/proxy resilience patches, build hardening, and documentation updates. |

#### Changelog

- **`2.0.0`** — Major platform expansion: rebranded Game #1 to **Yang Bener Yang Mana**, launched **Game #2: Kata-Kata Hari Ini** (true Blind-Spy word deduction with zero `isSpy` leakage, Multi-Spy `1 / 2 / Acak` mode, 36 Indonesian word pairs across 3 packs + custom pair builder, multi-round elimination voting, and final-Penyusup Last-Chance Guess), added `kataKataStart`/`Vote`/`Guess`/`Resolve` Cloud Functions v2 & preview routes, updated `firestore.rules`, and switched CI workflows to Bun (`bun.lock`) + InfinityFree FTP defaults.
- **`1.2.1`** — Unified GitHub Actions secret (`YUK_MAIN_DEPLOY_SECRETS`) with automatic `::add-mask::` protection, configurable `ftp.serverDir`, optional `site.basePath` subfolder support, bilingual `README.md`, `CONTRIBUTING.md`, and PolyForm Noncommercial `LICENSE`.
- **`1.2.0`** — Added InfinityFree static export pipeline (`STATIC_EXPORT=true`, `public/.htaccess`), GitHub Actions FTPS auto-deployment, and Firebase Cloud Functions v2 Game Master (`asia-southeast1`: `spyfallStart`, `spyfallVote`, `spyfallGuess`, `spyfallResolve`) with `httpsCallable` client routing.
- **`1.1.2`** — Hardened Next.js standalone production builds (`app/not-found.tsx`, `serverExternalPackages: ['firebase-admin']`) and fixed proxy `HTTP 405` vote errors via `X-Firebase-Token` header + automatic redirect retry.
- **`1.1.1`** — Fixed Firestore `players` list query rule compliance (`where('roomId', '==', roomId)`), clean listener teardown on room leave, Anonymous/Google Auth error reporting, and `AuthDialog` auto-close.
- **`1.1.0`** — Upgraded to **Server-Side Blind-Host Game Master** (`firebase-admin`, server-only `/serverState/current`, write-locked `secrets` and `score` fields in `firestore.rules`).
- **`1.0.0`** — Initial launch of **Yuk Main** hub and Game #1 (now **Yang Bener Yang Mana**) with 26 Indonesian locations across 3 packs, custom location/role builder, 9 Vitest engine specs, Privacy Shield role card, and Hybrid Cloud Firestore + RTDB chat & presence.

---

### License & Commercial Rights

- **Public License:** [PolyForm Noncommercial License 1.0.0](./LICENSE) — **Copyright © 2026 Ilham Liorahmat**.
- **Permitted for everyone:** You may view, fork, modify, self-host, and share your own version for **personal, educational, hobby, and non-commercial** purposes, and submit Pull Requests under [CONTRIBUTING.md](./CONTRIBUTING.md).
- **Monetization Prohibited Without Permission:** Commercial use or monetization (including ads, paywalls, paid hosting, or reselling) is **strictly prohibited** for everyone except the original copyright owner (**Ilham Liorahmat**), unless granted separate written commercial permission.

---

<a id="bahasa-indonesia"></a>

## Bahasa Indonesia

**Yuk Main** adalah platform hub permainan pesta multipemain berbahasa Indonesia (*mobile-first*) yang dibangun dengan **Next.js 15 (App Router)**, **React 19**, **Tailwind CSS v4**, dan **Firebase** (Authentication, Cloud Firestore, Realtime Database, dan Cloud Functions v2).

Platform ini menghadirkan **Game #1: Yang Bener Yang Mana** (deduksi lokasi & peran) serta **Game #2: Kata-Kata Hari Ini** (penyusup kata buta dengan Multi-Spy & Kesempatan Terakhir), didukung **Server-Side Blind-Host Game Master**, obrolan & kehadiran RTDB waktu nyata, pembuat konten kustom, serta *auto-deployment* statis ke **InfinityFree**.

### Fitur Utama
- **Registri Game Modular:** Katalog game (`lib/games/registry.ts`) dan `ActiveRoomContainer` berlangganan tunggal untuk merutekan ruang berdasarkan `gameType`.
- **Game #1 — Yang Bener Yang Mana** *(ID internal: `spyfall`)*:
  - 26 lokasi Indonesia pilihan dalam 3 paket (*Nusantara & Kota*, *Klasik & Profesi*, *Seru & Fantasi*) ditambah pembuat lokasi & peran kustom oleh Host.
  - **Kartu Identitas Privasi (*Privacy Shield*)** dan daftar centang deduksi lokasi interaktif.
- **Game #2 — Kata-Kata Hari Ini** *(ID internal: `kata_kata`)*:
  - **Penyusup Buta Sejati:** Bahkan Penyusup tidak tahu dirinya adalah Penyusup—semua pemain menerima satu kata rahasia di kartu identik, dan `/secrets/{playerId}` sama sekali tidak memuat field `isSpy` sehingga inspeksi DevTools pun tidak membocorkan peran.
  - **Mekanisme Multi-Spy:** Mendukung `1 Penyusup`, `2 Penyusup` (otomatis aktif saat ≥5 pemain), atau `Acak (1–2)` dengan penjaga keseimbangan sisi server.
  - **Eliminasi Bertahap & Kesempatan Terakhir:** Voting tuduhan mengeliminasi pemain satu per satu (status Warga/Penyusup langsung dibuka); saat Penyusup terakhir tertangkap, ia mendapat **1 Kesempatan Terakhir** menebak **Kata Warga** untuk membalikkan kemenangan!
  - 36 pasangan kata Indonesia dalam 3 paket (*Kuliner & Jajanan*, *Keseharian & Tongkrongan*, *Hiburan, Alam & Budaya*) ditambah **Pembuat Pasangan Kata Kustom**.
- **Game Master Sisi Server & Obrolan Waktu Nyata:** Pengacakan ronde, voting, eliminasi, validasi tebakan, dan penambahan skor diproses atomik di server via Firebase Admin SDK (`serverState/current` tertutup total dari browser), dipadukan chat & kehadiran `onDisconnect()` RTDB.
- **Arsitektur Deployment Ganda:**
  - **Produksi (InfinityFree + Firebase Spark Gratis):** Ekspor statis Next.js (`output: 'export'` → `./out/`) dibangun dengan Bun dan diunggah otomatis ke InfinityFree via FTP menggunakan **mode `client_host`** (100% transaksi Firebase Client SDK di browser—tanpa Cloud Functions dan tanpa kartu kredit; mode opsional Firebase Blaze Cloud Functions v2 tetap tersedia).
  - **Pratinjau / Pengembangan Lokal:** Mode server Next.js (`output: 'standalone'`) menggunakan rute lokal `/api/{spyfall,kata-kata}/*`.

---

### Struktur Proyek

```text
yuk-main/
├── .github/
│   └── workflows/
│       ├── deploy-infinityfree.yml        # CI/CD: tes, lint, build statis & upload FTPS ke InfinityFree
│       └── deploy-firebase-functions.yml  # CI/CD: build & deploy Cloud Functions v2 ke Firebase
├── app/
│   ├── api/spyfall/                       # Endpoint GM khusus preview lokal (dihapus saat build statis)
│   │   ├── start/route.ts                 # Mulai ronde, tulis serverState & kartu rahasia per pemain
│   │   ├── vote/route.ts                  # Mulai, beri suara, batalkan voting & verifikasi tertuduh
│   │   ├── guess/route.ts                 # Validasi tebakan lokasi Mata-Mata & terapkan skor
│   │   └── resolve/route.ts               # Selesaikan waktu habis / akhiri paksa / kembali ke lobi
│   ├── globals.css                        # Konfigurasi Tailwind CSS v4 & tipografi
│   ├── layout.tsx                         # Layout utama (ErrorBoundary + AuthProvider + metadata ID)
│   ├── not-found.tsx                      # Halaman 404 berbahasa Indonesia (fallback 404.html)
│   └── page.tsx                           # Halaman masuk (Beranda Hub / ruang Spyfall + auto-join ?room=)
├── components/
│   ├── ErrorBoundary.tsx                  # Penangkap error React agar UI tetap pulih rapi
│   ├── hub/
│   │   ├── AuthDialog.tsx                 # Modal Masuk Google & Masuk Sebagai Tamu (Anonymous)
│   │   └── YukMainHub.tsx                 # Beranda, form gabung kode 6 huruf & katalog permainan
│   └── games/spyfall/
│       ├── LobbySettingsPanel.tsx         # Durasi ronde, mode Mata-Mata, paket & lokasi kustom
│       ├── PlayersAndVotePanel.tsx        # Daftar pemain, skor, titik online RTDB & tombol Tuduh
│       ├── RoomChatPanel.tsx              # Obrolan RTDB waktu nyata & inspirasi pertanyaan cepat
│       └── SpyfallRoomView.tsx            # Ruang main taktis 3 kolom desktop / 3 tab ponsel
├── functions/                             # Backend Firebase Cloud Functions v2 (Game Master produksi)
│   ├── src/
│   │   ├── index.ts                       # Fungsi callable: spyfallStart, spyfallVote, spyfallGuess, spyfallResolve
│   │   └── shared/                        # Salinan sinkron mesin Spyfall & tipe dari lib/games/
│   ├── package.json
│   └── tsconfig.json
├── hooks/
│   ├── use-auth.tsx                       # Konteks autentikasi Firebase (Google + Tamu)
│   ├── use-mobile.ts                      # Deteksi ukuran layar mobile
│   └── use-room-session.ts                # Langganan real-time Firestore & RTDB ruang permainan
├── lib/
│   ├── firebase/
│   │   ├── admin.ts                       # Singleton Firebase Admin SDK & verifikasi token (mode preview)
│   │   ├── client.ts                      # Singleton Firebase Web SDK (Auth, Firestore, RTDB, Functions)
│   │   ├── config.ts                      # Konfigurasi Firebase & pemilihan transport Game Master
│   │   └── errors.ts                      # Pelaporan error Firestore terstruktur
│   ├── games/
│   │   ├── registry.ts                    # Katalog permainan modular Yuk Main
│   │   ├── types.ts                       # Definisi TypeScript untuk ruang, pemain, kartu & serverState
│   │   └── spyfall/
│   │       ├── engine.ts                  # Mesin inti aturan Spyfall (acak, voting, tebak, skor)
│   │       ├── locations-id.ts            # 26 lokasi Indonesia dalam 3 paket + daftar pertanyaan cepat
│   │       └── __tests__/engine.test.ts   # Unit test Vitest (9 skenario pengujian)
│   └── platform/
│       ├── chat-presence.ts               # Obrolan RTDB & kehadiran otomatis onDisconnect()
│       └── room-service.ts                # CRUD ruang + pemanggil Game Master ganda (Functions / API)
├── public/
│   └── .htaccess                          # Aturan Apache InfinityFree (HTTPS, 404.html, cache aset)
├── src/assets/images/                     # Ilustrasi sampul & emblem permainan
├── database.rules.json                    # Aturan keamanan Firebase Realtime Database
├── firebase-blueprint.json                # Cetak biru skema seluruh entitas & path Firestore
├── firebase.json & .firebaserc            # Konfigurasi Firebase CLI (Firestore, RTDB, Functions v2)
├── firestore.rules                        # Aturan keamanan Firestore Zero-Trust
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

| Path | Field Utama | Akses Klien (Browser) | Server / Admin SDK |
| :--- | :--- | :--- | :--- |
| `/users/{userId}` | `uid`, `displayName`, `avatarColor`, `isAnonymous`, `gamesPlayed`, `wins`, `createdAt`, `updatedAt` | Hanya pemilik: `get`, `create`, `update` (tanpa `list`/`delete`) | Akses penuh |
| `/roomCodes/{code}` | `code` (6 karakter kapital), `roomId`, `hostUid`, `gameType`, `createdAt` | Pengguna masuk: `get` kode persis; Host: `create`/`delete` | Akses penuh |
| `/rooms/{roomId}` | `id`, `code`, `gameType` (`spyfall \| kata_kata`), `hostUid`, `status` (`lobby \| playing \| voting \| spy_guess \| round_end`), `roundNumber`, `currentRoundId`, `roundDurationSec`, `roundEndsAtMs`, `firstSpeakerUid`, `spyMode`, `enabledPacks`, `selectedLocationNames`, `customLocations`, `customWordPairs`, `eliminatedUids`, `eliminationLog`, `activeVote`, `pendingSpyGuess`, `lastRoundResult`, `createdAt`, `updatedAt` | Anggota/lobi: `get`; Host: `create`, pengaturan lobi, transfer `hostUid`, `delete` | Mengubah status ronde, voting, eliminasi, timer & `lastRoundResult` |
| `/rooms/{roomId}/players/{playerId}` | `uid`, `roomId`, `displayName`, `avatarColor`, `isHost`, `score`, `isReady`, `joinedAt`, `updatedAt` | Anggota: `get`/`list` (wajib filter `roomId`); pemain sendiri: `create` (`score: 0`) & ubah profil; **ubah `score` diblokir** | Menambah `score` secara atomik (`FieldValue.increment`) |
| `/rooms/{roomId}/rounds/{roundId}/secrets/{playerId}` | `uid`, `roundId`, `gameType`, (`isSpy`, `locationName`, `roleName` untuk Game #1) ATAU (`secretWord` saja untuk Game #2 — **tanpa `isSpy`**), `createdAt` | Hanya pemilik kartu saat ronde berjalan; semua anggota ruang saat `round_end`; **`list` & `write` diblokir** | Menulis kartu rahasia seluruh pemain saat ronde dimulai |
| `/rooms/{roomId}/serverState/current` | `roundId`, `roundNumber`, `locationName`, `citizenWord`, `spyWord`, `spyUids[]`, `spyNames[]`, `createdAtMs` | **Diblokir total (`allow read, write: if false`)** | Menyimpan lokasi/kata asli & identitas Penyusup untuk verifikasi server |

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
   bun run test   # Menjalankan 18 unit test Vitest (Yang Bener Yang Mana + Kata-Kata Hari Ini)
   bun run lint   # Menjalankan ESLint + validasi keamanan firestore.rules
   bun run dev    # Menjalankan Next.js di http://localhost:3000
   ```

#### Auto-Deployment (InfinityFree + Firebase Cloud Functions v2 & Firestore Rules)
Buat **satu** GitHub Repository Secret bernama **`YUK_MAIN_DEPLOY_SECRETS`** (*Settings → Secrets and variables → Actions*) dengan format JSON yang sama seperti pada bagian Bahasa Inggris di atas:
- Isi `ftp.serverDir` sesuai direktori tujuan di InfinityFree (misalnya `"/htdocs/"` atau `"/subdomain.rf.gd/htdocs/"`).
- Biarkan `"site": { "basePath": "" }` jika di-host di root domain/subdomain; isi `"/subfolder"` hanya jika diakses melalui subfolder URL.
- Unduh berkas JSON lengkap Service Account dari **Firebase Console → Project Settings → Service accounts → Generate new private key**, lalu tempel seluruh isinya ke `"firebaseServiceAccount"` (wajib memuat `client_email` dan `private_key`). Workflow Firebase otomatis men-deploy **Cloud Functions v2 sekaligus `firestore.rules`** (`--only functions,firestore:rules`).
- Pastikan domain InfinityFree sudah didaftarkan di **Firebase Console → Authentication → Settings → Authorized domains** dan aturan `database.rules.json` telah dipublikasikan di Realtime Database Rules.

---

### Sistem Penomoran Versi (`Version.Iteration.build`)

Yuk Main menggunakan format penomoran 3 bagian: **`Version.Iteration.build`**

| Bagian | Arti | Kapan Dinaikkan |
| :--- | :--- | :--- |
| **`Version`** | Tonggak besar platform | Penambahan permainan pesta baru ke katalog Yuk Main (misalnya Game #2), perubahan skema besar, atau perombakan arsitektur inti. |
| **`Iteration`** | Iterasi fitur / infrastruktur | Penambahan fitur permainan baru, peningkatan arsitektur backend, paket lokasi baru, atau jalur deployment/CI baru. |
| **`build`** | Build perbaikan / pemeliharaan | Perbaikan bug, pengetatan aturan keamanan, ketahanan autentikasi/jaringan, perbaikan build, dan pembaruan dokumentasi. |

#### Riwayat Pembaruan (Changelog)

- **`2.0.0`** — Ekspansi besar platform: rebranding Game #1 menjadi **Yang Bener Yang Mana**, peluncuran **Game #2: Kata-Kata Hari Ini** (penyusup kata buta tanpa kebocoran `isSpy`, Multi-Spy `1 / 2 / Acak`, 36 pasangan kata Indonesia dalam 3 paket + pembuat pasangan kustom, eliminasi bertahap, dan Kesempatan Terakhir menebak Kata Warga), penambahan Cloud Functions v2 `kataKataStart`/`Vote`/`Guess`/`Resolve` & rute preview, pembaruan `firestore.rules`, serta migrasi CI ke Bun (`bun.lock`) + FTP InfinityFree.
- **`1.2.1`** — Konsolidasi seluruh kredensial ke satu GitHub Secret JSON (`YUK_MAIN_DEPLOY_SECRETS`) dengan masking otomatis `::add-mask::`, dukungan `ftp.serverDir` kustom, opsi `site.basePath`, `README.md` dwibahasa, `CONTRIBUTING.md`, dan lisensi PolyForm Noncommercial 1.0.0.
- **`1.2.0`** — Penambahan jalur build statis InfinityFree (`STATIC_EXPORT=true`, `public/.htaccess`), workflow auto-deploy FTPS GitHub Actions, serta backend Firebase Cloud Functions v2 (`asia-southeast1`: `spyfallStart`, `spyfallVote`, `spyfallGuess`, `spyfallResolve`) via `httpsCallable`.
- **`1.1.2`** — Penguatan build standalone Next.js (`app/not-found.tsx`, `serverExternalPackages: ['firebase-admin']`) dan perbaikan error `HTTP 405` saat voting melalui header `X-Firebase-Token` + mekanisme *retry* otomatis.
- **`1.1.1`** — Perbaikan query daftar pemain (`where('roomId', '==', roomId)`) agar sesuai aturan keamanan Firestore, pembersihan listener saat keluar ruang, pelaporan kode error Auth, dan penutupan otomatis `AuthDialog`.
- **`1.1.0`** — Peningkatan ke arsitektur **Server-Side Blind-Host Game Master** (`firebase-admin`, dokumen `serverState/current` khusus server, serta penguncian penulisan `secrets` dan `score` di `firestore.rules`).
- **`1.0.0`** — Peluncuran perdana hub **Yuk Main** dan Game #1 (kini **Yang Bener Yang Mana**) dengan 26 lokasi Indonesia dalam 3 paket, pembuat lokasi/peran kustom, 9 unit test Vitest, Kartu Privasi, serta arsitektur hibrida Cloud Firestore + RTDB.

---

### Lisensi & Hak Komersial

- **Lisensi Publik:** [PolyForm Noncommercial License 1.0.0](./LICENSE) — **Hak Cipta © 2026 Ilham Liorahmat**.
- **Diperbolehkan untuk publik:** Siapa pun boleh melihat kode, melakukan *fork*, memodifikasi, men-host sendiri secara gratis untuk keperluan **pribadi, pendidikan, hobi, dan non-komersial**, serta mengirimkan Pull Request sesuai [CONTRIBUTING.md](./CONTRIBUTING.md).
- **Larangan Monetisasi Tanpa Izin:** Penggunaan komersial atau monetisasi dalam bentuk apa pun (termasuk iklan, *paywall*, hosting berbayar, atau penjualan ulang) **dilarang keras** bagi siapa pun selain pemilik hak cipta asli (**Ilham Liorahmat**), kecuali dengan izin komersial tertulis terpisah.
