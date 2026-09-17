import { describe, expect, it } from 'vitest';
import {
  buildUnderstandingPrompt,
  normalizeUnderstandingResult,
  type UnderstandingAction,
  type UnderstandingSession,
} from './readingUnderstanding';

const session: UnderstandingSession = {
  version: 1,
  id: 'understanding-1',
  topic: '当前概念',
  sourceText: '第 3 页：在适用条件成立时，模型预测 A。第 4 页：观察 B 也可能有其他解释。',
  pageRefs: [3, 4],
  turns: [],
  mode: 'acquisition',
  phase: 'question',
  createdAt: 1,
};

const response = {
  topic: session.topic,
  mode: 'restructuring',
  phase: 'question',
  messageMarkdown: '换一个条件，你会怎样预测？',
  pageRefs: [3],
};

const afterCheck: UnderstandingSession = {
  ...session,
  phase: 'check',
  turns: [{ id: 'check', role: 'model', text: '假设条件不成立，还能应用结论吗？请说明理由。', phase: 'check', timestamp: 2 }],
};

describe('understanding response evidence', () => {
  it('deduplicates valid references within the current source', () => {
    const normalized = normalizeUnderstandingResult({ ...response, pageRefs: [3, 4, 3] }, {
      session, action: 'start', userText: '',
    });
    expect(normalized.pageRefs).toEqual([3, 4]);
  });

  it.each([{ pageRefs: [3, 99] }, { pageRefs: [3, '4'] }, { pageRefs: [99] }, { pageRefs: ['3'] }, { pageRefs: [-1, 0, 3.5] }, { pageRefs: [null] }])('rejects a whole response containing any invalid citations: $pageRefs', ({ pageRefs }) => {
    expect(() => normalizeUnderstandingResult({ ...response, pageRefs }, {
      session, action: 'start', userText: '',
    })).toThrow('不在当前材料范围内的页码');
  });

  it('allows an explicitly uncited conversational reply but rejects malformed citation containers', () => {
    expect(normalizeUnderstandingResult({ ...response, pageRefs: [] }, {
      session, action: 'hint', userText: '',
    }).pageRefs).toEqual([]);
    expect(() => normalizeUnderstandingResult({ ...response, pageRefs: '3' }, {
      session, action: 'hint', userText: '',
    })).toThrow('页码格式无效');
  });

  it.each([null, [], {}, { ...response, messageMarkdown: '  ' }])('rejects absent or empty generated replies', (raw) => {
    expect(() => normalizeUnderstandingResult(raw, { session, action: 'start', userText: '' })).toThrow();
  });

  it('accepts completion only in response to an existing check', () => {
    const userText = '不能，因为结论依赖刚才假设中的适用条件。';
    expect(normalizeUnderstandingResult({ ...response, phase: 'complete' }, {
      session: afterCheck, action: 'answer', userText,
    }).phase).toBe('complete');
    expect(() => normalizeUnderstandingResult({ ...response, phase: 'complete' }, {
      session, action: 'answer', userText,
    })).toThrow('缺少完成理解检验的依据');
  });

  it.each([
    '', '  ', '我懂了', '明白了！', '不知道',
    '完全明白了，谢谢', '谢谢你，我已经完全理解了。', '懂了，好的，谢谢！',
    'I understand now, thanks!', 'Okay, got it. Thank you!',
    'A', '（B）', '我选 C。', '答案：D', '选项B', '第二个', '1',
    'A，谢谢', '我选A。完全明白了，谢谢。', '是的', '不能', 'Yes',
  ])('does not mark a check complete from an option, request or self-report: %s', (userText) => {
    expect(() => normalizeUnderstandingResult({ ...response, phase: 'complete' }, {
      session: afterCheck, action: 'answer', userText,
    })).toThrow('缺少完成理解检验的依据');
  });

  it.each<UnderstandingAction>(['start', 'hint', 'revisit', 'explain', 'foundation'])('does not count %s as answering a check', (action) => {
    expect(() => normalizeUnderstandingResult({ ...response, phase: 'complete' }, {
      session: afterCheck, action, userText: '按钮请求不是检验答案。',
    })).toThrow('缺少完成理解检验的依据');
  });

  it.each<UnderstandingAction>(['explain', 'foundation'])('always treats %s as explanation, even when the model asks to check', (action) => {
    const result = normalizeUnderstandingResult({ ...response, phase: 'check' }, {
      session: afterCheck, action, userText: '',
    });
    expect(result.phase).toBe('explanation');
    if (action === 'foundation') expect(result.mode).toBe('acquisition');
  });

  it('does not use a stale session phase to bypass the most recent model turn', () => {
    const nextSession: UnderstandingSession = {
      ...afterCheck,
      turns: [...afterCheck.turns, { id: 'explain', role: 'model', text: '这里先讲清原理。', phase: 'explanation', timestamp: 3 }],
    };
    expect(() => normalizeUnderstandingResult({ ...response, phase: 'complete' }, {
      session: nextSession, action: 'answer', userText: '我可以用同样条件推到结论。',
    })).toThrow('缺少完成理解检验的依据');
  });

  it.each<UnderstandingAction>(['hint', 'explain', 'foundation', 'revisit'])('does not reuse an old check after an unanswered %s request', (action) => {
    const withPendingRequest: UnderstandingSession = {
      ...afterCheck,
      turns: [...afterCheck.turns, { id: 'help-request', role: 'user', action, text: '先帮我解释。', timestamp: 3 }],
    };
    expect(() => normalizeUnderstandingResult({ ...response, phase: 'complete' }, {
      session: withPendingRequest, action: 'answer', userText: '条件变了。',
    })).toThrow('缺少完成理解检验的依据');

    const withLaterAnswer: UnderstandingSession = {
      ...withPendingRequest,
      turns: [...withPendingRequest.turns, { id: 'later-answer', role: 'user', action: 'answer', text: '条件变了。', timestamp: 4 }],
    };
    expect(() => normalizeUnderstandingResult({ ...response, phase: 'complete' }, {
      session: withLaterAnswer, action: 'answer', userText: '条件变了。',
    })).toThrow('缺少完成理解检验的依据');
  });

  it.each(['条件变了', 'A，条件变了', '谢谢，结论仍依赖原先的假设'])('does not use length or connector counts to reject a substantive answer: %s', (userText) => {
    const withCurrentAnswer: UnderstandingSession = {
      ...afterCheck,
      turns: [...afterCheck.turns, { id: 'current-answer', role: 'user', action: 'answer', text: userText, timestamp: 3 }],
    };
    expect(normalizeUnderstandingResult({ ...response, phase: 'complete' }, {
      session: withCurrentAnswer, action: 'answer', userText,
    }).phase).toBe('complete');
  });
});

