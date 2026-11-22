import type {
  UlarBoardMode,
  UlarHeroClassId,
  UlarItemId,
  UlarScenarioId,
  UlarTanggaSettings,
} from '../types';

export interface UlarHeroClassMeta {
  id: UlarHeroClassId;
  name: string;
  archetype: string;
  maxHp: number;
  combatBonus: number;
  damageReduction: number;
  chestGoldBonus: number;
  ladderHealBonus: number;
  skillName: string;
  skillDescription: string;
  skillCooldown: number;
  needsTarget: boolean;
  accentClass: string;
}

export interface UlarItemMeta {
  id: UlarItemId;
  name: string;
  price: number;
  description: string;
  needsTarget: boolean;
}

export interface UlarMonsterTemplate {
  id: string;
  name: string;
  power: number;
  damage: number;
  rewardGold: number;
  flavor: string;
}

export interface UlarScenarioPack {
  id: UlarScenarioId;
  name: string;
  genre: string;
  artStyle: 'nusantara' | 'cyber' | 'mistis';
  prologue: string;
  roleplayPrompt: string;
  ladderLabel: string;
  snakeLabel: string;
  merchantLabel: string;
  ladders: Array<{ from: number; to: number }>;
  snakesStandard: Array<{ from: number; to: number }>;
  snakesBrutalExtra: Array<{ from: number; to: number }>;
  chestTiles: number[];
  monsterTiles: number[];
  shopTiles: number[];
  monsters: UlarMonsterTemplate[];
}

export const ULAR_HERO_CLASSES: Record<UlarHeroClassId, UlarHeroClassMeta> = {
  ksatria: {
    id: 'ksatria',
    name: 'Ksatria',
    archetype: 'Tank & Pengawal',
    maxHp: 16,
    combatBonus: 1,
    damageReduction: 2,
    chestGoldBonus: 0,
    ladderHealBonus: 0,
    skillName: 'Bantingan Perisai',
    skillDescription: 'Pukul mundur 1 lawan -3 petak, atau ambil ancang-ancang +2 langkah.',
    skillCooldown: 3,
    needsTarget: true,
    accentClass: 'text-amber-300',
  },
  pencuri: {
    id: 'pencuri',
    name: 'Pencuri',
    archetype: 'Pemburu Harta',
    maxHp: 12,
    combatBonus: 0,
    damageReduction: 0,
    chestGoldBonus: 10,
    ladderHealBonus: 0,
    skillName: 'Copet Kilat',
    skillDescription: 'Curi 15G dari 1 lawan, atau melesat cepat +3 langkah.',
    skillCooldown: 3,
    needsTarget: true,
    accentClass: 'text-emerald-300',
  },
  penyihir: {
    id: 'penyihir',
    name: 'Penyihir',
    archetype: 'Ahli Sabotase',
    maxHp: 11,
    combatBonus: 2,
    damageReduction: 0,
    chestGoldBonus: 0,
    ladderHealBonus: 0,
    skillName: 'Sihir Petak',
    skillDescription: 'Lemparkan mantra dorong lawan -4 petak, atau teleportasi +4 langkah.',
    skillCooldown: 3,
    needsTarget: true,
    accentClass: 'text-violet-300',
  },
  tabib: {
    id: 'tabib',
    name: 'Tabib',
    archetype: 'Penjaga & Penyembuh',
    maxHp: 13,
    combatBonus: 0,
    damageReduction: 0,
    chestGoldBonus: 0,
    ladderHealBonus: 3,
    skillName: 'Doa Pelindung',
    skillDescription: 'Pulihkan +5 HP dan aktifkan Perisai Anti-Ular untuk diri sendiri.',
    skillCooldown: 3,
    needsTarget: false,
    accentClass: 'text-cyan-300',
  },
};

export const ULAR_HERO_CLASS_ORDER: UlarHeroClassId[] = [
  'ksatria',
  'pencuri',
  'penyihir',
  'tabib',
];

