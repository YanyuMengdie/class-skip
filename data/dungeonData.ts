import { DungeonRoom, DungeonItem, DungeonStory } from '../types';

export const INITIAL_ROOMS: DungeonRoom[] = [
  {
    id: 'room-1',
    name: 'The Sunless Citadel',
    description: 'Recovered the ancient scroll of focusing.',
    unlocked: true,
    cleared: true,
    icon: 'castle',
    color: 'indigo'
  },
  {
    id: 'room-2',
    name: 'Goblin Camp',
    description: 'Defeated the distractions patrol.',
    unlocked: true,
    cleared: true,
    icon: 'shield',
    color: 'emerald'
  },
  {
    id: 'room-3',
    name: 'Arcane Archives',
    description: 'Silence is golden here. Complete focus session to explore.',
    unlocked: true,
    cleared: false,
    icon: 'library_books',
    color: 'violet'
  },
  {
    id: 'room-4',
    name: "Dragon's Lair",
    description: 'The path is obscured by fog...',
    unlocked: false,
    cleared: false,
    icon: 'diamond',
    color: 'amber'
  },
  {
    id: 'room-5',
    name: 'The Deep Dark',
    description: 'Unknown depths await...',
    unlocked: false,
    cleared: false,
    icon: 'nightlight',
    color: 'slate'
  },
  {
    id: 'room-6',
    name: 'Crystal Caverns',
    description: 'Where knowledge crystallizes...',
    unlocked: false,
    cleared: false,
    icon: 'auto_awesome',
    color: 'cyan'
  },
  {
    id: 'room-7',
    name: 'The Forbidden Library',
    description: 'Ancient texts whisper secrets...',
    unlocked: false,
    cleared: false,
    icon: 'menu_book',
    color: 'rose'
  },
  {
    id: 'room-8',
    name: 'Tower of Mastery',
    description: 'The ultimate test of focus...',
    unlocked: false,
    cleared: false,
    icon: 'tower',
    color: 'purple'
  }
];

export const DUNGEON_ITEMS: DungeonItem[] = [
  {
    id: 'item-scroll-wisdom',
    name: 'Scroll of Wisdom',
    description: 'Ancient knowledge fills your mind.',
    rarity: 'common',
    icon: 'history_edu'
  },
  {
    id: 'item-potion-clarity',
    name: 'Potion of Clarity',
    description: 'Reduces distraction chance by 50% for 1h.',
    rarity: 'common',
    icon: 'science'
  },
  {
    id: 'item-helmet-focus',
    name: 'Helmet of Focus',
    description: 'Prevents distractions for 30m.',
    rarity: 'rare',
    icon: 'shield'
  },
  {
    id: 'item-sword-focus',
    name: 'Sword of Focus',
    description: '+20% Focus retention for next session.',
    rarity: 'legendary',
    icon: 'swords'
  },
  {
    id: 'item-key-knowledge',
    name: 'Key of Knowledge',
    description: 'Unlocks hidden rooms.',
    rarity: 'rare',
    icon: 'key'
  },
  {
    id: 'item-crown-mastery',
    name: 'Crown of Mastery',
    description: 'Increases XP gain by 30%.',
    rarity: 'legendary',
    icon: 'workspace_premium'
  },
  {
    id: 'item-boots-persistence',
    name: 'Boots of Persistence',
    description: 'Reduces fatigue accumulation.',
    rarity: 'common',
    icon: 'hiking'
  },
  {
    id: 'item-ring-concentration',
    name: 'Ring of Concentration',
    description: '+2 to D20 rolls after 1 hour of focus.',
    rarity: 'epic',
    icon: 'diamond'
  }
];

export const DUNGEON_STORIES: DungeonStory[] = [
  {
    id: 'story-1',
    title: 'The Awakening',
    content: 'You awaken in a dimly lit chamber. Ancient runes glow faintly on the walls, whispering secrets of focus and determination. This is where your journey begins.',
    unlocked: true,
    chapter: 1
  },
  {
    id: 'story-2',
    title: 'First Victory',
    content: 'The goblins of distraction fall before your unwavering concentration. You feel stronger, more focused. The path ahead is clearer now.',
    unlocked: true,
    chapter: 2
  },
  {
    id: 'story-3',
    title: 'The Archives',
    content: 'In the Arcane Archives, silence is not empty—it is full of answers. Each moment of focus unlocks deeper understanding.',
    unlocked: false,
    chapter: 3
  },
  {
    id: 'story-4',
    title: 'Dragon\'s Challenge',
    content: 'The dragon of procrastination guards the deepest chambers. Only true mastery can overcome its influence.',
    unlocked: false,
    chapter: 4
  },
  {
    id: 'story-5',
    title: 'Mastery Achieved',
    content: 'You have become the master of your own mind. The dungeon bows to your will, and knowledge flows freely.',
    unlocked: false,
    chapter: 5
  }
];
