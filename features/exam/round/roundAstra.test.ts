import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RoundContext, RoundQuestion, StudyRound } from './roundTypes';

const { generateContent } = vi.hoisted(() => ({ generateContent: vi.fn() }));
vi.mock('@google/genai', async importOriginal => {
  const original = await importOriginal<typeof import('@google/genai')>();
  return { ...original, GoogleGenAI: class { models = { generateContent }; } };
});
import { createExamRoundAI, examRoundAI } from './roundAI';
import { hasReviewedPresentation } from './questionPresentation';

const source = 'A clear endpoint makes it possible to recognize that the action has finished.';
const citation = { materialId: 'm1', page: 1, quote: source };
const context: RoundContext = {
  scope: { id: 'scope', title: 'Action design', mode: 'practice', objectiveHints: [],
    materials: [{ materialId: 'm1', title: 'Lecture', pages: [1] }],
    knowledgeTargets: [{ id: 'atom1', atomId: 'a1', kcId: 'kc1', kcLabel: 'Action design',
      label: 'Recognize completion', description: source, materialId: 'm1', pages: [1], contentKey: 'v1' }] },
  pages: [{ materialId: 'm1', materialTitle: 'Lecture', page: 1, text: source }],
};
const options = { maxAttempts: 4, language: 'en' as const, history: { previousQuestions: [], weakTargets: [], exposures: [] } };
const task = (): RoundQuestion => ({ id: 'q1', objectiveIds: ['atom1'],
  prompt: 'Hypothetical routines say “practice regularly” and “stop after one page”. Which lets a learner recognize when this attempt ends, and why?',
  answerFormat: 'apply', responseRequirements: [], kind: 'initial', novelty: 'new', cueLevel: 2,
  criteria: [{ id: 'c1', objectiveId: 'atom1', requirement: 'Apply the source relationship to recognize completion.', expected: source, sources: [citation] }],
});
const plan = () => ({ canPlan: true, objectives: [{ knowledgeTargetId: 'atom1', sources: [citation] }], questions: [task()] });
type Payload = { selectedContext: RoundContext; evidenceSnippets: Array<typeof citation & { evidenceId: string }>; taskData: Record<string, any> };
type ProxyBody = { instructions: string; input: string; schema: any; maxOutputTokens: number; language: 'zh' | 'en' };
const payload = (body: ProxyBody): Payload => JSON.parse(body.input);
const wire = (value: unknown, data: Payload) => JSON.stringify(value, (_key, item) => {
  if (item && typeof item === 'object' && 'materialId' in item && 'page' in item && 'quote' in item) {
    const match = data.evidenceSnippets.find(source => source.materialId === item.materialId && source.page === item.page && source.quote.includes(item.quote));
    return { evidenceId: match?.evidenceId ?? 'outside-evidence' };
  }
  return item;
});
const review = (data: Payload) => ({ caseFeasible: true, limitation: '',
  reviews: data.taskData.candidateQuestions.map((question: { questionId: string; objectiveIds: string[] }) => ({
    questionId: question.questionId, noAnswerLeak: true, fairCriteria: true, sourceSupported: true,
    sameTask: true, selfContained: true, reason: 'Checked against the supplied source.', cueLevel: 2,
    cognitiveDemand: 'apply', connection: 'single',
    exercise: { taskType: 'case', applicationObjectiveIds: question.objectiveIds, hypothetical: true },
  })) });
const evaluated = () => ({ questionValid: true,
  items: [{ criterionId: 'c1', status: 'met', answerQuote: 'I can tell when it is done.', covered: 'The endpoint makes the finish recognizable.', needed: '', feedback: 'The relationship is present.' }],
  summary: 'The requested meaning is supported.', nextAction: 'continue',
  answerGuide: { referenceAnswer: source, criterionIds: ['c1'], sources: [citation], optionalNotes: [] } });
const fetchMock = vi.fn<typeof fetch>();
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const mockValue = (value: unknown) => fetchMock.mockImplementationOnce(async (_url, init) => {
  const body = JSON.parse(init!.body as string) as ProxyBody;
  return response({ text: wire(value, payload(body)) });
});
const bodyAt = (index: number): ProxyBody => JSON.parse(fetchMock.mock.calls[index][1]!.body as string);

beforeEach(() => {
  generateContent.mockReset();
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (_url, init) => {
    const body = JSON.parse(init!.body as string) as ProxyBody;
    const data = payload(body);
    if (data.taskData.operation === 'review-presentations') return response({ text: JSON.stringify(review(data)) });
    throw new Error('Unexpected Astra request without a fixture');
  });
  vi.stubGlobal('fetch', fetchMock);
  vi.stubEnv('API_KEY', '');
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers(); });