export const ULAR_RPG_ITEMS: Record<UlarItemId, UlarItemMeta> = {
  ramuan_hp: {
    id: 'ramuan_hp',
    name: 'Ramuan HP',
    price: 20,
    description: 'Pulihkan +6 HP seketika.',
    needsTarget: false,
  },
  jimat_anti_ular: {
    id: 'jimat_anti_ular',
    name: 'Jimat Anti-Ular',
    price: 25,
    description: 'Menangkis 1 gigitan & seluncuran Sarang Ular berikutnya.',
    needsTarget: false,
  },
  sepatu_kilat: {
    id: 'sepatu_kilat',
    name: 'Sepatu Kilat',
    price: 30,
    description: 'Tambah +3 langkah ekstra saat melempar dadu giliran ini.',
    needsTarget: false,
  },
  bom_ular: {
    id: 'bom_ular',
    name: 'Bom Ular',
    price: 35,
    description: 'Ledakkan 1 lawan: mundur -5 petak dan kehilangan -3 HP.',
    needsTarget: true,
  },
  gulungan_tukar: {
    id: 'gulungan_tukar',
    name: 'Gulungan Tukar',
    price: 45,
    description: 'Tukar posisi petakmu langsung dengan 1 lawan pilihan!',
    needsTarget: true,
  },
};

export const ULAR_ITEM_IDS: UlarItemId[] = [
  'ramuan_hp',
  'jimat_anti_ular',
  'sepatu_kilat',
  'bom_ular',
  'gulungan_tukar',
];

