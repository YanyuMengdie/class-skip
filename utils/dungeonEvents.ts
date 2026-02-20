import { DungeonEvent } from '../types';

/**
 * 随机事件池
 */
const EVENT_POOL: Omit<DungeonEvent, 'id'>[] = [
  {
    type: 'treasure',
    title: 'Ancient Locked Chest',
    description: 'You discover a heavy iron-bound chest covered in glowing runes. It hums with faint arcane energy, untouched for centuries.',
    difficultyClass: 15,
    requiredStudyMinutes: 25,
    rewards: { gold: 50, itemId: 'item-scroll-wisdom' }
  },
  {
    type: 'combat',
    title: 'Distraction Goblins',
    description: 'A patrol of goblins blocks your path. They whisper temptations of procrastination and mindless scrolling.',
    difficultyClass: 12,
    requiredStudyMinutes: 20,
    rewards: { gold: 30, itemId: 'item-potion-clarity' }
  },
  {
    type: 'puzzle',
    title: 'Rune Puzzle',
    description: 'Ancient runes form a puzzle on the wall. Deciphering them requires deep focus and mental clarity.',
    difficultyClass: 18,
    requiredStudyMinutes: 30,
    rewards: { itemId: 'item-key-knowledge', storyId: 'story-3' }
  },
  {
    type: 'encounter',
    title: 'Wise Scholar',
    description: 'An ethereal scholar appears. "Prove your dedication through focused study," they say.',
    difficultyClass: 10,
    requiredStudyMinutes: 15,
    rewards: { gold: 25, itemId: 'item-helmet-focus' }
  },
  {
    type: 'treasure',
    title: 'Hidden Cache',
    description: 'Behind a false wall, you find a cache of ancient learning artifacts.',
    difficultyClass: 14,
    requiredStudyMinutes: 22,
    rewards: { gold: 40, itemId: 'item-boots-persistence' }
  },
  {
    type: 'combat',
    title: 'Procrastination Demon',
    description: 'A shadowy figure materializes, offering easy escapes. You must resist its pull.',
    difficultyClass: 16,
    requiredStudyMinutes: 35,
    rewards: { gold: 60, itemId: 'item-ring-concentration' }
  },
  {
    type: 'encounter',
    title: 'Memory Fountain',
    description: 'A magical fountain that enhances recall. Drinking from it requires sustained focus.',
    difficultyClass: 13,
    requiredStudyMinutes: 28,
    rewards: { itemId: 'item-crown-mastery', storyId: 'story-4' }
  },
  {
    type: 'puzzle',
    title: 'Focus Labyrinth',
    description: 'A maze of mirrors that reflects your mental state. Only clarity can guide you through.',
    difficultyClass: 17,
    requiredStudyMinutes: 40,
    rewards: { gold: 80, itemId: 'item-sword-focus' }
  }
];

/**
 * 随机生成一个事件
 */
export function generateRandomEvent(): DungeonEvent {
  const template = EVENT_POOL[Math.floor(Math.random() * EVENT_POOL.length)];
  return {
    ...template,
    id: `event-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  };
}

/**
 * 根据骰子结果判断是否成功
 * 
 * @param diceResult D20 结果（1-20）
 * @param difficultyClass 难度等级（DC）
 * @returns 是否成功
 */
export function checkEventSuccess(diceResult: number, difficultyClass: number): boolean {
  return diceResult >= difficultyClass;
}

/**
 * 根据事件类型和成功与否生成结果描述
 */
export function getEventResultText(event: DungeonEvent, success: boolean, diceResult: number): string {
  if (success) {
    switch (event.type) {
      case 'combat':
        return `你成功击败了敌人！骰子结果：${diceResult}（DC ${event.difficultyClass}）`;
      case 'puzzle':
        return `谜题解开！骰子结果：${diceResult}（DC ${event.difficultyClass}）`;
      case 'treasure':
        return `宝箱打开！骰子结果：${diceResult}（DC ${event.difficultyClass}）`;
      case 'encounter':
        return `奇遇成功！骰子结果：${diceResult}（DC ${event.difficultyClass}）`;
      default:
        return `成功！骰子结果：${diceResult}`;
    }
  } else {
    switch (event.type) {
      case 'combat':
        return `战斗失败...骰子结果：${diceResult}（需要 ${event.difficultyClass}+）`;
      case 'puzzle':
        return `谜题未解...骰子结果：${diceResult}（需要 ${event.difficultyClass}+）`;
      case 'treasure':
        return `宝箱锁住了...骰子结果：${diceResult}（需要 ${event.difficultyClass}+）`;
      case 'encounter':
        return `奇遇错过...骰子结果：${diceResult}（需要 ${event.difficultyClass}+）`;
      default:
        return `失败...骰子结果：${diceResult}`;
    }
  }
}
