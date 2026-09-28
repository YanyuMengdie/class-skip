import { describe, expect, it, vi } from 'vitest';
const { generate } = vi.hoisted(()=>({ generate:vi.fn() }));
vi.mock('./readingAstraClient',()=>({ generateReadingContent:generate }));
import { advanceLectureCase, analyzeLectureCaseFit, buildLectureCasePlan } from './geminiService';
describe('retired case generation',()=>{
 it.each([analyzeLectureCaseFit,buildLectureCasePlan,advanceLectureCase])('blocks every public generator before reading input or calling AI',async generateCase=>{
  await expect(generateCase(undefined as never)).rejects.toThrow('案例式领读已停止生成');
  expect(generate).not.toHaveBeenCalled();
 });
});