export const ULAR_SCENARIO_PACKS: Record<UlarScenarioId, UlarScenarioPack> = {
  menara_nusantara: {
    id: 'menara_nusantara',
    name: 'Menara Nusantara',
    genre: 'Fantasi Candi & Rimba',
    artStyle: 'nusantara',
    prologue:
      'Kalian mendaki Menara Candi kuno yang dijaga ular keramat dan roh hutan. Kumpulkan pusaka sebelum puncak tersentuh!',
    roleplayPrompt:
      'Ucapkan gaya kelasmu tiap kali naik tangga atau berhadapan dengan monster penjaga menara!',
    ladderLabel: 'Tangga Bambu Suci',
    snakeLabel: 'Sarang Ular Keramat',
    merchantLabel: 'Kedai Tabib Keliling',
    ladders: [
      { from: 4, to: 14 },
      { from: 9, to: 31 },
      { from: 21, to: 42 },
      { from: 28, to: 55 },
      { from: 51, to: 67 },
      { from: 71, to: 91 },
      { from: 80, to: 96 },
    ],
    snakesStandard: [
      { from: 17, to: 7 },
      { from: 34, to: 19 },
      { from: 47, to: 26 },
      { from: 62, to: 39 },
      { from: 75, to: 53 },
      { from: 88, to: 64 },
      { from: 97, to: 78 },
    ],
    snakesBrutalExtra: [
      { from: 59, to: 41 },
      { from: 93, to: 70 },
    ],
    chestTiles: [6, 16, 25, 38, 52, 66, 79, 89],
    monsterTiles: [12, 23, 35, 49, 60, 73, 84, 94],
    shopTiles: [15, 40, 65, 86],
    monsters: [
      {
        id: 'goblin_pasar',
        name: 'Goblin Pasar Batu',
        power: 4,
        damage: 3,
        rewardGold: 20,
        flavor: 'Meminta pajak koin di anak tangga candi.',
      },
      {
        id: 'biawak_purba',
        name: 'Biawak Purba Lumut',
        power: 5,
        damage: 3,
        rewardGold: 25,
        flavor: 'Menjaga lorong berlumut di lantai tengah.',
      },
      {
        id: 'buto_ijo',
        name: 'Buto Ijo Penjaga',
        power: 5,
        damage: 4,
        rewardGold: 30,
        flavor: 'Mengayunkan gada kayu raksasa di tikungan menara.',
      },
      {
        id: 'siluman_kobra',
        name: 'Siluman Kobra Emas',
        power: 6,
        damage: 4,
        rewardGold: 35,
        flavor: 'Ular penjaga puncak yang haus duel kehormatan.',
      },
    ],
  },
  distrik_neon: {
    id: 'distrik_neon',
    name: 'Distrik Neon 2099',
    genre: 'Sci-Fi Cyberpunk',
    artStyle: 'cyber',
    prologue:
      'Menembus blokade korporasi di Distrik Neon! Gunakan lift hologram, hindari kabel tegangan tinggi, dan retas drone patroli.',
    roleplayPrompt:
      'Anggap setiap giliran adalah misi peretasan—tawarkan aliansi atau sabotase dengan kode sandi!',
    ladderLabel: 'Lift Hologram',
    snakeLabel: 'Kabel Tegangan Glitch',
    merchantLabel: 'Kios Mod Cyber',
    ladders: [
      { from: 3, to: 22 },
      { from: 11, to: 29 },
      { from: 20, to: 41 },
      { from: 33, to: 54 },
      { from: 48, to: 69 },
      { from: 63, to: 82 },
      { from: 77, to: 95 },
    ],
    snakesStandard: [
      { from: 18, to: 5 },
      { from: 31, to: 13 },
      { from: 44, to: 24 },
      { from: 58, to: 36 },
      { from: 74, to: 50 },
      { from: 86, to: 61 },
      { from: 98, to: 76 },
    ],
    snakesBrutalExtra: [
      { from: 67, to: 45 },
      { from: 92, to: 68 },
    ],
    chestTiles: [7, 19, 28, 43, 53, 68, 81, 90],
    monsterTiles: [14, 26, 37, 51, 65, 79, 85, 93],
    shopTiles: [16, 39, 64, 87],
    monsters: [
      {
        id: 'drone_patroli',
        name: 'Drone Patroli Sektor',
        power: 4,
        damage: 3,
        rewardGold: 20,
        flavor: 'Menyorotkan pemindai laser di koridor bawah.',
      },
      {
        id: 'bot_hacker',
        name: 'Bot Hacker Liar',
        power: 5,
        damage: 3,
        rewardGold: 25,
        flavor: 'Mencoba membekukan chip navigasimu.',
      },
      {
        id: 'anomali_firewall',
        name: 'Anomali Firewall Merah',
        power: 5,
        damage: 4,
        rewardGold: 30,
        flavor: 'Dinding keamanan aktif di menara data.',
      },
      {
        id: 'mecha_serigala',
        name: 'Mecha Serigala Apex',
        power: 6,
        damage: 4,
        rewardGold: 35,
        flavor: 'Unit pemburu elit penjaga atap Distrik Neon.',
      },
    ],
  },
  pasar_mistis: {
    id: 'pasar_mistis',
    name: 'Pasar Malam Mistis',
    genre: 'Horor Komedi Lokal',
    artStyle: 'mistis',
    prologue:
      'Tersesat di Pasar Malam gaib lewat tengah malam! Tawar jimat di lapak misterius dan waspadai penunggu pasar yang iseng.',
    roleplayPrompt:
      'Bumbui permainan dengan gaya nego pasar malam atau alasan mistis setiap kali terkena ular!',
    ladderLabel: 'Tangga Lampion Gaib',
    snakeLabel: 'Jebakan Asap Bayangan',
    merchantLabel: 'Lapak Jimat Tengah Malam',
    ladders: [
      { from: 5, to: 18 },
      { from: 12, to: 30 },
      { from: 22, to: 45 },
      { from: 36, to: 57 },
      { from: 50, to: 70 },
      { from: 68, to: 87 },
      { from: 79, to: 94 },
    ],
    snakesStandard: [
      { from: 19, to: 6 },
      { from: 32, to: 15 },
      { from: 49, to: 27 },
      { from: 61, to: 40 },
      { from: 76, to: 54 },
      { from: 89, to: 66 },
      { from: 99, to: 74 },
    ],
    snakesBrutalExtra: [
      { from: 56, to: 38 },
      { from: 91, to: 71 },
    ],
    chestTiles: [8, 17, 29, 42, 55, 69, 82, 92],
    monsterTiles: [13, 24, 37, 52, 63, 73, 85, 96],
    shopTiles: [16, 44, 67, 88],
    monsters: [
      {
        id: 'tuyul_pemalak',
        name: 'Tuyul Pemalak Koin',
        power: 4,
        damage: 3,
        rewardGold: 20,
        flavor: 'Bersembunyi di balik gerobak martabak gaib.',
      },
      {
        id: 'pocong_jaga',
        name: 'Pocong Pos Ronda',
        power: 5,
        damage: 3,
        rewardGold: 25,
        flavor: 'Melompat menghadang di lorong lampion.',
      },
      {
        id: 'kuntilanak_tenda',
        name: 'Penjaga Tenda Bianglala',
        power: 5,
        damage: 4,
        rewardGold: 30,
        flavor: 'Tertawa nyaring di depan panggung kosong.',
      },
      {
        id: 'genderuwo_gerbang',
        name: 'Genderuwo Gerbang Akhir',
        power: 6,
        damage: 4,
        rewardGold: 35,
        flavor: 'Penjaga raksasa di pintu keluar pasar malam.',
      },
    ],
  },
};

