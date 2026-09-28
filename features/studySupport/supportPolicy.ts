export const CHECK_IN_GAP_MS = 20 * 60 * 1000;
export function canCheckIn({ now, lastCheckIn, boundaryChanged, busy, paused, editing, visible }: {
  now: number; lastCheckIn: number; boundaryChanged: boolean; busy: boolean;
  paused: boolean; editing: boolean; visible: boolean;
}) {
  return boundaryChanged && now - lastCheckIn >= CHECK_IN_GAP_MS && !busy && !paused && !editing && visible;
}

// Curated destinations: no learner content or mood is included in outgoing URLs.
export const REST_LINKS = [
  { id: 'nature', href: 'https://explore.org/livecams', zh: '看看小动物和自然直播', en: 'Watch animals and nature', source: 'Explore.org' },
  { id: 'sound', href: 'https://asoftmurmur.com/', zh: '听一点雨声、海浪声', en: 'Listen to rain and waves', source: 'A Soft Murmur' },
] as const;
