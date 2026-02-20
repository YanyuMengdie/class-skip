import { DungeonRoom, DungeonItem, DungeonStory } from '../types';

export const INITIAL_ROOMS: DungeonRoom[] = [
  {
    id: 'room-1',
    name: '无光城堡',
    description: '你已找回古老的专注卷轴。',
    unlocked: true,
    cleared: true,
    icon: 'castle',
    color: 'indigo'
  },
  {
    id: 'room-2',
    name: '哥布林营地',
    description: '你已击败分心巡逻队。',
    unlocked: true,
    cleared: true,
    icon: 'shield',
    color: 'emerald'
  },
  {
    id: 'room-3',
    name: '秘法档案馆',
    description: '此处寂静如金。完成专注学习即可探索。',
    unlocked: true,
    cleared: false,
    icon: 'library_books',
    color: 'violet'
  },
  {
    id: 'room-4',
    name: '巨龙巢穴',
    description: '前路被迷雾遮蔽...',
    unlocked: false,
    cleared: false,
    icon: 'diamond',
    color: 'amber'
  },
  {
    id: 'room-5',
    name: '深渊暗域',
    description: '未知的深度等待着你...',
    unlocked: false,
    cleared: false,
    icon: 'nightlight',
    color: 'slate'
  },
  {
    id: 'room-6',
    name: '水晶洞窟',
    description: '知识在此结晶...',
    unlocked: false,
    cleared: false,
    icon: 'auto_awesome',
    color: 'cyan'
  },
  {
    id: 'room-7',
    name: '禁书图书馆',
    description: '古老的文字低语着秘密...',
    unlocked: false,
    cleared: false,
    icon: 'menu_book',
    color: 'rose'
  },
  {
    id: 'room-8',
    name: '精通之塔',
    description: '专注的终极考验...',
    unlocked: false,
    cleared: false,
    icon: 'tower',
    color: 'purple'
  }
];

export const DUNGEON_ITEMS: DungeonItem[] = [
  {
    id: 'item-scroll-wisdom',
    name: '智慧卷轴',
    description: '古老的知识充盈你的脑海。',
    rarity: 'common',
    icon: 'history_edu'
  },
  {
    id: 'item-potion-clarity',
    name: '清晰药水',
    description: '在 1 小时内减少 50% 的分心概率。',
    rarity: 'common',
    icon: 'science'
  },
  {
    id: 'item-helmet-focus',
    name: '专注头盔',
    description: '在 30 分钟内防止分心。',
    rarity: 'rare',
    icon: 'shield'
  },
  {
    id: 'item-sword-focus',
    name: '专注之剑',
    description: '下次学习时专注力保留 +20%。',
    rarity: 'legendary',
    icon: 'swords'
  },
  {
    id: 'item-key-knowledge',
    name: '知识之钥',
    description: '解锁隐藏房间。',
    rarity: 'rare',
    icon: 'key'
  },
  {
    id: 'item-crown-mastery',
    name: '精通王冠',
    description: '经验值获得 +30%。',
    rarity: 'legendary',
    icon: 'workspace_premium'
  },
  {
    id: 'item-boots-persistence',
    name: '坚持之靴',
    description: '减少疲劳积累。',
    rarity: 'common',
    icon: 'hiking'
  },
  {
    id: 'item-ring-concentration',
    name: '专注之戒',
    description: '学习 1 小时后，D20 投掷结果 +2。',
    rarity: 'epic',
    icon: 'diamond'
  }
];

export const DUNGEON_STORIES: DungeonStory[] = [
  {
    id: 'story-1',
    title: '觉醒',
    content: '你在昏暗的房间里醒来。古老的符文在墙上发出微弱的光芒，低语着专注与决心的秘密。这就是你旅程的开始。',
    unlocked: true,
    chapter: 1
  },
  {
    id: 'story-2',
    title: '首次胜利',
    content: '分心的哥布林在你坚定的专注力面前倒下。你感到更强大、更专注。前方的道路现在更清晰了。',
    unlocked: true,
    chapter: 2
  },
  {
    id: 'story-3',
    title: '档案馆',
    content: '在秘法档案馆中，寂静并非空虚——它充满了答案。每一刻的专注都解锁更深层的理解。',
    unlocked: false,
    chapter: 3
  },
  {
    id: 'story-4',
    title: '巨龙的挑战',
    content: '拖延的巨龙守护着最深的房间。只有真正的精通才能克服它的影响。',
    unlocked: false,
    chapter: 4
  },
  {
    id: 'story-5',
    title: '达成精通',
    content: '你已成为自己心灵的主人。地牢臣服于你的意志，知识自由流淌。',
    unlocked: false,
    chapter: 5
  }
];