describe('understanding reflection provenance', () => {
  const reflection = {
    before: '只要看到 A 就能确定原因。',
    trigger: '如果另一种原因也能产生 A 呢？',
    after: '看到 A 还不够，需要排除其他原因。',
  };
  const withAttempts: UnderstandingSession = {
    ...session,
    turns: [
      { id: 'old', role: 'user', action: 'answer', text: reflection.before, timestamp: 2 },
      { id: 'counterexample', role: 'model', text: reflection.trigger, phase: 'question', timestamp: 3 },
    ],
  };

  it('keeps the actual old view, encountered prompt and later learner wording', () => {
    expect(normalizeUnderstandingResult({ ...response, reflection }, {
      session: withAttempts, action: 'answer', userText: reflection.after,
    }).reflection).toEqual(reflection);
  });

  it.each(['before', 'trigger', 'after'] as const)('omits reflection when its %s was invented', (field) => {
    expect(normalizeUnderstandingResult({ ...response, reflection: { ...reflection, [field]: '这是没有出现过的说法。' } }, {
      session: withAttempts, action: 'answer', userText: reflection.after,
    }).reflection).toBeUndefined();
  });

  it('does not manufacture a learner history from only AI explanations or button requests', () => {
    const noAttempts: UnderstandingSession = {
      ...session,
      turns: [
        { id: 'model-old', role: 'model', text: `${reflection.before}\n${reflection.trigger}`, timestamp: 2 },
        { id: 'button', role: 'user', action: 'explain', text: reflection.after, timestamp: 3 },
      ],
    };
    expect(normalizeUnderstandingResult({ ...response, reflection }, {
      session: noAttempts, action: 'hint', userText: reflection.after,
    }).reflection).toBeUndefined();
  });

  it('requires the revised view to occur after the old view, in a separate attempt', () => {
    expect(normalizeUnderstandingResult({ ...response, reflection }, {
      session: {
        ...withAttempts,
        turns: [
          { id: 'new-first', role: 'user', text: reflection.after, timestamp: 1 },
          ...withAttempts.turns,
        ],
      },
      action: 'hint', userText: '',
    }).reflection).toBeUndefined();
    expect(normalizeUnderstandingResult({ ...response, reflection }, {
      session: { ...session, sourceText: reflection.trigger },
      action: 'answer', userText: `${reflection.before}${reflection.after}`,
    }).reflection).toBeUndefined();
  });
});

describe('understanding prompt contract', () => {
  it('includes the actual source, action and adjustable time budget without inventing a completion entitlement', () => {
    const prompt = buildUnderstandingPrompt({ session, action: 'foundation', userText: '这里没基础', minutes: 3 });
    expect(prompt).toContain(session.sourceText);
    expect(prompt).toContain('时间预算：3 分钟');
    expect(prompt).toContain('这里没基础');
    expect(prompt).toContain('只能返回 explanation');
    expect(prompt).toContain('否，禁止返回 complete');
    expect(prompt).toContain('理论预测、实际观察、证据质量和解释边界');
  });

  it('uses a finite default budget and passes completion eligibility only for a real check answer', () => {
    const prompt = buildUnderstandingPrompt({
      session: afterCheck, action: 'answer', userText: '不能，因为适用条件已被改变。', minutes: Number.NaN,
    });
    expect(prompt).toContain('时间预算：5 分钟');
    expect(prompt).toContain('是，但仍须核对本次理由是否成立');
  });

  it.each(['A', '完全明白了，谢谢'])('does not tell the model a non-answer is eligible for completion: %s', (userText) => {
    const prompt = buildUnderstandingPrompt({ session: afterCheck, action: 'answer', userText, minutes: 3 });
    expect(prompt).toContain('否，禁止返回 complete');
  });
});
