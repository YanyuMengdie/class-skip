import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { questionAuditKey } from './questionPresentation';
import { AstraConfigurationNotice, isIndependentPracticeStage, PracticeDesignNotice, readAstraConfiguration, studyRoundAIForRequest, studyRoundProvider, StudyRoundModelChoice, StudyRoundPanel } from './StudyRoundPanel';
import { ConditionEvidenceSummary, PracticeEvidenceSummary } from './ConditionEvidenceSummary';
import { FeedbackAnswer } from './FeedbackAnswer';
import { applyEvaluation, createRound, endRound, pauseRound, recordEvaluationError, recordStoreExposure, saveRoundStore, submitRoundAnswer, updateDraft } from './roundState';
import type { RoundAI, RoundBlueprint, RoundContext, RoundEvaluation, RoundTaskType, StudyRound } from './roundTypes';

const modelMocks = vi.hoisted(() => ({
  gemini: { plan: vi.fn(), evaluate: vi.fn(), support: vi.fn(), followUp: vi.fn() },
  astra: { plan: vi.fn(), evaluate: vi.fn(), support: vi.fn(), followUp: vi.fn() },
  create: vi.fn(),
}));
vi.mock('./roundAI', () => ({ createExamRoundAI: modelMocks.create, examRoundAI: modelMocks.gemini }));
const source = { materialId: 'source-a', page: 2, quote: 'Secret source detail.' };
const context: RoundContext = { scope: { id: 'scope-a', title: 'A bounded topic', materials: [{ materialId: 'source-a', title: 'Selected reading', pages: [2] }], objectiveHints: [], mode: 'practice' }, pages: [{ materialId: 'source-a', materialTitle: 'Selected reading', page: 2, text: source.quote }] };
const blueprint = (): RoundBlueprint => { const plan: RoundBlueprint = ({ id: 'plan', scope: context.scope, objectives: [{ id: 'o1', label: 'Explain the relationship', sources: [source] }], questions: [{ id: 'q1', objectiveIds: ['o1'], prompt: 'Explain what happened in your own words.', responseRequirements: [], criteria: [{ id: 'c1', objectiveId: 'o1', requirement: 'Describe the relationship.', expected: 'PRIVATE_EXPECTED_ANSWER', sources: [source] }], kind: 'initial', cueLevel: 4, novelty: 'original' }], maxAttempts: 4, createdAt: 1000 });
  for (const question of plan.questions) {
    question.presentationVersion = 2;
    question.presentationScopeTitle = plan.scope.title;
    question.answerFormat = 'explain';
    question.audit = { version: 1, status: 'checked', questionKey: questionAuditKey(question), cueLevel: question.cueLevel, cognitiveDemand: 'explain', connection: 'single' };
  }
  return plan;
};
const evaluation: RoundEvaluation = { questionValid: true, items: [{ criterionId: 'c1', status: 'met', answerQuote: 'My complete answer', feedback: 'Your explanation addresses the relationship.' }], summary: 'One source requirement addressed.', nextAction: 'continue' };
const guidedEvaluation = (status: 'met' | 'partial' | 'missing' | 'uncertain' = 'met'): RoundEvaluation => ({
  ...evaluation, feedbackVersion: 1,
  items: [{ ...evaluation.items[0], status, answerQuote: status === 'met' || status === 'partial' ? 'My complete answer' : '',
    covered: status === 'met' || status === 'partial' ? 'COVERED_POINT' : '', needed: status === 'partial' || status === 'missing' ? 'REQUIRED_MISSING_POINT' : '' }],
  answerGuide: { referenceAnswer: 'COMPLETE_REFERENCE_PARAGRAPH', criterionIds: ['c1'], sources: [source],
    optionalNotes: [{ text: 'OPTIONAL_EXTENSION_NOT_REQUIRED', sources: [source] }] },
});
const evaluatedRound = (result: RoundEvaluation = guidedEvaluation()) => applyEvaluation(
  submitRoundAnswer(createRound(blueprint(), undefined, 1000), 'My complete answer', 2000), 'plan:1000:attempt:1', result, 3000,
);
const practiceBlueprint = (taskType: RoundTaskType = 'case', cueLevel: 1 | 2 | 3 | 4 = 2): RoundBlueprint => {
  const plan = blueprint();
  plan.practiceDesign = { version: 1, caseAvailability: 'limited', limitation: 'PRIVATE_SOURCE_LIMITATION_WITH_CONCLUSION' };
  const question = plan.questions[0];
  question.practiceVersion = 1;
  question.presentationScopeTitle = '练习任务';
  question.prompt = 'Two teams observe different outcomes.\n\nExplain the difference using the observations provided.';
  question.answerFormat = taskType === 'direct' ? 'explain' : 'apply';
  question.cueLevel = cueLevel;
  question.audit = { version: 1, status: 'checked', questionKey: questionAuditKey(question), cueLevel,
    cognitiveDemand: question.answerFormat, connection: 'single',
    exercise: { version: 1, taskType, applicationObjectiveIds: taskType === 'direct' ? [] : ['o1'], hypothetical: taskType !== 'direct' } };
  return plan;
};
const evaluatedPracticeRound = (taskType: RoundTaskType = 'case', cueLevel: 1 | 2 | 3 | 4 = 2, result = guidedEvaluation()) => applyEvaluation(
  submitRoundAnswer(createRound(practiceBlueprint(taskType, cueLevel), undefined, 1000), 'My complete answer', 2000), 'plan:1000:attempt:1', result, 3000,
);
const key = 'study-round-ui-test';
const render = (rounds: StudyRound[] = [], language: 'zh' | 'en' = 'zh') => {
  saveRoundStore(key, { version: 1, rounds });
  return renderToStaticMarkup(<StudyRoundPanel context={context} storageKey={key} language={language} onOpenSource={() => {}} />);
};
beforeEach(() => {
  vi.clearAllMocks();
  modelMocks.create.mockImplementation((provider: 'gemini' | 'astra') => modelMocks[provider]);
  const values = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (item: string) => values.get(item) ?? null, setItem: (item: string, value: string) => values.set(item, value) });
});
afterEach(() => vi.unstubAllGlobals());

