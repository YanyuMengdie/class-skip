import { DungeonEvent } from '../types';

/**
 * 随机事件池
 */
const EVENT_POOL: Omit<DungeonEvent, 'id'>[] = [
  {
    type: 'treasure',
    title: '古老上锁的宝箱',
    description: '你发现了一个沉重的铁制宝箱，上面覆盖着发光的符文。它散发着微弱的秘法能量，数百年未被触碰。',
    difficultyClass: 15,
    requiredStudyMinutes: 25,
    rewards: { gold: 50, itemId: 'item-scroll-wisdom' }
  },
  {
    type: 'combat',
    title: '分心哥布林',
    description: '一队哥布林挡住了你的去路。它们低语着拖延和无脑刷手机的诱惑。',
    difficultyClass: 12,
    requiredStudyMinutes: 20,
    rewards: { gold: 30, itemId: 'item-potion-clarity' }
  },
  {
    type: 'puzzle',
    title: '符文谜题',
    description: '古老的符文在墙上形成一个谜题。解读它们需要深度专注和清晰的思维。',
    difficultyClass: 18,
    requiredStudyMinutes: 30,
    rewards: { itemId: 'item-key-knowledge', storyId: 'story-3' }
  },
  {
    type: 'encounter',
    title: '智慧学者',
    description: '一位虚幻的学者出现了。"通过专注的学习证明你的奉献精神，"他们说。',
    difficultyClass: 10,
    requiredStudyMinutes: 15,
    rewards: { gold: 25, itemId: 'item-helmet-focus' }
  },
  {
    type: 'treasure',
    title: '隐藏的宝库',
    description: '在假墙后面，你找到了一个装满古代学习文物的宝库。',
    difficultyClass: 14,
    requiredStudyMinutes: 22,
    rewards: { gold: 40, itemId: 'item-boots-persistence' }
  },
  {
    type: 'combat',
    title: '拖延恶魔',
    description: '一个阴影般的身影出现，提供轻松的逃避。你必须抵抗它的诱惑。',
    difficultyClass: 16,
    requiredStudyMinutes: 35,
    rewards: { gold: 60, itemId: 'item-ring-concentration' }
  },
  {
    type: 'encounter',
    title: '记忆之泉',
    description: '一个增强记忆力的魔法喷泉。饮用它需要持续的专注。',
    difficultyClass: 13,
    requiredStudyMinutes: 28,
    rewards: { itemId: 'item-crown-mastery', storyId: 'story-4' }
  },
  {
    type: 'puzzle',
    title: '专注迷宫',
    description: '一个反映你心理状态的镜面迷宫。只有清晰才能引导你通过。',
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
