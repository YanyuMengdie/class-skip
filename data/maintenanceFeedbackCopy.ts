import type { LearnerMood, MaintenanceFeedbackVariant } from '../types';

export function buildFeedbackExitCopy(params: {
  examTitles: string[];
  cardCount: number;
  daysToNearest: number | null;
  /** P1：语气变体 */
  variant?: MaintenanceFeedbackVariant;
  mood?: LearnerMood;
}): { title: string; body: string } {
  const examLabel = params.examTitles.length > 0 ? params.examTitles.join('、') : '你选择的考试';
  const dayText =
    params.daysToNearest == null
      ? '目前先保持手感就很够用'
      : `离最近一场考试还有 ${params.daysToNearest} 天`;
  const v = params.variant ?? 'standard';
  const mood = params.mood ?? 'normal';

  if (mood === 'dont_want' && v === 'gentle') {
    return {
      title: '愿意打开，就已经很棒',
      body: `今天能点开「${examLabel}」相关材料并过完 ${params.cardCount} 张闪卡，本身就是胜利。${dayText}——不想学时也能走一小步，这就够了。想停就停，我们随时等你回来。`,
    };
  }

  if (v === 'gentle') {
    return {
      title: '今天这段节奏很温柔',
      body: `你在「${examLabel}」上轻量过了 ${params.cardCount} 张闪卡。${dayText}——不用逼自己完美，一点点维持就很稳。`,
    };
  }

  if (v === 'celebrate_small') {
    return {
      title: '小步也算数',
      body: `你在「${examLabel}」上完成了 ${params.cardCount} 张闪卡。${dayText}——远考阶段，能持续碰一下材料，比一次猛学更省力。`,
    };
  }

  return {
    title: '今天这段记忆维持很棒',
    body: `你在「${examLabel}」相关材料上快速过了 ${params.cardCount} 张重点闪卡。${dayText}——这种“偶尔碰一下”的节奏，比考前硬背更稳。想歇了就歇，我们明天还能继续。`,
  };
}

export function buildFeedbackStrongCopy(params: {
  examTitles: string[];
  cardCount: number;
  quizCount: number;
  variant?: MaintenanceFeedbackVariant;
  mood?: LearnerMood;
}): { title: string; body: string } {
  const examLabel = params.examTitles.length > 0 ? params.examTitles.join('、') : '你选择的考试';
  const v = params.variant ?? 'standard';
  const mood = params.mood ?? 'normal';

  if (v === 'gentle' || mood === 'dont_want') {
    return {
      title: '加码完成，你做得很好',
      body: `闪卡 ${params.cardCount} 张 + 测验 ${params.quizCount} 题都完成了。在「${examLabel}」上，你比刚才多走了一小步——这本身就值得肯定。累了就休息，不必再证明自己。`,
    };
  }

  if (v === 'celebrate_small') {
    return {
      title: '小加码，稳稳的',
      body: `闪卡 ${params.cardCount} 张 + 测验 ${params.quizCount} 题完成。你对「${examLabel}」又多了一层提取练习——保持这种「可持续」的节奏就很好。`,
    };
  }

  return {
    title: '加码完成，状态加一分',
    body: `闪卡 ${params.cardCount} 张 + 测验 ${params.quizCount} 题都完成了。你对「${examLabel}」相关内容的提取练习比刚才更扎实了一步。还有精力可以继续开考前预测；没精力也完全 OK。`,
  };
}
