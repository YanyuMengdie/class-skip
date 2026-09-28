import { describe, expect, it } from 'vitest';
import { createMessageUnderstandingPlan } from './messageTopics';
import { prepareMessageUnderstanding } from './understandingScope';
import { createTopicConversation } from './understandingPlan';
import { buildUnderstandingPrompt } from './readingUnderstanding';

// Representative structure of the user's reading message: four steps with nested examples/arguments.
const reading = `现在我们讨论“被弃”。

### 第一步：什么是“被弃”？——拒绝虚伪的世俗道德
在应用内第 41–42 页，解释这一概念。
> 上帝并不存在，而我们必须承担这一断言带来的后果。

---
### 第二步：“人是被判自由的”——没有借口
在应用内第 43 页，解释“被判”与“自由”的含义。
1. **别拿“激情”当挡箭牌：** 人必须对自己的激情负责。
2. **别拿“天意/征兆”当挡箭牌：** 征兆的含义需要自己解释。

### 第三步：教科书级的伦理困境——那个法国年轻人的抉择
在应用内第 44–45 页，年轻人面对两难。
> 去参军，还是留在母亲身边？
- **留在母亲身边：** 行动具体，但只帮助一个人。
- **前往英国参军：** 目标更广，但结果不确定。

### 第四步：一切既有伦理道德的彻底破产
在应用内第 45–46 页，比较两种道德原则为什么无法替他选择。
1. **基督教道德能救他吗？** 应当爱谁？
2. **康德的理性道德能救他吗？** 应当如何把人当作目的？
   - 留在母亲身边和去参军都有需要权衡的对象。

### 小结
不应另起一个小结知识点。
### 下一步
UNSELECTED_NEXT_TOPIC
`;
const pages = Array.from({ length: 37 }, (_, index) => index + 31);
const make = (text: string) => createMessageUnderstandingPlan({ role: 'model', timestamp: 1, text }, text, pages);

describe('groups matching the clicked reading message', () => {
  it('keeps the four original step titles and their complete arguments, without extra intro/list items', () => {
    const plan = make(reading);
    expect(plan.topics.map(topic => topic.title)).toEqual([
      '第一步：什么是“被弃”？——拒绝虚伪的世俗道德',
      '第二步：“人是被判自由的”——没有借口',
      '第三步：教科书级的伦理困境——那个法国年轻人的抉择',
      '第四步：一切既有伦理道德的彻底破产',
    ]);
    expect(plan.topics[1].summary).toContain('激情');
    expect(plan.topics[1].summary).toContain('天意/征兆');
    expect(plan.topics[1].preview).toContain('激情');
    expect(plan.topics[1].preview).toContain('天意/征兆');
    expect(plan.topics[2].summary).toContain('> 去参军');
    expect(plan.topics[2].pageRefs).toEqual([44, 45]);
    expect(plan.topics[3].summary).toContain('基督教');
    expect(plan.topics[3].summary).toContain('康德');
    expect(plan.topics[3].preview).toContain('康德');
    expect(plan.topics[3].summary).not.toContain('UNSELECTED_NEXT_TOPIC');
  });

  it('sends a whole chosen group, including its supporting points, without the other groups', () => {
    const parent = prepareMessageUnderstanding({ role: 'model', timestamp: 1, text: reading }, reading, pages);
    const topic = parent.plan!.topics[3];
    const session = createTopicConversation(parent, topic, parent.plan!);
    const prompt = buildUnderstandingPrompt({ session, action: 'start', userText: '', minutes: 3 });
    expect(prompt).toContain('基督教道德能救他吗');
    expect(prompt).toContain('康德的理性道德能救他吗');
    expect(prompt).not.toContain('别拿“激情”当挡箭牌');
    expect(prompt).not.toContain('UNSELECTED_NEXT_TOPIC');
    expect(session.pageRefs).toEqual([45, 46]);
  });

  it('keeps nested markdown subheadings inside the main section', () => {
    const plan = make('# 整条领读\n\n## 主问题甲\n解释甲。\n### 例子甲\n例子。\n### 推论甲\n推论。\n## 主问题乙\n解释乙。');
    expect(plan.topics.map(topic => topic.title)).toEqual(['主问题甲', '主问题乙']);
    expect(plan.topics[0].summary).toContain('推论甲');
    expect(plan.topics[0].preview).toContain('例子甲');
  });

  it('does not split a single main question into all its subquestions', () => {
    const plan = make('## 一个完整问题\n问题背景。\n### 小点一\n内容一。\n### 小点二\n内容二。');
    expect(plan.topics).toHaveLength(1);
    expect(plan.topics[0].title).toBe('一个完整问题');
  });

  it('recognizes bold step headings but keeps numbered bold arguments inside each step', () => {
    const plan = make('**第一步：概念**\n概念解释。\n1. **小点甲**：说明。\n2. **小点乙**：说明。\n**第二步：案例**\n案例解释。');
    expect(plan.topics.map(topic => topic.title)).toEqual(['第一步：概念', '第二步：案例']);
    expect(plan.topics[0].summary).toContain('小点乙');
  });

  it('keeps an unstructured paragraph and its numbered examples together', () => {
    const plan = make('讨论一个问题。\n1. **第一个例子**：内容。\n2. **第二个例子**：内容。');
    expect(plan.topics).toHaveLength(1);
    expect(plan.topics[0].summary).toContain('第二个例子');
  });

  it('ignores headings in quotes and fenced code as group boundaries', () => {
    const plan = make('## 真实主题\n正文。\n> # 引文标题\n~~~md\n# 示例标题\n```\n## 仍在代码中\n~~~\n## 第二主题\n正文二。');
    expect(plan.topics.map(topic => topic.title)).toEqual(['真实主题', '第二主题']);
  });

  it('does not invent extra topics for housekeeping-only messages or from the module spine', () => {
    expect(make('## 小结\n回顾。\n### 子项\n仍是小结。\n## 下一步\n继续。').topics).toEqual([]);
    const message = { role: 'model' as const, timestamp: 1, text: '## 当前主题\n当前内容。', skimExplanation: { spineItems: [{ id: 'other', titleZh: '整章其他主题', summary: '无关内容', pageRefs: [31] }] } };
    expect(createMessageUnderstandingPlan(message as Parameters<typeof createMessageUnderstandingPlan>[0], message.text, pages).topics.map(topic => topic.title)).toEqual(['当前主题']);
  });

  it('regroups an existing fine-grained list and retains old discussions exactly once', () => {
    const saved = prepareMessageUnderstanding({ role: 'model', timestamp: 1, text: reading }, reading, pages);
    delete saved.plan!.groupingVersion;
    saved.plan!.topics[0].conversation = createTopicConversation(saved, saved.plan!.topics[0], saved.plan!);
    saved.plan!.topics[0].conversation!.turns.push({ id: 'old', role: 'user', text: '以前的疑问', timestamp: 1 });
    const next = prepareMessageUnderstanding({ role: 'model', timestamp: 1, text: reading, skimUnderstanding: saved }, reading, pages);
    expect(next.plan!.groupingVersion).toBe(2);
    expect(next.archivedSessions?.[0]).toEqual(saved);
    expect(next.plan!.topics.every(topic => !topic.conversation)).toBe(true);
    expect(prepareMessageUnderstanding({ role: 'model', timestamp: 1, text: reading, skimUnderstanding: next }, reading, pages)).toBe(next);
  });
});
