export function buildFeedbackExitCopy(params: {
  examTitles: string[];
  cardCount: number;
  daysToNearest: number | null;
}): { title: string; body: string } {
  const examLabel = params.examTitles.length > 0 ? params.examTitles.join('、') : '你选择的考试';
  const dayText =
    params.daysToNearest == null
      ? '目前先保持手感就很够用'
      : `离最近一场考试还有 ${params.daysToNearest} 天`;
  return {
    title: '今天这段记忆维持很棒',
    body: `你在「${examLabel}」相关材料上快速过了 ${params.cardCount} 张重点闪卡。${dayText}——这种“偶尔碰一下”的节奏，比考前硬背更稳。想歇了就歇，我们明天还能继续。`,
  };
}

export function buildFeedbackStrongCopy(params: {
  examTitles: string[];
  cardCount: number;
  quizCount: number;
}): { title: string; body: string } {
  const examLabel = params.examTitles.length > 0 ? params.examTitles.join('、') : '你选择的考试';
  return {
    title: '加码完成，状态加一分',
    body: `闪卡 ${params.cardCount} 张 + 测验 ${params.quizCount} 题都完成了。你对「${examLabel}」相关内容的提取练习比刚才更扎实了一步。还有精力可以继续开考前预测；没精力也完全 OK。`,
  };
}