describe('StudyRoundPanel model selection and local configuration', () => {
  it('defaults a new round to Astra without calling either model before preparation', () => {
    const html = render();
    expect(html).not.toContain('type="radio"');
    expect(html).toContain('GPT-6 Astra');
    expect(html).not.toContain('Gemini');
    expect(modelMocks.create).not.toHaveBeenCalled();
  });

  it('reads only the local availability endpoint and does not expose extra response fields', async () => {
    const fetchStatus = vi.fn().mockResolvedValue(new Response(JSON.stringify({ configured: true, model: 'gpt-6-astra', ignored: 'PRIVATE_SERVER_SENTINEL' })));
    expect(await readAstraConfiguration(fetchStatus)).toBe('ready');
    expect(fetchStatus).toHaveBeenCalledOnce();
    expect(fetchStatus).toHaveBeenCalledWith('/api/exam/astra/status', expect.objectContaining({ method: 'GET', cache: 'no-store' }));
    expect(fetchStatus.mock.calls[0][1]).not.toHaveProperty('body');
    expect(modelMocks.create).not.toHaveBeenCalled();
  });

  it.each([
    [{ configured: false, model: 'gpt-6-astra' }, 'missing'],
    [{ configured: true, model: 'another-model' }, 'unavailable'],
    [{ configured: 'true', model: 'gpt-6-astra' }, 'unavailable'],
  ] as const)('fails closed for local status %j', async (status, expected) => {
    expect(await readAstraConfiguration(vi.fn().mockResolvedValue(new Response(JSON.stringify(status))))).toBe(expected);
  });

  it('treats a missing dev route, invalid response or network failure as unavailable', async () => {
    const requests = [
      vi.fn().mockResolvedValue(new Response('Unavailable', { status: 404 })),
      vi.fn().mockResolvedValue(new Response('<html>Not the status route</html>')),
      vi.fn().mockRejectedValue(new Error('PRIVATE_SERVER_ERROR')),
    ];
    for (const fetchStatus of requests) expect(await readAstraConfiguration(fetchStatus)).toBe('unavailable');
    expect(modelMocks.create).not.toHaveBeenCalled();
  });

  it('explains missing configuration locally without a key entry or a model fallback', () => {
    const html = renderToStaticMarkup(<StudyRoundModelChoice configuration="missing" language="zh" onRefresh={() => {}} />);
    expect(html).toContain('先配置OpenAI API密钥');
    expect(html).toContain('OPENAI_API_KEY');
    expect(html).toContain('保存后点击「刷新配置状态」');
    expect(html).toContain('刷新配置状态');
    expect(html).not.toContain('type="password"');
    expect(html).not.toContain('type="text"');
    expect(html).not.toContain('PRIVATE_SERVER');
    expect(html).not.toContain('自动切换');
  });

  it('shows configuration retry without a model picker', () => {
    const html = renderToStaticMarkup(<StudyRoundModelChoice configuration="missing" language="zh" onRefresh={() => {}} />);
    expect(html).not.toContain('type="radio"');
    const refresh = [...html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)].find(button => button[2].includes('刷新配置状态'));
    expect(refresh?.[1]).not.toContain('disabled');
    const pending = renderToStaticMarkup(<AstraConfigurationNotice configuration="checking" language="zh" onRefresh={() => {}} />);
    expect(pending).toContain('正在检查 Astra 本地配置');
    expect(pending).toContain('disabled=""');
  });

  it('routes older rounds to Astra without mutating their historical plans', async () => {
    const plan = blueprint();
    const saved = JSON.stringify(plan);
    expect(studyRoundProvider(plan)).toBe('astra');
    const legacyClient = studyRoundAIForRequest(studyRoundProvider(plan), 'ready', 'zh');
    expect(legacyClient).toBe(modelMocks.astra);
    expect(JSON.stringify(plan)).toBe(saved);
    const astraPlan = { ...plan, model: { provider: 'astra', model: 'gpt-6-astra', reasoning: 'medium' } as const };
    const astraClient = studyRoundAIForRequest(studyRoundProvider(astraPlan), 'ready', 'zh');
    await astraClient.plan(context, { maxAttempts: 4, history: { previousQuestions: [], weakTargets: [], exposures: [] }, language: 'zh' });
    await astraClient.evaluate(context, plan.questions[0], 'My answer', { language: 'zh' });
    await astraClient.support(context, plan.questions[0], 'Draft', 'hint', 'zh');
    await astraClient.followUp(context, createRound(astraPlan, undefined, 1000), 'zh');
    for (const method of ['plan', 'evaluate', 'support', 'followUp'] as const) {
      expect(modelMocks.astra[method]).toHaveBeenCalledOnce();
      expect(modelMocks.gemini[method]).not.toHaveBeenCalled();
    }
  });

  it.each(['checking', 'missing', 'unavailable'] as const)('does not create a paid client or fall back while Astra is %s', configuration => {
    expect(() => studyRoundAIForRequest('astra', configuration, 'zh')).toThrow();
    expect(modelMocks.create).not.toHaveBeenCalled();
    expect(() => studyRoundAIForRequest('astra', configuration, 'en')).toThrow(/OpenAI API key|local Astra/);
  });

  it('keeps an explicitly injected test AI ahead of provider routing and configuration checks', () => {
    const injected = { plan: vi.fn(), evaluate: vi.fn(), support: vi.fn(), followUp: vi.fn() } as RoundAI;
    expect(studyRoundAIForRequest('astra', 'missing', 'zh', injected)).toBe(injected);
    expect(studyRoundAIForRequest('gemini', 'unavailable', 'zh', injected)).toBe(injected);
    expect(modelMocks.create).not.toHaveBeenCalled();
  });

  it('retains an Astra draft and locks paid controls until configuration is ready, with source and pause still available', () => {
    const plan = practiceBlueprint();
    plan.model = { provider: 'astra', model: 'gpt-6-astra', reasoning: 'medium' };
    const round = updateDraft(createRound(plan, undefined, 1000), 'PRESERVED_ASTRA_DRAFT', 1500);
    const before = JSON.stringify(round);
    const html = render([round]);
    expect(html).toContain('PRESERVED_ASTRA_DRAFT');
    expect(html).toContain('<span class="study-round-model-label">GPT-6 Astra</span>');
    expect(html).not.toContain('type="radio"');
    const buttons = [...html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)];
    for (const label of ['提交完整回答', '给一点提示', '先讲给我']) expect(buttons.find(button => button[2].includes(label))?.[1]).toContain('disabled');
    for (const label of ['暂停', '第 2 页']) expect(buttons.find(button => button[2].includes(label))?.[1]).not.toContain('disabled');
    expect(JSON.stringify(round)).toBe(before);
    expect(modelMocks.create).not.toHaveBeenCalled();
  });
});

