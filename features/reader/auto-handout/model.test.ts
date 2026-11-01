import { describe, expect, it } from 'vitest';
import { annotationForPage, auditPassed, exportAnnotations, newJob, pageRange, parseAudit, parseDraft, parsePlan, sourceImagePages, type HandoutPlan, type PageAudit, type PageDraft } from './model';
const slides = [1, 2, 3, 4].map(pageNumber => ({ id: `slide-${pageNumber}`, pageNumber, imageUrl: 'data:image/png;base64,YQ==' }));
export const draft: PageDraft = { title: '概念', sections: [{ heading: '关系', explanation: '解释主干，并保留条件。', sourceEvidence: '第 2 页：原文中有明确限定。' }], uncertainties: [] };
export const audit: PageAudit = { coverage: true, source: true, visuals: true, context: true, teaching: true, issues: [] };
export const plan: HandoutPlan = { overview: '整份资料的上下文', pages: [1, 2, 3].map(page => ({ page, title: `Page ${page}`, kind: 'concept', role: '解释概念', focus: ['主干概念'], linkedPages: [4] })) };
describe('source coverage and export isolation', () => {
  it('requires actual source pages and a bounded complete range', () => {
    expect(pageRange(2, 4, slides)).toEqual([2, 3, 4]);
    for (const [a, b] of [[0, 2], [1, 5], [2, 1], [1.2, 2], [1, 61]]) expect(() => pageRange(a, b, slides)).toThrow();
  });
  it('rejects omitted pages, duplicate pages and fictional cross-references', () => {
    expect(parsePlan(plan, [1, 2, 3], [1, 2, 3, 4])).toEqual(plan);
    expect(() => parsePlan({ ...plan, pages: plan.pages.slice(1) }, [1, 2, 3], [1, 2, 3, 4])).toThrow();
    expect(() => parsePlan({ ...plan, pages: [plan.pages[0], plan.pages[0], plan.pages[2]] }, [1, 2, 3], [1, 2, 3, 4])).toThrow();
    expect(() => parsePlan({ ...plan, pages: plan.pages.map(p => ({ ...p, linkedPages: [7] })) }, [1, 2, 3], [1, 2, 3, 4])).toThrow();
  });
  it('retains the current page, requested context and available neighbors', () => {
    expect(sourceImagePages(plan.pages[1], slides)).toEqual([2, 4, 1, 3]);
    expect(sourceImagePages(plan.pages[0], slides)).toEqual([1, 4, 2]);
  });
  it('does not count malformed, uncertain or failed dimensions as checked', () => {
    expect(parseDraft(draft)).toEqual(draft);
    expect(parseAudit(audit)).toEqual(audit);
    expect(() => parseDraft({ ...draft, sections: [] })).toThrow();
    expect(() => parseAudit({ ...audit, visuals: 'true' })).toThrow();
    expect(auditPassed(draft, audit)).toBe(true);
    expect(auditPassed(draft, { ...audit, visuals: false })).toBe(false);
    expect(auditPassed(draft, { ...audit, issues: ['p.2 数据无法确认'] })).toBe(false);
    expect(auditPassed({ ...draft, uncertainties: ['图例看不清'] }, audit)).toBe(false);
  });
  it('isolates drafts by account, actual file, language, depth, range and prompt version', () => {
    const a = newJob('alice', 'hash-a', 'zh-CN', 'quick', [1, 2]);
    expect(a.id).toBe(newJob('alice', 'hash-a', 'zh-CN', 'quick', [1, 2]).id);
    expect(new Set([a.id, newJob('bob', 'hash-a', 'zh-CN', 'quick', [1, 2]).id,
      newJob('alice', 'hash-b', 'zh-CN', 'quick', [1, 2]).id, newJob('alice', 'hash-a', 'en', 'quick', [1, 2]).id,
      newJob('alice', 'hash-a', 'zh-CN', 'thorough', [1, 2]).id, newJob('alice', 'hash-a', 'zh-CN', 'quick', [2, 3]).id]).size).toBe(6);
  });
  it('keeps all manual notes untouched and attaches generated content only in the export layer', () => {
    const job = newJob('alice', 'hash-a', 'zh-CN', 'thorough', [1, 2]);
    job.pages[1] = { page: 1, status: 'checked', draft, audit, updatedAt: 1 };
    job.pages[2] = { page: 2, status: 'needs_review', draft: { ...draft, title: 'UNVERIFIED' }, audit: { ...audit, source: false }, updatedAt: 1 };
    const manual = { id: 'manual', text: '<p>旧标签</p>', x: 4, y: 5 };
    const original = { 'slide-1': [manual], 'slide-4': [manual] };
    const snapshot = structuredClone(original);
    const output = exportAnnotations(job, slides, original);
    expect(original).toEqual(snapshot);
    expect(output['slide-1'][0]).toBe(manual);
    expect(output['slide-1'][1].text).toContain('概念');
    expect(output['slide-2'][0].text).not.toContain('UNVERIFIED');
    expect(output['slide-2'][0].text).toContain('尚无通过核查');
    expect(output['slide-3']).toBeUndefined();
    expect(output['slide-4']).toBe(original['slide-4']);
    expect(exportAnnotations(job, slides, original, true)['slide-2'][0].text).toContain('UNVERIFIED');
  });
  it('never treats an edited draft as checked and escapes model/user HTML', () => {
    const malicious = { ...draft, title: '<script>unsafe</script>', sections: [{ heading: '<img onerror=bad>', explanation: '<iframe src=evil>', sourceEvidence: '& source' }] };
    const output = annotationForPage({ page: 1, status: 'edited', draft: malicious, audit, updatedAt: 1 }, 'zh-CN', true);
    expect(output.text).toContain('未重新核查');
    expect(output.text).toContain('&lt;script&gt;');
    expect(output.text).not.toContain('<script>');
    expect(output.text).not.toContain('<iframe');
  });
});