describe('Astra exam transport', () => {
  it('uses only the same-origin proxy without a Gemini key and preserves source IDs and independent review', async () => {
    mockValue(plan());
    const onProgress = vi.fn();
    const result = await createExamRoundAI('astra').plan(context, { ...options, onProgress });
    expect(result.model).toEqual({ provider: 'astra', model: 'gpt-6-astra', reasoning: 'medium' });
    expect(result.questions.every(hasReviewedPresentation)).toBe(true);
    expect(result.questions[0].criteria[0].sources).toEqual([citation]);
    expect(result.objectives[0].knowledgeTarget).toEqual(context.scope.knowledgeTargets![0]);
    expect(result.practiceDesign).toEqual({ version: 1, caseAvailability: 'included' });
    expect(onProgress.mock.calls.flat()).toEqual(['generating', 'reviewing']);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(generateContent).not.toHaveBeenCalled();
    for (const [url, init] of fetchMock.mock.calls) {
      expect(url).toBe('/api/exam/astra');
      expect(init).toMatchObject({ method: 'POST', headers: { 'Content-Type': 'application/json' } });
      expect(init!.signal).toBeInstanceOf(AbortSignal);
      expect(Object.keys(JSON.parse(init!.body as string)).sort()).toEqual(['input', 'instructions', 'language', 'maxOutputTokens', 'schema']);
      expect(init!.headers).not.toHaveProperty('Authorization');
    }
    const initial = bodyAt(0);
    const data = payload(initial);
    expect(data.selectedContext).toEqual(context);
    expect(initial.language).toBe('en');
    expect(initial.maxOutputTokens).toBe(8192);
    expect(initial.instructions).toContain('Use only the supplied selected-page text');
    expect(initial.schema.properties.questions.items.properties.criteria.items.properties.sources.items.properties.evidenceId.enum)
      .toEqual(data.evidenceSnippets.map(item => item.evidenceId));
    expect(payload(bodyAt(1)).taskData.operation).toBe('review-presentations');
  });

  it('routes legacy and default clients through Astra without invoking Gemini', async () => {
    fetchMock.mockImplementation(async (_url, init) => {
      const data = payload(JSON.parse(init!.body as string));
      return response({ text: data.taskData.operation === 'review-presentations' ? JSON.stringify(review(data)) : wire(plan(), data) });
    });
    for (const client of [createExamRoundAI('astra'), createExamRoundAI('gemini'), examRoundAI]) {
      const result = await client.plan(context, options);
      expect(result.model).toEqual({ provider: 'astra', model: 'gpt-6-astra', reasoning: 'medium' });
      expect(result.questions[0].model?.provider).toBe('astra');
    }
    expect(fetchMock).toHaveBeenCalledTimes(6);
    expect(fetchMock.mock.calls.every(([url]) => url === '/api/exam/astra')).toBe(true);
    expect(generateContent).not.toHaveBeenCalled();
  });

  it('routes grading, help and follow-up review through the same Astra instance', async () => {
    const astra = createExamRoundAI('astra');
    mockValue(plan());
    const blueprint = await astra.plan(context, options);
    const question = blueprint.questions[0];
    mockValue(evaluated());
    expect((await astra.evaluate(context, question, 'I can tell when it is done.', { language: 'en' })).items[0].status).toBe('met');
    mockValue({ text: 'Consider whether the finish is recognizable.', sources: [citation] });
    expect((await astra.support(context, question, '', 'hint', 'en')).sources).toEqual([citation]);
    const round: StudyRound = { version: 1, id: 'round', blueprint, questions: blueprint.questions,
      currentQuestionId: question.id, phase: 'feedback', draft: '', currentHelp: [], supports: [], attempts: [], exposures: [], startedAt: 1, updatedAt: 1 };
    mockValue({ ...task(), id: 'follow', kind: 'transfer', prompt: 'Hypothetical task: a list has a final checkbox. How does this change whether someone can tell the activity is finished?' });
    const next = await astra.followUp(context, round, 'en');
    expect(next?.id).toBe('follow');
    expect(hasReviewedPresentation(next!)).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(6);
    expect(generateContent).not.toHaveBeenCalled();
  });

  it('retains the single-repair ceiling and independent audit on the Astra path', async () => {
    mockValue(plan());
    fetchMock.mockImplementationOnce(async (_url, init) => {
      const value = review(payload(JSON.parse(init!.body as string)));
      value.reviews[0].exercise = { taskType: 'direct', applicationObjectiveIds: [], hypothetical: false };
      return response({ text: JSON.stringify(value) });
    });
    mockValue({ questions: [{ ...task(), id: 'repaired' }] });
    const result = await createExamRoundAI('astra').plan(context, options);
    expect(result.questions[0].id).toBe('repaired');
    expect(result.model?.provider).toBe('astra');
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(payload(bodyAt(2)).taskData.operation).toBe('repair-applied-case');
    expect(generateContent).not.toHaveBeenCalled();
  });

  it('keeps controlled cue reduction and its fresh independent review on Astra', async () => {
    const astra = createExamRoundAI('astra');
    mockValue(plan());
    const blueprint = await astra.plan(context, options);
    const original = blueprint.questions[0];
    const round: StudyRound = { version: 1, id: 'round', blueprint, questions: blueprint.questions,
      currentQuestionId: original.id, phase: 'feedback', draft: '', currentHelp: [], supports: [], exposures: [], startedAt: 1, updatedAt: 1,
      attempts: [{ id: 'attempt', question: original, answer: 'I can tell when it is done.', submittedAt: 2, helpEvents: [], independent: true }] };
    mockValue({ id: 'reduced', prompt: 'Hypothetical routines say “practice regularly” and “stop after one page”. Which gives someone a recognizable finish, and why?' });
    fetchMock.mockImplementationOnce(async (_url, init) => {
      const value = review(payload(JSON.parse(init!.body as string)));
      value.reviews[0].cueLevel = 1;
      return response({ text: JSON.stringify(value) });
    });
    const reduced = await astra.followUp(context, round, 'en', { reduceCues: true });
    expect(reduced).toMatchObject({ id: 'reduced', cueLevel: 1, criteria: original.criteria,
      objectiveIds: original.objectiveIds, answerFormat: original.answerFormat });
    expect(reduced?.audit?.exercise).toEqual(original.audit?.exercise);
    expect(payload(bodyAt(3)).taskData.reductionFrom.questionId).toBe(original.id);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(generateContent).not.toHaveBeenCalled();
  });

  it('still rejects out-of-catalogue citations and an invalid independent review', async () => {
    const invalid = plan();
    invalid.questions[0].criteria[0].sources = [{ ...citation, page: 8 }];
    mockValue(invalid);
    await expect(createExamRoundAI('astra').plan(context, options)).rejects.toThrow('citation');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    mockValue(plan());
    fetchMock.mockImplementationOnce(async (_url, init) => {
      const value = review(payload(JSON.parse(init!.body as string)));
      value.reviews[0].sourceSupported = false;
      return response({ text: JSON.stringify(value) });
    });
    await expect(createExamRoundAI('astra').plan(context, options)).rejects.toThrow('pre-answer review');
    expect(generateContent).not.toHaveBeenCalled();
  });

  it.each([
    ['not_configured', 503, 'Astra service key is not configured'],
    ['timeout', 500, 'timed out'], ['rate_limit', 500, 'quota or rate limit'],
    ['unauthorized', 500, 'denied access'], ['unavailable', 500, 'temporarily busy'],
    ['invalid_request', 500, 'service configuration'], ['unrecognized-code', 429, 'quota or rate limit'],
    ['incomplete', 502, 'response was incomplete'], ['refused', 422, 'could not provide this response'],
    ['cancelled', 499, 'request was cancelled'],
    ['unrecognized-code', 422, 'did not return a usable result'],
  ])('maps proxy error %s locally without displaying remote text or falling back', async (code, status, expected) => {
    vi.stubEnv('API_KEY', 'SECRET-GEMINI-KEY');
    fetchMock.mockResolvedValueOnce(response({ error: { code, message: 'SECRET arbitrary upstream instructions or rubric' } }, status as number));
    const error = await createExamRoundAI('astra').plan(context, options).catch(error => error as Error);
    expect((error as Error).message).toContain(expected);
    expect((error as Error).message).not.toContain('SECRET');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(generateContent).not.toHaveBeenCalled();
  });

  it('handles non-JSON HTTP failures and malformed success bodies without leaking their contents', async () => {
    fetchMock.mockResolvedValueOnce(new Response('SECRET gateway body', { status: 503 }));
    await expect(createExamRoundAI('astra').plan(context, options)).rejects.toThrow('temporarily busy');
    fetchMock.mockResolvedValueOnce(response({ text: 'SECRET malformed JSON' }));
    const error = await createExamRoundAI('astra').plan(context, options).catch(error => error as Error);
    expect((error as Error).message).toContain('did not return a usable result');
    expect((error as Error).message).not.toContain('SECRET');
    expect(generateContent).not.toHaveBeenCalled();
  });

  it('bounds an Astra request at 180 seconds, aborts fetch and ignores a late response', async () => {
    vi.useFakeTimers();
    let resolveLate: (response: Response) => void = () => {};
    fetchMock.mockImplementationOnce(() => new Promise(resolve => { resolveLate = resolve; }));
    const promise = createExamRoundAI('astra').plan(context, options);
    const rejection = expect(promise).rejects.toThrow('timed out');
    const signal = fetchMock.mock.calls[0][1]!.signal!;
    await vi.advanceTimersByTimeAsync(90_000);
    expect(signal.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(89_999);
    expect(signal.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await rejection;
    expect(signal.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    resolveLate(response({ text: '{}' }));
    await Promise.resolve();
    await expect(promise).rejects.toThrow('timed out');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(generateContent).not.toHaveBeenCalled();
  });

  it('clears Astra deadlines after successful generation and review', async () => {
    vi.useFakeTimers();
    mockValue(plan());
    await createExamRoundAI('astra').plan(context, options);
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(180_000);
    expect(fetchMock.mock.calls.every(([, init]) => !init!.signal!.aborted)).toBe(true);
  });
});
