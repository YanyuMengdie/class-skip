import { beforeEach, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => vi.fn());
vi.mock('@/services/readingAstraClient', () => ({ generateReadingContent: mock }));
import { auditAssignment } from './ai';
import type { ModuleAIContext } from './ai';
import type { Lesson, ModulePlan, ReviewQuestion } from './types';
const ctx = {
  module: { id: 'm', start: 8, end: 9 },
  pages: [
    { page: 8, text: 'Source' },
    { page: 9, text: 'Limits' },
  ],
  pdf: 'data:application/pdf;base64,cGRm',
  language: 'en',
} as ModuleAIContext;
const plan = { objectives: [], excluded: [] } as ModulePlan,
  lesson = { sections: [], language: 'en' } as Lesson,
  qs = [{ id: 'q1' }, { id: 'q2' }] as ReviewQuestion[];
beforeEach(() => mock.mockReset());
it('consolidates substantive issues by question and keeps them within this assignment', async () => {
  mock.mockResolvedValue({
    text: JSON.stringify({
      issues: [
        { questionId: 'q2', reason: 'Translation adds significance' },
        { questionId: 'q2', reason: 'Reference overstates the source' },
      ],
    }),
  });
  expect(await auditAssignment(ctx, plan, lesson, qs)).toEqual([
    { id: 'q2', reason: 'Translation adds significance Reference overstates the source' },
  ]);
  mock.mockResolvedValue({
    text: JSON.stringify({ issues: [{ questionId: 'outside', reason: 'Invented question' }] }),
  });
  await expect(auditAssignment(ctx, plan, lesson, qs)).rejects.toThrow();
});
it('distinguishes a completed check from missing or malformed results', async () => {
  mock.mockResolvedValue({ text: JSON.stringify({ issues: [] }) });
  expect(await auditAssignment(ctx, plan, lesson, qs)).toEqual([]);
  mock.mockResolvedValue({ text: '{}' });
  await expect(auditAssignment(ctx, plan, lesson, qs)).rejects.toThrow();
});
