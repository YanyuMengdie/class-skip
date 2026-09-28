import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { SprintVisual } from './SprintVisual';
import { GuidedSprintPanel } from './GuidedSprint';
import { makeCramSession } from './cramState';
import { sprintState } from './sprintState';
import type { ExamMaterialLink } from '@/types';
import type { StudyVisual } from '@/features/reluctant/studyVisuals';

vi.mock('@/lib/pdf/pdfUtils', () => ({ readFileAsDataURL: vi.fn() }));

vi.mock('@/shared/i18n/appLanguage', async importOriginal => ({
  ...await importOriginal<typeof import('@/shared/i18n/appLanguage')>(),
  useAppLanguage: () => ({ language: 'en', text: (_zh: string, en: string) => en }),
}));
const visual: StudyVisual = { kind: 'branches', title: 'Parallel, not sequential', caption: 'A theoretical account.', nodes: [
  { label: 'Central process', detail: '' },
  { label: 'PHYSICAL_RESPONSE', detail: '', link: 'parallel branch' },
  { label: 'EMOTIONAL_RESPONSE', detail: '', link: 'parallel branch' },
] };
describe('lightweight sprint teaching', () => {
  it('renders parallel branches with explicit relationship labels and no images', () => {
    const html = renderToStaticMarkup(<SprintVisual visual={visual} language="en" />);
    expect(html).toContain('sprint-visual-branches');
    expect(html).toContain('parallel branch');
    expect(html).not.toContain('<img');
    expect(html).toContain('Step through');
    expect(html).not.toContain('逐步看');
  });
  it('renders model strings as text rather than executable HTML', () => {
    const html = renderToStaticMarkup(<SprintVisual visual={{ ...visual, title: '<img src=x onerror=alert(1)>' }} language="en" />);
    expect(html).toContain('&lt;img');
    expect(html).not.toContain('<img');
  });
  it('hides teaching graphics during both immediate and delayed recall', () => {
    for (const kind of ['immediate', 'delayed'] as const) {
      const s = makeCramSession('test', [{ id: 'm1', fileName: 'Lecture.pdf' } as ExamMaterialLink]);
      s.sources[0].pages = ['Source']; s.sources[0].processedPages = [1];
      s.guided = sprintState(s);
      s.guided.lectures[0].explanation = { terms: [{term:'Taught',english:'Taught terminology',explanation:'HIDDEN_DEFINITION'}], title: 'Lecture', sections: [{ text: 'Taught prose.', pointIds: ['p1'], visual }] };
      s.guided.lectures[0].outline = { title: 'Lecture', overview: 'Overview', pageCount: 1, points: [{ id: 'p1', idea: 'Idea', explanation: 'Prose', caveat: '', pages: [1] }] };
      s.guided.active = { kind: 'lecture', materialId: 'm1' };
      const render = () => renderToStaticMarkup(<GuidedSprintPanel session={s} getSession={() => s} busy={false} run={vi.fn()} commit={vi.fn()} readSources={vi.fn()} extract={vi.fn()} resolvePdf={vi.fn()} onSource={vi.fn()} />);
      expect(render()).toContain('PHYSICAL_RESPONSE');
      expect(render()).toContain('Taught terminology');
      s.guided.active = { kind: 'recall', id: 'r1' };
      s.guided.recalls = [{ id: 'r1', materialId: 'm1', kind, topicIds: [], draft: '', startedAt: 1, assisted: false }];
      expect(render()).not.toContain('PHYSICAL_RESPONSE');
      expect(render()).not.toContain('Taught terminology');
      expect(render()).not.toContain('HIDDEN_DEFINITION');
      expect(render()).toContain('Show earlier explanation');
    }
  });
});