describe('StudyRoundPanel disclosure and recovery', () => {
  it('discloses a valid case round with stronger cues without claiming a source shortage or low-cue success', () => {
    for (const language of ['zh', 'en'] as const) {
      const html = renderToStaticMarkup(<PracticeDesignNotice language={language}
        design={{ version: 1, caseAvailability: 'included', preparationNote: 'stronger_cues' }} />);
      expect(html).toContain(language === 'zh' ? '案例已准备好' : 'Your cases are ready');
      expect(html).toContain(language === 'zh' ? '实际提示条件' : 'actual conditions');
      expect(html).not.toContain(language === 'zh' ? '这段材料适合的案例较少' : 'supports fewer case tasks');
      expect(html).not.toContain('未借助额外帮助完成');
    }
  });

  it('prepares for varied application tasks without mounting the topic or private criteria', () => {
    const html = render();
    expect(html).toContain('本轮以应用为主');
    expect(html).toContain('比较、预测或解读结果');
    expect(html).not.toContain(context.scope.title);
    expect(html).not.toContain('PRIVATE_EXPECTED_ANSWER');
  });

  it('shows a reviewed hypothetical case as paragraphs with neutral source names before submission', () => {
    const html = render([createRound(practiceBlueprint(), undefined, 1000)]);
    expect(html).toContain('案例分析');
    expect(html).toContain('假设情境');
    expect(html).toContain('<p>Two teams observe different outcomes.</p>');
    expect(html).toContain('<p>Explain the difference using the observations provided.</p>');
    expect(html).toContain('title="资料 1 · 第 2 页"');
    for (const privateText of [context.scope.title, 'Selected reading', 'Describe the relationship.', 'PRIVATE_EXPECTED_ANSWER',
      'Secret source detail.', 'PRIVATE_SOURCE_LIMITATION_WITH_CONCLUSION', '这次练到了什么']) expect(html).not.toContain(privateText);
  });

  it.each<[{ taskType: RoundTaskType; label: string }]>([
    [{ taskType: 'direct', label: '基础回顾' }], [{ taskType: 'compare', label: '比较解释' }],
    [{ taskType: 'predict', label: '预测变化' }], [{ taskType: 'data', label: '解读结果' }],
  ])('shows only the reviewed task label for $taskType', ({ taskType, label }) => {
    const html = render([createRound(practiceBlueprint(taskType), undefined, 1000)]);
    expect(html).toContain(label);
    expect(html.includes('假设情境')).toBe(taskType !== 'direct');
    expect(html).not.toContain('PRIVATE_EXPECTED_ANSWER');
  });

  it('withholds case labels and the question when its exercise review is missing', () => {
    const round = createRound(practiceBlueprint(), undefined, 1000);
    delete round.questions[0].audit!.exercise;
    const html = render([round]);
    expect(html).toContain('这轮旧题需要重新整理');
    expect(html).not.toContain('Two teams observe different outcomes.');
    expect(html).not.toContain('假设情境');
    expect(html).not.toContain('提交完整回答');
  });

  it('uses local source-limit text before answering and reveals the source reason only in a folded answer-stage detail', () => {
    const design = practiceBlueprint().practiceDesign;
    const prepared = renderToStaticMarkup(<PracticeDesignNotice design={design} language="zh" />);
    expect(prepared).toContain('这段材料适合的案例较少');
    expect(prepared).not.toContain('PRIVATE_SOURCE_LIMITATION_WITH_CONCLUSION');
    const answered = render([evaluatedPracticeRound()]);
    expect(answered).toContain('<details class="study-round-practice-limitation">');
    expect(answered).toContain('PRIVATE_SOURCE_LIMITATION_WITH_CONCLUSION');
    const stoppedBeforeAnswer = render([endRound(createRound(practiceBlueprint(), undefined, 1000), 2000)]);
    expect(stoppedBeforeAnswer).not.toContain('PRIVATE_SOURCE_LIMITATION_WITH_CONCLUSION');
  });

  it('distinguishes foundation, application and untested low-cue cases after answering', () => {
    const foundation = render([evaluatedPracticeRound('direct')]);
    expect(foundation).toContain('已练基础 · 1 次');
    expect(foundation).toContain('案例应用还没检查');
    const cued = render([evaluatedPracticeRound('case', 3)]);
    expect(cued).toContain('已做案例应用 · 1 次');
    expect(cued).toContain('较少线索的案例还没检查');
    const lowCue = render([evaluatedPracticeRound()]);
    expect(lowCue).toContain('已练较少线索的案例 · 1 次');
    expect(lowCue).toContain('未借助额外帮助完成 1 次');
    expect(lowCue).toContain('不代表全部知识已掌握');
    expect(render([evaluatedRound()])).not.toContain('这次练到了什么');
  });

  it('keeps missing and disputed case work out of successful completion claims', () => {
    const partial = evaluatedPracticeRound('case', 2, guidedEvaluation('partial'));
    const partialHtml = renderToStaticMarkup(<PracticeEvidenceSummary attempts={partial.attempts} language="zh" />);
    expect(partialHtml).toContain('仍有遗漏 1 次');
    expect(partialHtml).not.toContain('未借助额外帮助完成 1 次');
    const disputed = evaluatedPracticeRound();
    disputed.attempts[0].dispute = { note: 'Review this judgment.', at: 4000 };
    const disputedHtml = renderToStaticMarkup(<PracticeEvidenceSummary attempts={disputed.attempts} language="zh" />);
    expect(disputedHtml).not.toContain('已做案例应用 · 1 次');
    expect(disputedHtml).not.toContain('未借助额外帮助完成 1 次');
  });

  it('does not borrow case application from a different objective in a composite question', () => {
    const plan = practiceBlueprint();
    const question = plan.questions[0];
    plan.objectives.push({ id: 'o2', label: 'Apply the relationship', sources: [source] });
    question.objectiveIds.push('o2');
    question.criteria.push({ ...question.criteria[0], id: 'c2', objectiveId: 'o2' });
    question.audit!.connection = 'linked';
    question.audit!.exercise!.applicationObjectiveIds = ['o2'];
    question.audit!.questionKey = questionAuditKey(question);
    const round = createRound(plan, undefined, 1000);
    const submitted = submitRoundAnswer(round, 'My complete answer', 2000);
    const result = guidedEvaluation();
    result.items.push({ ...result.items[0], criterionId: 'c2' });
    result.answerGuide!.criterionIds.push('c2');
    const completed = applyEvaluation(submitted, submitted.attempts[0].id, result, 3000);
    const foundation = renderToStaticMarkup(<ConditionEvidenceSummary attempts={completed.attempts} objectiveId="o1" language="zh" />);
    expect(foundation).toContain('已练基础 · 1 次');
    expect(foundation).toContain('案例应用还没检查');
    expect(foundation).not.toContain('已做案例应用 · 1 次');
    const application = renderToStaticMarkup(<ConditionEvidenceSummary attempts={completed.attempts} objectiveId="o2" language="zh" />);
    expect(application).toContain('已做案例应用 · 1 次');
    expect(application).not.toContain('已练基础 · 1 次');
  });

  it('keeps surrounding names neutral for a new unfinished draft, including pause and resume, without changing old rounds', () => {
    const round = createRound(practiceBlueprint(), undefined, 1000);
    expect(isIndependentPracticeStage(round)).toBe(true);
    expect(isIndependentPracticeStage(pauseRound(round, 2000))).toBe(true);
    expect(isIndependentPracticeStage(submitRoundAnswer(round, 'My complete answer', 2000))).toBe(false);
    expect(isIndependentPracticeStage(endRound(round, 2000))).toBe(false);
    expect(isIndependentPracticeStage(createRound(blueprint(), undefined, 1000))).toBe(false);
  });

  it('presents correct points, actual omissions and a complete reference answer before folded optional details', () => {
    const html = render([evaluatedRound(guidedEvaluation('partial'))]);
    expect(html.indexOf('你已经说对的')).toBeLessThan(html.indexOf('本题还需要补的'));
    expect(html.indexOf('本题还需要补的')).toBeLessThan(html.indexOf('一份简短完整的参考回答'));
    expect(html.indexOf('一份简短完整的参考回答')).toBeLessThan(html.indexOf('想深入再看'));
    expect(html).toContain('COVERED_POINT');
    expect(html).toContain('REQUIRED_MISSING_POINT');
    expect(html).toContain('COMPLETE_REFERENCE_PARAGRAPH');
    expect(html).toContain('这是一种合适的表达，不需要照背');
    expect(html).toContain('<details class="study-round-optional-notes">');
    expect(html).toContain('<details class="study-round-criterion-details">');
    const omissions = html.match(/<section class="study-round-feedback-section study-round-needed">([\s\S]*?)<\/section>/)?.[1];
    expect(omissions).toContain('REQUIRED_MISSING_POINT');
    expect(omissions).not.toContain('OPTIONAL_EXTENSION_NOT_REQUIRED');
    expect(html).toContain('不是本题缺少的要求');
  });

  it('keeps prior reference answers and optional notes unmounted while answering a new question', () => {
    const previous = endRound(evaluatedRound(), 4000);
    const current = createRound(blueprint(), undefined, 5000);
    const html = render([previous, current]);
    expect(html).toContain('提交完整回答');
    expect(html).not.toContain('COMPLETE_REFERENCE_PARAGRAPH');
    expect(html).not.toContain('OPTIONAL_EXTENSION_NOT_REQUIRED');
    expect(html).not.toContain('COVERED_POINT');
  });

  it('confirms that an all-met answer needs no extra detail and makes continuing the primary action', () => {
    const html = render([evaluatedRound()]);
    expect(html).toContain('你已经回应了本题的全部要求');
    expect(html).toContain('不需要为了完整而再加细节');
    expect(html).toMatch(/<button[^>]*class="study-round-primary"[^>]*>继续下一题/);
    expect(html).toContain('再练一道（可选）');
    expect(html).toContain('少些提示再试（可选）');
    expect(html).not.toContain('按需要再检查一点');
    expect(html).not.toContain('REQUIRED_MISSING_POINT');
  });

  it('shows the last complete reference answer directly after the attempt budget ends', () => {
    const round = endRound(evaluatedRound(), 4000);
    round.endReason = 'budget';
    const html = render([round]);
    const visibleFeedback = html.match(/<section class="study-round-final-feedback">([\s\S]*?)<details class="study-round-optional-notes">/)?.[1];
    expect(visibleFeedback).toContain('COMPLETE_REFERENCE_PARAGRAPH');
    expect(html.indexOf('COMPLETE_REFERENCE_PARAGRAPH')).toBeLessThan(html.indexOf('展开完整原答与反馈'));
  });

  it('offers explicit feedback reorganization only for the current round and preserves the original record', () => {
    const current = evaluatedRound(evaluation);
    const originalAnswer = current.attempts[0].answer;
    const html = render([current]);
    expect(html).toContain('这是旧版反馈');
    expect(html).toContain('按新方式整理反馈');
    expect(html).toContain('不另提交，也不增加作答次数');
    expect(html).not.toContain('COMPLETE_REFERENCE_PARAGRAPH');
    expect(current.attempts).toHaveLength(1);
    expect(current.attempts[0].answer).toBe(originalAnswer);
    const previous = endRound(current, 4000);
    const latest = endRound(createRound(blueprint(), undefined, 5000), 6000);
    const historyHtml = render([previous, latest]);
    expect(historyHtml).toContain('这是旧版反馈');
    expect(historyHtml).not.toContain('按新方式整理反馈');
  });

  it('shows failed reorganization clearly with the old answer, old feedback and retry still available', () => {
    const current = evaluatedRound(evaluation);
    const failed = recordEvaluationError(current, current.attempts[0].id, 'REFRESH_FAILED_RETRY_AVAILABLE', 4000);
    const html = render([failed]);
    expect(html).toContain('REFRESH_FAILED_RETRY_AVAILABLE');
    expect(html).toContain('My complete answer');
    expect(html).toContain('Your explanation addresses the relationship.');
    expect(html).toContain('按新方式整理反馈');
    const finished = render([endRound(failed, 5000)]);
    expect(finished).toContain('REFRESH_FAILED_RETRY_AVAILABLE');
  });

  it('withholds success and gap claims for an uncertain answer but still shows a valid reference', () => {
    const html = render([evaluatedRound(guidedEvaluation('uncertain'))]);
    expect(html).toContain('这次回答的判定还需要核对');
    expect(html).toContain('COMPLETE_REFERENCE_PARAGRAPH');
    expect(html).not.toContain('你已经说对的');
    expect(html).not.toContain('本题还需要补的');
    expect(html).not.toContain('你已经回应了本题的全部要求');
    expect(html).not.toContain('针对未回应的点再试');
  });

  it('does not show a reference or claim knowledge gaps for an invalid question, even if a guide was supplied', () => {
    const current = evaluatedRound();
    const invalid = { ...guidedEvaluation(), questionValid: false, invalidReason: 'Wrong source scope.', items: [] };
    const html = renderToStaticMarkup(<FeedbackAnswer attempt={current.attempts[0]} evaluation={invalid} language="zh" renderSources={() => null} />);
    expect(html).toContain('这道题的依据需要重新确认');
    expect(html).toContain('Wrong source scope.');
    expect(html).not.toContain('COMPLETE_REFERENCE_PARAGRAPH');
    expect(html).not.toContain('OPTIONAL_EXTENSION_NOT_REQUIRED');
    expect(html).not.toContain('本题还需要补的');
    expect(html).not.toContain('data-status="met"');
  });

  it('offers bounded attempt budgets and explains that follow-ups also count', () => {
    const html = render();
    expect(html).toContain('追问和重测也算一次');
    expect(html).toContain('>4<'); expect(html).toContain('>6<'); expect(html).toContain('>8<');
    expect(html).toContain('准备这一轮');
    expect(html).toContain('默认不限时');
    expect(html).toContain('3 分钟');
    expect(html).toContain('5 分钟');
  });
  it('shows only neutral format instructions and never mounts private criteria or quotes before submission', () => {
    const html = render([createRound(blueprint(), undefined, 1000)]);
    expect(html).toContain('用自己的话说明理由或过程。');
    expect(html).not.toContain('Describe the relationship.');
    expect(html).not.toContain('PRIVATE_EXPECTED_ANSWER');
    expect(html).not.toContain('Secret source detail.');
    expect(html).toContain('先独立想一想，卡住时可以用提示');
    expect(html).toContain('先讲给我');
  });
  it('preserves the complete submitted answer and reveals the criterion evidence only in feedback', () => {
    const round = applyEvaluation(submitRoundAnswer(createRound(blueprint(), undefined, 1000), 'My complete answer', 2000), 'plan:1000:attempt:1', evaluation, 3000);
    const html = render([round]);
    expect(html).toContain('My complete answer');
    expect(html).toContain('PRIVATE_EXPECTED_ANSWER');
    expect(html).toContain('Secret source detail.');
    expect(html).toContain('回答被误解');
  });
  it('keeps an older leaked question and its requirements out of the answer screen', () => {
    const plan = blueprint();
    const question = plan.questions[0];
    delete question.audit; delete question.presentationVersion;
    question.prompt = 'LEGACY_QUESTION_WITH_ANSWER';
    question.responseRequirements = ['GR_METHYLATION_DECREASES_AND_HPA_FEEDBACK_INCREASES'];
    const round = updateDraft(createRound(plan, undefined, 1000), 'MY_PRESERVED_DRAFT', 1500);
    const html = render([round]);
    expect(html).toContain('这轮旧题需要重新整理');
    expect(html).toContain('MY_PRESERVED_DRAFT');
    expect(html).not.toContain('LEGACY_QUESTION_WITH_ANSWER');
    expect(html).not.toContain('GR_METHYLATION_DECREASES_AND_HPA_FEEDBACK_INCREASES');
    expect(html).not.toContain('提交完整回答');
  });
  it('offers a controlled cue reduction only after feedback on a reviewed cued question', () => {
    const round = applyEvaluation(submitRoundAnswer(createRound(blueprint(), undefined, 1000), 'My complete answer', 2000), 'plan:1000:attempt:1', evaluation, 3000);
    const html = render([round]);
    expect(html).toContain('少些提示再试');
    expect(html).toContain('同一知识点、推理要求和情境');
    expect(html).toContain('概念点名');
    expect(html).toContain('未记录额外帮助');
  });
  it('does not offer another submission when feedback is missing', () => {
    const round = submitRoundAnswer(createRound(blueprint(), undefined, 1000), 'My complete answer', 2000);
    const html = render([round]);
    expect(html).toContain('重试反馈，不重复计次');
    expect(html).not.toContain('提交完整回答');
  });
  it('does not restore another block from a shared session store', () => {
    const other = blueprint(); other.scope = { ...other.scope, id: 'other-scope' }; other.questions[0].prompt = 'OTHER_SCOPE_QUESTION';
    const html = render([createRound(other, undefined, 5000)]);
    expect(html).toContain('准备这一轮');
    expect(html).not.toContain('OTHER_SCOPE_QUESTION');
  });
  it('shows a pause screen rather than exposing the question or draft while paused', () => {
    const round = pauseRound(updateDraft(createRound(blueprint(), undefined, 1000), 'PRIVATE_DRAFT', 2000), 3000);
    const html = render([round]);
    expect(html).toContain('先歇一会儿');
    expect(html).not.toContain('PRIVATE_DRAFT');
    expect(html).not.toContain('PRIVATE_EXPECTED_ANSWER');
  });
  it('reports untested areas without claiming a mastery score', () => {
    const html = render([endRound(createRound(blueprint(), undefined, 1000), 2000)]);
    expect(html).toContain('还没检查');
    expect(html).toContain('本轮还没有检查到');
    expect(html).not.toContain('掌握率');
    expect(html).not.toContain('PASS');
  });
  it('shows an exportable recovery warning when saved records cannot be read', () => {
    localStorage.setItem(key, '{bad-json');
    const html = renderToStaticMarkup(<StudyRoundPanel context={context} storageKey={key} language="zh" onOpenSource={() => {}} />);
    expect(html).toContain('记录尚未安全保存');
    expect(html).toContain('导出记录备份');
    expect(localStorage.getItem(key)).toBe('{bad-json');
  });
  it('renders English task controls and indicates the cue type', () => {
    const html = render([createRound(blueprint(), undefined, 1000)], 'en');
    expect(html).toContain('Submit answer');
    expect(html).toContain('Try it first; hints are available if needed');
    expect(html).toContain('Explain it first');
  });
  it('restores an unsaved in-memory draft without overwriting unreadable disk records', () => {
    const round = updateDraft(createRound(blueprint(), undefined, 1000), 'MY_UNSAVED_DRAFT', 2000);
    localStorage.setItem(key, '{bad-json');
    const html = renderToStaticMarkup(<StudyRoundPanel context={context} storageKey={key} language="zh" onOpenSource={() => {}} memoryStore={{ version: 1, rounds: [round] }} />);
    expect(html).toContain('MY_UNSAVED_DRAFT');
    expect(html).toContain('记录尚未安全保存');
    expect(localStorage.getItem(key)).toBe('{bad-json');
  });
  it('recognizes source exposure saved outside the panel before the active task mounts', () => {
    const round = createRound(blueprint(), undefined, Date.now() - 1000);
    saveRoundStore(key, recordStoreExposure({ version: 1, rounds: [round] }, [{ materialId: 'source-a', pages: [2] }], 'source', Date.now()));
    const html = renderToStaticMarkup(<StudyRoundPanel context={context} storageKey={key} language="zh" onOpenSource={() => {}} />);
    expect(html).toContain('本次已有支持记录');
    expect(html).not.toContain('PRIVATE_EXPECTED_ANSWER');
  });
  it('keeps the answer and submit controls available after a soft time limit', () => {
    const plan = blueprint(); plan.answerTimeLimitSeconds = 180;
    const html = render([createRound(plan, undefined, Date.now() - 181000)]);
    expect(html).toContain('已到自己设定的时间，可以继续把答案写完整');
    expect(html).toContain('03:01');
    expect(html).toContain('提交完整回答');
    expect(html).not.toContain('PRIVATE_EXPECTED_ANSWER');
  });
  it('shows actual submitted duration and a chosen-limit overrun in feedback and the report', () => {
    const plan = blueprint(); plan.answerTimeLimitSeconds = 180;
    const round = applyEvaluation(submitRoundAnswer(createRound(plan, undefined, 1000), 'My complete answer', 182000), 'plan:1000:attempt:1', evaluation, 183000);
    const feedback = render([round]);
    expect(feedback).toContain('用时 03:01');
    expect(feedback).toContain('超出自选时限');
    const report = render([endRound(round, 184000)]);
    expect(report).toContain('已记录 1 次作答用时，共 03:01');
    expect(report).toContain('1 次超出自选时限');
  });
  it('does not invent zero-second timing for older attempts without timing data', () => {
    const round = applyEvaluation(submitRoundAnswer(createRound(blueprint(), undefined, 1000), 'My complete answer', 2000), 'plan:1000:attempt:1', evaluation, 3000);
    delete round.attempts[0].elapsedMs;
    expect(render([round])).toContain('未记录用时');
  });
});