export const ULAR_SCENARIO_ORDER: UlarScenarioId[] = [
  'menara_nusantara',
  'distrik_neon',
  'pasar_mistis',
];

export function getUlarScenarioPack(scenarioId?: string | null): UlarScenarioPack {
  if (scenarioId && scenarioId in ULAR_SCENARIO_PACKS) {
    return ULAR_SCENARIO_PACKS[scenarioId as UlarScenarioId];
  }
  return ULAR_SCENARIO_PACKS.menara_nusantara;
}

export function getActiveSnakesForScenario(
  pack: UlarScenarioPack,
  boardMode: UlarBoardMode,
): Array<{ from: number; to: number }> {
  return boardMode === 'brutal'
    ? [...pack.snakesStandard, ...pack.snakesBrutalExtra]
    : [...pack.snakesStandard];
}

export function getDefaultUlarTanggaSettings(): UlarTanggaSettings {
  return {
    scenarioId: 'menara_nusantara',
    boardMode: 'standar',
    exactFinishBounce: true,
    classSelectionByUid: {},
  };
}

export function sanitizeUlarTanggaSettings(
  raw?: Partial<UlarTanggaSettings> | null,
): UlarTanggaSettings {
  const def = getDefaultUlarTanggaSettings();
  if (!raw || typeof raw !== 'object') return def;

  const scenarioId: UlarScenarioId =
    raw.scenarioId && raw.scenarioId in ULAR_SCENARIO_PACKS
      ? (raw.scenarioId as UlarScenarioId)
      : def.scenarioId;

  const boardMode: UlarBoardMode = raw.boardMode === 'brutal' ? 'brutal' : 'standar';
  const exactFinishBounce =
    typeof raw.exactFinishBounce === 'boolean' ? raw.exactFinishBounce : def.exactFinishBounce;

  const cleanClasses: Record<string, UlarHeroClassId | 'acak'> = {};
  if (raw.classSelectionByUid && typeof raw.classSelectionByUid === 'object') {
    for (const [uid, val] of Object.entries(raw.classSelectionByUid)) {
      if (val === 'acak' || (typeof val === 'string' && val in ULAR_HERO_CLASSES)) {
        cleanClasses[uid] = val as UlarHeroClassId | 'acak';
      }
    }
  }

  return {
    scenarioId,
    boardMode,
    exactFinishBounce,
    classSelectionByUid: cleanClasses,
  };
}
