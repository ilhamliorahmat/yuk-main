const AVATAR_COLORS = [
  '#DC2626',
  '#D97706',
  '#059669',
  '#0284C7',
  '#4F46E5',
  '#9333EA',
  '#DB2777',
  '#0D9488',
];

export function pickAvatarColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}
