
import { GoogleGenAI, Type, type GenerateContentParameters } from "@google/genai";
import { ChatMessage, StudyMap, Prerequisite, QuizData, DocType, PersonaSettings, StudyGuideContent, StudyGuideFormat, TurtleSoupPuzzle, MindMapNode, MindMapMultiResult, MindMapEvaluateResult, LSAPContentMap, LSAPKnowledgeComponent, LogicAtom, DisciplineBand, LearnerMood, UrgencyBand, LearnerTurnQuality, TutorScaffoldingContext, KCScopedTutorContext, MultiKCScopedTutorContext, ExamMaterialLink, RetrievedChunk, ExamReviewScope, LayeredReadingModule, LayeredReadingRound2Branch, LayeredReadingRound3Detail, LayeredReadingRound3Unit, LayeredReadingQuestion, LayeredReadingQuestionGrade, SkimContentType, SkimAuxiliaryMaterialRole, SkimAuxiliaryUseMode, SkimReadingRoute, SkimReadingRouteNode, SkimExplanationDepth, SkimExplanationStyle, SkimExplanationState, SkimExplanationSpineItem, SkimModuleTakeaway, LearnerProfileNotebook, ProfileNotebookUpdateSuggestion, StudyWitnessSession, JointReviewMaterialRole, LectureStructuredNotes, LectureTranscriptSegment, LectureNoteEvidence, LectureTeacherSignalKind, TinyStudyEntry, TinyStudyEntryAction, TinyStudyEntryTurn, TinyStudyEntryType, LectureCaseManifest, LectureCaseSuitabilityReport, LectureCasePlan, LectureCaseEpisode, LectureCaseProgress, LectureCaseTurnResult, LectureCasePageDisposition, LectureCaseContentUnit } from "@/types";
import { buildDialogueTeachingSystemPrompt } from "@/data/disciplineTeachingProfiles";
import { buildScaffoldingTurnDirective, getScaffoldingSystemAddendum } from "@/data/scaffoldingPrompt";
import { heuristicQuality } from "@/lib/exam/scaffoldingClassifier";
import { CLASSIFIER_PROMPT, STEM_SYSTEM_PROMPT, HUMANITIES_SYSTEM_PROMPT, PAPER_COMPANION_PROMPT, ARTICLE_COMPANION_PROMPT } from "@/lib/prompts/systemPrompts";
import { getMessageImages } from "@/lib/chat/messageUtils";
import {
  type SkimExplanationTurnDraft,
  type SkimExplanationVariantDraft,
  validateSkimExplanationTurnDraft,
  validateSkimExplanationVariantDraft,
} from "@/features/reader/skim/skimExplanation";
import {
  buildDisplayedSkimTranscript,
  collectSkimTakeawaySources,
  normalizeSkimTakeawayDrafts,
  type SkimTakeawayModelDraft,
} from "@/features/reader/skim/skimTakeaways";
import {
  LAYERED_READING_SYSTEM_PROMPT,
  buildLayeredModuleGenPrompt,
  buildLayeredRound1Prompt,
  buildLayeredRound2Prompt,
  buildLayeredRound3Prompt,
  buildLayeredRound3UnitPrompt,
  buildLayeredQuestionRound1Prompt,
  buildLayeredQuestionRound2Prompt,
  buildLayeredQuestionRound3Prompt,
  buildLayeredQuestionGradingPrompt,
} from "@/lib/prompts/layeredReadingPrompts";
import type {
  ExamGlobalChatTurn,
  ExamGlobalCitation,
  ExamGlobalMaterialConnection,
  ExamGlobalMaterialManifest,
  ExamGlobalQuiz,
  ExamGlobalQuizFeedback,
  ExamGlobalQuizQuestion,
} from '@/features/exam/lib/examGlobalChat';
import { getAIOutputLanguageInstruction, getCurrentAppLanguage, localizeText } from '@/shared/i18n/appLanguage';

let aiClient: GoogleGenAI | null = null;

const getAIClient = (): GoogleGenAI => {
  const apiKey = process.env.API_KEY || "";
  if (!apiKey) {
    throw new Error("Gemini API key is missing. Set API_KEY before using AI features.");
  }
  if (!aiClient) aiClient = new GoogleGenAI({ apiKey });
  return aiClient;
};

const appendOutputLanguageInstruction = (existing: unknown, instruction: string): unknown => {
  if (!existing) return instruction;
  if (typeof existing === 'string') return [existing, instruction];
  if (Array.isArray(existing)) return [...existing, instruction];
  if (typeof existing === 'object' && existing !== null && Array.isArray((existing as { parts?: unknown[] }).parts)) {
    const content = existing as { parts: unknown[] } & Record<string, unknown>;
    return { ...content, parts: [...content.parts, { text: instruction }] };
  }
  return [existing, instruction];
};

/**
 * Every learner-visible Gemini call in this service passes this single gateway.
 * The selected language is captured when the request starts, so changing the
 * setting never mutates a response that is already in flight.
 */
export const withCurrentOutputLanguage = (params: GenerateContentParameters): GenerateContentParameters => {
  const requestLanguage = getCurrentAppLanguage();
  return {
    ...params,
    config: {
      ...(params.config ?? {}),
      systemInstruction: appendOutputLanguageInstruction(
        params.config?.systemInstruction,
        getAIOutputLanguageInstruction(requestLanguage),
      ) as GenerateContentParameters['config'] extends { systemInstruction?: infer T } ? T : never,
    },
  };
};

const ai = new Proxy({} as GoogleGenAI, {
  get(_target, prop: keyof GoogleGenAI) {
    const client = getAIClient();
    if (prop !== 'models') {
      const value = (client as unknown as Record<PropertyKey, unknown>)[prop];
      return typeof value === 'function' ? value.bind(client) : value;
    }
    const models = client.models;
    return new Proxy(models as object, {
      get(target, modelProp) {
        if (modelProp === 'generateContent') {
          return (params: GenerateContentParameters) => models.generateContent(withCurrentOutputLanguage(params));
        }
        const value = Reflect.get(target, modelProp);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
  },
});

export interface TaskHugResponse {
  message: string;
  steps: string[];
}

const getDefaultErrorScript = () => getCurrentAppLanguage() === 'en'
  ? [
      '(bows) Sorry...',
      'The connection may be unstable, so I could not read this file.',
      'Please try uploading it again.',
    ]
  : [
      '(鞠躬) 对不起...',
      '可能是因为信号不好，我无法读取这份文件。',
      '请尝试重新上传一下吧！',
    ];

/**
 * Helper to construct the content part for Gemini.
 */
const getContentPart = (docContent: string) => {
  if (docContent && docContent.startsWith('data:')) {
    // Extract base64 and mimeType using a robust regex
    const matches = docContent.match(/^data:([^;]+);base64,(.+)$/);
    if (matches && matches.length === 3) {
      return { 
        inlineData: { 
          mimeType: matches[1], 
          data: matches[2] 
        } 
      };
    }
  }
  const safeText = docContent ? docContent.slice(0, 40000) : "Warning: No document content provided.";
  return { text: `DOCUMENT CONTENT:\n${safeText}` };
};

/**
 * 备考工作台：按「单份关联材料」调用 KC 图谱时使用。
 * 上限 120000 字符：仅作用于该路径，避免与全局 getContentPart(40000) 一样在单份长讲义中过早截断；
 * 其它功能（分类、考前预测单文件等）仍走 getContentPart，不受影响。
 */
const LSAP_WORKSPACE_CHUNK_MAX_CHARS = 120_000;

const getContentPartForWorkspaceChunk = (docContent: string) => {
  if (docContent && docContent.startsWith('data:')) {
    const matches = docContent.match(/^data:([^;]+);base64,(.+)$/);
    if (matches && matches.length === 3) {
      return {
        inlineData: {
          mimeType: matches[1],
          data: matches[2],
        },
      };
    }
  }
  const safeText = docContent ? docContent.slice(0, LSAP_WORKSPACE_CHUNK_MAX_CHARS) : 'Warning: No document content provided.';
  return { text: `DOCUMENT CONTENT:\n${safeText}` };
};

/** 逻辑原子等：可指定正文上限，避免与全局 getContentPart(40000) 绑死 */
const getContentPartWithMaxChars = (docContent: string, maxChars: number) => {
  if (docContent && docContent.startsWith('data:')) {
    const matches = docContent.match(/^data:([^;]+);base64,(.+)$/);
    if (matches && matches.length === 3) {
      return {
        inlineData: {
          mimeType: matches[1],
          data: matches[2],
        },
      };
    }
  }
  const safeText = docContent ? docContent.slice(0, maxChars) : 'Warning: No document content provided.';
  return { text: `DOCUMENT CONTENT:\n${safeText}` };
};

/** 备考工作台按材料抽原子：单讲可用更大上限（与 P1 KC 单份 120000 对齐）；未传则 40000 与历史行为一致 */
export interface GenerateLogicAtomsForContentMapOptions {
  maxDocChars?: number;
  /** true：prompt 中「合并讲义」改为「本份关联材料全文」 */
  perMaterial?: boolean;
  /** 仅补全既有原子的双语与页码，不改变数量、顺序和含义 */
  preserveExistingAtoms?: boolean;
}

/** generateLSAPContentMap 可选模式；默认 legacy 与历史行为一致 */
export type GenerateLSAPContentMapMode = 'legacy' | 'workspaceChunk';

export interface GenerateLSAPContentMapOptions {
  mode?: GenerateLSAPContentMapMode;
}

/**
 * Clean JSON string aggressively
 */
const cleanJsonString = (text: string): string => {
  if (!text) return "[]";
  let cleaned = text.trim();
  // Remove markdown code blocks
  cleaned = cleaned.replace(/^```json/i, '').replace(/^```/i, '');
  cleaned = cleaned.replace(/```$/, '');
  return cleaned.trim();
};

/**
 * Classifies the document content into STEM or HUMANITIES.
 */
export const classifyDocument = async (docContent: string): Promise<DocType> => {
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/f7788da6-7262-4420-bc72-576f23e0b7d4',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'geminiService.ts:classifyDocument',message:'entry',data:{},timestamp:Date.now(),hypothesisId:'H1'})}).catch(()=>{});
  // #endregion
  try {
    const contentPart = getContentPart(docContent);
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview', 
      contents: [
        { role: 'user', parts: [contentPart, { text: CLASSIFIER_PROMPT }] }
      ],
    });
    const result = response.text?.trim().toUpperCase().replace(/[^AB]/g, '') || "A";
    const docType = result === 'B' ? 'HUMANITIES' : 'STEM';
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/f7788da6-7262-4420-bc72-576f23e0b7d4',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'geminiService.ts:classifyDocument',message:'exit ok',data:{docType},timestamp:Date.now(),hypothesisId:'H1'})}).catch(()=>{});
    // #endregion
    return docType;
  } catch (error) {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/f7788da6-7262-4420-bc72-576f23e0b7d4',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'geminiService.ts:classifyDocument',message:'catch',data:{err:String(error)},timestamp:Date.now(),hypothesisId:'H1,H3'})}).catch(()=>{});
    // #endregion
    console.error("Classification failed, defaulting to STEM", error);
    return 'STEM';
  }
};

/**
 * P4：可选 LLM 学生单轮质量分类（便宜模型 + JSON）。失败时回退 heuristicQuality。
 * 不返回 neutral。
 */
export async function classifyLearnerTurn(
  shortText: string
): Promise<Exclude<LearnerTurnQuality, 'neutral'>> {
  const t = shortText.trim().slice(0, 2000);
  if (!t) return 'empty';
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: `你是教学对话分析器。根据下面「学生一句话」，判断其表述质量档位（仅 JSON，不要其他文字）。

档位说明：
- strong：论述较完整、有推理或结构
- partial：有一定内容但明显不完整或缺推理链
- weak：过短、敷衍或信息极少
- empty：几乎无实质内容

学生表述：
${t}`,
            },
          ],
        },
      ],
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            quality: {
              type: Type.STRING,
              enum: ['strong', 'partial', 'weak', 'empty'],
            },
          },
          required: ['quality'],
        },
      },
    });
    const parsed = JSON.parse(response.text || '{}') as { quality?: string };
    const q = parsed.quality;
    if (q === 'strong' || q === 'partial' || q === 'weak' || q === 'empty') return q;
  } catch (e) {
    console.warn('classifyLearnerTurn failed', e);
  }
  return heuristicQuality(t) as Exclude<LearnerTurnQuality, 'neutral'>;
}

/** 根据上课转写全文，用 Gemini 整理：讲课逻辑、重点、老师风格、以及如何理解这篇 lecture */
export const organizeLectureFromTranscript = async (transcript: string): Promise<string> => {
  if (!transcript || transcript.trim().length === 0) {
    return localizeText('（暂无转写内容，无法整理）', '(No transcript is available to organize.)');
  }
  const systemInstruction = `
你是一位善于归纳课堂内容的助教。用户会提供一堂课的语音转写全文（可能有不连贯或重复）。
请用【简体中文】输出一份结构化整理，包含以下部分，每部分用清晰的标题和分段：

1. **讲课逻辑与结构**：这节课的整体脉络（先讲什么、再讲什么、如何过渡），以及各部分的逻辑关系。
2. **重点与考点**：老师明确或反复强调的概念、公式、结论、以及可能考察的点。
3. **老师风格与习惯**：例如偏重推导还是结论、是否爱举例子、口头禅或表述习惯（便于学生回忆课堂）。
4. **希望你怎样理解这篇 lecture**：从学生复习角度，建议怎样把握这节课、与前后内容的联系、易混点提醒等。

要求：条理清晰、可直接用于课后复习，不要泛泛而谈；若转写过短或难以识别重点，可简要说明并给出有限结论。
`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: [
        { role: 'user', parts: [{ text: `请整理以下课堂转写：\n\n${transcript.slice(0, 60000)}` }] }
      ],
      config: {
        systemInstruction
      }
    });
    return response.text?.trim() ?? '（整理结果为空）';
  } catch (error) {
    console.error('organizeLectureFromTranscript failed', error);
    throw error;
  }
};

interface RawLectureNoteItem {
  title?: unknown;
  summary?: unknown;
  explanation?: unknown;
  question?: unknown;
  answer?: unknown;
  term?: unknown;
  description?: unknown;
  kind?: unknown;
  segmentIds?: unknown;
}

interface RawLectureNotes {
  overview?: unknown;
  catchUp?: unknown;
  outline?: unknown;
  keyPoints?: unknown;
  teacherAdditions?: unknown;
  examples?: unknown;
  teacherSignals?: unknown;
  questions?: unknown;
  terms?: unknown;
  uncertainMoments?: unknown;
}

export interface LectureOrganizationContext {
  sourceFileName?: string;
  pageBySegmentId?: Record<string, number>;
  pageTexts?: Array<{ pageNumber: number; text: string }>;
}

const asCleanString = (value: unknown) => typeof value === 'string' ? value.trim() : '';

const resolveLectureEvidence = (
  value: unknown,
  segmentById: Map<string, LectureTranscriptSegment>
): LectureNoteEvidence[] => {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value
    .map((segmentId) => asCleanString(segmentId))
    .filter((segmentId) => {
      if (!segmentId || seen.has(segmentId) || !segmentById.has(segmentId)) return false;
      seen.add(segmentId);
      return true;
    })
    .slice(0, 6)
    .map((segmentId) => {
      const segment = segmentById.get(segmentId)!;
      return {
        segmentId,
        speakerLabel: segment.speakerLabel,
        startMs: segment.startMs,
        endMs: segment.endMs,
        quote: segment.text.trim().slice(0, 240),
      };
    });
};

/**
 * V4 classroom review package. The model may only cite transcript segment IDs
 * supplied by the app; timestamps and quotes are resolved locally.
 */
export const organizeLectureWithEvidence = async (
  segments: LectureTranscriptSegment[],
  context: LectureOrganizationContext = {}
): Promise<LectureStructuredNotes> => {
  const usableSegments = segments
    .filter((segment) => segment.text.trim())
    .slice(0, 1200);
  if (usableSegments.length === 0) {
    throw new Error('没有可整理的高精度课堂转写。');
  }

  const segmentById = new Map(usableSegments.map((segment) => [segment.id, segment]));
  const transcript = usableSegments.map((segment) => ({
    id: segment.id,
    speaker: segment.speakerLabel,
    startSeconds: Math.round(segment.startMs / 1000),
    pageNumber: context.pageBySegmentId?.[segment.id],
    text: segment.text.trim(),
  }));
  const referencedPages = new Set(
    Object.values(context.pageBySegmentId || {}).filter((pageNumber) => Number.isFinite(pageNumber))
  );
  let slideTextBudget = 45_000;
  const slideContext: Array<{ pageNumber: number; text: string }> = [];
  for (const page of context.pageTexts || []) {
    if (!referencedPages.has(page.pageNumber) || slideTextBudget <= 0) continue;

    const sourceText = page.text.trim();
    if (!sourceText) continue;

    const text = sourceText.slice(0, Math.min(1800, slideTextBudget));
    if (!text) continue;

    slideContext.push({ pageNumber: page.pageNumber, text });
    slideTextBudget -= text.length;
  }
  const evidenceIdsSchema = {
    type: Type.ARRAY,
    items: { type: Type.STRING },
  };

  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: [{
      role: 'user',
      parts: [{
        text: `请把下面的课堂转写整理成可复习、可回听、可核对的课堂复习包。

课堂转写（唯一可引用的音频证据）：
${JSON.stringify(transcript)}

${slideContext.length > 0
  ? `关联课件文本（只用于判断老师相对课件的补充、修正和限定；不能替代音频证据）：\n${JSON.stringify(slideContext)}`
  : '没有提供可安全对照的课件文本。不要声称老师讲了课件之外的内容。'}
`,
      }],
    }],
    config: {
      systemInstruction: `
你是一位谨慎的课堂记录助教。输入是带有稳定段落 id、说话人标签和时间的课堂转写。

目标：
1. catchUp：先给缺课学生一条 8-12 分钟能读完的最短补课路线，3-6 节，覆盖前提、主线、关键结论和收尾。
2. outline：还原课堂实际推进顺序和过渡，不按转写字面机械切段。
3. keyPoints：提取真正需要带走的课堂结论。
4. teacherAdditions：仅在提供课件文本时，记录老师相对对应课件新增、修正、重新解释或明确限定的内容。
5. examples：单独整理老师用来解释概念的案例、类比、演示或研究例子。
6. teacherSignals：只记录老师明确说出的强调、作业、考试、截止日期、更正、限定条件；绝不推测考试重点。
7. questions：单独整理学生提问与老师回答；证据不足时不要强行归类。
8. terms：解释课堂专业术语，优先保留老师在本堂课里的用法。
9. uncertainMoments：标记听不清、答非所问、说话人不确定或上下文不足的片段，不要擅自补全。

证据规则：
- 每一项都必须填写 segmentIds，且只能使用输入中真实存在的 id。
- segmentIds 要指向直接支持该项结论的原话，不能只引用附近无关内容。
- 不要编造时间戳、页码、引语、老师身份或学生身份。
- 同一说话人标签不等于固定身份；根据对话内容谨慎判断老师与学生。
- 如果没有可靠的学生提问、术语或不确定片段，对应数组返回空数组。
- 课件文本不是可引用证据；teacherAdditions 也必须由课堂转写 segmentIds 直接支持。
- 没有提供课件文本时 teacherAdditions 必须为空。
- teacherSignals.kind 只能是 emphasis、assignment、exam、deadline、correction、limitation。
- exam 只有老师明确提到考试、测验或评分要求时才能使用，禁止根据语气和重复次数猜测。
- 输出简体中文，语言适合课后复习。
`,
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          overview: { type: Type.STRING },
          catchUp: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                summary: { type: Type.STRING },
                segmentIds: evidenceIdsSchema,
              },
              required: ['title', 'summary', 'segmentIds'],
            },
          },
          outline: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                summary: { type: Type.STRING },
                segmentIds: evidenceIdsSchema,
              },
              required: ['title', 'summary', 'segmentIds'],
            },
          },
          keyPoints: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                explanation: { type: Type.STRING },
                segmentIds: evidenceIdsSchema,
              },
              required: ['title', 'explanation', 'segmentIds'],
            },
          },
          teacherAdditions: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                explanation: { type: Type.STRING },
                segmentIds: evidenceIdsSchema,
              },
              required: ['title', 'explanation', 'segmentIds'],
            },
          },
          examples: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                explanation: { type: Type.STRING },
                segmentIds: evidenceIdsSchema,
              },
              required: ['title', 'explanation', 'segmentIds'],
            },
          },
          teacherSignals: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                kind: {
                  type: Type.STRING,
                  enum: ['emphasis', 'assignment', 'exam', 'deadline', 'correction', 'limitation'],
                },
                title: { type: Type.STRING },
                explanation: { type: Type.STRING },
                segmentIds: evidenceIdsSchema,
              },
              required: ['kind', 'title', 'explanation', 'segmentIds'],
            },
          },
          questions: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                question: { type: Type.STRING },
                answer: { type: Type.STRING },
                segmentIds: evidenceIdsSchema,
              },
              required: ['question', 'answer', 'segmentIds'],
            },
          },
          terms: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                term: { type: Type.STRING },
                explanation: { type: Type.STRING },
                segmentIds: evidenceIdsSchema,
              },
              required: ['term', 'explanation', 'segmentIds'],
            },
          },
          uncertainMoments: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                description: { type: Type.STRING },
                segmentIds: evidenceIdsSchema,
              },
              required: ['description', 'segmentIds'],
            },
          },
        },
        required: [
          'overview',
          'catchUp',
          'outline',
          'keyPoints',
          'teacherAdditions',
          'examples',
          'teacherSignals',
          'questions',
          'terms',
          'uncertainMoments',
        ],
      },
    },
  });

  const parsed = JSON.parse(response.text || '{}') as RawLectureNotes;
  const rawItems = (value: unknown): RawLectureNoteItem[] => (
    Array.isArray(value) ? value.filter((item): item is RawLectureNoteItem => Boolean(item && typeof item === 'object')) : []
  );
  const withEvidence = (item: RawLectureNoteItem) => resolveLectureEvidence(item.segmentIds, segmentById);
  const sections = (value: unknown) => rawItems(value)
    .map((item) => ({
      title: asCleanString(item.title),
      summary: asCleanString(item.summary),
      evidence: withEvidence(item),
    }))
    .filter((item) => item.title && item.summary && item.evidence.length > 0);
  const points = (value: unknown) => rawItems(value)
    .map((item) => ({
      title: asCleanString(item.title),
      explanation: asCleanString(item.explanation),
      evidence: withEvidence(item),
    }))
    .filter((item) => item.title && item.explanation && item.evidence.length > 0);
  const teacherSignalKinds = new Set<LectureTeacherSignalKind>([
    'emphasis',
    'assignment',
    'exam',
    'deadline',
    'correction',
    'limitation',
  ]);

  return {
    version: 4,
    generatedAt: Date.now(),
    overview: asCleanString(parsed.overview) || '这堂课的结构化整理已生成。',
    catchUp: sections(parsed.catchUp),
    outline: sections(parsed.outline),
    keyPoints: points(parsed.keyPoints),
    teacherAdditions: slideContext.length > 0 ? points(parsed.teacherAdditions) : [],
    examples: points(parsed.examples),
    teacherSignals: rawItems(parsed.teacherSignals)
      .map((item) => ({
        kind: asCleanString(item.kind) as LectureTeacherSignalKind,
        title: asCleanString(item.title),
        explanation: asCleanString(item.explanation),
        evidence: withEvidence(item),
      }))
      .filter((item) => (
        teacherSignalKinds.has(item.kind)
        && item.title
        && item.explanation
        && item.evidence.length > 0
      )),
    questions: rawItems(parsed.questions)
      .map((item) => ({
        question: asCleanString(item.question),
        answer: asCleanString(item.answer),
        evidence: withEvidence(item),
      }))
      .filter((item) => item.question && item.answer && item.evidence.length > 0),
    terms: rawItems(parsed.terms)
      .map((item) => ({
        term: asCleanString(item.term),
        explanation: asCleanString(item.explanation),
        evidence: withEvidence(item),
      }))
      .filter((item) => item.term && item.explanation && item.evidence.length > 0),
    uncertainMoments: rawItems(parsed.uncertainMoments)
      .map((item) => ({
        description: asCleanString(item.description),
        evidence: withEvidence(item),
      }))
      .filter((item) => item.description && item.evidence.length > 0),
    comparedWithSlides: slideContext.length > 0,
  };
};

// Interface for internal JSON handling
interface ExplanationJSON {
  summary?: unknown;
  key_points?: unknown;
  deep_dive?: unknown;
}

export type SlideExplanationMode = 'explain' | 'note' | 'exam';

export interface SlideExplanationOptions {
  mode?: SlideExplanationMode;
  pageNumber?: number;
  guideContext?: string;
}

const getSlideExplanationModeLabel = (mode: SlideExplanationMode): string => {
  if (mode === 'note') return '整理本页内容';
  if (mode === 'exam') return '这页怎么考';
  return '听讲解';
};

const getSlideExplanationTaskInstruction = (mode: SlideExplanationMode): string => {
  if (mode === 'note') {
    return `
  [页面工具任务：整理本页内容]
  目标：只把当前这一页本身整理清楚，像把 slide 上的内容转成干净中文笔记。
  写法：
  - 忠实整理本页可见内容和本页隐含的基本意思，不要扩展成复习计划。
  - 不要写「可复习要点」「考前速记」「可能怎么考」「你必须掌握」。
  - 如果这一页是 bullet list，就按原来的层级整理成清楚的中文条目。
  - 如果这一页是图表/流程，就只说明图表里各部分和关系。
  - 如果这一页只是标题、过渡页或很空，就短短整理，不要硬凑。
  `;
  }
  if (mode === 'exam') {
    return `
  [页面工具任务：这页怎么考]
  目标：从考试和复习角度分析这一页。
  写法：
  - 必须指出这一页可能对应的考点、常见问法、易错点和最小记忆版本。
  - 如果这一页不太像考点，请直接说它更像铺垫/背景，并说明需要关注到什么程度。
  - 输出要具体，不要泛泛说“理解概念”。
  `;
  }
  return `
  [页面工具任务：听讲解]
  目标：让学生当场听懂这一页，而不是生成可保存笔记。
  写法：
  - 先用一句大白话说这一页到底在讲什么。
  - 再解释它为什么出现在当前 module / part 里。
  - 如果是关键页，再拆 bullet、公式、图表、论证或术语。
  - 如果是过渡页，就短讲它连接了什么。
  - 语气像陪读讲给人听，不要整理成学习手帐格式。
  `;
};

const getSlideExplanationOutputFormat = (mode: SlideExplanationMode): string => {
  if (mode === 'note') {
    return `
  [输出格式 - 严格 JSON]
  请严格按照以下结构返回 JSON：
  {
    "summary": "本页主题：一句话概括本页内容。只基于当前页，不要加入考试或复习建议。",

    "key_points": [
      "本页内容 1：按当前页可见层级整理",
      "本页内容 2：按当前页可见层级整理",
      "本页内容 3：如有才写，不要硬凑"
    ],

    "deep_dive": {
      "title": "本页内容整理",
      "content": "请用 Markdown 忠实整理这一页：\n\n## 本页原本在说什么\n...\n\n## 页面内容\n- ...\n- ...\n\n## 术语 / 图表 / 例子（如果本页有）\n...\n\n要求：只整理这一页，不写可复习要点、不写考前速记、不写可能怎么考。",
      "interactive_question": ""
    }
  }
  `;
  }

  if (mode === 'exam') {
    return `
  [输出格式 - 严格 JSON]
  请严格按照以下结构返回 JSON：
  {
    "summary": "考试视角：这一页可能和什么考法有关；如果不像考点，也要说明原因。",

    "key_points": [
      "可能考点 1：具体到本页内容",
      "可能问法 2：具体到本页内容",
      "易错点 3：具体到本页内容"
    ],

    "deep_dive": {
      "title": "这页怎么考",
      "content": "请用 Markdown 写出：\n\n## 1. 这页可能考什么\n...\n\n## 2. 老师可能怎么问\n...\n\n## 3. 容易写错在哪里\n...\n\n## 4. 最小答题骨架\n...",
      "interactive_question": "给用户一个最自然的下一步追问建议。"
    }
  }
  `;
  }

  return `
  [输出格式 - 严格 JSON]
  请严格按照以下结构返回 JSON：
  {
    "summary": "一句大白话：这一页到底在说什么。",

    "key_points": [
      "听懂这页的点 1：",
      "听懂这页的点 2：",
      "听懂这页的点 3："
    ],

    "deep_dive": {
      "title": "这一页怎么理解",
      "content": "请用 Markdown 写出：\n\n## 1. 先用人话讲\n...\n\n## 2. 它在当前 module 里的作用\n...\n\n## 3. 这页每个重点是什么意思\n...\n\n## 4. 最容易误解的地方\n...",
      "interactive_question": "给用户一个最自然的下一步追问建议。"
    }
  }
  `;
};

const stripMarkdownFence = (text: string): string => {
  const trimmed = text.trim();
  return trimmed
    .replace(/^```(?:json|markdown|md)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
};

const extractJsonObjectText = (text: string): string => {
  const cleaned = stripMarkdownFence(text);
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return '';
  return cleaned.slice(start, end + 1);
};

const parseExplanationJSON = (raw: string): ExplanationJSON | null => {
  const candidates = [
    raw.trim(),
    stripMarkdownFence(raw),
    cleanJsonString(raw),
    extractJsonObjectText(raw),
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as ExplanationJSON;
      }
    } catch {
      // Try the next recovery shape.
    }
  }

  return null;
};

const readTextField = (value: unknown): string => {
  return typeof value === 'string' ? value.trim() : '';
};

const readStringList = (value: unknown): string[] => {
  return Array.isArray(value) ? value.map(readTextField).filter(Boolean) : [];
};

const readDeepDive = (data: ExplanationJSON): { title?: unknown; content?: unknown; interactive_question?: unknown } => {
  return data.deep_dive && typeof data.deep_dive === 'object' && !Array.isArray(data.deep_dive)
    ? data.deep_dive as { title?: unknown; content?: unknown; interactive_question?: unknown }
    : {};
};

const hasExplanationContent = (data: ExplanationJSON): boolean => {
  const deepDive = readDeepDive(data);
  return Boolean(
    readTextField(data.summary) ||
    readTextField(deepDive.title) ||
    readTextField(deepDive.content) ||
    readTextField(deepDive.interactive_question) ||
    readStringList(data.key_points).length > 0
  );
};

const buildExplanationMarkdown = (data: ExplanationJSON, mode: SlideExplanationMode): string => {
  const deepDive = readDeepDive(data);
  const title = readTextField(deepDive.title) || '页面工具';
  const summary = readTextField(data.summary);
  const keyPoints = readStringList(data.key_points);
  const content = readTextField(deepDive.content);
  const question = readTextField(deepDive.interactive_question);

  const sections = [`# ${title}`];

  if (summary) {
    const summaryLabel = mode === 'note' ? '本页主题' : mode === 'exam' ? '考试视角' : '先听这一句';
    sections.push(`> **${summaryLabel}**: ${summary}`);
  }

  if (keyPoints.length > 0) {
    const pointsLabel = mode === 'note' ? '本页内容' : mode === 'exam' ? '可能考法' : '听懂这页的几个点';
    sections.push(`## ${pointsLabel}\n${keyPoints.map((item) => `- ${item}`).join('\n')}`);
  }

  if (content) {
    const contentLabel = mode === 'note' ? '整理稿' : mode === 'exam' ? '考试拆解' : '讲解';
    sections.push(`## ${contentLabel}\n${content}`);
  }

  if (question && mode !== 'note') {
    sections.push(`---\n**🤔 思考**: ${question}`);
  }

  return sections.join('\n\n').trim();
};

const buildDraftExplanationMarkdown = (raw: string): string => {
  const readable = stripMarkdownFence(raw);
  return `
# 讲解草稿

> 这次模型返回的格式不太稳定，我先把可读内容保留下来。

${readable}
  `.trim();
};

export const generateSlideExplanation = async (imageBase64: string, fullContext?: string, options: SlideExplanationOptions = {}): Promise<string> => {
  const mode = options.mode ?? 'explain';
  const parts = imageBase64.split(',');
  const base64Data = parts[1];
  const mimeType = parts[0].split(';')[0].split(':')[1] || 'image/png';

  // 【系统指令：领读里的页面工具 (中文版)】
  const systemInstruction = `
  角色：你是一位博学多才的学习导师。你不是在开启一套独立精读模式，而是在领读过程中临时使用「页面工具」。
  **语言约束：无论 Slide 内容是英文还是中文，你必须始终使用【简体中文】进行讲解。**
  **产品定位：领读负责主学习流程；你负责把当前页这个局部讲清楚、整理成笔记或转成考试视角。**
  
  [你的大脑 - 完整文档记忆]
  <<<文档开始>>>
  ${fullContext ? fullContext.slice(0, 80000) : "未提供上下文"} 
  <<<文档结束>>>

  [当前领读上下文]
  ${options.guideContext || "未提供领读上下文。请仅根据当前页和全文记忆判断。"}

  [当前页信息]
  ${options.pageNumber ? `当前页码：第 ${options.pageNumber} 页。` : "当前页码：未知。"}

  ${getSlideExplanationTaskInstruction(mode)}

  [学科自适应策略]
  当用户展示一张 Slide 时，你必须先识别学科类型，然后采用不同的讲解策略：

  **🔴 场景 A：理科/工科 (STEM - 数学, 物理, 生物, 计算机)**
  - **特征**：包含公式、代码、图表、分子结构、解剖图。
  - **讲解策略**：如果本页包含核心公式/图表/模型，才做 Step-by-Step 拆解；如果只是标题或过渡页，说明它在模块中的位置即可。

  **🔵 场景 B：人文/社科 (Humanities - 哲学, 历史, 文学, 艺术)**
  - **特征**：主要是文本、论点、历史事件、艺术作品。
  - **讲解策略**：如果本页承载核心论证，拆前提、推论和结论；如果只是材料背景，讲清它服务于哪个主张。

  ${getSlideExplanationOutputFormat(mode)}
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3.1-pro-preview',
      contents: {
        parts: [
          { inlineData: { mimeType: mimeType, data: base64Data } },
          {
            text: `请执行页面工具任务：「${getSlideExplanationModeLabel(mode)}」。
            **要求：**
            1. **必须用中文回答。**
            2. 当前页只是局部，不要脱离当前领读上下文。
            3. 严格执行当前工具的任务边界：听讲解就讲给人听；整理本页内容就只整理本页；考试视角才谈考试。
            4. 不要把三种工具写成同一种结果。`
          },
        ],
      },
      config: {
        systemInstruction: systemInstruction,
        responseMimeType: 'application/json'
      }
    });

    const jsonText = response.text?.trim() || "";

    if (!jsonText) {
      throw new Error("EMPTY_EXPLANATION_RESPONSE");
    }

    const data = parseExplanationJSON(jsonText);
    if (data && hasExplanationContent(data)) {
      return buildExplanationMarkdown(data, mode);
    }

    const readableText = stripMarkdownFence(jsonText);
    if (readableText.length >= 24) {
      console.warn("Explanation response was not valid JSON; showing readable draft instead.");
      return buildDraftExplanationMarkdown(readableText);
    }

    throw new Error("UNREADABLE_EXPLANATION_RESPONSE");

  } catch (error) {
    console.error("Error generating explanation:", error);
    throw error instanceof Error ? error : new Error("EXPLANATION_GENERATION_FAILED");
  }
};

/**
 * GENERATES DYNAMIC PERSONA PROMPT
 */
const getPersonaSystemPrompt = (persona: PersonaSettings) => {
    return `
    你现在正在进行一个沉浸式的角色扮演 (Roleplay)。
    
    # 你的设定
    - 你的名字：${persona.charName}
    - 用户的称呼：${persona.userNickname}
    - 你与用户的关系：${persona.relationship}
    - 你的核心性格：${persona.personality}
    
    # 任务
    你现在的任务是陪伴用户学习这份 PDF/幻灯片。
    你需要用符合你【性格】的语气，基于【关系】的亲疏远近，来讲解内容或回答问题。
    如果是“占有欲强”的女友，可能会吃醋用户看书不看你；
    如果是“腹黑”的兄弟，可能会在讲解时带点损人的幽默。
    如果是“妻子/丈夫”，语气要更加亲密和包容。
    但无论如何，必须保证学术内容的准确性。
    
    请始终用中文回答（除非幻灯片里有特定术语）。
    `;
};

export const chatWithSlide = async (
  slideImageBase64: string,
  history: ChatMessage[],
  newMessage: string,
  userImagesBase64?: string[],
  mode: 'standard' | 'galgame' = 'standard',
  persona?: PersonaSettings,
  disciplineBand: DisciplineBand = 'unspecified',
  scaffolding?: TutorScaffoldingContext
): Promise<string> => {
  try {
    const parts = slideImageBase64.split(',');
    const slideData = parts[1];
    const slideMime = parts[0].split(';')[0].split(':')[1] || 'image/png';
    const contents = [];

    contents.push({
      role: 'user',
      parts: [
        { inlineData: { mimeType: slideMime, data: slideData } },
        { text: mode === 'galgame' 
            ? "这是我们现在正在看的页面。" 
            : "这是当前正在学习的幻灯片页面。请基于此页面的内容回答我接下来的问题。" 
        }
      ]
    });

    if (mode === 'standard') {
        contents.push({
          role: 'model',
          parts: [{ text: "好的，我已经理解了这张幻灯片的内容。请问您有什么问题？" }]
        });
    }

    history.forEach(msg => {
      const parts: any[] = [{ text: msg.text }];
      if (msg.role === 'user') {
        const imgs = getMessageImages(msg);
        imgs.forEach((img) => {
          const imgP = img.split(',');
          const imgData = imgP[1];
          const imgMime = imgP[0].split(';')[0].split(':')[1] || 'image/png';
          parts.push({ inlineData: { mimeType: imgMime, data: imgData } });
        });
      }
      contents.push({ role: msg.role, parts: parts });
    });

    let messageForModel = newMessage;
    if (mode === 'standard' && scaffolding) {
      messageForModel = `${newMessage}\n\n${buildScaffoldingTurnDirective(scaffolding)}`;
    }

    const currentParts: any[] = [{ text: messageForModel }];
    (userImagesBase64 ?? []).forEach((img) => {
      const uParts = img.split(',');
      const uImgData = uParts[1];
      const uImgMime = uParts[0].split(';')[0].split(':')[1] || 'image/png';
      currentParts.push({ inlineData: { mimeType: uImgMime, data: uImgData } });
    });
    contents.push({ role: 'user', parts: currentParts });

    let systemPrompt = "";
    
    if (mode === 'galgame' && persona) {
        // Galgame：保留角色扮演，不套完整苏格拉底长指令，仅锚定幻灯片
        systemPrompt = `${getPersonaSystemPrompt(persona)}

【内容锚定】请仅依据当前幻灯片画面可见的信息作答；不要编造画面中未出现的内容。数学公式用 LaTeX $...$ / $$...$$。`;
    } else {
        const pedagogy = buildDialogueTeachingSystemPrompt(disciplineBand);
        const visualBlock = `# 幻灯片辅助说明（与教学法叠加）
# VISUAL LOGIC PROTOCOL (No Code Blocks)
1. **Trigger**: When explaining complex logic (e.g., A leads to B which inhibits C).
2. **Prohibition**: DO NOT use raw code blocks like Mermaid or Graphviz.
3. **Solution**: Use **Emoji Flows**.
   - Example: **[ Glucose ]** ➔ 🟢 **[ Insulin ]** ➔ 📉 **[ Blood Sugar ]**
4. **Style**: Magazine-style readability. No technical jargon dumping.`;
        systemPrompt = `${pedagogy}\n\n${visualBlock}`;
        if (scaffolding) {
          systemPrompt += getScaffoldingSystemAddendum();
        }
    }

    const config: any = {
        systemInstruction: systemPrompt
    };

    const response = await ai.models.generateContent({
      model: 'gemini-3.1-pro-preview',
      contents: contents,
      config: config
    });

    return response.text || (mode === 'galgame' ? "..." : "我无法回答这个问题。");
  } catch (error) {
    console.error("Error in chat:", error);
    return mode === 'galgame' ? "(服务器开小差了...)" : "抱歉，遇到了一些问题。";
  }
};

const MULTI_DOC_QA_MODEL = 'gemini-3.1-pro-preview';
const MULTI_DOC_QA_DOC_MAX_LEN = 80000;
const MULTI_DOC_QA_HISTORY_MAX = 20;

/**
 * 多文档问答：基于给定文档内容与历史对话，用 Gemini 3.1 生成下一轮回复。
 * 仅根据文档内容回答，不编造；无相关信息时明确说明。
 */
export const multiDocQAReply = async (
  docContent: string,
  _docLabel: string,
  history: ChatMessage[],
  newMessage: string
): Promise<string> => {
  try {
    const truncated = (docContent || '').trim().slice(0, MULTI_DOC_QA_DOC_MAX_LEN);
    const systemInstruction = `你是基于用户提供文档的问答助手。请仅根据下述文档内容回答用户问题，不要编造文档中不存在的信息；若文档中无相关信息则明确说明。回答使用简体中文。

重要：若回答中包含数学公式或方程，请一律使用 LaTeX 格式以便正确显示：行内公式用 $...$，独立公式用 $$...$$。例如：$dN/dt = rN(K-N)/K$。不要使用易产生乱码的 Unicode 数学符号或图片中的原始排版字符，避免出现问号块或乱码。`;

    const contents: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> = [
      {
        role: 'user',
        parts: [{ text: `以下是用户选中的文档内容，请仅基于以下内容回答后续问题。\n\n${truncated || '（无文档内容）'}` }]
      },
      {
        role: 'model',
        parts: [{ text: '我已阅读文档，请提问。' }]
      }
    ];

    const recentHistory = history.slice(-MULTI_DOC_QA_HISTORY_MAX);
    recentHistory.forEach((msg) => {
      contents.push({ role: msg.role, parts: [{ text: msg.text }] });
    });
    contents.push({ role: 'user', parts: [{ text: newMessage }] });

    const response = await ai.models.generateContent({
      model: MULTI_DOC_QA_MODEL,
      contents,
      config: { systemInstruction }
    });

    return response.text?.trim() ?? '未能生成回复，请重试。';
  } catch (error) {
    console.error('multiDocQAReply Error:', error);
    return localizeText('抱歉，回答时遇到问题，请稍后重试。', 'Sorry, something went wrong while answering. Please try again later.');
  }
};

/**
 * REPLACED: generateRemStoryScript -> generatePersonaStoryScript
 * Now accepts PersonaSettings to customize the storytelling voice.
 */
export const generatePersonaStoryScript = async (fullText: string, images?: string[], persona?: PersonaSettings): Promise<string[]> => {
    // Basic validation
    if ((!fullText || fullText.trim().length < 50) && (!images || images.length === 0)) {
        return ["(疑惑) 诶？这份文件好像是空白的呢？"];
    }

    // Default persona if none provided
    const p = persona || {
        charName: '蕾姆',
        userNickname: '昂君',
        relationship: '爱慕者',
        personality: '温柔体贴'
    };

    try {
        const parts: any[] = [];

        // 1. Add Images (Vision) if available
        if (images && images.length > 0) {
            const visualContext = images.slice(0, 15);
            visualContext.forEach(imgBase64 => {
                 const split = imgBase64.split(',');
                 if (split.length === 2) {
                     parts.push({
                         inlineData: {
                             mimeType: split[0].split(';')[0].split(':')[1] || 'image/png',
                             data: split[1]
                         }
                     });
                 }
            });
        }

        // 2. Add Text
        parts.push({ text: `FULL DOCUMENT TEXT (Truncated):\n${fullText.slice(0, 50000)}` });
        
        const prompt = `
        # ROLE: ${p.charName} (Visual Novel Character)
        - Nickname for User: ${p.userNickname}
        - Relationship: ${p.relationship}
        - Personality: ${p.personality}

        **Task:** Convert the input document (Images or Text) into a linear monologue script spoken by ${p.charName}.

        **CRITICAL RULES:**
        1.  **Output Format:** JSON Array of Strings. \`["Line 1", "Line 2", ...]\`
        2.  **Objective:** Explain the document content simply and clearly, forming a cohesive narrative.
        3.  **Constraint:** Keep each line short (under 50 chars).
        4.  **Tone & Style:** 
            - MUST reflect the [Personality] and [Relationship].
            - If [Personality] is "Tsundere (傲娇)", use phrases like "才不是为了你学的呢".
            - If [Personality] is "Possessive (占有欲强)", imply you want the user's attention.
            - Speak mostly in CHINESE.

        **Example Output:**
        [
          "(${p.charName}靠近) ${p.userNickname}，终于要开始学习了吗？",
          "这份材料主要讲的是...",
          "你看这里..."
        ]
        `;

        parts.push({ text: prompt });

        const response = await ai.models.generateContent({
            model: 'gemini-3.1-pro-preview',
            contents: [
                { role: 'user', parts: parts }
            ],
            config: {
                responseMimeType: 'application/json'
            }
        });

        if (!response.text) return getDefaultErrorScript();

        const cleanedText = cleanJsonString(response.text);
        let parsedData = [];

        try {
            parsedData = JSON.parse(cleanedText);
        } catch (jsonError) {
            console.error("JSON Parse failed:", jsonError);
            return getDefaultErrorScript();
        }

        if (Array.isArray(parsedData) && parsedData.length > 0) {
            return parsedData.map(item => String(item));
        }
        
        return getDefaultErrorScript();

    } catch (error) {
        console.error("Gemini API Error:", error);
        return getDefaultErrorScript();
    }
};

// Legacy re-exports - FIXED TO PASS ARGS
export const generateRemStoryScript = (t: string, i?: string[], p?: PersonaSettings) => generatePersonaStoryScript(t, i, p);

export const runTaskHugAgent = async (userGoal: string): Promise<TaskHugResponse> => {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3.1-pro-preview',
      contents: userGoal,
      config: {
        systemInstruction: `Task decomposition agent. Output JSON only.`,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            message: { type: Type.STRING },
            steps: { type: Type.ARRAY, items: { type: Type.STRING } }
          },
          required: ["message", "steps"]
        }
      }
    });
    return response.text ? JSON.parse(response.text) : { message: "Error", steps: [] };
  } catch (e) { return { message: "请稍后再试", steps: [] }; }
};

export const runTaskHugChat = async (history: ChatMessage[], newMessage: string, currentSteps?: string[]): Promise<string> => {
  return "加油！";
};

/**
 * 获取ChatHug不同模式的系统提示词
 */
const getChatHugSystemPrompt = (mode: 'emotional' | 'casual' | 'mindfulness' | 'coax'): string => {
  switch (mode) {
    case 'emotional':
      return `你是一个温暖、理解的情绪陪伴助手。用户在学习累了、感到疲惫或压力大时来找你倾诉。

你的任务：
- 认真倾听用户的感受，给予共情和理解
- 不要催促用户去学习，不要给建议（除非用户明确要求）
- 用温暖、支持的语气回应
- 让用户感到被理解和接纳
- 可以分享一些鼓励的话语，但重点是理解

回复要求：
- 每次回复控制在2-4句话
- 语气温暖、真诚
- 用中文回复
- 不要重复说"我在听"，要给出有意义的回应`;

    case 'casual':
      return `你是一个轻松、幽默的聊天伙伴。用户想要暂时放下学习，随便聊聊放松一下。

你的任务：
- 和用户进行轻松愉快的对话
- 可以讲笑话、聊日常、分享有趣的话题
- 不要涉及学习内容，不要催促学习
- 让用户感到放松和快乐

回复要求：
- 每次回复控制在2-4句话
- 语气轻松、幽默
- 用中文回复
- 可以适当使用表情符号`;

    case 'mindfulness':
      return `你是一个正念引导助手。用户感到焦虑、脑子乱，需要平静下来。

你的任务：
- 引导用户进行正念练习（深呼吸、观察当下等）
- 用平静、温和的语气
- 帮助用户专注于当下，放下杂念
- 可以逐步引导，但不要强迫

回复要求：
- 每次回复控制在3-5句话
- 语气平静、温和
- 用中文回复
- 可以给出具体的正念练习指导`;

    case 'coax':
      return `你是一个温柔、鼓励的学习伙伴。用户学习累了，想放弃但又还想学，需要一点力量。

你的任务：
- 理解用户的疲惫和挣扎
- 温柔地给予鼓励和支持
- 帮助用户找到继续学习的动力
- 不要强迫，而是用理解和鼓励的方式
- 可以提醒用户已经取得的进步

回复要求：
- 每次回复控制在3-5句话
- 语气温柔、鼓励
- 用中文回复
- 给予具体的支持和力量`;

    default:
      return '你是一个温暖的支持助手。';
  }
};

export const runChatHugAgent = async (
  history: ChatMessage[], 
  newMessage: string, 
  mode: 'emotional' | 'casual' | 'mindfulness' | 'coax'
): Promise<string> => {
  try {
    // 验证模式
    if (!mode || !['emotional', 'casual', 'mindfulness', 'coax'].includes(mode)) {
      console.warn('Invalid ChatHug mode:', mode);
      mode = 'emotional'; // 默认使用情绪陪伴模式
    }

    const systemPrompt = getChatHugSystemPrompt(mode);
    const contents = [];

    // 限制对话历史长度，只保留最近15条消息（性能优化）
    const recentHistory = history.slice(-15);

    // 构建对话历史
    recentHistory.forEach(msg => {
      contents.push({
        role: msg.role === 'user' ? 'user' : 'model',
        parts: [{ text: msg.text || '' }]
      });
    });

    // 添加新消息
    contents.push({
      role: 'user',
      parts: [{ text: newMessage || '' }]
    });

    const response = await ai.models.generateContent({
      model: 'gemini-3.1-pro-preview',
      contents: contents,
      config: {
        systemInstruction: systemPrompt,
        temperature: mode === 'casual' ? 0.9 : 0.7, // casual模式更随机有趣
        topP: 0.95,
        topK: 40
      }
    });

    const responseText = response.text?.trim();
    
    // 如果回复为空或太短，返回友好的提示
    if (!responseText || responseText.length < 2) {
      return "抱歉，我现在有点卡住了，能再说一遍吗？";
    }

    return responseText;
  } catch (error) {
    console.error("ChatHug Error:", error);
    
    // 根据错误类型返回不同的友好提示
    if (error instanceof Error) {
      if (error.message.includes('timeout') || error.message.includes('网络')) {
        return "抱歉，网络有点慢，稍等一下好吗？";
      }
      if (error.message.includes('quota') || error.message.includes('limit')) {
        return "抱歉，我现在有点忙，稍后再试试好吗？";
      }
    }
    
    return "抱歉，我现在有点忙，稍等一下好吗？";
  }
};

export type SkimGranularity = 'fine' | 'standard' | 'coarse';

export const performPreFlightDiagnosis = async (
  docContent: string,
  options?: { skimGranularity?: SkimGranularity; moduleCount?: number }
): Promise<StudyMap | null> => {
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/f7788da6-7262-4420-bc72-576f23e0b7d4',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'geminiService.ts:performPreFlightDiagnosis',message:'entry',data:{},timestamp:Date.now(),hypothesisId:'H1'})}).catch(()=>{});
  // #endregion
  try {
    const contentPart = getContentPart(docContent);
    const n = options?.moduleCount;
    const moduleInstruction =
      typeof n === 'number' && n >= 2 && n <= 8
        ? `在 initialBriefing 中将文档拆解为 ${n} 个模块，每个模块写明页码范围与剧情/概要。`
        : (() => {
            const granularity = options?.skimGranularity ?? 'standard';
            return granularity === 'fine'
              ? '在 initialBriefing 中将文档拆解为 5-7 个模块，每个模块写明页码范围与剧情/概要。'
              : granularity === 'coarse'
                ? '在 initialBriefing 中将文档拆解为 2-3 个模块，每个模块写明页码范围与剧情/概要。'
                : '在 initialBriefing 中将文档拆解为 3-5 个模块，每个模块写明页码范围与剧情/概要。';
          })();
    const basePrompt = '执行【预飞检查】。识别文档的主题领域，并提取 3-5 个读懂该文档必须具备的基础概念（前置知识）。';
    const fullPrompt = `${basePrompt} ${moduleInstruction}`;
    const response = await ai.models.generateContent({
      model: 'gemini-3.1-pro-preview',
      contents: [
          { role: 'user', parts: [contentPart, { text: fullPrompt }] }
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            topic: { type: Type.STRING },
            prerequisites: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  concept: { type: Type.STRING }
                },
                required: ["id", "concept"]
              }
            },
            initialBriefing: { type: Type.STRING }
          },
          required: ["topic", "prerequisites", "initialBriefing"]
        }
      }
    });
    if (!response.text) return null;
    const data = JSON.parse(response.text);
    const result = {
      topic: data.topic,
      initialBriefing: data.initialBriefing,
      prerequisites: data.prerequisites.map((p: any) => ({ ...p, mastered: false }))
    };
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/f7788da6-7262-4420-bc72-576f23e0b7d4',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'geminiService.ts:performPreFlightDiagnosis',message:'exit ok',data:{},timestamp:Date.now(),hypothesisId:'H1'})}).catch(()=>{});
    // #endregion
    return result;
  } catch (e) {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/f7788da6-7262-4420-bc72-576f23e0b7d4',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'geminiService.ts:performPreFlightDiagnosis',message:'catch',data:{err:String(e)},timestamp:Date.now(),hypothesisId:'H1,H3'})}).catch(()=>{});
    // #endregion
    console.error("Diagnosis Error:", e);
    return null;
  }
};

export const generateGatekeeperQuiz = async (docContent: string, topic: string): Promise<QuizData | null> => {
  try {
    const contentPart = getContentPart(docContent);
    const response = await ai.models.generateContent({
      model: 'gemini-3.1-pro-preview',
      contents: [
        { 
            role: 'user', 
            parts: [
                contentPart, 
                { text: `Topic: ${topic}\n\nCreate a "Gatekeeper Quiz" (Single Multiple Choice Question). Language: Chinese.` }
            ] 
        }
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
            type: Type.OBJECT,
            properties: {
                question: { type: Type.STRING },
                options: { type: Type.ARRAY, items: { type: Type.STRING } },
                correctIndex: { type: Type.INTEGER },
                explanation: { type: Type.STRING }
            },
            required: ["question", "options", "correctIndex", "explanation"]
        }
      }
    });
    if (!response.text) return null;
    return JSON.parse(response.text) as QuizData;
  } catch (error) {
    console.error("Quiz Gen Error:", error);
    return null;
  }
};

/**
 * 根据当前整段式标签或当前唱片中用户实际看过的内容生成要点。
 * 整段式页码与状态来自连接式骨架；唱片式来源来自当前独立对话，页码严格限制在唱片范围。
 */
export const generateModuleTakeaways = async (
  readingMessages: ChatMessage[],
  docType: DocType,
  options: {
    pageStart: number;
    pageEnd: number;
    recordScope?: { title: string; pageStart: number; pageEnd: number };
  },
): Promise<SkimModuleTakeaway[]> => {
  const sources = collectSkimTakeawaySources(readingMessages, {
    ...(options.recordScope ? { recordScope: options.recordScope } : {}),
  });
  const convoText = buildDisplayedSkimTranscript(readingMessages);
  if (!convoText.trim()) return [];
  const sourceManifest = sources.map((source) => ({
    id: source.id,
    titleZh: source.titleZh,
    titleEn: source.titleEn ?? '',
    kind: source.kind,
    summary: source.summary,
    pageRefs: source.pageRefs,
    status: source.status,
  }));
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3.1-pro-preview',
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: `你正在整理${docType === 'HUMANITIES' ? '社科/人文' : '理科'} Lecture 的${options.recordScope ? '当前唱片' : '整段式'}领读要点。目标是让用户快速回看刚才真正看过的内容，不是生成考试提纲。

【硬性规则】
1. 只整理对话中导读已经展示的内容，不加入外部知识，不扩写新结论。
2. 每项必须给出：中文标题、可选英文术语、一句中文大白话、它在本段中的作用或与前后内容的关系。
3. sourceIds 只能逐字使用下方骨架清单中的 id。多个骨架项确实属于同一要点时可以合并。
4. status=deferred 的骨架是简单版中“AI暂时替你记着”的内容：可以整理，但不能写成已经正式讲过。
5. 唱片式的来源可能是消息级来源，页码会覆盖当前唱片范围；仍要用 sourceIds 关联真正出现过这些内容的导读消息，不能加入原对话没有讲过的细节。
6. 若骨架清单为空，说明是旧版对话：仍可根据对话生成要点，但 sourceIds 必须为空，绝不能虚构页码或来源。
7. 已讲内容提炼 3–6 项；暂存内容最多 4 项。语言简洁，不写学习建议，不打分。

【可靠内容骨架】
${JSON.stringify(sourceManifest)}

【当前领读标签的对话】
${convoText.slice(-80000)}

只返回结构化 JSON。`
            }
          ]
        }
      ],
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            items: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  titleZh: { type: Type.STRING },
                  titleEn: { type: Type.STRING },
                  plainLanguage: { type: Type.STRING },
                  connection: { type: Type.STRING },
                  sourceIds: { type: Type.ARRAY, items: { type: Type.STRING } },
                },
                required: ['titleZh', 'titleEn', 'plainLanguage', 'connection', 'sourceIds'],
              },
            },
          },
          required: ['items'],
        }
      }
    });
    if (!response.text) {
      return normalizeSkimTakeawayDrafts([], sources, options.pageStart, options.pageEnd);
    }
    const parsed = JSON.parse(response.text) as { items?: SkimTakeawayModelDraft[] };
    return normalizeSkimTakeawayDrafts(
      Array.isArray(parsed.items) ? parsed.items : [],
      sources,
      options.pageStart,
      options.pageEnd,
    );
  } catch (error) {
    console.error('generateModuleTakeaways Error:', error);
    return normalizeSkimTakeawayDrafts([], sources, options.pageStart, options.pageEnd);
  }
};

type SkimKnowledgeExtractionQuestion = {
  kind: 'fill' | 'choice' | 'concept';
  question: string;
  options: string[];
};

/** 把已讲要点临时变成一条普通领读消息；不保存答案、分数或掌握状态。 */
export const generateModuleKnowledgeExtraction = async (
  takeaways: SkimModuleTakeaway[],
): Promise<string> => {
  const explained = takeaways.filter((item) => item.status === 'explained');
  if (explained.length === 0) return '';
  const source = explained.map((item) => ({
    titleZh: item.titleZh,
    titleEn: item.titleEn ?? '',
    plainLanguage: item.plainLanguage,
    connection: item.connection,
  }));
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3.1-pro-preview',
      contents: [{
        role: 'user',
        parts: [{
          text: `把下面这些用户刚刚看过的领读要点，变成一次很轻的知识提取。

要求：
- 生成 3–4 道中文小题，一次全部给出，不提供答案、提示、页码或评分。
- 至少一道概念题，要求用户用自己的话重建关系；可搭配填空题和一道小选择题。
- 填空只用于确实值得记住的术语、方向或数字；选择题的干扰项应来自容易混淆的说法。
- 只能问下方要点已经讲过的内容，不得加入材料外知识。
- 题面友好、简短，不要写成正式考试，也不要询问用户是否准备好。

【已讲要点】
${JSON.stringify(source)}

只返回结构化 JSON。`,
        }],
      }],
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            questions: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  kind: { type: Type.STRING, enum: ['fill', 'choice', 'concept'] },
                  question: { type: Type.STRING },
                  options: { type: Type.ARRAY, items: { type: Type.STRING } },
                },
                required: ['kind', 'question', 'options'],
              },
            },
          },
          required: ['questions'],
        },
      },
    });
    if (!response.text) return '';
    const parsed = JSON.parse(response.text) as { questions?: SkimKnowledgeExtractionQuestion[] };
    const questions = (Array.isArray(parsed.questions) ? parsed.questions : [])
      .filter((item) => item && typeof item.question === 'string' && item.question.trim())
      .slice(0, 4);
    if (questions.length === 0) return '';
    const labels: Record<SkimKnowledgeExtractionQuestion['kind'], string> = {
      fill: '填空',
      choice: '小选择',
      concept: '用自己的话说',
    };
    const body = questions.map((item, index) => {
      const optionLines = item.kind === 'choice'
        ? item.options.slice(0, 4).map((option, optionIndex) => `   ${String.fromCharCode(65 + optionIndex)}. ${option}`).join('\n')
        : '';
      return `${index + 1}. **${labels[item.kind]}**：${item.question}${optionLines ? `\n${optionLines}` : ''}`;
    }).join('\n\n');
    return `### 先把要点合上，看看还留下了什么\n\n${body}\n\n直接按题号回答就行；想不起来也可以照实说。`;
  } catch (error) {
    console.error('generateModuleKnowledgeExtraction Error:', error);
    return '';
  }
};

/** 根据当前模块对话或 takeaways 文本，生成 2–3 道小题。 */
export const generateModuleQuiz = async (
  readingMessages: ChatMessage[],
  takeawaysText?: string
): Promise<QuizData[]> => {
  try {
    const convoText = readingMessages
      .map((m) => `${m.role === 'user' ? '用户' : '导读'}: ${m.text}`)
      .join('\n\n');
    const source = takeawaysText
      ? `【本模块要点】\n${takeawaysText}\n\n（可结合要点与对话出题）`
      : `【对话记录】\n${convoText.slice(-12000)}`;
    if (!convoText.trim() && !takeawaysText) return [];

    const response = await ai.models.generateContent({
      model: 'gemini-3.1-pro-preview',
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: `${source}\n\n请根据以上内容，生成 2–3 道中文选择题（每道 4 个选项，单选），用于巩固本模块理解。返回 JSON：{ "items": [ { "question": "...", "options": ["A", "B", "C", "D"], "correctIndex": 0, "explanation": "解析..." }, ... ] }`
            }
          ]
        }
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            items: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  question: { type: Type.STRING },
                  options: { type: Type.ARRAY, items: { type: Type.STRING } },
                  correctIndex: { type: Type.INTEGER },
                  explanation: { type: Type.STRING }
                },
                required: ["question", "options", "correctIndex", "explanation"]
              }
            }
          },
          required: ["items"]
        }
      }
    });
    if (!response.text) return [];
    const parsed = JSON.parse(response.text) as { items: QuizData[] };
    return Array.isArray(parsed.items) ? parsed.items : [];
  } catch (error) {
    console.error("generateModuleQuiz Error:", error);
    return [];
  }
};

/** 根据 PDF 生成多道测验题（复习用）。existingQuestionTexts 用于「继续出题」时避免重复。 */
export const generateQuizSet = async (
  docContent: string,
  options: { count: number; existingQuestionTexts?: string[] }
): Promise<QuizData[]> => {
  try {
    const contentPart = getContentPart(docContent);
    const noRepeat = (options.existingQuestionTexts?.length ?? 0) > 0
      ? `\n\n【重要】以下题目已经出过，请勿重复出相同或高度相似的问题：\n${options.existingQuestionTexts!.slice(-50).join('\n')}`
      : '';
    const response = await ai.models.generateContent({
      model: 'gemini-3.1-pro-preview',
      contents: [
        {
          role: 'user',
          parts: [
            contentPart,
            {
              text: `根据文档内容生成 ${options.count} 道中文选择题（每道题 4 个选项，单选）。要求：题目覆盖文档核心知识点，选项有区分度。${noRepeat}\n\n返回 JSON：{ "items": [ { "question": "...", "options": ["A", "B", "C", "D"], "correctIndex": 0, "explanation": "解析..." }, ... ] }`
            }
          ]
        }
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            items: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  question: { type: Type.STRING },
                  options: { type: Type.ARRAY, items: { type: Type.STRING } },
                  correctIndex: { type: Type.INTEGER },
                  explanation: { type: Type.STRING }
                },
                required: ["question", "options", "correctIndex", "explanation"]
              }
            }
          },
          required: ["items"]
        }
      }
    });
    if (!response.text) return [];
    const parsed = JSON.parse(response.text) as { items: QuizData[] };
    return Array.isArray(parsed.items) ? parsed.items : [];
  } catch (error) {
    console.error("generateQuizSet Error:", error);
    return [];
  }
};

/** 根据 PDF 估算可整理的闪卡数量。 */
export const estimateFlashCardCount = async (docContent: string): Promise<number> => {
  try {
    const contentPart = getContentPart(docContent);
    const response = await ai.models.generateContent({
      model: 'gemini-3.1-pro-preview',
      contents: [
        {
          role: 'user',
          parts: [
            contentPart,
            {
              text: '根据这份文档的内容，估算可以整理出多少张「概念-解释」或「术语-定义」类的闪卡（正面为概念/问题，背面为解释/答案）。只返回一个 JSON 对象：{ "estimatedCount": number }，数字为整数，例如 15 或 30。'
            }
          ]
        }
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: { estimatedCount: { type: Type.INTEGER } },
          required: ["estimatedCount"]
        }
      }
    });
    if (!response.text) return 20;
    const parsed = JSON.parse(response.text) as { estimatedCount: number };
    const n = Number(parsed.estimatedCount);
    return Number.isFinite(n) && n > 0 ? Math.min(Math.max(n, 5), 200) : 20;
  } catch (error) {
    console.error("estimateFlashCardCount Error:", error);
    return 20;
  }
};

/** 根据 PDF 生成一批闪卡。existingFronts 用于「再生成更多」时避免重复。 */
export const generateFlashCards = async (
  docContent: string,
  options: { count: number; existingFronts?: string[] }
): Promise<Array<{ front: string; back: string }>> => {
  try {
    const contentPart = getContentPart(docContent);
    const noRepeat = (options.existingFronts?.length ?? 0) > 0
      ? `\n\n【重要】以下正面内容已经存在，请勿重复：\n${options.existingFronts!.slice(-80).join('\n')}`
      : '';
    const response = await ai.models.generateContent({
      model: 'gemini-3.1-pro-preview',
      contents: [
        {
          role: 'user',
          parts: [
            contentPart,
            {
              text: `根据文档整理 ${options.count} 张中文闪卡。每张闪卡包含 "front"（正面：概念/术语/问题）和 "back"（背面：解释/定义/答案）。内容简洁清晰。${noRepeat}\n\n返回 JSON：{ "cards": [ { "front": "...", "back": "..." }, ... ] }`
            }
          ]
        }
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            cards: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  front: { type: Type.STRING },
                  back: { type: Type.STRING }
                },
                required: ["front", "back"]
              }
            }
          },
          required: ["cards"]
        }
      }
    });
    if (!response.text) return [];
    const parsed = JSON.parse(response.text) as { cards: Array<{ front: string; back: string }> };
    return Array.isArray(parsed.cards) ? parsed.cards : [];
  } catch (error) {
    console.error("generateFlashCards Error:", error);
    return [];
  }
};

function maintenanceMoodInstruction(mood: LearnerMood): string {
  if (mood === 'dont_want') {
    return '【心态】学习者此刻不太想学习：请用更短句、降低压迫感；强调可随时停下、少量即可；不要堆叠任务感。';
  }
  if (mood === 'want_anxious') {
    return '【心态】学习者想学但焦虑：请强调小步、可控、过程导向；避免评价其能力；语气稳定、支持性。';
  }
  return '【心态】学习者状态正常：保持清晰、可执行的复习语气即可。';
}

function maintenanceUrgencyInstruction(urgency: UrgencyBand): string {
  if (urgency === 'd1_2') {
    return '【紧迫度】约 1–2 天内考试：略提高「高频考点 / 必记事实」在整批闪卡中的比例（仍遵守 JSON 结构）。';
  }
  if (urgency === 'd3_7') {
    return '【紧迫度】约 3–7 天：平衡高频与易混点。';
  }
  if (urgency === 'd8_plus') {
    return '【紧迫度】8 天以上：可略增加结构梳理类记忆点，仍保持闪卡可快速过。';
  }
  return '【紧迫度】无明确近期考试：以维持手感与关键术语为主。';
}

/** 低压保温流：按考试维持记忆的闪卡（10-20张） */
export const generateMaintenanceFlashCards = async (
  docContent: string,
  options: {
    count: number;
    examTitles: string[];
    weakConcepts?: string[];
    disciplineBand: DisciplineBand;
    mood: LearnerMood;
    urgency: UrgencyBand;
  }
): Promise<Array<{ front: string; back: string }>> => {
  try {
    const contentPart = getContentPart(docContent.slice(0, 60000));
    const weakPart =
      options.weakConcepts && options.weakConcepts.length > 0
        ? `\n优先覆盖这些薄弱概念：${options.weakConcepts.slice(0, 12).join('、')}。`
        : '';
    // P2：保温闪卡为「记忆向」；苏格拉底式深度教学在对话层（备考台 / adaptive tutor），此处不收学科长指令。
    const metaLine = {
      disciplineBand: options.disciplineBand,
      mood: options.mood,
      urgency: options.urgency,
    };
    if (import.meta.env?.DEV) {
      console.debug('[generateMaintenanceFlashCards] P1 prompt context', metaLine);
    }
    const response = await ai.models.generateContent({
      model: 'gemini-3.1-pro-preview',
      contents: [
        {
          role: 'user',
          parts: [
            contentPart,
            {
              text: `你是记忆维持教练。以下内容来自考试：${options.examTitles.join(' / ')}。
${maintenanceMoodInstruction(options.mood)}
${maintenanceUrgencyInstruction(options.urgency)}
请生成 ${options.count} 张中文闪卡，用于「低压记忆维持」。
要求：
1) 以高频概念、易混点、必须记忆的事实为主；front/back 短而可检索；
2) 不要做「对话式追问教学」——那是备考台苏格拉底对话的职责；
3) front 简洁明确，back 直接可复习。${weakPart}

仅返回 JSON：{ "cards": [ { "front": "...", "back": "..." } ] }`,
            },
          ],
        },
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            cards: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  front: { type: Type.STRING },
                  back: { type: Type.STRING }
                },
                required: ["front", "back"]
              }
            }
          },
          required: ["cards"]
        }
      }
    });
    if (!response.text) return [];
    const parsed = JSON.parse(response.text) as { cards: Array<{ front: string; back: string }> };
    return Array.isArray(parsed.cards) ? parsed.cards : [];
  } catch (error) {
    console.error("generateMaintenanceFlashCards Error:", error);
    return [];
  }
};

/** 费曼检验：用大白话解释文档内容，便于自测是否真懂 */
export const generateFeynmanExplanation = async (docContent: string): Promise<string> => {
  try {
    const contentPart = getContentPart(docContent.slice(0, 40000));
    const response = await ai.models.generateContent({
      model: 'gemini-3.1-pro-preview',
      contents: [
        {
          role: 'user',
          parts: [
            contentPart,
            {
              text: `请用「费曼技巧」把这份文档的核心内容，用**完全不懂的人也能听懂的大白话**解释一遍。要求：
1. 少用专业术语；若必须用，立刻用一句话解释该术语。
2. 用生活类比或简单逻辑链把结论串起来。
3. 分块说明（用 ## 小标题），每块不要太长，条与条之间空一行。
直接输出 Markdown，不要 JSON。数学用 LaTeX $...$。`
            }
          ]
        }
      ]
    });
    return response.text?.trim() || "生成失败，请重试。";
  } catch (error) {
    console.error("generateFeynmanExplanation Error:", error);
    return "生成失败，请重试。";
  }
};

/** 费曼：针对用户写的不懂的知识点，用大白话单独讲清楚 */
export const generateFeynmanExplanationForTopics = async (
  docContent: string,
  userTopics: string
): Promise<string> => {
  try {
    const contentPart = getContentPart(docContent.slice(0, 40000));
    const response = await ai.models.generateContent({
      model: 'gemini-3.1-pro-preview',
      contents: [
        {
          role: 'user',
          parts: [
            contentPart,
            {
              text: `用户表示对以下知识点不太懂，请**只针对这些点**用费曼技巧、大白话讲清楚（可结合文档内容）：

【用户不懂的知识点】
${userTopics.trim()}

要求：少用术语或立刻解释；用生活类比；分块用 ## 小标题；每块不要太长。直接输出 Markdown。数学用 LaTeX $...$。`
            }
          ]
        }
      ]
    });
    return response.text?.trim() || "生成失败，请重试。";
  } catch (error) {
    console.error("generateFeynmanExplanationForTopics Error:", error);
    return "生成失败，请重试。";
  }
};

export interface FeynmanQuestionResult {
  question: string;
  referenceAnswer: string;
}

/** 费曼：根据文档出一道简答题（short-answer），可指定难度 */
export const generateFeynmanQuestion = async (
  docContent: string,
  difficulty: 'easy' | 'medium' | 'hard'
): Promise<FeynmanQuestionResult | null> => {
  try {
    const contentPart = getContentPart(docContent.slice(0, 40000));
    const diffHint =
      difficulty === 'easy'
        ? '考查基础概念、定义或直接能从文档找到的结论，用大白话或课本原话即可答对。'
        : difficulty === 'hard'
          ? '考查综合、辨析或易混点，需要联系多处内容或区分相似概念。'
          : '考查理解与简单应用，难度适中。';
    const response = await ai.models.generateContent({
      model: 'gemini-3.1-pro-preview',
      contents: [
        {
          role: 'user',
          parts: [
            contentPart,
            {
              text: `请根据文档内容出一道**简答题（Short Answer）**，学生需要用大白话或课堂/文档中的概念来回答。

难度：${diffHint}

要求：题目清晰、有唯一参考答案要点；不要选择题。返回 JSON，且只返回一个 JSON 对象，不要其他文字：
{"question": "题目内容（中文）", "referenceAnswer": "参考答案要点（用于判分与反馈，可多条用分号隔开）"}`
            }
          ]
        }
      ]
    });
    const raw = response.text?.trim() || '';
    const cleaned = raw.replace(/^```\w*\n?|\n?```$/g, '').trim();
    const parsed = JSON.parse(cleaned) as FeynmanQuestionResult;
    if (parsed?.question && parsed?.referenceAnswer) return parsed;
    return null;
  } catch (error) {
    console.error("generateFeynmanQuestion Error:", error);
    return null;
  }
};

export interface FeynmanAnswerFeedback {
  correct: boolean;
  feedback: string;
}

/** 费曼：评判用户答案是否到位，并给出反馈与参考答案 */
export const evaluateFeynmanAnswer = async (
  question: string,
  referenceAnswer: string,
  userAnswer: string
): Promise<FeynmanAnswerFeedback> => {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3.1-pro-preview',
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: `你是一位严格的简答题阅卷老师。请评判学生的答案是否扣住要点。

【题目】${question}

【参考答案要点】${referenceAnswer}

【学生答案】${userAnswer}

请返回一个 JSON 对象，且只返回该对象，不要其他文字：
{"correct": true或false, "feedback": "简短评语：若不对则指出缺了哪点或哪里错了，并简要给出正确说法；若对则肯定并可有补充。"}`
            }
          ]
        }
      ]
    });
    const raw = response.text?.trim() || '';
    const cleaned = raw.replace(/^```\w*\n?|\n?```$/g, '').trim();
    const parsed = JSON.parse(cleaned) as FeynmanAnswerFeedback;
    return {
      correct: !!parsed?.correct,
      feedback: parsed?.feedback || '无法评判，请重试。'
    };
  } catch (error) {
    console.error("evaluateFeynmanAnswer Error:", error);
    return { correct: false, feedback: "评判失败，请重试。" };
  }
};

/** 考前速览：核心要点 + 易错点 + 高频考点（Markdown） */
export const generateExamSummary = async (docContent: string): Promise<string> => {
  try {
    const contentPart = getContentPart(docContent.slice(0, 50000));
    const response = await ai.models.generateContent({
      model: 'gemini-3.1-pro-preview',
      contents: [
        {
          role: 'user',
          parts: [
            contentPart,
            {
              text: `请根据文档内容，生成一份「考前速览」Markdown，用于考前快速复习，要求**详细、可直接背诵**。用中文输出，包含三部分：

1. **核心要点**：8～12 条必须掌握的核心结论、公式或定义。每条可展开 1～2 句话说明含义或适用条件；公式请用 LaTeX，例如 $x^2$、$10^{-6}$、$\\lambda$、$\\rightarrow$。
2. **易错点**：5～8 个常被忽略或容易混淆的坑。每个要写出**具体例子或对比**（如 A 与 B 的区别、常见误用），便于避坑。
3. **高频考点**：5～8 个最可能考到的方向或题型。每个要给出**可能考法、典型问法或答题要点**，必要时配简短例题思路。

直接输出 Markdown，不要 JSON。数学与公式一律用 LaTeX 行内 $...$ 或块级 $$...$$。各部分标题用 ##，子项用 - 或 1. 列表，条与条之间空一行便于阅读。`
            }
          ]
        }
      ]
    });
    return response.text?.trim() || "生成失败，请重试。";
  } catch (error) {
    console.error("generateExamSummary Error:", error);
    return "生成失败，请重试。";
  }
};

/** 5 分钟模式：超简学习指南（3–5 个要点，每条一句话的 Markdown） */
export const generateFiveMinGuide = async (docContent: string): Promise<string> => {
  try {
    const contentPart = getContentPart(docContent.slice(0, 30000));
    const prompt = `你是一位善于「压缩知识」的助教，现在要为一个很抗拒学习、只愿意先花 5 分钟混个脸熟的学生，做一份**超简学习指南**。

请根据文档内容，用中文输出 3～5 条要点，每条仅 1 句话，让学生对这份材料有一个「大致是讲什么」的直觉印象即可。

要求：
- 不求全面覆盖，只挑选最核心的 3～5 个大块。
- 不要展开长篇解释，每条控制在一行之内。
- 适合第一次见到这份材料、心情一般的人快速浏览。

请直接以 Markdown 列表或小标题形式输出（例如以 - 开头的列表，或以 ## / ### 开头的简短标题），不要返回 JSON。`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.1-pro-preview',
      contents: [
        {
          role: 'user',
          parts: [
            contentPart,
            { text: prompt }
          ]
        }
      ]
    });
    return response.text?.trim() || '（暂时无法生成 5 分钟速览，请稍后重试）';
  } catch (error) {
    console.error('generateFiveMinGuide Error:', error);
    return localizeText('（生成 5 分钟速览失败，请稍后重试）', '(Could not generate the five-minute overview. Please try again later.)');
  }
};

export type TinyStudyAction = 'start' | 'next' | 'simpler' | 'deeper' | 'example';

export interface TinyStudyOptions {
  fileName: string;
  action: TinyStudyAction;
  previousTurns?: string[];
  targetTurn?: {
    index: number;
    text: string;
  };
}

const getTinyStudyActionInstruction = (action: TinyStudyAction, targetIndex?: number): string => {
  if (action === 'next') return '接着上一段，往后讲一点点。不要复述之前内容。';
  if (action === 'simpler') return `只针对第 ${targetIndex ?? '当前'} 小段，用更浅、更生活化、更像人话的方式重讲一遍。不要讲新段落。`;
  if (action === 'deeper') return `只针对第 ${targetIndex ?? '当前'} 小段，稍微深入一点，但仍然保持低压力和大白话。不要讲新段落。`;
  if (action === 'example') return `只针对第 ${targetIndex ?? '当前'} 小段，换一个更直观、更生活化的例子来解释。不要讲新段落。`;
  return '先讲这份材料的最低门槛梗概，只讲最容易进入的一小块。';
};

/** Dashboard「我现在不想学」→「只学一点点」：低压力、分段式大白话讲解。 */
export const generateTinyStudyStep = async (
  docContent: string,
  options: TinyStudyOptions
): Promise<string> => {
  try {
    const contentPart = getContentPart(docContent);
    const history = (options.previousTurns ?? [])
      .slice(-6)
      .map((turn, index) => `第 ${index + 1} 段：${turn}`)
      .join('\n\n');

    const prompt = `你是一个很会降低学习阻力的陪读助手。用户现在非常不想学习，甚至不想点开 lecture slides。

你现在要在 Dashboard 的一张小卡片里，帮用户「只学一点点」。这不是正式学习页，不要像老师讲课，也不要制造任务感。

资料名：${options.fileName}
本次动作：${getTinyStudyActionInstruction(options.action, options.targetTurn?.index)}

之前已经讲过：
${history || '还没有。'}

${options.targetTurn ? `这次只针对下面这一小段做局部补充，不要继续往后讲：
第 ${options.targetTurn.index} 小段：
${options.targetTurn.text}` : ''}

输出要求：
- 必须用中文。
- 只讲一小段，控制在 150～260 个中文字左右。
- 用最简单的大白话，像朋友在旁边帮忙解释。
- 不要 quiz，不要术语表，不要“你必须掌握/你需要完成/考点如下”这种压力口吻。
- 如果材料很复杂，先挑最容易进入的一点，不要试图讲完整。
- 如果本次是“讲白一点 / 稍微深入一点 / 换个例子”，只围绕指定小段补充，不要总结全文，也不要开启下一小段。
- 结尾用一句很轻的邀请，比如“如果你愿意，我们下一小段再看……”。
- 直接输出正文，不要 JSON。`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.1-pro-preview',
      contents: [{ role: 'user', parts: [contentPart, { text: prompt }] }],
    });

    return response.text?.trim() || '我这次没讲出来。我们可以再点一下，换一种更轻的说法。';
  } catch (error) {
    console.error('generateTinyStudyStep Error:', error);
    return localizeText(
      '我这次没讲出来，可能是云端有点慢。你可以稍后再试，或者先换一份更短的 PDF。',
      'I could not generate this explanation. The service may be slow; try again later or use a shorter PDF.',
    );
  }
};

const TINY_STUDY_ENTRY_TYPES: TinyStudyEntryType[] = [
  'question',
  'experiment',
  'counterintuitive',
  'debate',
  'real_life',
];

const normalizeEvidenceText = (value: string): string => (
  value.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, '')
);

const hasEvidenceOnPages = (evidence: string, pages: string[]): boolean => {
  const normalizedEvidence = normalizeEvidenceText(evidence);
  const normalizedPages = normalizeEvidenceText(pages.join(' '));
  if (normalizedEvidence.length >= 8 && normalizedPages.includes(normalizedEvidence)) return true;

  const tokens = evidence
    .toLocaleLowerCase()
    .split(/[^\p{L}\p{N}]+/gu)
    .filter((token) => token.length >= 3);
  if (tokens.length < 2) return false;
  const matched = tokens.filter((token) => normalizedPages.includes(normalizeEvidenceText(token))).length;
  return matched / tokens.length >= 0.45;
};

const parseJsonObject = (raw: string): Record<string, unknown> => {
  const candidates = [raw, cleanJsonString(raw)];
  const firstBrace = raw.indexOf('{');
  const lastBrace = raw.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) candidates.push(raw.slice(firstBrace, lastBrace + 1));

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // Try the next progressively cleaned candidate.
    }
  }
  throw new Error('Interest entry response was not valid JSON');
};

export const generateTinyStudyEntries = async (
  _docContent: string,
  pageTexts: string[],
  options: { fileName: string }
): Promise<{ documentSummary: string; entries: Array<Omit<TinyStudyEntry, 'id' | 'status' | 'turns'>> }> => {
  const perPageChars = Math.max(
    220,
    Math.min(2400, Math.floor(90000 / Math.max(1, pageTexts.length)))
  );
  const pageIndex = pageTexts
    .map((text, index) => `[PAGE ${index + 1}]\n${text.trim().slice(0, perPageChars) || '（本页没有可提取文字）'}`)
    .join('\n\n');

  const prompt = `你正在为一个“现在不想学，但又想先接触一点”的大学学习入口架挑选内容。

资料名：${options.fileName}

请从下面逐页标记的原文里，挑出 3～6 个真正有意思、彼此不同、能够准确定位的入口。不要为了凑数量虚构内容。

入口类型只能是：
- question：资料真正想回答的有意思问题
- experiment：有具体做法与发现的实验或案例
- counterintuitive：违反直觉的发现
- debate：理论或观点冲突
- real_life：能和现实生活、社会或其他课程建立的原文连接

严格要求：
- 标题要像优质科普视频的“可信标题党”，目标是让一个本来不想学习的人也产生“等等，怎么回事？”的冲动，而不是像教材目录或论文小标题。
- 标题必须制造一个真实的好奇缺口：优先使用具体画面、反常识结果、冲突、悬念或直接提问；可以有一点营销号感，但所有暗示都必须被对应原文支持。
- 标题不要直接把完整答案说完，也不要使用“X 的机制 / X 的效应 / X 的研究 / 浅析 / 探究”这类教科书式名词短语。
- 禁止虚假夸张和廉价话术，例如“震惊”“99%的人不知道”“看完颠覆认知”“科学家都惊呆了”。
- 标题尽量控制在 12～26 个汉字。梗概 1～2 句再准确说明“发生了什么、为什么值得看”，标题负责让人想点，梗概负责兑现承诺。
- 不同类型可以参考这些写法，但不要照抄：
  - question：为什么越害怕，眼前的东西反而越清楚？
  - experiment：科学家给图片加了噪点，情绪却骗过了眼睛
  - counterintuitive：你以为情绪只影响心情，它连画面清晰度都能改
  - debate：情绪到底先发生在身体，还是先发生在大脑？
  - real_life：为什么紧张时，周围的一切像突然开了高清？
- 输出前默默检查每个标题：它是否有问题或冲突、是否有具体画面、是否不像教材标题、是否忠于证据。不要输出检查过程。
- pageStart/pageEnd 必须使用下方 [PAGE n] 的应用内页码，不能猜页码。
- evidence 必须逐字抄录对应页中一小段连续原文，用于程序核验；不能改写。
- 同一内容不要换标题重复推荐。
- documentSummary 用 2～3 句说明整份资料的背景，只用于后续理解位置。
- 只输出 JSON，不要代码块或解释。

JSON 格式：
{"documentSummary":"...","entries":[{"type":"question","title":"...","teaser":"...","pageStart":1,"pageEnd":2,"evidence":"原文逐字短句"}]}

逐页原文：
${pageIndex}`;

  const response = await ai.models.generateContent({
    model: 'gemini-3.1-pro-preview',
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
  });
  const parsed = parseJsonObject(response.text?.trim() || '');
  const rawEntries = Array.isArray(parsed.entries) ? parsed.entries : [];
  const entries: Array<Omit<TinyStudyEntry, 'id' | 'status' | 'turns'>> = [];
  const seenTitles = new Set<string>();

  for (const value of rawEntries) {
    if (!value || typeof value !== 'object') continue;
    const item = value as Record<string, unknown>;
    const type = String(item.type || '') as TinyStudyEntryType;
    const title = String(item.title || '').trim();
    const teaser = String(item.teaser || '').trim();
    const evidence = String(item.evidence || '').trim();
    const pageStart = Math.trunc(Number(item.pageStart));
    const pageEnd = Math.trunc(Number(item.pageEnd));
    const normalizedTitle = normalizeEvidenceText(title);
    if (!TINY_STUDY_ENTRY_TYPES.includes(type) || !title || !teaser || !evidence) continue;
    if (!Number.isInteger(pageStart) || !Number.isInteger(pageEnd) || pageStart < 1 || pageEnd < pageStart || pageEnd > pageTexts.length) continue;
    if (seenTitles.has(normalizedTitle)) continue;
    const targetPages = pageTexts.slice(pageStart - 1, pageEnd);
    if (!hasEvidenceOnPages(evidence, targetPages)) continue;
    const nearDuplicate = entries.some((entry) => {
      const overlap = Math.max(0, Math.min(entry.pageEnd, pageEnd) - Math.max(entry.pageStart, pageStart) + 1);
      const smallerRange = Math.min(entry.pageEnd - entry.pageStart + 1, pageEnd - pageStart + 1);
      return entry.type === type && overlap / smallerRange >= 0.8;
    });
    if (nearDuplicate) continue;
    seenTitles.add(normalizedTitle);
    entries.push({ type, title, teaser, pageStart, pageEnd, evidence });
    if (entries.length >= 6) break;
  }

  if (entries.length === 0) throw new Error('No evidence-grounded interest entries were found');
  return {
    documentSummary: String(parsed.documentSummary || '').trim(),
    entries,
  };
};

const getTinyStudyEntryActionInstruction = (action: TinyStudyEntryAction): string => {
  if (action === 'simpler') return '把刚才这个入口再讲白一点，只解释同一件事，不引入新的主题。';
  if (action === 'interesting') return '只解释这个入口为什么有意思、反直觉或值得继续看，不扩展成整份资料总结。';
  if (action === 'deeper') return '沿着同一个入口深入一层，可以补充机制或证据，但不能跳到其他入口。';
  return '第一次介绍这个入口：先讲清发生了什么，以及为什么有意思。';
};

export const generateTinyStudyEntryStep = async (
  _docContent: string,
  options: {
    fileName: string;
    documentSummary: string;
    entry: TinyStudyEntry;
    action: TinyStudyEntryAction;
    pageTexts: string[];
    previousTurns?: TinyStudyEntryTurn[];
  }
): Promise<string> => {
  const pageScope = options.pageTexts
    .slice(options.entry.pageStart - 1, options.entry.pageEnd)
    .map((text, index) => `[PAGE ${options.entry.pageStart + index}]\n${text.slice(0, 5000)}`)
    .join('\n\n');
  const history = (options.previousTurns ?? [])
    .slice(-6)
    .map((turn) => `${turn.action}: ${turn.text}`)
    .join('\n\n');
  const prompt = `你是一个很会降低学习阻力的陪读助手。用户选择了一个自己可能感兴趣的入口，你只能围绕这个入口讲。

资料名：${options.fileName}
整份资料背景：${options.documentSummary || '无额外背景'}
当前入口：${options.entry.title}
入口梗概：${options.entry.teaser}
准确范围：第 ${options.entry.pageStart}-${options.entry.pageEnd} 页
本次动作：${getTinyStudyEntryActionInstruction(options.action)}

当前入口的历史：
${history || '这是第一次讲。'}

对应页面原文：
${pageScope}

要求：
- 必须用中文和大白话，像朋友在旁边解释。
- 第一次控制在 180～320 个中文字；后续只补充当前入口，不重复整段。
- 先让人理解“发生了什么”和“为什么有意思”，不要自动生成术语表、Quiz、作业或掌握要求。
- 除非用户明确要求比较，否则不能转去讲其他页或总结整份 PDF。
- 不要声称原文没有提供的事实。
- 直接输出正文，不要 JSON。`;

  const response = await ai.models.generateContent({
    model: 'gemini-3.1-pro-preview',
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
  });
  const text = response.text?.trim();
  if (!text) throw new Error('Interest entry explanation was empty');
  return text;
};

export interface JointReviewSourceInput {
  fileName: string;
  role: JointReviewMaterialRole;
  content: string;
}

const getJointReviewRoleLabel = (role: JointReviewMaterialRole): string => {
  if (role === 'lecture') return 'Lecture / 课堂 slides';
  if (role === 'reading') return 'Reading / 课前阅读';
  if (role === 'article') return 'Article / 文章';
  if (role === 'textbook') return 'Textbook / 教科书章节';
  return 'Other / 其他材料';
};

export const generateJointReviewBriefing = async (
  sources: JointReviewSourceInput[],
  options: { title: string }
): Promise<string> => {
  if (sources.length === 0) return localizeText('这个复习包里还没有材料。', 'This review bundle does not contain any materials yet.');
  try {
    const sourceIndex = sources
      .map((source, index) => `${index + 1}. ${source.fileName} — ${getJointReviewRoleLabel(source.role)}`)
      .join('\n');
    const contentParts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [
      {
        text: `你是一个大学课程复习规划助手。用户正在做“联合复习”：把 lecture slides 和课前 paper/article/textbook 放在一起复习。

课次复习包名称：${options.title}

材料清单：
${sourceIndex}

任务目标：
请生成一份中文 Markdown「联合复习说明」，回答：这些材料为什么要一起复习、每份材料在这节课里起什么作用、复习时应该怎么搭配读。

必须输出以下结构：

# 联合复习说明

## 1. 这节课的主线
用 3-6 句话说明这组材料共同服务的核心主题。不要泛泛而谈。

## 2. 每份材料在干什么
逐份材料说明：它是主线、背景、证据、案例、概念定义、扩展阅读，还是考试加分材料。

## 3. Lecture 和 readings 的对应关系
尽量指出 lecture 里的哪些概念/页段/主题，可能对应哪些 reading/article/textbook。拿不准页码时可以说“可能对应”，但不要编造不存在的细节。

## 4. 复习优先级
分成：
- 必须先看
- 有时间再看
- 只需要知道作用

## 5. 考试怎么用
给出“最小考试答案”和“加分 evidence / reading 出处”的区分。

## 6. 建议复习顺序
给出一个低压力顺序，帮助用户开始。

约束：
- 不要假装已经精确读懂所有页码；如果材料多或信息不确定，要用谨慎措辞。
- 不要要求用户完整重读每篇 paper。
- 重点是建立关系，而不是单篇文献摘要。
- 语言自然，像懂课的同学帮忙整理。

下面开始给你材料内容。`
      },
    ];

    sources.forEach((source, index) => {
      contentParts.push({
        text: `\n\n【材料 ${index + 1}】${source.fileName}\n角色：${getJointReviewRoleLabel(source.role)}\n`,
      });
      contentParts.push(getContentPartWithMaxChars(source.content, 50000));
    });

    const response = await ai.models.generateContent({
      model: 'gemini-3.1-pro-preview',
      contents: [{ role: 'user', parts: contentParts }],
    });

    return response.text?.trim() || '这次没生成出来，可以稍后重试。';
  } catch (error) {
    console.error('generateJointReviewBriefing Error:', error);
    throw error;
  }
};

export const chatWithJointReviewGuide = async (
  sources: JointReviewSourceInput[],
  history: ChatMessage[],
  userMessage: string,
  options: { title: string; summaryMarkdown?: string }
): Promise<string> => {
  if (sources.length === 0) return localizeText('这个复习包里还没有可读材料。', 'This review bundle does not contain any readable materials yet.');
  try {
    const sourceIndex = sources
      .map((source, index) => `${index + 1}. ${source.fileName} — ${getJointReviewRoleLabel(source.role)}`)
      .join('\n');
    const contentParts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [
      {
        text: `你是逃课神器里的“联合领读”向导。用户把 lecture slides 和课前 reading/article/textbook 放进同一个课次复习包里。

你的任务不是分别总结每份 PDF，而是：以 lecture 为主线，带用户一小段一小段复习；遇到 lecture 背后需要 reading/article/textbook 支撑时，再调取那些材料解释。

课次复习包：${options.title}

材料清单：
${sourceIndex}

已有联合复习说明：
${options.summaryMarkdown?.trim() || '暂无。'}

对话规则：
- 必须用中文。
- 一次只推进一小段，不要一口气讲完整个 lecture 或完整个 module。
- 默认以 lecture 为复习主线；reading/article/textbook 只在需要解释背景、证据、出处或加分理解时拉进来。
- 如果用户说“继续”，就接着上一段往后带读。
- 如果用户问某个概念，就先答问题，再告诉它和 lecture/readings 的关系。
- 讲到 reading 证据时要点名来源，例如“这点更像来自 Paper A / Article B 的作用”。不确定时说“可能对应”，不要编造页码。
- 输出要像陪读，不像报告。可以用小标题、短段落和 bullet，但不要太长。
- 每次结尾给一个轻量下一步，比如“要不要继续看 lecture 下一小段？”。

下面开始给你材料内容。`
      },
    ];

    sources.forEach((source, index) => {
      contentParts.push({
        text: `\n\n【材料 ${index + 1}】${source.fileName}\n角色：${getJointReviewRoleLabel(source.role)}\n`,
      });
      contentParts.push(getContentPartWithMaxChars(source.content, 50000));
    });

    const contents: Array<{ role: 'user' | 'model'; parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> }> = [
      { role: 'user', parts: contentParts },
      { role: 'model', parts: [{ text: '我已了解这组材料。接下来我会以 lecture 为主线，必要时调用 readings 支撑。' }] },
    ];

    history.slice(-12).forEach((msg) => {
      contents.push({ role: msg.role, parts: [{ text: msg.text }] });
    });
    contents.push({ role: 'user', parts: [{ text: userMessage }] });

    const response = await ai.models.generateContent({
      model: 'gemini-3.1-pro-preview',
      contents,
    });

    return response.text?.trim() || '这次没讲出来，可以再点一次继续。';
  } catch (error) {
    console.error('chatWithJointReviewGuide Error:', error);
    throw error;
  }
};

export const generateJointReviewExamPrep = async (
  sources: JointReviewSourceInput[],
  options: { title: string; summaryMarkdown?: string; guideMessages?: ChatMessage[] }
): Promise<string> => {
  if (sources.length === 0) return localizeText('这个复习包里还没有材料。', 'This review bundle does not contain any materials yet.');
  try {
    const sourceIndex = sources
      .map((source, index) => `${index + 1}. ${source.fileName} — ${getJointReviewRoleLabel(source.role)}`)
      .join('\n');
    const recentGuide = (options.guideMessages ?? [])
      .slice(-10)
      .map((msg) => `${msg.role === 'user' ? '学生' : '联合领读'}：${msg.text}`)
      .join('\n\n');
    const contentParts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [
      {
        text: `你是一个大学课程的考前整合助手。用户已经创建了一个“课次复习包”，里面有 lecture slides 和课前 reading/article/textbook。

你的任务不是继续带读，而是生成一份可直接用于考前复习的中文 Markdown：把 lecture 和 readings 连接成答题材料。

课次复习包：${options.title}

材料清单：
${sourceIndex}

已有联合复习说明：
${options.summaryMarkdown?.trim() || '暂无。'}

最近联合领读对话：
${recentGuide || '暂无。'}

必须输出以下结构：

# 联合考试整合

## 1. 这组材料最可能怎么考
列出 4-7 个可能考法。每个考法要说明为什么可能考，以及主要来自 lecture 还是 readings。

## 2. 最小考试答案模板
给 3-5 个高频核心问题。每个问题都要包含：
- **最小答案**：只靠 lecture 也能答出的版本，适合考试时间紧张。
- **加分 evidence**：reading/article/textbook 可以补的证据、研究、案例或出处。
- **别写偏**：容易过度展开或跑题的地方。

## 3. Lecture + Reading 对照答题表
用 Markdown 表格：
| Lecture 里的考点 | 对应 reading/article/textbook 的作用 | 考试中怎么用 |

## 4. 易混点与陷阱
列出容易把 lecture 和 readings 混错、概念混错、证据用错的地方。

## 5. 考前 10 分钟速览
写成极简清单：如果只剩 10 分钟，先看哪 5-8 个东西。

## 6. 自测题
给 5 道自测题，题后附简短参考答案。题目要能体现 lecture 与 readings 的关系，不要只考定义。

约束：
- 不要假装知道老师必考什么，要用“可能/高优先级/低优先级”表达不确定性。
- 不要要求用户完整重读 paper。
- 明确区分 lecture 的考试主线与 readings 的加分作用。
- 如果没有足够证据建立精确对应关系，要直接说“这里需要回到原文核对”，不要编造页码。
- 输出自然、实用、适合考前直接看。

下面开始给你材料内容。`
      },
    ];

    sources.forEach((source, index) => {
      contentParts.push({
        text: `\n\n【材料 ${index + 1}】${source.fileName}\n角色：${getJointReviewRoleLabel(source.role)}\n`,
      });
      contentParts.push(getContentPartWithMaxChars(source.content, 50000));
    });

    const response = await ai.models.generateContent({
      model: 'gemini-3.1-pro-preview',
      contents: [{ role: 'user', parts: contentParts }],
    });

    return response.text?.trim() || '这次没生成出来，可以稍后重试。';
  } catch (error) {
    console.error('generateJointReviewExamPrep Error:', error);
    throw error;
  }
};

/** 根据用户要求修改考前速览：在原有内容基础上增删改，其他结构不变 */
export const updateExamSummary = async (
  docContent: string,
  currentMarkdown: string,
  userRequest: string
): Promise<string> => {
  try {
    const contentPart = getContentPart(docContent.slice(0, 30000));
    const response = await ai.models.generateContent({
      model: 'gemini-3.1-pro-preview',
      contents: [
        {
          role: 'user',
          parts: [
            contentPart,
            {
              text: `下面是一份已有的「考前速览」Markdown 内容，用户希望对它进行修改。

【用户的要求】
${userRequest.trim()}

【当前考前速览内容】
\`\`\`
${currentMarkdown}
\`\`\`

请根据用户要求，在**保持原有三部分结构**（核心要点、易错点、高频考点）的前提下，对内容进行增删或修改：
- 若用户想「加入」某块不熟悉的知识：在该部分中增加相应条目，风格与现有条目一致。
- 若用户想「减少」某部分：删减或合并相应条目，其余保留。
- 若用户想「强调」某块：可适当加粗或增加一句说明。
其他未提及的内容尽量保持原样。数学与公式用 LaTeX（$...$）。输出完整的修订后的 Markdown，不要只输出修改片段。`
            }
          ]
        }
      ]
    });
    return response.text?.trim() || "修改失败，请重试。";
  } catch (error) {
    console.error("updateExamSummary Error:", error);
    return "修改失败，请重试。";
  }
};

/** 考点与陷阱：考点列表 + 陷阱描述 + 易错题提示（Markdown） */
export const generateExamTraps = async (docContent: string): Promise<string> => {
  try {
    const contentPart = getContentPart(docContent.slice(0, 50000));
    const response = await ai.models.generateContent({
      model: 'gemini-3.1-pro-preview',
      contents: [
        {
          role: 'user',
          parts: [
            contentPart,
            {
              text: `请根据文档内容，生成一份「考点与陷阱」Markdown，用中文输出，包含三部分，每部分用 ## 小标题：
1. **核心考点**：5～8 个必考知识点，每条一句话概括。
2. **常见陷阱**：3～5 个易错/易混淆点，说明错误思路与正确区分方式。
3. **陷阱题提示**：2～4 道典型陷阱题的题干要点与易错选项特征（不要求完整选项，只写“容易误选…因为…”即可）。

各部分用 ## 小标题（如 ## 核心考点、## 常见陷阱、## 陷阱题提示），每条单独一行或列表项，条与条之间空一行。数学与公式用 LaTeX $...$。直接输出 Markdown，不要 JSON。`
            }
          ]
        }
      ]
    });
    return response.text?.trim() || "生成失败，请重试。";
  } catch (error) {
    console.error("generateExamTraps Error:", error);
    return "生成失败，请重试。";
  }
};

/** 递归为思维导图节点补全 id（若缺失） */
const ensureMindMapIds = (node: MindMapNode, prefix: string): MindMapNode => {
  const id = node.id || `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
  const children = node.children?.map((c, i) => ensureMindMapIds(c, `${id}-${i}`));
  return { ...node, id, children };
};

/** 单文档思维导图生成 */
export const generateMindMap = async (docContent: string): Promise<MindMapNode | null> => {
  try {
    const contentPart = getContentPart(docContent.slice(0, 40000));
    const response = await ai.models.generateContent({
      model: 'gemini-3.1-pro-preview',
      contents: [
        {
          role: 'user',
          parts: [
            contentPart,
            {
              text: `请根据文档内容生成一份思维导图，用 JSON 表示树形结构。要求：
- 根节点一个，label 为文档核心主题（中文）。
- 每个节点格式：{ "id": "唯一标识", "label": "中文标题", "labelEn": "English title", "children": [ 子节点数组 ] }。必须中英对照：label 用中文，labelEn 用英文；子节点可省略 children 表示叶子。
- 层级建议 2～4 层，每层子节点不超过 8 个，便于阅读。
- 只输出一个 JSON 对象（根节点），不要其他文字。id 可用 "root", "root-0", "root-0-1" 这类形式。`
            }
          ]
        }
      ]
    });
    const raw = response.text?.trim() || '';
    const cleaned = cleanJsonString(raw);
    const parsed = JSON.parse(cleaned) as MindMapNode;
    if (!parsed?.label) return null;
    return ensureMindMapIds(parsed, 'n');
  } catch (error) {
    console.error("generateMindMap Error:", error);
    return null;
  }
};

/** 多文档思维导图：每文档一棵树 + 文档间关联 */
export const generateMindMapMulti = async (
  mergedContent: string,
  fileNames: string[]
): Promise<MindMapMultiResult | null> => {
  try {
    if (fileNames.length === 0) return null;
    const contentPart = getContentPart(mergedContent.slice(0, 60000));
    const response = await ai.models.generateContent({
      model: 'gemini-3.1-pro-preview',
      contents: [
        {
          role: 'user',
          parts: [
            contentPart,
            {
              text: `当前内容由多份文档合并，每段以【文件名】开头。请：
1. 为每个【文件名】对应的文档生成一棵思维导图树，结构同单文档：根节点 { "id", "label", "labelEn", "children" }。label 用中文，labelEn 用英文，中英对照；每层子节点不超过 8 个。
2. 分析这些文档之间的关联，列出两两之间相似或易混淆的知识点。

只输出一个 JSON 对象，格式如下（不要其他文字）：
{
  "perDoc": [ { "fileName": "文档名", "tree": { "id": "root", "label": "主题", "labelEn": "Topic", "children": [...] } }, ... ],
  "crossDoc": [ { "docA": "文档1名", "docB": "文档2名", "similarities": ["相似点1", "相似点2"] }, ... ]
}
fileName 必须与内容中的【文件名】一致。`
            }
          ]
        }
      ]
    });
    const raw = response.text?.trim() || '';
    const cleaned = cleanJsonString(raw);
    const parsed = JSON.parse(cleaned) as MindMapMultiResult;
    if (!parsed?.perDoc?.length) return null;
    const perDoc = parsed.perDoc.map((d) => ({
      fileName: d.fileName,
      tree: ensureMindMapIds(d.tree, 'm')
    }));
    return { perDoc, crossDoc: parsed.crossDoc || [] };
  } catch (error) {
    console.error("generateMindMapMulti Error:", error);
    return null;
  }
};

/** 自建思维导图：AI 评判与补充 */
export const evaluateAndSupplementMindMap = async (
  docContent: string,
  userTree: MindMapNode
): Promise<MindMapEvaluateResult | null> => {
  try {
    const contentPart = getContentPart(docContent.slice(0, 40000));
    const treeJson = JSON.stringify(userTree, null, 0);
    const response = await ai.models.generateContent({
      model: 'gemini-3.1-pro-preview',
      contents: [
        {
          role: 'user',
          parts: [
            contentPart,
            {
              text: `用户根据文档自己构建了一份思维导图（JSON 树结构），请评判并给出补充建议。

【用户当前的思维导图】
${treeJson}

请输出一个 JSON 对象（不要其他文字）：
{
  "feedback": "简短评语：肯定做得好的地方，指出遗漏或易混点，1～3 句话。",
  "suggestedNodes": [ { "parentId": "用户树中某节点的 id", "node": { "id": "new-1", "label": "建议补充的节点标题", "children": [] } }, ... ]
}
suggestedNodes 最多 5～8 条，只补充重要遗漏即可；若用户导图已很完整可返回空数组。parentId 必须是用户树中已存在的 id。`
            }
          ]
        }
      ]
    });
    const raw = response.text?.trim() || '';
    const cleaned = cleanJsonString(raw);
    const parsed = JSON.parse(cleaned) as MindMapEvaluateResult;
    if (!parsed?.feedback) return null;
    return {
      feedback: parsed.feedback,
      suggestedNodes: parsed.suggestedNodes || []
    };
  } catch (error) {
    console.error("evaluateAndSupplementMindMap Error:", error);
    return null;
  }
};

/** 根据用户描述修改思维导图（增删改节点、简化、翻译等），返回新树 */
export const modifyMindMap = async (
  currentTree: MindMapNode,
  userInstruction: string,
  docContent?: string
): Promise<MindMapNode | null> => {
  try {
    const treeJson = JSON.stringify(currentTree, null, 0);
    const contentParts: Array<{ text: string } | ReturnType<typeof getContentPart>> = [
      {
        text: `用户有一份思维导图（JSON 树结构），希望按他的描述修改。请根据描述输出修改后的完整思维导图 JSON。

【当前思维导图】
${treeJson}

【用户修改要求】
${userInstruction}

要求：
- 只输出一个 JSON 对象（根节点），不要其他文字。保持 id 格式（如 root, root-0 等），可新增节点用 new-1, new-2 等。
- 节点格式：{ "id", "label", "labelEn", "children" }，保持中英对照：label 中文，labelEn 英文。
- 严格按用户要求增删改节点、调整结构或文案；若要求翻译则整体改为目标语并保留另一语种在 label/labelEn。`
      }
    ];
    if (docContent?.trim()) {
      contentParts.push(getContentPart(docContent.slice(0, 20000)));
      contentParts.push({ text: '\n若修改需参考文档内容，请结合上文。' });
    }
    const response = await ai.models.generateContent({
      model: 'gemini-3.1-pro-preview',
      contents: [{ role: 'user', parts: contentParts }]
    });
    const raw = response.text?.trim() || '';
    const cleaned = cleanJsonString(raw);
    const parsed = JSON.parse(cleaned) as MindMapNode;
    if (!parsed?.label) return null;
    return ensureMindMapIds(parsed, 'n');
  } catch (error) {
    console.error("modifyMindMap Error:", error);
    return null;
  }
};

export interface TerminologyItem {
  term: string;
  definition: string;
  keyWords?: string[];
}

/** 术语精确定义：从文档抽取术语及定义，返回结构化列表 */
export const extractTerminology = async (docContent: string): Promise<TerminologyItem[]> => {
  try {
    const contentPart = getContentPart(docContent.slice(0, 50000));
    const response = await ai.models.generateContent({
      model: 'gemini-3.1-pro-preview',
      contents: [
        {
          role: 'user',
          parts: [
            contentPart,
            {
              text: `请从文档中抽取重要术语及其精确定义，用 JSON 数组输出，每个元素格式：
{"term": "术语名", "definition": "一句话精确定义", "keyWords": ["关键词1", "关键词2"]}
keyWords 可选，为定义中的关键限定词。抽取 8～15 个术语，只输出 JSON 数组，不要其他文字。`
            }
          ]
        }
      ]
    });
    const raw = response.text?.trim() || "[]";
    const cleaned = cleanJsonString(raw);
    const parsed = JSON.parse(cleaned) as TerminologyItem[];
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error("extractTerminology Error:", error);
    return [];
  }
};

/** 刁钻教授：根据文档与用户薄弱点生成易考易错的刁钻题（Markdown） */
export const generateTrickyQuestions = async (docContent: string, weakPoints?: string): Promise<string> => {
  try {
    const contentPart = getContentPart(docContent.slice(0, 50000));
    const userHint = weakPoints?.trim()
      ? `\n用户特别说明的薄弱点或易错点：${weakPoints}\n请针对这些地方多出刁钻题。`
      : '';
    const response = await ai.models.generateContent({
      model: 'gemini-3.1-pro-preview',
      contents: [
        {
          role: 'user',
          parts: [
            contentPart,
            {
              text: `请扮演「刁钻教授」，根据文档内容出 3～5 道**易错、易混淆、考细节**的题目。${userHint}

要求：每题包含题干、选项（4 个）、正确答案索引（0-based）、简要解析。用 Markdown 输出。
- 数学、符号用 LaTeX 表示，例如有效种群大小用 $N_e$，不要写纯文字 Ne。
- 题干、选项、答案、解析之间各空一行，便于排版。
格式示例：
## 第 1 题

**题干** 题目内容…

- A. 选项 A
- B. 选项 B
- C. 选项 C
- D. 选项 D

**答案**：B（索引 1）

**解析**：解析内容…

直接输出 Markdown，不要 JSON。`
            }
          ]
        }
      ]
    });
    return response.text?.trim() || "生成失败，请重试。";
  } catch (error) {
    console.error("generateTrickyQuestions Error:", error);
    return "生成失败，请重试。";
  }
};

/** P1：备考台讲义引用 — 附在用户轮末尾，约束模型输出可解析的 citations JSON */
export function buildExamWorkspaceCitationInstruction(materials: ExamMaterialLink[]): string {
  if (!materials.length) return '';
  const lines = materials
    .map((m) => `- materialId: \`${m.id}\` ｜ fileName: ${(m.fileName || '未命名').replace(/\s+/g, ' ').trim()}`)
    .join('\n');
  return `

【本场关联材料清单（用于讲义页码引用）】
下列 materialId 必须与引用时完全一致；**禁止**编造未出现在清单中的 materialId；无法确定页码时不要写入 citations。
${lines}

【回复末尾必须附机器可解析的引用（JSON）】
在 Markdown 正文全部输出完毕后，**单独**追加一个 fenced 代码块：语言标记为 json，且**仅**包含下列结构（page 为 **1-based** 页码，与讲义预览一致）：
- **P3 增强（可选，与旧版兼容）**：每条引用可含 \`paragraphIndex\`（**0-based** 整数）：按正文渲染顺序，依次为每个块级元素编号——段落 \`p\`、标题 \`h1\`–\`h6\`、**每个** \`li\`、\`blockquote\`、\`pre\` 各占一个编号；请保证该索引与引用所依据的**那一段正文**一致。
- 可选 \`quote\`：从讲义中摘录的**短句**（≤120 字，须真实存在），用于侧栏 PDF 文本高亮；**禁止**编造讲义中不存在的句子。
\`\`\`json
{
  "citations": [
    { "materialId": "<materialId>", "page": 3, "paragraphIndex": 2, "quote": "讲义中的原文片段…" }
  ]
}
\`\`\`
若本轮无可靠页码或材料对应关系，请使用 "citations": []；不要猜测页码。无把握时不要填写 paragraphIndex 或 quote。
`;
}

/**
 * 备考引用 1-3：向用户轮追加 chunk 白名单与 †chunkId† 协议（仅摘要，不塞全文）。
 * 当本附录非空时，chatWithAdaptiveTutor **不再**附加旧版 buildExamWorkspaceCitationInstruction。
 */
export function buildExamChunkCitationAppendix(candidates: RetrievedChunk[]): string {
  if (!candidates.length) return '';
  const exampleId = candidates[0]!.chunk.chunkId;
  const lines = candidates
    .map((r) => {
      const id = r.chunk.chunkId;
      const sum = r.chunk.text.replace(/\s+/g, ' ').trim().slice(0, 80);
      return `- \`${id}\` ｜ material=${r.chunk.materialLinkId} ｜ page=${r.chunk.page} ｜ ${sum}`;
    })
    .join('\n');

  return `

【讲义定位引用（检索白名单 · 必须遵守）】
以下为**本轮**检索到的讲义片段 id（**仅允许**引用下列 id；**禁止**编造 id、禁止编造 materialId 或页码）。
每一行：chunkId 与不超过 80 字的摘要（摘要仅协助对齐语义，**不要**在正文中复述全文）。

${lines}

【引用暗号（必须）】
- 在正文中需要指向讲义时，使用 **†chunkId†**（字符 † 为 U+2020 DAGGER，一对包裹**完整** chunkId；chunkId 内**不得**含 †）。
- 示例：正如 †${exampleId}† 中的表述…
- **不要**使用旧版文末 \`\`\`json\` 的 \`citations\` 块；本轮仅以 chunkId 为准。
- **不要**编造未出现在上方列表中的 id。

若本轮无法关联到任何白名单片段，则**不要**输出任何 † 引用，也不要猜测页码。
`;
}

function formatReviewScopeForPrompt(scope?: ExamReviewScope | null): string {
  if (!scope) return '';
  const formatPageWindows = (windows?: Array<{ start: number; end: number }>): string | null => {
    const valid = (windows ?? [])
      .filter((w) => Number.isFinite(w.start) && Number.isFinite(w.end))
      .map((w) => ({ start: Math.max(1, Math.min(w.start, w.end)), end: Math.max(1, Math.max(w.start, w.end)) }));
    if (!valid.length) return null;
    return valid
      .map((w) => (w.start === w.end ? `第 ${w.start} 页` : `第 ${w.start}-${w.end} 页`))
      .join('、');
  };
  const pageLine =
    formatPageWindows(scope.pageWindows) ||
    scope.pageLabel ||
    (scope.pageRange ? `第 ${scope.pageRange.start}-${scope.pageRange.end} 页` : '页码范围未知');
  const kcLines = scope.sourceKcs
    .slice(0, 12)
    .map((kc, i) => {
      const anchors = (kc.anchorPages ?? []).length ? `主证据页 ${kc.anchorPages.join('、')}` : '';
      const sourcePages = (kc.sourcePages ?? []).length ? `证据页 ${kc.sourcePages.join('、')}` : '';
      const related = (kc.relatedPages ?? []).length ? `关联页 ${kc.relatedPages.join('、')}` : '';
      const pages = [anchors, sourcePages, related].filter(Boolean).join('；') || '页码未知';
      return `${i + 1}. ${kc.concept}（${pages}）`;
    })
    .join('\n');

  return `

【当前复习块与证据锚点】
- 当前块：${scope.title}
- 当前材料：${scope.materialTitle}
- 当前证据页/窗口：${pageLine}
- 当前块 KC：\n${kcLines || '（暂无 KC 明细）'}

回答规则：
1. 主回答必须先围绕“当前复习块”回答；不要把其它 lecture / paper / article 的内容说成当前页或当前块内容。
2. 页码是证据锚点，不是牢笼；如果用户指出具体页码或指出页码/内容冲突，必须优先核查本轮白名单和用户指出的页码，不要硬拗原范围。
3. 你可以有全局视野，但只能放在单独小段「全局联系（非当前块证据）」里，并明确说明它来自当前范围之外。
4. 如果用户问“你确定这是当前页/当前块内容吗”，必须先核对上面的当前材料、证据页和本轮白名单；若刚才说的是外部联系，要直接承认并改回当前材料。
5. 若当前块证据不足，不要用外部材料硬补成当前证据；请说“当前块里证据不足，我只能作为全局联系补充”。
`;
}

/**
 * 当前复习块专用 chunk 附录：把主证据和全局延伸分开，避免“串台”。
 */
export function buildExamScopedChunkCitationAppendix(input: {
  scope?: ExamReviewScope | null;
  primary: RetrievedChunk[];
  global?: RetrievedChunk[];
}): string {
  const primary = input.primary ?? [];
  const global = input.global ?? [];
  const all = [...primary, ...global];
  if (!all.length) return '';

  const exampleId = all[0]!.chunk.chunkId;
  const formatLine = (r: RetrievedChunk) => {
    const id = r.chunk.chunkId;
    const sum = r.chunk.text.replace(/\s+/g, ' ').trim().slice(0, 80);
    return `- \`${id}\` ｜ material=${r.chunk.materialLinkId} ｜ page=${r.chunk.page} ｜ ${sum}`;
  };
  const primaryLines = primary.map(formatLine).join('\n') || '- （本轮没有命中当前块附近片段）';
  const globalLines = global.map(formatLine).join('\n') || '- （本轮没有额外全局片段）';
  const scopeText = formatReviewScopeForPrompt(input.scope);

  return `
${scopeText}

【讲义定位引用（当前材料优先 · 必须遵守）】
本轮白名单分两类。正文的主回答优先使用「当前材料证据」；「全局延伸证据」只能用于单独的“全局联系（非当前块证据）”小段。
如果用户明确提到某一页，本轮「当前材料证据」中与该页相邻的片段优先级最高。

当前材料证据（当前块 / 用户指出页码 / 同材料候选）：
${primaryLines}

全局延伸证据：
${globalLines}

【引用暗号（必须）】
- 在正文中需要指向讲义时，使用 **†chunkId†**（字符 † 为 U+2020 DAGGER，一对包裹完整 chunkId）。
- 示例：正如 †${exampleId}† 中的表述…
- 仅允许引用上方白名单里的 chunkId；禁止编造 id、materialId 或页码。
- 不要使用旧版文末 \`\`\`json\` 的 \`citations\` 块。
- 如果当前材料证据为空，不要假装定位到了当前页；请明说当前材料附近暂无可用定位证据。
`;
}

function isKCScopedTutorContext(
  scaffolding: TutorScaffoldingContext | KCScopedTutorContext | undefined
): scaffolding is KCScopedTutorContext {
  return (
    !!scaffolding &&
    typeof scaffolding === 'object' &&
    'kcId' in scaffolding &&
    typeof (scaffolding as KCScopedTutorContext).kcId === 'string' &&
    (scaffolding as KCScopedTutorContext).kcId.length > 0
  );
}

/** M3：备考台锚定 KC 时附在用户消息末尾（在 P4 元指令之后） */
function buildKCScopedTutorAppendix(ctx: KCScopedTutorContext): string {
  const atomLines = (ctx.atoms ?? [])
    .slice(0, 32)
    .map((a) => `- ${a.id}: ${a.label}`)
    .join('\n');
  const gapPart =
    ctx.gapAtomIds && ctx.gapAtomIds.length > 0
      ? `\n【待加强原子（上一轮分析）】${ctx.gapAtomIds.join('、')}`
      : '';

  const modeHint =
    ctx.probeMode === 'direct'
      ? `【探测模式·direct】正面探测：引导学生用简短语言解释机制或定义；不要先给长篇讲义。`
      : ctx.probeMode === 'stress'
        ? `【探测模式·stress】必须构造一个与讲义一致的**违背场景或小反例**，区分背诵与真正理解；篇幅仍须遵守上方「本轮辅导元指令」。`
        : `【探测模式·remediate】针对未说清处补追问或小线索；可优先围绕下方待加强原子。`;

  return `

【M3·本场锚定考点（本轮只讨论此 KC）】
- 考点：${ctx.kcConcept}
- 定义摘要：${(ctx.kcDefinition || '').slice(0, 500)}
- 布鲁姆追问目标层级：${ctx.bloomTarget}（1=记忆/理解，2=应用，3=分析/综合）
${modeHint}
${gapPart}
${formatReviewScopeForPrompt(ctx.reviewScope)}

【本考点逻辑原子 id 清单】
${atomLines || '（暂无原子，仅围绕考点概念讨论）'}

【Markdown 与考点释义侧栏】
请使用 Markdown；双星号粗体 **...** 仅用于本学科专有名词、术语、符号名、标准缩写等；不要用粗体强调普通词汇、整句或修辞性强调（否则会被侧栏误收为术语）。
`;
}

/** 阶段 3：备考台多选 KC（>=2）时的类型 guard。与 isKCScopedTutorContext 平级且互斥。 */
function isMultiKCScopedTutorContext(
  scaffolding: TutorScaffoldingContext | KCScopedTutorContext | MultiKCScopedTutorContext | undefined
): scaffolding is MultiKCScopedTutorContext {
  return (
    !!scaffolding &&
    typeof scaffolding === 'object' &&
    'kcs' in scaffolding &&
    Array.isArray((scaffolding as MultiKCScopedTutorContext).kcs) &&
    (scaffolding as MultiKCScopedTutorContext).kcs.length >= 2
  );
}

/**
 * 阶段 3：多选 KC（>=2）锚定时附在用户消息末尾（在 P4 元指令之后）。
 *
 * 与 buildKCScopedTutorAppendix 平级——单选走单 KC 版本，多选走本函数。
 * 不修改原 buildKCScopedTutorAppendix；多选时由 chatWithAdaptiveTutor 内的
 * isMultiKCScopedTutorContext 分支选择。
 *
 * 设计要点：
 * - 列出本场锚定的 N 个 KC（concept + 定义摘要 + 各自的 atom id 清单）
 * - 不指定 probeMode / bloomTarget（多 KC 横跨不适用）
 * - Markdown 粗体使用约定与单 KC 版本一致
 */
function buildMultiKCScopedTutorAppendix(ctx: MultiKCScopedTutorContext): string {
  const kcBlocks = ctx.kcs
    .map((kc, kcIndex) => {
      const atomLines = (kc.atoms ?? [])
        .slice(0, 32)
        .map((a) => `  - ${a.id}: ${a.label}`)
        .join('\n');
      const gapForKc = ctx.gapAtomIdsByKcId?.[kc.id];
      const gapPart =
        gapForKc && gapForKc.length > 0
          ? `\n  【待加强原子（上一轮分析）】${gapForKc.join('、')}`
          : '';
      return [
        `### KC ${kcIndex + 1}：${kc.concept}`,
        `- 定义摘要：${(kc.definition || '').slice(0, 300)}`,
        `- 本考点逻辑原子 id 清单：`,
        atomLines || '  - （暂无原子，仅围绕考点概念讨论）',
        gapPart,
      ]
        .filter(Boolean)
        .join('\n');
    })
    .join('\n\n');

  return `

【阶段 3·本场锚定多选考点（共 ${ctx.kcs.length} 个 KC，本轮可在以下范围内联合讨论）】
请围绕下列考点联合追问与讲解，识别学生表述时按各 KC 各自的原子清单核对覆盖。
不要泄露 atom id 给学生；保持苏格拉底式辅导口吻，不出"判对错"式题。
${formatReviewScopeForPrompt(ctx.reviewScope)}

${kcBlocks}

【Markdown 与考点释义侧栏】
请使用 Markdown；双星号粗体 **...** 仅用于本学科专有名词、术语、符号名、标准缩写等；不要用粗体强调普通词汇、整句或修辞性强调（否则会被侧栏误收为术语）。
`;
}

/**
 * reading 模式下对用户本轮消息的追加（略读 / 备考 reading 共用）。
 * - 当 `studyMapBriefing`（trim 非空）存在时：以地图为唯一结构锚，追加「必须一致」+ 地图正文；
 *   不再重复追加带具体数字的「领读模块数」段，避免与地图模块数冲突。
 * - 当无地图且 `moduleCount`(2–8) 有效时：保留旧行为，追加「领读模块数」段。
 * - 当二者皆无且有 `skimGranularity` 时：保留旧「第三分支」兜底。
 * - 该函数由 `chatWithSkimAdaptiveTutor` 与 `chatWithAdaptiveTutor` 的 reading 分支共用；
 *   备考 reading 若未来传入 options，同样遵循本规则。
 */
type SkimReadingRecordScope = {
  cardId: string;
  moduleIndex: number;
  partIndex?: number;
  title: string;
  moduleTitle: string;
  pageStart: number;
  pageEnd: number;
  summary: string;
  otherRecordDigests: Array<{
    moduleIndex: number;
    partIndex?: number;
    title: string;
    clarified: string[];
    unresolved: string[];
  }>;
};

// 注:`skimPace` 仅由略读路径(`chatWithSkimAdaptiveTutor` / `SkimPanel`)使用;备考路径(`chatWithAdaptiveTutor`)不传该字段,if 条件永不触发。
export function appendReadingModeUserMessageSuffix(
  newMessage: string,
  readingOptions?: {
    skimGranularity?: 'fine' | 'standard' | 'coarse';
    studyMapBriefing?: string;
    moduleCount?: number;
    skimPace?: 'module' | 'part';
    auxiliaryMaterial?: { fileName: string; role: SkimAuxiliaryMaterialRole; useMode?: SkimAuxiliaryUseMode; content: string };
    recordScope?: SkimReadingRecordScope;
  }
): string {
  if (!readingOptions) {
    return newMessage;
  }
  const n = readingOptions.moduleCount;
  const hasModuleCount = typeof n === 'number' && n >= 2 && n <= 8;
  const brief = readingOptions.studyMapBriefing?.trim();

  let out = newMessage;

  out += "\n\n【格式要求·硬约束】只使用 Markdown。不要输出 HTML 标签，尤其不要输出 <br>、<div>、<span>；需要换行时直接换行。";

  // 方案 A:moduleCount 与 brief 同时注入,先放硬数字约束,再放地图作为参考清单
  if (hasModuleCount) {
    out += `\n\n【领读模块数·硬约束】目标模块数 = ${n} 个。请严格按此数量拆解文档,禁止擅自合并为更少或拆成更多;若同时存在下方学习地图,以本数字为准,地图作为标题与页码范围的参考。`;
  }
  if (brief) {
    out +=
      "\n\n【必须一致】模块数量、标题与页码范围以紧接其下的学习地图为准。深度领读时必须与该地图保持一致，禁止擅自合并、删减模块或另起一套块数不同的大模块列表：\n\n" +
      brief;
  }
  if (!hasModuleCount && !brief && readingOptions.skimGranularity) {
    out +=
      "\n\n【领读模块数】请将文档拆解为以下数量的大模块后再输出逻辑路线图与带读：fine 为 5-7 个，standard 为 3-5 个，coarse 为 2-3 个。本次要求：" +
      readingOptions.skimGranularity +
      "。";
  }
  if (readingOptions.skimPace === 'part') {
    out += "\n\n【节奏要求·硬约束】本次领读节奏 = 一次一个 part。无论用户说“继续”“下一段”“往下讲”，都只能推进当前顺序里的下一个 part，不能一次输出完整 module，也不能连续讲多个 part。请根据对话历史判断当前已经讲到哪里；除非用户明确要求重讲，否则不要从 module1 重新开始。讲完一个 part 后停下，简短询问是否继续。";
  } else if (readingOptions.skimPace === 'module') {
    out += "\n\n【节奏要求·硬约束】本次领读节奏 = 一次一个 module。无论用户说“继续”“下一段”“往下讲”，都只能推进当前顺序里的下一个 module，不能一次输出多个 module。请根据对话历史判断当前已经讲到哪里；除非用户明确要求重讲，否则不要从 module1 重新开始。讲完一个 module 后停下，简短询问是否继续。";
  }
  if (readingOptions.auxiliaryMaterial) {
    const useMode = readingOptions.auxiliaryMaterial.useMode ?? 'necessary';
    out += useMode === 'active'
      ? "\n\n【联合辅助材料·硬约束】当前对话已挂载一份辅助材料，引用强度=积极关联。主材料仍是当前 PDF；请主动寻找当前 module / part 与辅助材料的联系，但每轮最多补充 1 个短小关联点。没有清楚联系时不要硬凑，不要讲完整辅助材料，不要让它抢走主线。"
      : "\n\n【联合辅助材料·硬约束】当前对话已挂载一份辅助材料，引用强度=只在必要时引用。主材料仍是当前 PDF；只有当辅助材料能直接解释当前 module / part 的概念、证据、实验或背景时才引用。没有明显关系时完全不要提辅助材料，也不要写“本段没有引用辅助材料”。";
  }
  if (readingOptions.recordScope) {
    const scope = readingOptions.recordScope;
    const label = `Module ${scope.moduleIndex}${scope.partIndex ? ` · Part ${scope.partIndex}` : ''}`;
    out += `\n\n【当前唱片范围·最高优先级】
- 当前唱片：${label} · ${scope.title}
- 所属 Module：${scope.moduleTitle}
- 应用内页码：第 ${scope.pageStart}-${scope.pageEnd} 页
- 本段梗概：${scope.summary}

本轮默认只能讲解、追问、举例和总结上述唱片范围。你拥有整份 PDF 的全局视野，但不能因为看见其他页面就自行切换 Module / Part；只有用户明确提出“比较、联系、回顾、跳到其他部分”时才能跨范围，并要清楚说明正在做跨范围联系。讲完当前唱片后停下，不要自动开始下一张唱片，也不要重新输出整份 Lecture 路线。`;
    if (scope.otherRecordDigests.length > 0) {
      const digestText = scope.otherRecordDigests.slice(0, 12).map((digest) => {
        const digestLabel = `Module ${digest.moduleIndex}${digest.partIndex ? ` Part ${digest.partIndex}` : ''} · ${digest.title}`;
        const clarified = digest.clarified.slice(0, 3).join('；') || '暂无';
        const unresolved = digest.unresolved.slice(0, 2).join('；') || '暂无';
        return `- ${digestLabel}：已讲清 ${clarified}；未解决 ${unresolved}`;
      }).join('\n');
      out += `\n\n【其他唱片的压缩记忆·只作全局联系】\n${digestText}`;
    }
  }
  return out;
}

type TutorTurnContext = {
  currentPage?: number;
  totalPages?: number;
};

const normalizeForTutorContext = (text: string): string => (
  text.replace(/\s+/g, ' ').trim()
);

const clipTutorContextText = (text: string, maxLength = 700): string => {
  const normalized = normalizeForTutorContext(text);
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}...` : normalized;
};

const hasExplicitTutorTopicShift = (message: string): boolean => (
  /第\s*[0-9一二三四五六七八九十百两]+\s*页|page\s*\d+|全(文|部|局|篇|书)|整(份|个|本)|module|模块|part|章节|换(一|个|成)|重新讲|另一个|下一页|上一页/i.test(message)
);

const isTutorFollowUpMessage = (message: string): boolean => {
  const normalized = normalizeForTutorContext(message);
  if (!normalized) return false;
  const hasFollowUpCue =
    /(太|过于)?(细|详细|复杂|长|多)|简单点|简短|短一点|大白话|换个说法|听不懂|没懂|不是这个意思|不用|不需要|继续|再讲|重讲|举例|例子|为什么|怎么理解|什么意思|这句|刚刚|上面|前面|这一点|这个/.test(normalized);
  return hasFollowUpCue && !hasExplicitTutorTopicShift(normalized);
};

function buildTutorContextTurnSuffix(
  history: ChatMessage[],
  newMessage: string,
  tutorContext?: TutorTurnContext
): string {
  const realHistory = history.filter((msg) => normalizeForTutorContext(msg.text).length > 0);
  const previousUser = [...realHistory].reverse().find((msg) => msg.role === 'user');
  const previousModel = [...realHistory].reverse().find((msg) => msg.role === 'model');
  const hasPreviousTurn = Boolean(previousUser || previousModel);
  const shouldAnchorToPreviousTurn = hasPreviousTurn && isTutorFollowUpMessage(newMessage);
  const pageHint =
    tutorContext?.currentPage && tutorContext?.totalPages
      ? `当前界面停在第 ${tutorContext.currentPage} / ${tutorContext.totalPages} 页。`
      : tutorContext?.currentPage
        ? `当前界面停在第 ${tutorContext.currentPage} 页。`
        : '';

  if (!pageHint && !hasPreviousTurn) return '';

  let suffix = '\n\n【私教上下文护栏】';
  if (pageHint) {
    suffix += `\n- ${pageHint}如果用户没有明确指定别的页码，可以把当前页作为重要参考，但不要无故改成全文概览。`;
  }
  suffix += '\n- 用户的短反馈（例如“太细了”“简单点”“不用这么细”“换个说法”“举个例子”）默认是在修改或追问上一轮回答，不是开启新任务。';
  suffix += '\n- 如果本轮消息没有明确要求换页、换 module 或总结全文，必须保持上一轮的页码、概念和任务范围，只调整讲法、长度或难度。';
  suffix += '\n- 不要因为用户说“别太细”就自动切到全书大纲；应当把上一轮内容压缩成更轻、更短、更好懂的版本。';

  if (previousUser) {
    suffix += `\n\n上一轮用户问题：${clipTutorContextText(previousUser.text, 320)}`;
  }
  if (previousModel) {
    suffix += `\n上一轮助手回答片段：${clipTutorContextText(previousModel.text, 520)}`;
  }
  if (shouldAnchorToPreviousTurn) {
    suffix += '\n\n【本轮判定】这句话高度像是对上一轮回答的风格/长度反馈。请重写或调整上一轮回答，不要换主题。';
  }

  return suffix;
}

/**
 * 备考工作台苏格拉底对话等：**教学法** `buildDialogueTeachingSystemPrompt` + docFlavor + 模式提示；可叠加
 * `scaffolding`、KC 附录、备考材料 citations / chunk 白名单等。**不要**用于略读 `SkimPanel`（略读请用 `chatWithSkimAdaptiveTutor`）。
 */
export const chatWithAdaptiveTutor = async (
    docContent: string,
    history: ChatMessage[],
    newMessage: string,
    mode: 'tutoring' | 'reading',
    docType: DocType = 'STEM',
    readingOptions?: { skimGranularity?: 'fine' | 'standard' | 'coarse'; studyMapBriefing?: string; moduleCount?: number },
    disciplineBand: DisciplineBand = 'unspecified',
    scaffolding?: TutorScaffoldingContext | KCScopedTutorContext | MultiKCScopedTutorContext,
    /** P1：备考台传入本场材料时，追加 citations JSON 协议（略读走 `chatWithSkimAdaptiveTutor`，不经过此参数） */
    examWorkspaceMaterials?: ExamMaterialLink[],
    /** 1-3：非空时优先使用 chunk 白名单 + †chunkId† 协议，**不**再附加旧版 citations JSON */
    examChunkCitationAppendix?: string | null
): Promise<string> => {
    try {
        const contentPart = getContentPart(docContent);
        const contents = [];
        const base = buildDialogueTeachingSystemPrompt(disciplineBand);
        const docFlavor =
            docType === 'HUMANITIES'
                ? '\n\n【材料类型辅助】文本偏文科/论证类：关注论点、前提、概念辨析与理论适用边界。'
                : '\n\n【材料类型辅助】文本偏理科/机制类：关注变量关系、因果链、边界条件与反事实推理。';
        const modeHint =
            mode === 'tutoring'
                ? '\n\n【当前模式】递归式辅导：以苏格拉底式对话为主，先问后讲，必要时再给结构化讲解。'
                : '\n\n【当前模式】深度领读：按用户要求拆解模块、逐段讲解；仍需遵守上文「锚定课程」与支架式原则。';
        let adaptiveSystemPrompt = `${base}${docFlavor}${modeHint}`;
        if (scaffolding) {
            adaptiveSystemPrompt += getScaffoldingSystemAddendum();
        }

        contents.push({
            role: 'user',
            parts: [
                contentPart,
                { text: `Current Mode: ${mode === 'tutoring' ? 'Recursive Tutoring' : 'Deep Lead-Reading (Phase 1/2)'}` }
            ]
        });

        history.forEach(msg => {
            contents.push({ role: msg.role, parts: [{ text: msg.text }] });
        });

        let finalMessage =
          mode === 'reading' && readingOptions
            ? appendReadingModeUserMessageSuffix(newMessage, readingOptions)
            : newMessage;
        if (scaffolding) {
            finalMessage = finalMessage + '\n\n' + buildScaffoldingTurnDirective(scaffolding);
        }
        if (isKCScopedTutorContext(scaffolding)) {
            finalMessage = finalMessage + buildKCScopedTutorAppendix(scaffolding);
        } else if (isMultiKCScopedTutorContext(scaffolding)) {
            finalMessage = finalMessage + buildMultiKCScopedTutorAppendix(scaffolding);
        }
        /**
         * 1-3 / 1-4：`examChunkCitationAppendix` 与 `buildExamWorkspaceCitationInstruction` **互斥**（if / else）。
         * 有 chunk 附录时仅用 †chunkId†；无附录（无索引、检索空、检索失败）且仍有材料时沿用旧版文末 citations JSON；**禁止** 同时注入两套协议。
         */
        if (examChunkCitationAppendix && examChunkCitationAppendix.trim()) {
            finalMessage = finalMessage + examChunkCitationAppendix;
        } else if (examWorkspaceMaterials && examWorkspaceMaterials.length > 0) {
            finalMessage = finalMessage + buildExamWorkspaceCitationInstruction(examWorkspaceMaterials);
        }
        contents.push({ role: 'user', parts: [{ text: finalMessage }] });

        const response = await ai.models.generateContent({
            model: 'gemini-3.1-pro-preview',
            contents: contents,
            config: { systemInstruction: adaptiveSystemPrompt }
        });

        return response.text || "Thinking...";
    } catch (error) {
        console.error("Adaptive Tutor Error:", error);
        return "通信中断，请重试。";
    }
};

function isAbortLikeError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === 'AbortError') return true;
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    (error as { name: string }).name === 'AbortError'
  );
}

/**
 * 略读 / 智能导读专用：仅 `SkimPanel` 等入口应调用；`systemInstruction` 为 `utils/prompts.ts` 的
 * `STEM_SYSTEM_PROMPT` / `HUMANITIES_SYSTEM_PROMPT`（按 `docType`）。**无**备考 citations、chunk、KC、支架附录。
 * reading 模式下的用户句追加与 `appendReadingModeUserMessageSuffix` 对齐（与 `chatWithAdaptiveTutor` 内 reading 分支一致）。
 *
 * `abortSignal`：传入 `AbortController.signal`（`@google/genai` 在 `GenerateContentConfig.abortSignal` 中支持），用户取消时抛出可识别的 abort 错误，由 UI 静默处理、不追加助手消息。
 */
export async function chatWithSkimAdaptiveTutor(
  docContent: string,
  history: ChatMessage[],
  newMessage: string,
  mode: 'tutoring' | 'reading',
  docType: DocType = 'STEM',
  readingOptions?: {
    skimGranularity?: 'fine' | 'standard' | 'coarse';
    studyMapBriefing?: string;
    moduleCount?: number;
    skimPace?: 'module' | 'part';
    auxiliaryMaterial?: {
      fileName: string;
      role: SkimAuxiliaryMaterialRole;
      useMode?: SkimAuxiliaryUseMode;
      content: string;
    };
    recordScope?: SkimReadingRecordScope;
  },
  abortSignal?: AbortSignal,
  /** 当前轮用户图片(数组,语义对齐 chatWithSlide 的 userImagesBase64;放末尾以避免 TS 必填参数顺序错误) */
  userImagesBase64?: string[],
  /** 阶段4b：内容类型。'paper'/'article' 走顺序陪读 prompt；缺省/'lecture' 维持 docType 逻辑。私教不传。 */
  contentType?: SkimContentType,
  tutorContext?: TutorTurnContext
): Promise<string> {
  try {
    const contentPart = getContentPart(docContent);
    const auxiliaryRoleLabel: Record<SkimAuxiliaryMaterialRole, string> = {
      reading: '课前阅读',
      paper: 'Paper',
      article: '文章',
      textbook: '教科书',
      other: '辅助材料',
    };
    const auxiliaryUseModeLabel: Record<SkimAuxiliaryUseMode, string> = {
      necessary: '只在必要时引用',
      active: '积极关联',
    };
    const contents: Array<{ role: 'user' | 'model'; parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> }> = [];
    const systemInstruction =
      contentType === 'paper' ? PAPER_COMPANION_PROMPT
      : contentType === 'article' ? ARTICLE_COMPANION_PROMPT
      : docType === 'HUMANITIES' ? HUMANITIES_SYSTEM_PROMPT
      : STEM_SYSTEM_PROMPT;

    contents.push({
      role: 'user',
      parts: [
        { text: mode === 'tutoring'
          ? '【主材料】下面这份文档是用户正在学习的 PDF。私教回答必须优先围绕用户问题和当前对话上下文，不要无故切到全文概览。'
          : '【主材料】下面这份文档是本轮领读的主线。除非用户明确要求，否则必须围绕主材料推进。'
        },
        contentPart,
        ...(readingOptions?.auxiliaryMaterial ? [
          {
            text: `【辅助材料】下面这份文档是可选参考，不是主线。\n文件名：${readingOptions.auxiliaryMaterial.fileName}\n身份：${auxiliaryRoleLabel[readingOptions.auxiliaryMaterial.role]}\n引用强度：${auxiliaryUseModeLabel[readingOptions.auxiliaryMaterial.useMode ?? 'necessary']}\n使用规则：\n1. 主材料永远是当前 PDF，辅助材料不能改写本轮结构。\n2. ${readingOptions.auxiliaryMaterial.useMode === 'active' ? '可以主动寻找当前 module / part 与辅助材料的联系，但每轮最多补充一个短小关联点。' : '只在辅助材料能直接解释当前 module / part 时引用；没有明显关系就完全不提。'}\n3. 不要总结完整辅助材料，不要连续大段引用辅助材料。\n4. 如果引用它，请用“补充自${auxiliaryRoleLabel[readingOptions.auxiliaryMaterial.role]}：...”标明，并控制在 1-3 句。`
          },
          getContentPart(readingOptions.auxiliaryMaterial.content),
        ] : []),
        ...(readingOptions?.recordScope ? [{
          text: `【唱片学习上下文】当前会话是独立唱片对话，范围为应用内第 ${readingOptions.recordScope.pageStart}-${readingOptions.recordScope.pageEnd} 页。整份主材料只提供全局视野；除非用户明确提出跨范围比较或联系，不得主动讲解范围外内容，也不得延续其他唱片的聊天。`
        }] : []),
        { text: `Current Mode: ${mode === 'tutoring' ? 'Recursive Tutoring' : 'Deep Lead-Reading (Phase 1/2)'}` }
      ]
    });

    history.forEach((msg) => {
      const parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [{ text: msg.text }];
      if (msg.role === 'user') {
        const imgs = getMessageImages(msg);
        imgs.forEach((img) => {
          const imgP = img.split(',');
          const imgData = imgP[1];
          const imgMime = imgP[0].split(';')[0].split(':')[1] || 'image/png';
          parts.push({ inlineData: { mimeType: imgMime, data: imgData } });
        });
      }
      contents.push({ role: msg.role, parts });
    });

    let finalMessage = newMessage;
    if (mode === 'reading' && readingOptions) {
      finalMessage = appendReadingModeUserMessageSuffix(newMessage, readingOptions);
    } else if (mode === 'tutoring') {
      finalMessage += buildTutorContextTurnSuffix(history, newMessage, tutorContext);
    }

    const currentParts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [{ text: finalMessage }];
    (userImagesBase64 ?? []).forEach((img) => {
      const uParts = img.split(',');
      const uImgData = uParts[1];
      const uImgMime = uParts[0].split(';')[0].split(':')[1] || 'image/png';
      currentParts.push({ inlineData: { mimeType: uImgMime, data: uImgData } });
    });
    contents.push({ role: 'user', parts: currentParts });

    const response = await ai.models.generateContent({
      model: 'gemini-3.1-pro-preview',
      contents,
      config: {
        systemInstruction,
        ...(abortSignal ? { abortSignal } : {})
      }
    });

    return response.text || 'Thinking...';
  } catch (error) {
    if (isAbortLikeError(error)) {
      throw error;
    }
    console.error('Skim Adaptive Tutor Error:', error);
    return localizeText('通信中断，请重试。', 'The connection was interrupted. Please try again.');
  }
}

type ContinuousLectureReadingOptions = {
  studyMapBriefing?: string;
  moduleCount?: number;
  skimPace?: 'module' | 'part';
  auxiliaryMaterial?: {
    fileName: string;
    role: SkimAuxiliaryMaterialRole;
    useMode?: SkimAuxiliaryUseMode;
    content: string;
  };
  recordScope?: SkimReadingRecordScope;
};

export interface GenerateContinuousLectureTurnInput {
  docContent: string;
  history: ChatMessage[];
  newMessage: string;
  docType: DocType;
  readingOptions?: ContinuousLectureReadingOptions;
  depth: SkimExplanationDepth;
  pageStart: number;
  pageEnd: number;
  turnIntent?: 'standard' | 'knowledge-extraction-feedback';
  abortSignal?: AbortSignal;
  userImagesBase64?: string[];
}

export interface GenerateContinuousLectureVariantInput {
  docContent: string;
  explanation: SkimExplanationState;
  targetDepth: SkimExplanationDepth;
  targetStyle: SkimExplanationStyle;
  pageStart: number;
  pageEnd: number;
  recordScope?: Pick<SkimReadingRecordScope, 'title' | 'pageStart' | 'pageEnd'>;
  abortSignal?: AbortSignal;
}

export interface GenerateLegacyRecordExplanationVariantInput {
  docContent: string;
  legacyMessageMarkdown: string;
  targetDepth: SkimExplanationDepth;
  targetStyle: SkimExplanationStyle;
  pageStart: number;
  pageEnd: number;
  recordTitle: string;
  abortSignal?: AbortSignal;
}

const SKIM_EXPLANATION_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    responseKind: { type: Type.STRING, enum: ['explanation', 'transition'] },
    messageMarkdown: { type: Type.STRING },
    spineItems: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          titleZh: { type: Type.STRING },
          titleEn: { type: Type.STRING },
          kind: { type: Type.STRING, enum: ['concept', 'relationship', 'mechanism', 'evidence', 'boundary', 'example'] },
          summary: { type: Type.STRING },
          pageRefs: { type: Type.ARRAY, items: { type: Type.INTEGER } },
        },
        required: ['id', 'titleZh', 'kind', 'summary', 'pageRefs'],
      },
    },
    coveredSpineItemIds: { type: Type.ARRAY, items: { type: Type.STRING } },
    deferredSpineItemIds: { type: Type.ARRAY, items: { type: Type.STRING } },
    pageRefs: { type: Type.ARRAY, items: { type: Type.INTEGER } },
  },
  required: ['responseKind', 'messageMarkdown', 'spineItems', 'coveredSpineItemIds', 'deferredSpineItemIds', 'pageRefs'],
};

const SKIM_EXPLANATION_VARIANT_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    messageMarkdown: { type: Type.STRING },
    coveredSpineItemIds: { type: Type.ARRAY, items: { type: Type.STRING } },
    deferredSpineItemIds: { type: Type.ARRAY, items: { type: Type.STRING } },
    pageRefs: { type: Type.ARRAY, items: { type: Type.INTEGER } },
  },
  required: ['messageMarkdown', 'coveredSpineItemIds', 'deferredSpineItemIds', 'pageRefs'],
};

const asStringArray = (value: unknown): string[] => (
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean) : []
);

const asPageArray = (value: unknown): number[] => (
  Array.isArray(value)
    ? value.map(Number).filter((page) => Number.isInteger(page))
    : []
);

const normalizeSkimExplanationSpine = (value: unknown): SkimExplanationSpineItem[] => {
  if (!Array.isArray(value)) return [];
  return value.map((raw, index) => {
    const item = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
    const kind = typeof item.kind === 'string' && ['concept', 'relationship', 'mechanism', 'evidence', 'boundary', 'example'].includes(item.kind)
      ? item.kind as SkimExplanationSpineItem['kind']
      : 'concept';
    return {
      id: typeof item.id === 'string' && item.id.trim() ? item.id.trim() : `spine-${index + 1}`,
      titleZh: typeof item.titleZh === 'string' ? item.titleZh.trim() : '',
      ...(typeof item.titleEn === 'string' && item.titleEn.trim() ? { titleEn: item.titleEn.trim() } : {}),
      kind,
      summary: typeof item.summary === 'string' ? item.summary.trim() : '',
      pageRefs: asPageArray(item.pageRefs),
    };
  });
};

const parseContinuousLectureTurnDraft = (raw: string): SkimExplanationTurnDraft => {
  let parsed: Record<string, unknown> = {};
  try {
    parsed = parseJsonObject(raw);
  } catch {
    // 返回可校验的空草稿，让调用方携带错误反馈自动修复一次。
  }
  return {
    responseKind: parsed.responseKind === 'transition' ? 'transition' : 'explanation',
    messageMarkdown: typeof parsed.messageMarkdown === 'string' ? parsed.messageMarkdown.trim() : '',
    spineItems: normalizeSkimExplanationSpine(parsed.spineItems),
    coveredSpineItemIds: asStringArray(parsed.coveredSpineItemIds),
    deferredSpineItemIds: asStringArray(parsed.deferredSpineItemIds),
    pageRefs: asPageArray(parsed.pageRefs),
  };
};

const parseContinuousLectureVariantDraft = (raw: string): SkimExplanationVariantDraft => {
  let parsed: Record<string, unknown> = {};
  try {
    parsed = parseJsonObject(raw);
  } catch {
    // 同上：结构失败进入一次修复，不覆盖已有版本。
  }
  return {
    messageMarkdown: typeof parsed.messageMarkdown === 'string' ? parsed.messageMarkdown.trim() : '',
    coveredSpineItemIds: asStringArray(parsed.coveredSpineItemIds),
    deferredSpineItemIds: asStringArray(parsed.deferredSpineItemIds),
    pageRefs: asPageArray(parsed.pageRefs),
  };
};

const buildContinuousLectureDepthDirective = (
  depth: SkimExplanationDepth,
  pageStart: number,
  pageEnd: number,
  turnIntent: GenerateContinuousLectureTurnInput['turnIntent'] = 'standard',
  recordScope?: SkimReadingRecordScope,
  validationFeedback?: string,
): string => {
  const modeLabel = recordScope ? '分段唱片式' : '整段式';
  if (turnIntent === 'knowledge-extraction-feedback') {
    return `

【普通 Lecture ${modeLabel}领读·临时知识提取核对】
用户刚刚回答了“看要点”里生成的临时知识提取题。本轮只核对这一次回答，不继续普通领读流程。

必须遵守：
- 只用简短中文说明“已经说出的意思”和“还需要补的一点”；如果用户想不起来，只补最小缺口。
- 不给分，不使用百分比、满分、全部拿下等表达，也不声称用户已经掌握、学会或理解扎实。
- 不继续出题，不主动进入或邀请进入下一个 Module / Part，不询问是否准备好继续。
- 不改变学习进度、覆盖、证据或掌握状态；这只是一次即时回想核对。
- 结尾至多告诉用户：可以继续正常领读，或再次打开“看要点”。
- 必须返回 responseKind=transition；spineItems、coveredSpineItemIds、deferredSpineItemIds、pageRefs 全部为空数组。核对文字只写入 messageMarkdown。
- 只返回结构化 JSON，不要把 JSON 说明写入 messageMarkdown。
${validationFeedback ? `
【上一次输出未通过校验，必须逐项修复】
${validationFeedback}
只返回修复后的完整 JSON。` : ''}`;
  }

  return `

【普通 Lecture ${modeLabel}领读·连接式讲解协议】
当前应用内页码范围：第 ${pageStart}-${pageEnd} 页。页码只能使用这个范围内的整数。
本轮讲解深度：${depth === 'simple' ? '简单讲' : '正常讲'}。
${recordScope ? `当前唱片：${recordScope.title}。上述页码就是这张唱片的硬边界；骨架、讲解、例子和页码都不得越过它，不得自动开始下一张唱片。` : ''}

请返回结构化 JSON，不要把 JSON 说明写入 messageMarkdown。
- responseKind：有实质概念、关系、机制、证据、边界或例子时为 explanation；只有简短确认、报错或“是否继续”时为 transition。
- explanation 必须先为本轮原文建立完整 spineItems。骨架要覆盖本轮应讲的核心概念、关系、机制、关键证据和边界，不能因为选择简单讲就从骨架删除难点。
- 每个骨架项必须有稳定且本轮唯一的 id、中文名、可用时的英文名、短摘要、类型和原 PDF 应用内页码。
- messageMarkdown 中文为主，英文术语只作为必要的括号补充；只用 Markdown，不用 HTML。
${depth === 'simple' ? `- 简单讲先给核心关系、直觉和至多一个具体例子，短句、少术语。coveredSpineItemIds 写已经展开的骨架项；其余全部写入 deferredSpineItemIds，界面会显示“AI暂时替你记着”，所以任何骨架项都不能遗漏。` : `- 正常讲完整说明正式术语、关系、机制、证据和边界。coveredSpineItemIds 必须包含全部骨架项，deferredSpineItemIds 必须为空。`}
- pageRefs 是本轮实际涉及页码的去重数组。transition 的 spineItems 与覆盖数组必须全部为空。
- 不要引入 Lecture 之外的事实，不要编造页码。
${validationFeedback ? `
【上一次输出未通过校验，必须逐项修复】
${validationFeedback}
只返回修复后的完整 JSON。` : ''}`;
};

const appendAuxiliaryContinuousLectureContext = (
  parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }>,
  auxiliary?: ContinuousLectureReadingOptions['auxiliaryMaterial'],
) => {
  if (!auxiliary) return;
  parts.push({
    text: `【辅助材料】${auxiliary.fileName}。它只用于必要补充，当前 PDF 永远是讲解主线；不得用辅助材料替换主材料的内容骨架。`,
  });
  parts.push(getContentPart(auxiliary.content));
};

/** 仅供 Lecture + continuous/records + reading 使用；其他领读/私教入口继续使用原服务。 */
export const generateContinuousLectureTurn = async (
  input: GenerateContinuousLectureTurnInput,
): Promise<SkimExplanationTurnDraft> => {
  const run = async (validationFeedback?: string): Promise<SkimExplanationTurnDraft> => {
    const recordScope = input.readingOptions?.recordScope;
    const documentParts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [
      { text: `【主材料】下面是当前普通${recordScope ? '分段唱片式' : '整段式'} Lecture 的主 PDF。所有讲解、骨架和页码必须以它为准。` },
      getContentPart(input.docContent),
    ];
    appendAuxiliaryContinuousLectureContext(documentParts, input.readingOptions?.auxiliaryMaterial);
    documentParts.push({ text: recordScope ? 'Current Mode: Record-scoped Lecture Lead-Reading' : 'Current Mode: Continuous Lecture Lead-Reading' });

    const contents: Array<{ role: 'user' | 'model'; parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> }> = [
      { role: 'user', parts: documentParts },
    ];
    input.history.forEach((message) => {
      const parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [{ text: message.text }];
      if (message.role === 'user') {
        getMessageImages(message).forEach((image) => {
          const [prefix, data] = image.split(',');
          if (!data) return;
          parts.push({ inlineData: { mimeType: prefix.split(';')[0].split(':')[1] || 'image/png', data } });
        });
      }
      contents.push({ role: message.role, parts });
    });
    const finalMessage = appendReadingModeUserMessageSuffix(input.newMessage, input.readingOptions)
      + buildContinuousLectureDepthDirective(
        input.depth,
        input.pageStart,
        input.pageEnd,
        input.turnIntent,
        recordScope,
        validationFeedback,
      );
    const currentParts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [{ text: finalMessage }];
    (input.userImagesBase64 ?? []).forEach((image) => {
      const [prefix, data] = image.split(',');
      if (!data) return;
      currentParts.push({ inlineData: { mimeType: prefix.split(';')[0].split(':')[1] || 'image/png', data } });
    });
    contents.push({ role: 'user', parts: currentParts });

    const response = await ai.models.generateContent({
      model: 'gemini-3.1-pro-preview',
      contents,
      config: {
        systemInstruction: input.docType === 'HUMANITIES' ? HUMANITIES_SYSTEM_PROMPT : STEM_SYSTEM_PROMPT,
        responseMimeType: 'application/json',
        responseSchema: SKIM_EXPLANATION_RESPONSE_SCHEMA,
        ...(input.abortSignal ? { abortSignal: input.abortSignal } : {}),
      },
    });
    return parseContinuousLectureTurnDraft(response.text || '');
  };

  let draft = await run();
  let validation = validateSkimExplanationTurnDraft(draft, input.depth, input.pageStart, input.pageEnd);
  if (!validation.valid) {
    draft = await run(validation.errors.join('\n'));
    validation = validateSkimExplanationTurnDraft(draft, input.depth, input.pageStart, input.pageEnd);
  }
  if (!validation.valid) throw new Error(`连接式讲解校验失败：${validation.errors.join('；')}`);
  return draft;
};

/**
 * 为旧唱片讲解按需补建内容骨架。原消息保留为 normal-standard，
 * 本服务只生成用户首次点击的目标版本，不在加载时自动消耗模型。
 */
export const generateLegacyRecordExplanationVariant = async (
  input: GenerateLegacyRecordExplanationVariantInput,
): Promise<SkimExplanationTurnDraft> => {
  const run = async (validationFeedback?: string): Promise<SkimExplanationTurnDraft> => {
    const prompt = `【旧唱片讲解·建立连接式版本】
当前唱片：${input.recordTitle}
硬性页码范围：第 ${input.pageStart}-${input.pageEnd} 页
目标深度：${input.targetDepth === 'simple' ? '简单讲' : '正常讲'}
目标表达：${input.targetStyle === 'interesting' ? '有意思讲法' : '标准讲法'}

这是该唱片之前已经生成的旧讲解：

---
${input.legacyMessageMarkdown.slice(0, 24000)}
---

请先从“旧讲解实际说了什么”提取不可变内容骨架，再生成目标版本。
必须遵守：
1. responseKind 必须为 explanation。
2. spineItems 只收录旧讲解已经表达、且能被当前唱片原 PDF 支持的概念、关系、机制、证据、边界和例子；不要把下一张唱片或旧消息未讲的内容加进骨架。
3. 每个骨架项必须有稳定 ID、中英文名称、短摘要、类型和合法原文页码。
4. ${input.targetDepth === 'simple' ? '只展开核心关系、直觉和至多一个例子；其余骨架项全部放入 deferredSpineItemIds。' : '展开全部骨架项；coveredSpineItemIds 包含全部 ID，deferredSpineItemIds 为空。'}
5. ${input.targetStyle === 'interesting' ? '只从这张唱片和旧讲解中找反直觉、冲突、场景或类比；不得添加外部新闻或新研究。结尾对应回正式术语和页码。' : '中文为主，必要英文术语放括号；保持与旧讲解的明确对应。'}
6. messageMarkdown 只放目标版本正文；pageRefs 与所有骨架页码只能在第 ${input.pageStart}-${input.pageEnd} 页。
7. 只返回结构化 JSON。
${validationFeedback ? `
【上一次输出未通过校验，必须修复】
${validationFeedback}
只返回修复后的完整 JSON。` : ''}`;
    const response = await ai.models.generateContent({
      model: 'gemini-3.1-pro-preview',
      contents: [{
        role: 'user',
        parts: [getContentPart(input.docContent), { text: prompt }],
      }],
      config: {
        systemInstruction: '你负责为普通 Lecture 的旧唱片讲解补建连接式版本。必须保留原结论，严格遵守当前唱片范围。',
        responseMimeType: 'application/json',
        responseSchema: SKIM_EXPLANATION_RESPONSE_SCHEMA,
        ...(input.abortSignal ? { abortSignal: input.abortSignal } : {}),
      },
    });
    return parseContinuousLectureTurnDraft(response.text || '');
  };

  let draft = await run();
  let validation = validateSkimExplanationTurnDraft(
    draft,
    input.targetDepth,
    input.pageStart,
    input.pageEnd,
  );
  if (!validation.valid) {
    draft = await run(validation.errors.join('\n'));
    validation = validateSkimExplanationTurnDraft(
      draft,
      input.targetDepth,
      input.pageStart,
      input.pageEnd,
    );
  }
  if (!validation.valid) throw new Error(`旧唱片讲解骨架校验失败：${validation.errors.join('；')}`);
  return draft;
};

const buildVariantDirective = (
  input: GenerateContinuousLectureVariantInput,
  validationFeedback?: string,
): string => {
  const variants = Object.values(input.explanation.variants)
    .filter((variant): variant is NonNullable<typeof variant> => Boolean(variant))
    .map((variant) => ({
      key: variant.key,
      depth: variant.depth,
      style: variant.style,
      messageMarkdown: variant.messageMarkdown.slice(0, 16000),
      coveredSpineItemIds: variant.coveredSpineItemIds,
      deferredSpineItemIds: variant.deferredSpineItemIds,
    }));
  return `【同一条领读讲解·生成连接版本】
目标深度：${input.targetDepth === 'simple' ? '简单讲' : '正常讲'}
目标表达：${input.targetStyle === 'interesting' ? '有意思讲法' : '标准讲法'}
合法页码：第 ${input.pageStart}-${input.pageEnd} 页

不可变内容骨架：
${JSON.stringify(input.explanation.spineItems)}

已经生成的同卡片版本：
${JSON.stringify(variants)}

规则：
1. 只能改变讲解深度和表达方式，不能新增、删除或改写骨架结论，不能引用骨架外的事实。
2. 必须参考原 PDF 核对事实与页码，不能只根据简单版自行扩写。
${input.recordScope ? `3. 这条讲解属于唱片“${input.recordScope.title}”，范围为第 ${input.recordScope.pageStart}-${input.recordScope.pageEnd} 页。任何版本都不得引入下一张唱片的内容。` : '3. 当前为整段式领读，继续沿用该消息已有的内容骨架和页码范围。'}
4. ${input.targetDepth === 'normal' ? '正常版必须覆盖每个骨架项，coveredSpineItemIds 写全部骨架 ID，deferredSpineItemIds 为空。若已有同表达方式的简单版，要明确用“刚才简单版里的……，正式来说对应……”建立连接。' : '简单版只展开核心关系和一个直觉例子，其余骨架项全部放进 deferredSpineItemIds，不能丢失。'}
5. ${input.targetStyle === 'interesting' ? '从原材料内部寻找反直觉结果、冲突、具体场景或贴切类比；不要编造新闻、研究或外部事实。结尾明确把场景/类比逐项对应回 Lecture 的术语、证据和页码。若已有另一深度的有意思版，沿用同一个入口。' : '保持清楚、直接、中文为主；必要英文术语放在括号中。'}
6. messageMarkdown 只用 Markdown，不用 HTML。pageRefs 只能使用合法范围内的原文页码。
${validationFeedback ? `
【上一次输出未通过校验，必须修复】
${validationFeedback}
只返回修复后的完整 JSON。` : ''}`;
};

export const generateContinuousLectureVariant = async (
  input: GenerateContinuousLectureVariantInput,
): Promise<SkimExplanationVariantDraft> => {
  const run = async (validationFeedback?: string): Promise<SkimExplanationVariantDraft> => {
    const response = await ai.models.generateContent({
      model: 'gemini-3.1-pro-preview',
      contents: [{
        role: 'user',
        parts: [getContentPart(input.docContent), { text: buildVariantDirective(input, validationFeedback) }],
      }],
      config: {
        systemInstruction: '你是普通 Lecture 领读的讲解改写器。忠实性、当前范围和同一内容骨架优先于文风变化。',
        responseMimeType: 'application/json',
        responseSchema: SKIM_EXPLANATION_VARIANT_SCHEMA,
        ...(input.abortSignal ? { abortSignal: input.abortSignal } : {}),
      },
    });
    return parseContinuousLectureVariantDraft(response.text || '');
  };

  let draft = await run();
  let validation = validateSkimExplanationVariantDraft(
    draft,
    input.explanation.spineItems,
    input.targetDepth,
    input.pageStart,
    input.pageEnd,
  );
  if (!validation.valid) {
    draft = await run(validation.errors.join('\n'));
    validation = validateSkimExplanationVariantDraft(
      draft,
      input.explanation.spineItems,
      input.targetDepth,
      input.pageStart,
      input.pageEnd,
    );
  }
  if (!validation.valid) throw new Error(`讲解版本校验失败：${validation.errors.join('；')}`);
  return draft;
};

type RawSkimRouteNode = {
  kind?: string;
  index?: number;
  title?: string;
  pageStart?: number;
  pageEnd?: number;
  pageLabel?: string;
  summary?: string;
  children?: RawSkimRouteNode[];
};

type RawSkimRoutePayload = {
  title?: string;
  nodes?: RawSkimRouteNode[];
};

const parseSkimRouteJson = (raw: string): RawSkimRoutePayload | null => {
  const candidates = [
    raw,
    raw.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim(),
  ];
  const firstBrace = raw.indexOf('{');
  const lastBrace = raw.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    candidates.push(raw.slice(firstBrace, lastBrace + 1));
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as RawSkimRoutePayload;
      if (parsed && Array.isArray(parsed.nodes)) return parsed;
    } catch {
      // try next candidate
    }
  }
  return null;
};

const normalizeRouteTitle = (value: unknown, fallback: string): string => {
  if (typeof value !== 'string') return fallback;
  const text = value.replace(/\s+/g, ' ').trim();
  return text || fallback;
};

const normalizeRoutePageNumber = (value: unknown): number | undefined => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  const page = Math.round(value);
  return page > 0 ? page : undefined;
};

const routeTopKindForContentType = (contentType: SkimContentType): SkimReadingRouteNode['kind'] => {
  if (contentType === 'paper') return 'section';
  if (contentType === 'article') return 'stage';
  return 'module';
};

const routeChildKindForContentType = (contentType: SkimContentType): SkimReadingRouteNode['kind'] => {
  if (contentType === 'paper') return 'naturalPart';
  if (contentType === 'article') return 'paragraphGroup';
  return 'part';
};

const normalizeSkimRouteNode = (
  node: RawSkimRouteNode,
  contentType: SkimContentType,
  index: number,
  parentId?: string
): SkimReadingRouteNode => {
  const isChild = Boolean(parentId);
  const expectedKind = isChild ? routeChildKindForContentType(contentType) : routeTopKindForContentType(contentType);
  const id = parentId ? `${parentId}-part-${index}` : `route-${contentType}-${index}`;
  const pageStart = normalizeRoutePageNumber(node.pageStart);
  const pageEnd = normalizeRoutePageNumber(node.pageEnd);
  const pageLabel =
    typeof node.pageLabel === 'string' && node.pageLabel.trim()
      ? node.pageLabel.trim()
      : pageStart && pageEnd
        ? `${pageStart}-${pageEnd} 页`
        : pageStart
          ? `第 ${pageStart} 页`
          : undefined;

  const children = Array.isArray(node.children)
    ? node.children
        .slice(0, 8)
        .map((child, childIndex) => normalizeSkimRouteNode(child, contentType, childIndex + 1, id))
    : undefined;

  return {
    id,
    kind: expectedKind,
    index,
    title: normalizeRouteTitle(node.title, isChild ? `Part ${index}` : `Module ${index}`),
    ...(pageStart ? { pageStart } : {}),
    ...(pageEnd ? { pageEnd } : {}),
    ...(pageLabel ? { pageLabel } : {}),
    ...(typeof node.summary === 'string' && node.summary.trim() ? { summary: node.summary.trim() } : {}),
    ...(children && children.length > 0 ? { children } : {}),
  };
};

const buildSkimRoutePrompt = (options: {
  contentType: SkimContentType;
  moduleCount?: number;
  skimPace?: 'module' | 'part';
  pageRangeLabel?: string;
  studyMapBriefing?: string;
  strictPageRanges?: boolean;
  pageIndexedText?: string;
  validationFeedback?: string;
}): string => {
  const {
    contentType,
    moduleCount,
    skimPace,
    pageRangeLabel,
    studyMapBriefing,
    strictPageRanges,
    pageIndexedText,
    validationFeedback,
  } = options;
  const lectureInstruction = `
你正在为一份 lecture / 讲义生成"可导航领读路线"。
- 顶层必须是 Module。
- 如果用户指定模块数(${moduleCount ?? '未指定'}),顶层 Module 数量必须严格贴近/等于该数量。
- 每个 Module 下可以有 1-4 个 Part,数量按内容自然决定,绝对不要假设每个 Module 都只有 2 个 Part。
- Part 页码范围必须落在对应 Module 页码范围内。
- 如果学习地图提供了模块标题和页码,优先沿用它,但要补出自然 Part。`;

  const paperInstruction = `
你正在为一篇论文 / paper 生成"可导航领读路线"。
- 顶层是论文真实 Section 或功能段,例如 Abstract、Introduction、Methods、Results、Discussion、Conclusion。
- 不要套 lecture 的 Module 模板。
- 长 section 可以拆成 1-4 个 Natural Part;短 section 可以没有 children。
- 标题要体现作者结构和论证功能。`;

  const articleInstruction = `
你正在为一篇文章 / 书章生成"可导航领读路线"。
- 顶层是作者推进思路的 Stage,不是论文 section,也不是 lecture module。
- 每个 Stage 可拆成若干 Paragraph Group / 小段落组。
- 标题要体现这一段在作者思路里做了什么,比如提出问题、举例推进、转折反驳、收束结论。`;

  return `
请只根据材料生成一份稳定的"领读目录路线" JSON。不要讲解内容,不要输出 Markdown。

共同要求:
- 这份路线用于右侧目录跳转,所以必须按材料出现顺序排列。
- 只记录正式主线结构,不要记录用户插队提问、追问、重讲请求。
- ${strictPageRanges
    ? '页码是创建唱片的硬数据，必须使用下面“逐页原文”标注的应用内页码，禁止估算、使用幻灯片印刷页码或跳过空白页。顶层 Module 必须无缺页、无重叠地连续覆盖整个指定范围；有 Part 时，Part 也必须无缺页、无重叠地连续覆盖所属 Module。'
    : '页码尽量准确;不确定时允许近似,但不要编造不存在的页码。'}
- title 用中文优先,必要时保留英文术语。
- summary ${strictPageRanges ? '写两句简短梗概：第一句说明本段讲什么，第二句说明它在整份 Lecture 中的作用。' : '只写一句短说明,不要长篇解释。'}
- 输出必须是 JSON object,形如:
{
  "title": "整份材料标题",
  "nodes": [
    {
      "kind": "module",
      "index": 1,
      "title": "Module 标题",
      "pageStart": 1,
      "pageEnd": 6,
      "pageLabel": "1-6 页",
      "summary": "这一段在主线中的作用",
      "children": [
        { "kind": "part", "index": 1, "title": "Part 标题", "pageStart": 1, "pageEnd": 3, "pageLabel": "1-3 页", "summary": "短说明" }
      ]
    }
  ]
}

当前材料类型: ${contentType}
当前页码范围: ${pageRangeLabel || '整份材料'}
${contentType === 'lecture' ? `当前领读节奏: ${skimPace === 'part' ? '一次一个 part' : '一次一个 module'}` : ''}
${contentType === 'lecture' ? lectureInstruction : contentType === 'paper' ? paperInstruction : articleInstruction}

${studyMapBriefing?.trim() ? `可参考的旧学习地图如下,但请输出结构化 JSON:\n${studyMapBriefing.trim().slice(0, 8000)}` : ''}
${validationFeedback?.trim() ? `\n【上一次路线校验失败，必须逐项修复】\n${validationFeedback.trim()}\n不要解释修复过程，只返回修正后的完整 JSON。` : ''}
${strictPageRanges && pageIndexedText?.trim() ? `\n【逐页原文与唯一页码依据】\n${pageIndexedText.trim()}` : ''}
`;
};

export const generateSkimReadingRoute = async (
  docContent: string,
  options: {
    contentType: SkimContentType;
    docType: DocType;
    moduleCount?: number;
    skimPace?: 'module' | 'part';
    pageRangeLabel?: string;
    studyMapBriefing?: string;
    strictPageRanges?: boolean;
    pageIndexedText?: string;
    validationFeedback?: string;
  }
): Promise<SkimReadingRoute | null> => {
  try {
    const contentPart = getContentPart(docContent);
    const prompt = buildSkimRoutePrompt(options);
    const childKind = routeChildKindForContentType(options.contentType);
    const topKind = routeTopKindForContentType(options.contentType);

    const response = await ai.models.generateContent({
      model: 'gemini-3.1-pro-preview',
      contents: [
        {
          role: 'user',
          parts: [
            contentPart,
            { text: prompt },
          ],
        },
      ],
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            nodes: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  kind: { type: Type.STRING, enum: [topKind] },
                  index: { type: Type.INTEGER },
                  title: { type: Type.STRING },
                  pageStart: { type: Type.INTEGER },
                  pageEnd: { type: Type.INTEGER },
                  pageLabel: { type: Type.STRING },
                  summary: { type: Type.STRING },
                  children: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        kind: { type: Type.STRING, enum: [childKind] },
                        index: { type: Type.INTEGER },
                        title: { type: Type.STRING },
                        pageStart: { type: Type.INTEGER },
                        pageEnd: { type: Type.INTEGER },
                        pageLabel: { type: Type.STRING },
                        summary: { type: Type.STRING },
                      },
                      required: options.strictPageRanges
                        ? ['kind', 'index', 'title', 'pageStart', 'pageEnd', 'pageLabel', 'summary']
                        : ['title'],
                    },
                  },
                },
                required: options.strictPageRanges
                  ? ['kind', 'index', 'title', 'pageStart', 'pageEnd', 'pageLabel', 'summary']
                  : ['title'],
              },
            },
          },
          required: ['nodes'],
        },
      },
    });

    const parsed = parseSkimRouteJson(response.text || '');
    if (!parsed?.nodes?.length) return null;

    const nodes = parsed.nodes
      .slice(0, 16)
      .map((node, index) => normalizeSkimRouteNode(node, options.contentType, index + 1));
    if (nodes.length === 0) return null;

    return {
      id: `skim-route-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      version: 1,
      kind: options.contentType,
      title: normalizeRouteTitle(parsed.title, options.contentType === 'lecture' ? '讲义领读路线' : options.contentType === 'paper' ? '论文领读路线' : '文章领读路线'),
      generatedAt: Date.now(),
      ...(options.pageRangeLabel ? { pageRangeLabel: options.pageRangeLabel } : {}),
      ...(typeof options.moduleCount === 'number' ? { moduleCount: options.moduleCount } : {}),
      ...(options.skimPace ? { skimPace: options.skimPace } : {}),
      nodes,
    };
  } catch (error) {
    console.warn('Generate skim reading route failed:', error);
    return null;
  }
};

/** 生成 Study Guide/Outline */
export const generateStudyGuide = async (
  docContent: string,
  options: { format: StudyGuideFormat }
): Promise<StudyGuideContent | null> => {
  try {
    const contentPart = getContentPart(docContent);
    
    const isDetailed = options.format === 'detailed';
    
    const prompt = isDetailed 
      ? `根据整个文档内容，生成一份**详细的学习指南 (Detailed Study Guide)**。要求**覆盖文档中出现过的所有概念**，不设数量上限，复习时不能有遗漏。

**1. 章节大纲 (Chapters)**
- 识别文档的所有主要章节和子章节
- 为每个章节标注大致页码范围（如"第1-5页"）
- 列出每个章节下的关键子主题

**2. 核心概念 (Core Concepts)**
- 提取**文档中出现过的全部**重要概念与术语，一个都不要漏
- 凡在正文、图表、例题中出现的专业概念、术语、公式符号，均需列入并给出清晰定义
- 为每个概念标注重要性等级（high/medium/low）
- 数量以文档实际覆盖为准，不设上限

**3. 学习路径 (Learning Path)**
- 设计一个循序渐进的学习顺序，覆盖全部章节与概念
- 每个步骤包含：标题、详细描述、建议阅读的页码
- 确保步骤之间有逻辑递进关系，且能对应到上述所有概念

**4. 知识点树 (Knowledge Tree)**
- 构建知识点的层级结构，**包含文档中所有相关知识点**
- 根节点：文档的核心主题
- 分支：主要知识领域
- 子分支：具体知识点和细节，尽量穷举文档中出现的内容

**5. 复习建议 (Review Suggestions)**
- 关键要点：列出所有需要掌握的复习重点（不限于5-8条，以覆盖全面为准）
- 练习建议：提供具体的复习方法和练习方向
- 常见错误：列出学习时容易混淆或出错的地方（可选）

**6. Markdown 格式内容**
- 生成一份完整的 Markdown 格式学习指南，**必须包含上述所有概念与知识点的详细讲解**
- 格式清晰，层次分明，每条概念都有对应说明
- 使用 Markdown 语法（标题、列表、表格、代码块等）
- 支持数学公式（使用 LaTeX 格式）

请用中文输出，内容要详尽、全面、不遗漏文档中任何概念。`
      : `根据整个文档内容，生成一份**简洁的学习大纲 (Outline)**。要求：

**1. 章节大纲 (Chapters)**
- 识别文档的主要章节结构
- 为每个章节标注页码范围
- 列出关键子主题

**2. 核心概念 (Core Concepts)**
- 提取最重要的概念和术语（8-12个）
- 为每个概念提供简洁定义
- 标注重要性等级（high/medium/low）

**3. Markdown 格式内容**
- 生成一份简洁的 Markdown 格式大纲
- 重点突出章节结构和核心概念
- 格式清晰，便于快速浏览

请用中文输出，内容要简洁、清晰、重点突出。`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.1-pro-preview',
      contents: [
        {
          role: 'user',
          parts: [
            contentPart,
            { text: prompt }
          ]
        }
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            chapters: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  title: { type: Type.STRING },
                  pageRange: { type: Type.STRING },
                  subsections: { type: Type.ARRAY, items: { type: Type.STRING } }
                },
                required: ["title"]
              }
            },
            coreConcepts: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  term: { type: Type.STRING },
                  definition: { type: Type.STRING },
                  importance: { type: Type.STRING, enum: ['high', 'medium', 'low'] }
                },
                required: ["term", "definition", "importance"]
              }
            },
            learningPath: isDetailed ? {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  step: { type: Type.INTEGER },
                  title: { type: Type.STRING },
                  description: { type: Type.STRING },
                  suggestedPages: { type: Type.ARRAY, items: { type: Type.INTEGER } }
                },
                required: ["step", "title", "description"]
              }
            } : { type: Type.ARRAY, items: { type: Type.OBJECT } },
            knowledgeTree: isDetailed ? {
              type: Type.OBJECT,
              properties: {
                root: { type: Type.STRING },
                branches: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      concept: { type: Type.STRING },
                      children: {
                        type: Type.ARRAY,
                        items: {
                          type: Type.OBJECT,
                          properties: {
                            concept: { type: Type.STRING },
                            details: { type: Type.ARRAY, items: { type: Type.STRING } }
                          },
                          required: ["concept"]
                        }
                      }
                    },
                    required: ["concept"]
                  }
                }
              },
              required: ["root", "branches"]
            } : { type: Type.OBJECT },
            reviewSuggestions: isDetailed ? {
              type: Type.OBJECT,
              properties: {
                keyPoints: { type: Type.ARRAY, items: { type: Type.STRING } },
                practiceTips: { type: Type.ARRAY, items: { type: Type.STRING } },
                commonMistakes: { type: Type.ARRAY, items: { type: Type.STRING } }
              },
              required: ["keyPoints", "practiceTips"]
            } : { type: Type.OBJECT },
            markdownContent: { type: Type.STRING }
          },
          required: ["chapters", "coreConcepts", "markdownContent"]
        }
      }
    });

    if (!response.text) return null;
    
    const parsed = JSON.parse(response.text) as StudyGuideContent;
    
    // 确保所有必需字段都存在，为缺失字段提供默认值
    const result: StudyGuideContent = {
      chapters: parsed.chapters || [],
      coreConcepts: parsed.coreConcepts || [],
      learningPath: isDetailed ? (parsed.learningPath || []) : [],
      knowledgeTree: isDetailed ? (parsed.knowledgeTree || { root: '', branches: [] }) : { root: '', branches: [] },
      reviewSuggestions: isDetailed ? (parsed.reviewSuggestions || { keyPoints: [], practiceTips: [] }) : { keyPoints: [], practiceTips: [] },
      markdownContent: parsed.markdownContent || ''
    };
    
    return result;
  } catch (error) {
    console.error("generateStudyGuide Error:", error);
    return null;
  }
};

// --- L-SAP 考前预测 ---
function normalizeKcPageList(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .map((page) => (typeof page === 'string' ? Number(page.trim()) : Number(page)))
        .filter((page) => Number.isFinite(page) && page >= 1)
        .map((page) => Math.round(page))
    )
  ).sort((a, b) => a - b);
}

function clampNumber(value: unknown, fallback: number, min: number, max: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export const generateLSAPContentMap = async (
  docContent: string,
  options?: GenerateLSAPContentMapOptions
): Promise<LSAPContentMap | null> => {
  try {
    const chunkMode = options?.mode === 'workspaceChunk';
    const contentPart = chunkMode ? getContentPartForWorkspaceChunk(docContent) : getContentPart(docContent);
    const prompt = chunkMode
      ? `以下 DOCUMENT 为**单份**讲义/材料的全文（或其中一段）。请仅依据本段内容提取「知识组件」(KC)，用于考前掌握度评估；不要引入材料外知识。

对每个知识组件输出：
- id: 唯一标识，如 kc-0, kc-1（本段内唯一即可）
- concept: 材料中的原始概念名称（优先保留英文术语）
- definition: 与材料语言一致的简短定义（一句）
- conceptZh: concept 的准确中文名称
- definitionZh: definition 的准确中文解释；专业术语首次出现时保留英文括注
- reviewFocus: 复习重点（一句话，严格基于本段）
- sourcePages: 直接讲到这个 KC 的证据页数组，必须是 DOCUMENT 里能核对到的页码，如 [12,13]；不要用端点页码假装覆盖整段
- anchorPages: 1-3 个最核心的证据页，优先选择定义、关键图表、关键实验、关键结论所在页
- relatedPages: 只作背景、承接、对照的相关页；不要把它们混进 anchorPages
- examWeight: 考试权重 1-5（5 最重要）
- bloomTargetLevel: 布鲁姆目标层级 1-3（1=记忆/理解，2=应用，3=分析/综合）

分块原则：
- KC 是后台「关键点」，不是给用户直接看的整章复习块；可以多一些，但每个必须具体、可验证。
- 对 lecture/slides：单个 KC 通常覆盖 1-6 个相邻页；如果一个主题要跨很多页，请按“定义/机制/实验/反驳/例子/总结”等局部阶段拆成多个 KC。
- 对 paper/article：单个 KC 应对应一个具体论证、方法、结果或结论片段，不要把整篇 Introduction/Discussion 合成一个 KC。
- 不要输出类似 [24,25,...,59] 或 [24,59] 这种横跨大半份材料的 KC；这种情况必须拆小。
- 如果某个概念在第 24 页提出、第 42 页再次被讨论，请输出 sourcePages: [24,42]，anchorPages 选其中最关键的 1-3 页；不要写成 [24,25,...,42] 或 [24,42] 来表示 24-42 连续范围。
- 页码来自 DOCUMENT 中的页码标记/页面结构；不确定时宁可少填可核对页，不要猜。

请**充分覆盖本段/本讲的核心可考点**，数量随内容复杂度增加；软上限约 **40 个 KC**（内容极少时可少于 5）。输出 JSON：{ "id": "content-map-xxx", "sourceKey": "doc", "kcs": [ ... ], "createdAt": 0 }
createdAt 请填当前时间戳（毫秒）。`
      : `根据以下文档内容，提取「知识组件」(KC)，用于考前掌握度评估。要求严格依据文档，不编造。

对每个知识组件输出：
- id: 唯一标识，如 kc-0, kc-1
- concept: 材料中的原始概念名称（优先保留英文术语）
- definition: 与材料语言一致的简短定义（一句）
- conceptZh: concept 的准确中文名称
- definitionZh: definition 的准确中文解释；专业术语首次出现时保留英文括注
- reviewFocus: 复习重点（一句话，便于复习时扫一眼知道要学什么，严格基于文档）
- sourcePages: 直接讲到这个 KC 的证据页数组，必须是 DOCUMENT 里能核对到的页码，如 [12,13]；不要用端点页码假装覆盖整段
- anchorPages: 1-3 个最核心的证据页，优先选择定义、关键图表、关键实验、关键结论所在页
- relatedPages: 只作背景、承接、对照的相关页；不要把它们混进 anchorPages
- examWeight: 考试权重 1-5（5 最重要）
- bloomTargetLevel: 布鲁姆目标层级 1-3（1=记忆/理解，2=应用，3=分析/综合）

分块原则：
- KC 是后台「关键点」，不是给用户直接看的整章复习块；可以多一些，但每个必须具体、可验证。
- 对 lecture/slides：单个 KC 通常覆盖 1-6 个相邻页；如果一个主题要跨很多页，请按“定义/机制/实验/反驳/例子/总结”等局部阶段拆成多个 KC。
- 对 paper/article：单个 KC 应对应一个具体论证、方法、结果或结论片段，不要把整篇 Introduction/Discussion 合成一个 KC。
- 不要输出类似 [24,25,...,59] 或 [24,59] 这种横跨大半份材料的 KC；这种情况必须拆小。
- 如果某个概念在第 24 页提出、第 42 页再次被讨论，请输出 sourcePages: [24,42]，anchorPages 选其中最关键的 1-3 页；不要写成 [24,25,...,42] 或 [24,42] 来表示 24-42 连续范围。
- 页码来自 DOCUMENT 中的页码标记/页面结构；不确定时宁可少填可核对页，不要猜。

请覆盖文档中的核心考点，数量 5-15 个。输出 JSON：{ "id": "content-map-xxx", "sourceKey": "doc", "kcs": [ ... ], "createdAt": 0 }
createdAt 请填当前时间戳（毫秒）。`;
    const response = await ai.models.generateContent({
      model: 'gemini-3.1-pro-preview',
      contents: [{ role: 'user', parts: [contentPart, { text: prompt }] }],
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            id: { type: Type.STRING },
            sourceKey: { type: Type.STRING },
            kcs: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  concept: { type: Type.STRING },
                  definition: { type: Type.STRING },
                  conceptZh: { type: Type.STRING },
                  definitionZh: { type: Type.STRING },
                  reviewFocus: { type: Type.STRING },
                  sourcePages: { type: Type.ARRAY, items: { type: Type.INTEGER } },
                  anchorPages: { type: Type.ARRAY, items: { type: Type.INTEGER } },
                  relatedPages: { type: Type.ARRAY, items: { type: Type.INTEGER } },
                  sourceExcerpt: { type: Type.STRING },
                  examWeight: { type: Type.NUMBER },
                  bloomTargetLevel: { type: Type.INTEGER }
                },
                required: ['id', 'concept', 'definition', 'conceptZh', 'definitionZh', 'sourcePages', 'examWeight', 'bloomTargetLevel']
              }
            },
            createdAt: { type: Type.NUMBER }
          },
          required: ['id', 'sourceKey', 'kcs', 'createdAt']
        }
      }
    });
    if (!response.text) return null;
    const parsed = JSON.parse(response.text) as LSAPContentMap;
    if (!parsed.kcs?.length) return null;
    parsed.createdAt = parsed.createdAt || Date.now();
    parsed.kcs = parsed.kcs.map((kc, index) => {
      const sourcePages = normalizeKcPageList(kc.sourcePages);
      const anchorPages = normalizeKcPageList(kc.anchorPages);
      const relatedPages = normalizeKcPageList(kc.relatedPages);
      return {
        ...kc,
        id: (kc.id || `kc-${index}`).trim(),
        concept: (kc.concept || `知识点 ${index + 1}`).trim(),
        definition: (kc.definition || '').trim(),
        conceptZh: (kc.conceptZh || '').trim() || undefined,
        definitionZh: (kc.definitionZh || '').trim() || undefined,
        reviewFocus: (kc.reviewFocus || '').trim(),
        sourcePages,
        anchorPages: anchorPages.length > 0 ? anchorPages : sourcePages.slice(0, 3),
        relatedPages,
        examWeight: clampNumber(kc.examWeight, 3, 1, 5),
        bloomTargetLevel: Math.round(clampNumber(kc.bloomTargetLevel, 1, 1, 3)),
      };
    });
    return parsed;
  } catch (e) {
    console.error('generateLSAPContentMap Error:', e);
    return null;
  }
};

/**
 * 为已有考点图谱的每个 KC 生成 3～8 条逻辑原子（最小命题单元），严格依据 DOCUMENT，不编造页码。
 * 返回新的 LSAPContentMap 深拷贝；失败返回 null（调用方勿清空已有 kcs）。
 * @param options.maxDocChars 默认 40000；备考按单份材料调用时可传 120000 等与 P1 一致，避免单讲仍被截断。
 */
export async function generateLogicAtomsForContentMap(
  mergedDocContent: string,
  contentMap: LSAPContentMap,
  options?: GenerateLogicAtomsForContentMapOptions
): Promise<LSAPContentMap | null> {
  try {
    const copy = JSON.parse(JSON.stringify(contentMap)) as LSAPContentMap;
    if (!copy.kcs?.length) return copy;

    const maxChars = options?.maxDocChars ?? 40000;
    const contentPart = getContentPartWithMaxChars(mergedDocContent, maxChars);
    const docLabel = options?.perMaterial ? '本份关联材料全文' : '本场合并讲义';

    const preserveExistingAtoms = options?.preserveExistingAtoms === true;
    const kcSummaries = copy.kcs
      .map(
        (k) => {
          const existingAtoms = preserveExistingAtoms && (k.atoms?.length ?? 0) > 0
            ? `; 既有原子（必须原顺序保留）：${(k.atoms ?? []).map((atom, index) => `[${index}] ${atom.label}: ${atom.description}`).join(' | ')}`
            : '';
          return `- id=${k.id}; concept=${k.concept}; definition=${(k.definition || '').slice(0, 200)}; 可用证据页=${normalizeKcPageList([...(k.anchorPages ?? []), ...(k.sourcePages ?? []), ...(k.relatedPages ?? [])]).join(',') || '未知'}; examWeight=${k.examWeight ?? 3}; bloomTargetLevel=${k.bloomTargetLevel ?? 1}${existingAtoms}`;
        }
      )
      .join('\n');

    const preservationRule = preserveExistingAtoms
      ? '8. 若 KC 列出了“既有原子”，必须保持其数量、顺序、英文 label 和英文 description 不变；你只负责补全中文与精确页码。这样旧覆盖记录仍能对应原来的原子。'
      : '';

    const prompt = `你是课程分析助手。下面「DOCUMENT」为${docLabel}（唯一事实来源）。上面列出了已提取的考点（KC）列表。

任务：为**每一个** KC 输出若干「逻辑原子」——能独立判断真假的**最小命题/推理单元**，用于衡量讲义中的命题密度与后续覆盖统计。

硬性规则：
1. 严格依据 DOCUMENT，禁止引入讲义外知识；不要编造页码。
2. 每个 KC 输出 **3～8** 条原子：examWeight 越高、bloomTargetLevel 越高，倾向于取**更多**条（仍不超过 8）。
3. 每条原子同时输出：英文 label（≤40 字）、英文 description（1～2 句）、准确的中文 labelZh、中文 descriptionZh。中文不是删减摘要，必须保留英文中的数字、限定条件和因果关系；专业术语首次出现时保留英文括注。
4. 必须覆盖列表中的**全部** KC id；某 KC 在文档中信息极少时可少至 3 条，但不要留空数组。
5. 每条原子输出 sourcePages，只列出 DOCUMENT 中直接支持这条命题的 1～3 个原 PDF 页码，并且必须来自对应 KC 的“可用证据页”；不能确定时输出空数组，禁止猜页码。
6. 每个 perKc 项额外输出 conceptZh 与 definitionZh，作为该 KC 英文名称和定义的准确中文版本。
7. 输出 JSON 仅含 perKc 数组：每项含 kcId、conceptZh、definitionZh 与 atoms（label、description、labelZh、descriptionZh、sourcePages，不要含 id 字段）。
${preservationRule}

KC 列表：
${kcSummaries}`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.1-pro-preview',
      contents: [{ role: 'user', parts: [contentPart, { text: prompt }] }],
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            perKc: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  kcId: { type: Type.STRING },
                  conceptZh: { type: Type.STRING },
                  definitionZh: { type: Type.STRING },
                  atoms: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        label: { type: Type.STRING },
                        description: { type: Type.STRING },
                        labelZh: { type: Type.STRING },
                        descriptionZh: { type: Type.STRING },
                        sourcePages: { type: Type.ARRAY, items: { type: Type.INTEGER } },
                      },
                      required: ['label', 'description', 'labelZh', 'descriptionZh', 'sourcePages'],
                    },
                  },
                },
                required: ['kcId', 'conceptZh', 'definitionZh', 'atoms'],
              },
            },
          },
          required: ['perKc'],
        },
      },
    });

    if (!response.text) return null;
    type GeneratedAtomRow = {
      label: string;
      description: string;
      labelZh?: string;
      descriptionZh?: string;
      sourcePages?: number[];
    };
    type GeneratedKcRow = {
      kcId: string;
      conceptZh?: string;
      definitionZh?: string;
      atoms: GeneratedAtomRow[];
    };
    const parsed = JSON.parse(response.text) as { perKc?: GeneratedKcRow[] };
    const rows = parsed.perKc;
    if (!Array.isArray(rows)) return null;

    const byKcId = new Map<string, GeneratedKcRow>();
    for (const row of rows) {
      if (!row?.kcId) continue;
      if (!byKcId.has(row.kcId)) byKcId.set(row.kcId, row);
    }

    for (const kc of copy.kcs) {
      const generated = byKcId.get(kc.id);
      const rawAtoms = generated?.atoms ?? [];
      const existingAtoms = kc.atoms ?? [];
      const atomRows = preserveExistingAtoms && existingAtoms.length > 0
        ? existingAtoms.map((existing, index) => ({ existing, generated: rawAtoms[index] }))
        : rawAtoms.map((generated) => ({ existing: undefined, generated }));
      const allowedPages = new Set(normalizeKcPageList([
        ...(kc.anchorPages ?? []),
        ...(kc.sourcePages ?? []),
        ...(kc.relatedPages ?? []),
      ]));
      const atoms: LogicAtom[] = atomRows.map(({ existing, generated: a }, index) => ({
        id: existing?.id ?? `atom-${kc.id}-${index}`,
        kcId: kc.id,
        label: (existing?.label ?? (a?.label || '').trim()) || `原子 ${index + 1}`,
        description: (existing?.description ?? (a?.description || '').trim()) || '—',
        labelZh: (a?.labelZh || existing?.labelZh || '').trim() || undefined,
        descriptionZh: (a?.descriptionZh || existing?.descriptionZh || '').trim() || undefined,
        sourcePages: normalizeKcPageList(a?.sourcePages ?? existing?.sourcePages).filter((page) => allowedPages.has(page)),
      }));
      kc.conceptZh = (generated?.conceptZh || kc.conceptZh || '').trim() || undefined;
      kc.definitionZh = (generated?.definitionZh || kc.definitionZh || '').trim() || undefined;
      kc.atoms = atoms;
    }

    return copy;
  } catch (e) {
    console.error('generateLogicAtomsForContentMap Error:', e);
    return null;
  }
}

/**
 * 一次 API 同时返回「本句已覆盖的原子」与「仍可能缺失的原子」。
 * 备考台对话应只调用本函数；若分别调用 markAtomsCoveredByUtterance 与 detectReasoningGaps 会各触发一次请求。
 */
/**
 * 为本场讲义语境下的单个术语生成短释义；无依据时须明说「材料未直接定义」等（见 prompt）。
 * 失败返回 null。
 */
export async function defineTermInLectureContext(
  mergedDocContent: string,
  kc: LSAPKnowledgeComponent,
  term: string
): Promise<string | null> {
  const t = term.trim().slice(0, 80);
  if (!t) return null;
  try {
    const contentPart = getContentPart(mergedDocContent.slice(0, 60000));
    const kcBlock = `考点 id：${kc.id}
考点名称：${kc.concept}
考点定义：${(kc.definition || '').slice(0, 2000)}
${kc.reviewFocus ? `复习重点：${kc.reviewFocus.slice(0, 500)}` : ''}`;
    const prompt = `你是课程助教。上方「DOCUMENT」为本场合并讲义（唯一事实来源）。另有当前考点 KC 上下文。

任务：请仅根据 DOCUMENT，用中文为术语「${t}」写 1～3 句讲义内释义（面向复习，紧扣当前考点语境；非百科泛谈）。

硬性规则：
1. 若 DOCUMENT 中未明确出现该术语、或未给出可复述的解释，须先作极短说明，并明确写出：材料中未单独定义，以上为结合当前考点语境的概括。
2. 禁止编造页码；禁止引入讲义外知识。
3. 不要输出 Markdown 粗体、标题或列表符号；纯段落文本即可。

当前 KC：
${kcBlock}

请直接输出释义：`;

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: [{ role: 'user', parts: [contentPart, { text: prompt }] }],
    });
    const text = response.text?.trim();
    return text || null;
  } catch (e) {
    console.warn('defineTermInLectureContext', e);
    return null;
  }
}

export async function analyzeKcUtteranceForAtoms(
  mergedDocContent: string,
  kc: LSAPKnowledgeComponent,
  userText: string
): Promise<{ coveredAtomIds: string[]; gapAtomIds: string[] }> {
  const atoms = kc.atoms ?? [];
  if (!atoms.length) return { coveredAtomIds: [], gapAtomIds: [] };
  const allowed = new Set(atoms.map((a) => a.id));
  try {
    const contentPart = getContentPart(mergedDocContent);
    const atomList = atoms
      .map((a) => `- id=${a.id}; label=${a.label}; desc=${(a.description || '').slice(0, 200)}`)
      .join('\n');
    const prompt = `你是严谨评阅助手。DOCUMENT 为本场合并讲义；下列 id 为当前考点下的「逻辑原子」。

任务：阅读学生的**本轮发言**（可能很短）。判断：
1) coveredAtomIds：学生**明确、可核对地**体现了哪些原子（id 必须来自列表；无把握则不要列入；宁可少报）。
2) gapAtomIds：结合讲义，哪些原子学生**尚未覆盖**或**表述可能不足**（同样必须来自列表；可空数组）。

学生发言：
${userText.slice(0, 8000)}`;

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: [{ role: 'user', parts: [contentPart, { text: prompt + '\n\n原子列表：\n' + atomList }] }],
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            coveredAtomIds: { type: Type.ARRAY, items: { type: Type.STRING } },
            gapAtomIds: { type: Type.ARRAY, items: { type: Type.STRING } },
          },
          required: ['coveredAtomIds', 'gapAtomIds'],
        },
      },
    });
    if (!response.text) return { coveredAtomIds: [], gapAtomIds: [] };
    const parsed = JSON.parse(response.text) as { coveredAtomIds?: string[]; gapAtomIds?: string[] };
    const filter = (ids: unknown): string[] =>
      (Array.isArray(ids) ? ids : []).filter((x): x is string => typeof x === 'string' && allowed.has(x));
    return {
      coveredAtomIds: filter(parsed.coveredAtomIds),
      gapAtomIds: filter(parsed.gapAtomIds),
    };
  } catch (e) {
    console.warn('analyzeKcUtteranceForAtoms', e);
    return { coveredAtomIds: [], gapAtomIds: [] };
  }
}

/**
 * 阶段 3：多选 KC（>=2）模式下,一次性评估学生本轮发言对所有选中 KC 的 atom 覆盖。
 *
 * 与 analyzeKcUtteranceForAtoms 平级——单选走原函数（不动），多选走本函数。
 * 单次 Gemini 调用，prompt 列出所有选中 KC 的全部 atom 列表（含 kcId 提示），
 * 客户端用 union 白名单二次过滤 AI 返回，防幻觉。
 *
 * 返回结构与 analyzeKcUtteranceForAtoms 一致：`{ coveredAtomIds, gapAtomIds }`
 * （atomId 横跨多 KC，调用方需用 lookupKcIdByAtomId 反查归属再分发更新）。
 */
export async function analyzeMultiKcUtteranceForAtoms(
  mergedDocContent: string,
  kcs: LSAPKnowledgeComponent[],
  userText: string
): Promise<{ coveredAtomIds: string[]; gapAtomIds: string[] }> {
  // 收集所有选中 KC 的 atom，构造 union 白名单
  const allAtoms: { id: string; kcId: string; label: string; description: string }[] = [];
  for (const kc of kcs) {
    for (const atom of kc.atoms ?? []) {
      allAtoms.push({
        id: atom.id,
        kcId: kc.id,
        label: atom.label,
        description: atom.description ?? '',
      });
    }
  }
  if (!allAtoms.length) return { coveredAtomIds: [], gapAtomIds: [] };
  const allowed = new Set(allAtoms.map((a) => a.id));

  try {
    const contentPart = getContentPart(mergedDocContent);
    const kcSummaryLines = kcs
      .map((kc, i) => `- KC${i + 1} (id=${kc.id})：${kc.concept}`)
      .join('\n');
    const atomList = allAtoms
      .map(
        (a) => `- id=${a.id}; kcId=${a.kcId}; label=${a.label}; desc=${(a.description || '').slice(0, 200)}`
      )
      .join('\n');
    const prompt = `你是严谨评阅助手。DOCUMENT 为本场合并讲义；本轮学生在多个考点（KC）的联合上下文中发言。

任务：阅读学生的**本轮发言**（可能很短）。判断：
1) coveredAtomIds：学生**明确、可核对地**体现了哪些原子（id 必须来自下方列表；无把握则不要列入；宁可少报）。可来自任意 KC，可跨 KC。
2) gapAtomIds：结合讲义，哪些原子学生**尚未覆盖**或**表述可能不足**（同样必须来自下方列表；可空数组）。

约束：
- 只能输出 id 字符串；不要输出 kcId 字段（atomId 与 KC 的归属由前端用结构化反查确定，不要依赖你的描述）。
- 若学生发言完全游离（既不靠近任意 KC，也无相关原子），返回两个空数组。

本场锚定考点列表：
${kcSummaryLines}

学生发言：
${userText.slice(0, 8000)}`;

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: [
        { role: 'user', parts: [contentPart, { text: prompt + '\n\n所有候选原子列表：\n' + atomList }] },
      ],
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            coveredAtomIds: { type: Type.ARRAY, items: { type: Type.STRING } },
            gapAtomIds: { type: Type.ARRAY, items: { type: Type.STRING } },
          },
          required: ['coveredAtomIds', 'gapAtomIds'],
        },
      },
    });
    if (!response.text) return { coveredAtomIds: [], gapAtomIds: [] };
    const parsed = JSON.parse(response.text) as {
      coveredAtomIds?: string[];
      gapAtomIds?: string[];
    };
    const filter = (ids: unknown): string[] =>
      (Array.isArray(ids) ? ids : []).filter(
        (x): x is string => typeof x === 'string' && allowed.has(x)
      );
    return {
      coveredAtomIds: filter(parsed.coveredAtomIds),
      gapAtomIds: filter(parsed.gapAtomIds),
    };
  } catch (e) {
    console.warn('analyzeMultiKcUtteranceForAtoms', e);
    return { coveredAtomIds: [], gapAtomIds: [] };
  }
}

/** 返回本句覆盖到的 LogicAtom.id（仅 id 来自 kc.atoms）。单独调用会触发一次 API；与 detectReasoningGaps 各调一次则共两次。 */
export async function markAtomsCoveredByUtterance(
  mergedDocContent: string,
  kc: LSAPKnowledgeComponent,
  userText: string
): Promise<string[]> {
  const r = await analyzeKcUtteranceForAtoms(mergedDocContent, kc, userText);
  return r.coveredAtomIds;
}

/** 返回仍缺失或表述可能不足的 atom id。单独调用会触发一次 API。 */
export async function detectReasoningGaps(
  mergedDocContent: string,
  kc: LSAPKnowledgeComponent,
  userText: string
): Promise<string[]> {
  const r = await analyzeKcUtteranceForAtoms(mergedDocContent, kc, userText);
  return r.gapAtomIds;
}

export interface LSAPProbeResult {
  question: string;
  sourceRef: string;
}

export type LSAPProbeDocScope = {
  /** 展示用材料名（与左侧材料一致） */
  materialDisplayName?: string;
  /** true：下列 DOCUMENT 仅为一份讲义，题目与 sourceRef 必须约束在该文档内 */
  docIsSingleMaterial?: boolean;
};

export const generateLSAPProbeQuestion = async (
  docContent: string,
  contentMap: LSAPContentMap,
  kcId: string,
  bloomLevel: number,
  _conversationSoFar?: { role: string; text: string }[],
  options?: LSAPProbeDocScope
): Promise<LSAPProbeResult | null> => {
  try {
    const kc = contentMap.kcs.find((k) => k.id === kcId);
    if (!kc) return null;
    const contentPart = getContentPart(docContent);
    const matName = options?.materialDisplayName?.trim() || '本考点所属讲义';
    const singleScope =
      options?.docIsSingleMaterial === true
        ? `
【材料边界（必须遵守）】
下列 DOCUMENT **仅为**考点所属的这一份讲义（材料名：「${matName}」）。
- 题目与答案依据必须**全部**来自该 DOCUMENT；**禁止**引用文档中未出现的其它讲义文件名或其它材料内容。
- sourceRef 必须写清：**材料名 + 该材料内的页码 + 极短原文摘录**（摘录须出自该 DOCUMENT）。
- 考点备注页码 ${(kc.sourcePages || []).join(', ')} 指**该材料内**的页码标注，请与此一致。
`
        : '';
    const prompt = `你正在根据讲义评估学生对某一考点的掌握程度。严格依据以下文档内容，不要自由发挥。
${singleScope}
当前考点：${kc.concept}
定义：${kc.definition}
布鲁姆层级：${bloomLevel}（1=记忆/理解，2=应用，3=分析/综合）
讲义页码（考点元数据，以该材料内标注为准）：${(kc.sourcePages || []).join(', ')}

请生成一道开放式问答题（不要选择题），让学生用自己的话解释或应用该考点。题目必须与讲义内容直接相关，且能根据讲义判断对错。
输出 JSON：{ "question": "题目内容", "sourceRef": "对应讲义页码或原文摘要，用于证据链" }`;
    const response = await ai.models.generateContent({
      model: 'gemini-3.1-pro-preview',
      contents: [{ role: 'user', parts: [contentPart, { text: prompt }] }],
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            question: { type: Type.STRING },
            sourceRef: { type: Type.STRING }
          },
          required: ['question', 'sourceRef']
        }
      }
    });
    if (!response.text) return null;
    return JSON.parse(response.text) as LSAPProbeResult;
  } catch (e) {
    console.error('generateLSAPProbeQuestion Error:', e);
    return null;
  }
};

export type LSAPNextAction = 'level_up' | 'same_level_retry' | 'hint' | 'next_kc';

export interface LSAPEvalResult {
  correct: boolean | 'partial';
  levelReached: number;
  evidence: string;
  conflictWithPage?: number;
  nextAction: LSAPNextAction;
}

export const evaluateLSAPAnswer = async (
  docContent: string,
  kcId: string,
  question: string,
  userAnswer: string,
  sourceRef: string,
  options?: LSAPProbeDocScope
): Promise<LSAPEvalResult | null> => {
  try {
    const contentPart = getContentPart(docContent);
    const matName = options?.materialDisplayName?.trim() || '';
    const singleNote =
      options?.docIsSingleMaterial === true
        ? `\n下列 DOCUMENT 与出题时完全一致，**仅为**材料「${matName || '该考点所属讲义'}」的全文。请**仅据此文档**阅卷；不要引用其它讲义或文档外知识。sourceRef 中的页码与依据须与该材料内文一致。\n`
        : '';
    const prompt = `你是阅卷人。严格依据以下文档（讲义）内容判断学生回答是否正确。不要引入文档外的标准。
${singleNote}
题目：${question}
学生回答：${userAnswer}
参考（讲义出处）：${sourceRef}

判断要求：
1. correct: 完全正确 true，部分正确 "partial"，错误 false
2. levelReached: 学生实际达到的布鲁姆层级 1-3
3. evidence: 一句话说明与讲义哪部分一致或冲突（用于证据链，如「与讲义第3页定义一致」）
4. conflictWithPage: 若与讲义冲突，写出页码（数字），否则不填
5. nextAction: 若正确且未到该考点目标层级则 "level_up"，错误则 "same_level_retry"，需提示则 "hint"，可测下一考点则 "next_kc"

输出 JSON，键名与上述一致。`;
    const response = await ai.models.generateContent({
      model: 'gemini-3.1-pro-preview',
      contents: [{ role: 'user', parts: [contentPart, { text: prompt }] }],
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            correct: { type: Type.STRING },
            levelReached: { type: Type.INTEGER },
            evidence: { type: Type.STRING },
            conflictWithPage: { type: Type.INTEGER },
            nextAction: { type: Type.STRING }
          },
          required: ['correct', 'levelReached', 'evidence', 'nextAction']
        }
      }
    });
    if (!response.text) return null;
    const raw = JSON.parse(response.text) as { correct: string; levelReached: number; evidence: string; conflictWithPage?: number; nextAction: string };
    const correctVal = raw.correct === 'true' || raw.correct === true ? true : raw.correct === 'partial' ? 'partial' : false;
    return {
      correct: correctVal,
      levelReached: raw.levelReached ?? 1,
      evidence: raw.evidence ?? '',
      conflictWithPage: raw.conflictWithPage,
      nextAction: (raw.nextAction as LSAPNextAction) || 'same_level_retry'
    };
  } catch (e) {
    console.error('evaluateLSAPAnswer Error:', e);
    return null;
  }
};

/** 针对性教学：根据考点与评判证据，基于讲义生成讲解，并明确标出对应页码 */
export const generateLSAPTargetedTeaching = async (
  docContent: string,
  kc: LSAPKnowledgeComponent,
  evidence: string,
  options?: LSAPProbeDocScope
): Promise<string> => {
  try {
    const contentPart = getContentPart(docContent);
    const pages = (kc.sourcePages && kc.sourcePages.length > 0) ? kc.sourcePages.join('、') : '讲义中';
    const matName = options?.materialDisplayName?.trim() || '本讲义';
    const singleScope =
      options?.docIsSingleMaterial === true
        ? `
【材料边界（必须遵守）】
下列 DOCUMENT **仅为**材料「${matName}」的全文。讲解、举例与「请重点看第 X 页」等页码引用必须**全部**出自该 DOCUMENT；**禁止**引用未在本 DOCUMENT 中出现的其它文件名或其它讲义内容。页码均指**该材料内**的页码。
`
        : '';
    const prompt = `你是一位针对性的辅导老师。学生刚在考点「${kc.concept}」上回答有误或不够完整。评判反馈是：${evidence}
${singleScope}
请严格依据以下文档（讲义）内容，针对该考点做一段简短讲解（2～4 段），帮助学生补上缺口。要求：
1. 只讲与「评判反馈」相关的部分，不要泛泛而谈。
2. 必须明确写出「请重点看讲义第 X 页」或「见讲义第 X–Y 页」，与考点对应的页码为：${pages}（以该材料内标注为准）。
3. 用中文，语气友好，可直接指出「你漏掉了…」「这里需要区分…」。
4. 不要编造，所有内容必须能在文档中找到依据。

直接输出讲解正文（Markdown 可选），不要输出 JSON。`;
    const response = await ai.models.generateContent({
      model: 'gemini-3.1-pro-preview',
      contents: [{ role: 'user', parts: [contentPart, { text: prompt }] }]
    });
    return response.text?.trim() || `请查看讲义第 ${pages} 页复习「${kc.concept}」。`;
  } catch (e) {
    console.error('generateLSAPTargetedTeaching Error:', e);
    const pages = (kc.sourcePages && kc.sourcePages.length > 0) ? kc.sourcePages.join('、') : '—';
    return `请查看讲义第 ${pages} 页复习「${kc.concept}」。\n\n（针对性讲解生成失败，请根据证据反馈自行对照讲义学习。）`;
  }
};

/** 针对性教学内的追问：基于讲义与当前考点回答，直到学生理解 */
export const answerLSAPTeachingQuestion = async (
  docContent: string,
  kc: LSAPKnowledgeComponent,
  teachingContent: string,
  conversationHistory: { role: 'user' | 'model'; text: string }[],
  userQuestion: string,
  options?: LSAPProbeDocScope
): Promise<string> => {
  try {
    const contentPart = getContentPart(docContent);
    const historyText = conversationHistory.length
      ? conversationHistory.map((m) => `${m.role === 'user' ? '学生' : '老师'}: ${m.text}`).join('\n')
      : '';
    const matName = options?.materialDisplayName?.trim() || '本讲义';
    const singleScope =
      options?.docIsSingleMaterial === true
        ? `【材料边界】下列 DOCUMENT 仅为「${matName}」的全文；回答与页码引用必须出自该 DOCUMENT，禁止引用其它讲义或未出现的内容。\n\n`
        : '';
    const prompt = `${singleScope}你是针对「${kc.concept}」考点的辅导老师。学生正在看上面的针对性讲解，现在追问。

${historyText ? `此前对话：\n${historyText}\n\n` : ''}学生问：${userQuestion}

要求：严格依据以下文档（讲义）回答，不编造。可指出「见讲义第 X 页」（页码为该材料内页码）。用中文，简短清晰。若学生已理解可肯定并小结。`;
    const parts: { role: 'user' | 'model'; parts: { text: string }[] }[] = [
      { role: 'user', parts: [contentPart, { text: `针对性讲解摘要：\n${teachingContent.slice(0, 2000)}\n\n---\n\n${prompt}` }] }
    ];
    const response = await ai.models.generateContent({
      model: 'gemini-3.1-pro-preview',
      contents: parts
    });
    return response.text?.trim() || '请对照讲义再想想，或点击「查看讲义」看具体页码。';
  } catch (e) {
    console.error('answerLSAPTeachingQuestion Error:', e);
    return localizeText('回答生成失败，请重试或直接查看讲义对应页码。', 'The answer could not be generated. Try again or open the cited lecture pages.');
  }
};

// --- NEW: SIDE QUEST AGENT ---
export const runSideQuestAgent = async (
    history: ChatMessage[],
    newMessage: string,
    anchorText: string
): Promise<string> => {
    try {
        const SIDE_QUEST_SYSTEM_PROMPT = `
        # 🌌 Role: The Deep Dive Archivist (Side Quest Guide)
        
        The user has paused their main learning journey to trigger a "Side Quest" on the specific term: **"${anchorText}"**.
        
        **Your Goal:** Provide an Encyclopedic, Depth-First explanation of this specific concept.
        
        **Rules:**
        1. **Ignore Context Constraints**: You are NO LONGER bound by the document's scope. Use your full external knowledge base.
        2. **Structure**:
           - **Definition**: What is it? (Academic & Intuitive).
           - **Origin/History**: Where did it come from?
           - **Why it matters**: What is its core value?
           - **Fun Fact/Counter-Intuitive**: Surprise the user.
        3. **Tone**: Mysterious, profound, yet highly academic (like opening a secret tome).
        4. **Language**: Chinese (Simplified).
        
        If the user asks follow-up questions, continue to answer in this "Deep Dive" persona.
        `;

        const contents = [];
        
        // Add Chat History
        history.forEach(msg => {
            contents.push({ role: msg.role, parts: [{ text: msg.text }] });
        });

        // Add current message
        contents.push({ role: 'user', parts: [{ text: newMessage }] });

        const response = await ai.models.generateContent({
            model: 'gemini-3.1-pro-preview',
            contents: contents,
            config: { systemInstruction: SIDE_QUEST_SYSTEM_PROMPT }
        });

        return response.text || "Archives inaccessible...";
    } catch (error) {
        console.error("Side Quest Error:", error);
        return "支线任务连接失败...";
    }
};

// --- 海龟汤 ---
export const generateTurtleSoupPuzzle = async (): Promise<TurtleSoupPuzzle> => {
    const prompt = `你是一个「海龟汤」出题人。请生成一道海龟汤谜题。
输出仅一个 JSON 对象，不要 markdown 包裹：
{ "situation": "汤面", "hiddenStory": "汤底" }

要求：
- situation（汤面）：一段简短的、有悬念的情境描述（2～4 句话），让人想用是非题推理真相。不要直接给出答案。
- hiddenStory（汤底）：完整的真相/故事，解释汤面中令人疑惑的部分。可以有一点反转或冷幽默。
请直接输出 JSON。`;

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            config: {
                responseMimeType: 'application/json',
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        situation: { type: Type.STRING },
                        hiddenStory: { type: Type.STRING }
                    },
                    required: ['situation', 'hiddenStory']
                }
            }
        });
        const raw = response.text?.trim() || '{}';
        const parsed = JSON.parse(raw.replace(/^```\w*\n?|\n?```$/g, '').trim()) as TurtleSoupPuzzle;
        if (!parsed.situation) parsed.situation = '一个人走进房间，然后死了。为什么？';
        if (!parsed.hiddenStory) parsed.hiddenStory = '房间里有毒气，他是被毒死的。';
        return parsed;
    } catch (e) {
        console.error('generateTurtleSoupPuzzle failed', e);
        return {
            situation: '一个人走进房间，然后死了。为什么？',
            hiddenStory: '房间里有毒气，他是被毒死的。'
        };
    }
};

export const answerTurtleSoupQuestion = async (
    puzzle: TurtleSoupPuzzle,
    question: string,
    questionHistory?: { q: string; a: string }[]
): Promise<string> => {
    const systemInstruction = `你是海龟汤主持人。你只知道「汤底」真相，对玩家的问题只能回答以下四种之一：是、否、与剧情无关、部分正确。不要解释，不要剧透汤底。
汤底（仅你可见）：${puzzle.hiddenStory}

${questionHistory?.length ? `已有问答：\n${questionHistory.map(h => `Q: ${h.q}\nA: ${h.a}`).join('\n')}` : ''}

请根据玩家的问题，只回复一个词：是、否、与剧情无关、部分正确。`;

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: [{ role: 'user', parts: [{ text: question }] }],
            config: { systemInstruction }
        });
        const raw = (response.text?.trim() || '').replace(/["\s]/g, '');
        if (/^是$/.test(raw)) return '是';
        if (/^否$/.test(raw)) return '否';
        if (/^与剧情无关$/.test(raw)) return '与剧情无关';
        if (/^部分正确$/.test(raw)) return '部分正确';
        return raw || '与剧情无关';
    } catch (e) {
        console.error('answerTurtleSoupQuestion failed', e);
        return '与剧情无关';
    }
};

export const generateTurtleSoupHint = async (
    hiddenStory: string,
    hintsSoFar: string[]
): Promise<string> => {
    const systemInstruction = `你是海龟汤主持人。根据汤底，给玩家一条新提示。提示要能推进推理，但不要直接说出关键反转或结局。
汤底：${hiddenStory}
已有提示：${hintsSoFar.length ? hintsSoFar.join('；') : '无'}

请只输出一条简短的提示（1～2 句话），不要前缀「提示：」。`;

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: [{ role: 'user', parts: [{ text: '请给一条新提示。' }] }],
            config: { systemInstruction }
        });
        return (response.text?.trim() || '再想想。').slice(0, 200);
    } catch (e) {
        console.error('generateTurtleSoupHint failed', e);
        return '再想想。';
    }
};

// ─────────────────────────────────────────────────────────────────────────
// 递进阅读模式（layered reading）—— 独立 API
//
// 设计原则（来自 LAYERED_READING_PLAN.md §1 七条铁律 / §3.2 阶段 2）：
// - 铁律 1：不复用 chatWithSkimAdaptiveTutor / chatWithAdaptiveTutor 任何代码逻辑;
//   不接收 scaffolding / KC / chunk / citations / docType 等任何附录参数
// - 铁律 5：不分 STEM / HUMANITIES;统一一套 systemInstruction
// - 铁律 7：prompt 层在 LAYERED_READING_SYSTEM_PROMPT 已禁止自动推进语
//
// 阶段 2 状态:
//   - chatWithLayeredReadingTutor: 阶段 2 panel 不消费,为阶段 3 树状 UI 对话准备
//   - generateLayeredReadingModules / generateLayeredRound1Content: 阶段 2 即被消费
// ─────────────────────────────────────────────────────────────────────────

/**
 * 递进阅读对话 API。统一一套 prompt（LAYERED_READING_SYSTEM_PROMPT）,不分学科。
 * 不接收 scaffolding / KC / chunk / citations / docType 任何附录参数。
 */
export const chatWithLayeredReadingTutor = async (
    docContent: string,
    history: ChatMessage[],
    newMessage: string
): Promise<string> => {
    try {
        const contentPart = getContentPart(docContent);
        const contents: Array<{ role: 'user' | 'model'; parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> }> = [];

        // 首条 user 消息携带 DOCUMENT 内容
        contents.push({
            role: 'user',
            parts: [contentPart, { text: 'Current Mode: Layered Reading' }]
        });

        // 历史对话
        history.forEach(msg => {
            contents.push({ role: msg.role, parts: [{ text: msg.text }] });
        });

        // 本轮新消息（不附任何 scaffolding / 引用协议 / KC 锚定 appendix）
        contents.push({ role: 'user', parts: [{ text: newMessage }] });

        const response = await ai.models.generateContent({
            model: 'gemini-3.1-pro-preview',
            contents,
            config: { systemInstruction: LAYERED_READING_SYSTEM_PROMPT }
        });

        return response.text || "Thinking...";
    } catch (error) {
        console.error('chatWithLayeredReadingTutor Error:', error);
        return "通信中断,请重试。";
    }
};

/**
 * 生成本模式独立的 module 列表（与 SkimPanel 的 studyMap 完全无关,铁律 2）。
 * AI 只输出 storyTitle + pageRange,前端补 id / index。
 *
 * @param fullText PDF 全文(或 dataURL)
 * @param options.moduleCount 用户指定的 module 数(2-7)
 * @returns LayeredReadingModule[] 或失败时 null
 */
export const generateLayeredReadingModules = async (
    fullText: string,
    options: { moduleCount: number }
): Promise<LayeredReadingModule[] | null> => {
    const { moduleCount } = options;
    if (moduleCount < 2 || moduleCount > 7) {
        console.error('generateLayeredReadingModules: moduleCount out of range [2, 7]', moduleCount);
        return null;
    }
    try {
        const contentPart = getContentPart(fullText);
        const prompt = buildLayeredModuleGenPrompt(moduleCount);
        const response = await ai.models.generateContent({
            model: 'gemini-3.1-pro-preview',
            contents: [{ role: 'user', parts: [contentPart, { text: prompt }] }],
            config: {
                responseMimeType: 'application/json',
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        modules: {
                            type: Type.ARRAY,
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    storyTitle: { type: Type.STRING },
                                    pageRange: { type: Type.STRING },
                                },
                                required: ['storyTitle', 'pageRange'],
                            },
                        },
                    },
                    required: ['modules'],
                },
            },
        });
        if (!response.text) return null;
        const parsed = JSON.parse(response.text) as {
            modules?: Array<{ storyTitle?: string; pageRange?: string }>;
        };
        const rawModules = Array.isArray(parsed.modules) ? parsed.modules : [];
        if (rawModules.length === 0) return null;

        // 前端补 id / index;只取前 moduleCount 个,防 AI 越界
        const modules: LayeredReadingModule[] = rawModules
            .slice(0, moduleCount)
            .map((m, i) => ({
                id: `module-${i + 1}`,
                index: i + 1,
                storyTitle: (m.storyTitle ?? '').trim() || `Module ${i + 1}`,
                pageRange: (m.pageRange ?? '').trim() || undefined,
            }));
        return modules;
    } catch (e) {
        console.error('generateLayeredReadingModules Error:', e);
        return null;
    }
};

/**
 * 为指定 module 生成 Round 1 大白话故事内容。
 * 输出纯 markdown 文本(非 JSON);200-400 字。
 *
 * @param fullText PDF 全文(或 dataURL)
 * @param layeredModule 待生成内容的 module(读 storyTitle + pageRange)
 * @returns markdown 文本,或失败时 null
 */
export const generateLayeredRound1Content = async (
    fullText: string,
    layeredModule: LayeredReadingModule
): Promise<string | null> => {
    try {
        const contentPart = getContentPart(fullText);
        const prompt = buildLayeredRound1Prompt(layeredModule);
        const response = await ai.models.generateContent({
            model: 'gemini-3.1-pro-preview',
            contents: [{ role: 'user', parts: [contentPart, { text: prompt }] }],
            config: { systemInstruction: LAYERED_READING_SYSTEM_PROMPT },
        });
        const text = response.text?.trim();
        if (!text) return null;
        return text;
    } catch (e) {
        console.error('generateLayeredRound1Content Error:', e);
        return null;
    }
};

/**
 * 阶段 3：生成 module 的 Round 2 子枝干列表 + 内容 + 溯源(铁律 6)。
 * 每个 branch 必须含 sourcePage(真实页码)+ sourceLocation(有意义位置描述)。
 *
 * @returns 2-5 个 branch 的数组(已补 id/index);失败时 null
 */
export const generateLayeredRound2Branches = async (
    fullText: string,
    layeredModule: LayeredReadingModule
): Promise<LayeredReadingRound2Branch[] | null> => {
    try {
        const contentPart = getContentPart(fullText);
        const prompt = buildLayeredRound2Prompt(layeredModule);
        const response = await ai.models.generateContent({
            model: 'gemini-3.1-pro-preview',
            contents: [{ role: 'user', parts: [contentPart, { text: prompt }] }],
            config: {
                responseMimeType: 'application/json',
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        branches: {
                            type: Type.ARRAY,
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    title: { type: Type.STRING },
                                    content: { type: Type.STRING },
                                    sourcePage: { type: Type.NUMBER },
                                    sourceLocation: { type: Type.STRING },
                                },
                                required: ['title', 'content', 'sourcePage', 'sourceLocation'],
                            },
                        },
                    },
                    required: ['branches'],
                },
            },
        });
        if (!response.text) return null;
        const parsed = JSON.parse(response.text) as {
            branches?: Array<{
                title?: string;
                content?: string;
                sourcePage?: number;
                sourceLocation?: string;
            }>;
        };
        const rawBranches = Array.isArray(parsed.branches) ? parsed.branches : [];
        if (rawBranches.length === 0) return null;

        // 前端补 id / index;限定 2-5
        const branches: LayeredReadingRound2Branch[] = rawBranches.slice(0, 5).map((b, i) => {
            const branch: LayeredReadingRound2Branch = {
                id: `${layeredModule.id}.${i + 1}`,
                index: i + 1,
                title: (b.title ?? '').trim() || `子枝干 ${i + 1}`,
                content: (b.content ?? '').trim() || null,
            };
            // 只保留 AI 给出的合法 sourcePage(>= 1 的整数);否则不写,防 0 / 负数 / 字符串等异常
            if (typeof b.sourcePage === 'number' && Number.isFinite(b.sourcePage) && b.sourcePage >= 1) {
                branch.sourcePage = Math.floor(b.sourcePage);
            }
            const loc = (b.sourceLocation ?? '').trim();
            if (loc) branch.sourceLocation = loc;
            return branch;
        });
        return branches;
    } catch (e) {
        console.error('generateLayeredRound2Branches Error:', e);
        return null;
    }
};

/**
 * 阶段 3：生成某个子枝干的 Round 3 细节挂载 + 溯源(铁律 6)。
 * 每个 detail 必填 sourcePage(真实页码)+ sourceLocation;label 用讲义原词。
 *
 * @returns 2-6 个 detail 的数组(已补 id);AI 倾向少给但准的细节;失败时 null
 */
export const generateLayeredRound3Details = async (
    fullText: string,
    parentModule: LayeredReadingModule,
    branch: LayeredReadingRound2Branch
): Promise<LayeredReadingRound3Detail[] | null> => {
    try {
        const contentPart = getContentPart(fullText);
        const prompt = buildLayeredRound3Prompt(parentModule, branch);
        const response = await ai.models.generateContent({
            model: 'gemini-3.1-pro-preview',
            contents: [{ role: 'user', parts: [contentPart, { text: prompt }] }],
            config: {
                responseMimeType: 'application/json',
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        details: {
                            type: Type.ARRAY,
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    kind: { type: Type.STRING },
                                    label: { type: Type.STRING },
                                    description: { type: Type.STRING },
                                    sourcePage: { type: Type.NUMBER },
                                    sourceLocation: { type: Type.STRING },
                                },
                                required: ['kind', 'label', 'description', 'sourcePage', 'sourceLocation'],
                            },
                        },
                    },
                    required: ['details'],
                },
            },
        });
        if (!response.text) return null;
        const parsed = JSON.parse(response.text) as {
            details?: Array<{
                kind?: string;
                label?: string;
                description?: string;
                sourcePage?: number;
                sourceLocation?: string;
            }>;
        };
        const rawDetails = Array.isArray(parsed.details) ? parsed.details : [];
        // 客户端二次过滤:丢弃 sourcePage 不合法的 detail(铁律 6 防御层——
        // 即使 AI 偶尔违反 prompt,前端也不展示编造页码)
        const allowedKinds = new Set(['term', 'experiment', 'figure', 'evidence', 'comparison']);
        const valid = rawDetails.filter((d) => {
            const sp = typeof d.sourcePage === 'number' ? d.sourcePage : -1;
            const sl = (d.sourceLocation ?? '').trim();
            const lbl = (d.label ?? '').trim();
            return (
                Number.isFinite(sp) &&
                sp >= 1 &&
                sl.length > 0 &&
                lbl.length > 0 &&
                typeof d.kind === 'string'
            );
        });
        if (valid.length === 0) return null;

        // 前端补 id;限定 2-6
        const details: LayeredReadingRound3Detail[] = valid.slice(0, 6).map((d, i) => ({
            id: `${branch.id}.d${i + 1}`,
            kind: allowedKinds.has(d.kind!) ? d.kind! : 'term',
            label: (d.label ?? '').trim(),
            description: (d.description ?? '').trim(),
            sourcePage: Math.floor(d.sourcePage!),
            sourceLocation: (d.sourceLocation ?? '').trim(),
        }));
        return details;
    } catch (e) {
        console.error('generateLayeredRound3Details Error:', e);
        return null;
    }
};

/**
 * 阶段 5 新增:为指定 branch 生成 Round 3 结构化学习单元。
 *
 * 与 generateLayeredRound3Details 完全独立函数,不共享代码。
 *
 * 客户端校验铁律(对齐铁律 6):
 * - 7 块必填字段缺一返回 null(figureGuide 不参与校验)
 * - sourcePage 必须 >= 1
 * - 所有字符串字段 trim 后长度 > 0
 */
export const generateLayeredRound3Unit = async (
  fullText: string,
  parentModule: LayeredReadingModule,
  branch: LayeredReadingRound2Branch
): Promise<LayeredReadingRound3Unit | null> => {
  try {
    const contentPart = getContentPart(fullText);
    const prompt = buildLayeredRound3UnitPrompt(parentModule, branch);

    const response = await ai.models.generateContent({
      model: 'gemini-3.1-pro-preview',
      contents: [{ role: 'user', parts: [contentPart, { text: prompt }] }],
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            coreQuestion: { type: Type.STRING },
            mechanismChain: { type: Type.STRING },
            keyTerms: { type: Type.STRING },
            figureGuide: { type: Type.STRING },
            answerSkeleton: { type: Type.STRING },
            confusionPoints: { type: Type.STRING },
            miniQuestion: { type: Type.STRING },
            sourcePage: { type: Type.NUMBER },
            sourceLocation: { type: Type.STRING },
          },
          required: [
            'coreQuestion',
            'mechanismChain',
            'keyTerms',
            'answerSkeleton',
            'confusionPoints',
            'miniQuestion',
            'sourcePage',
            'sourceLocation',
          ],
        },
      },
    });

    const text = response.text;
    if (!text) return null;

    const parsed = JSON.parse(text);

    // 客户端校验:7 必填块 + 溯源
    const valid =
      typeof parsed.coreQuestion === 'string' && parsed.coreQuestion.trim().length > 0 &&
      typeof parsed.mechanismChain === 'string' && parsed.mechanismChain.trim().length > 0 &&
      typeof parsed.keyTerms === 'string' && parsed.keyTerms.trim().length > 0 &&
      typeof parsed.answerSkeleton === 'string' && parsed.answerSkeleton.trim().length > 0 &&
      typeof parsed.confusionPoints === 'string' && parsed.confusionPoints.trim().length > 0 &&
      typeof parsed.miniQuestion === 'string' && parsed.miniQuestion.trim().length > 0 &&
      typeof parsed.sourcePage === 'number' && parsed.sourcePage >= 1 &&
      typeof parsed.sourceLocation === 'string' && parsed.sourceLocation.trim().length > 0;

    if (!valid) return null;

    return {
      coreQuestion: parsed.coreQuestion,
      mechanismChain: parsed.mechanismChain,
      keyTerms: parsed.keyTerms,
      figureGuide:
        typeof parsed.figureGuide === 'string' && parsed.figureGuide.trim().length > 0
          ? parsed.figureGuide
          : undefined,
      answerSkeleton: parsed.answerSkeleton,
      confusionPoints: parsed.confusionPoints,
      miniQuestion: parsed.miniQuestion,
      sourcePage: parsed.sourcePage,
      sourceLocation: parsed.sourceLocation,
      generatedAt: Date.now(),
    };
  } catch (e) {
    console.error('[generateLayeredRound3Unit] failed:', e);
    return null;
  }
};

// ─────────────────────────────────────────────────────────────────────────
// 阶段 4:递进阅读题目系统 — 4 个新 AI 函数(铁律 8/9/10)
//
// 设计原则:
// - 不复用 chatWithSkimAdaptiveTutor / chatWithAdaptiveTutor 任何代码逻辑(铁律 1)
// - 不接收 scaffolding / KC / chunk / citations / docType 任何附录参数
// - 题目生成 3 个函数都接收 fullText(铁律 6 精神:题目基于原始 slides,不是二手内容)
// - 批改函数 gradeLayeredQuestion 不接收 fullText(批改基于参考答案 + 用户答案就够,省 token)
// - 4 个函数都用 responseSchema 强约束 JSON
// - prompt 已含禁推进语段(铁律 11)
// ─────────────────────────────────────────────────────────────────────────

/**
 * 阶段 4:为某 module 生成 Round 1 末故事题(铁律 9 故事感 + 主旨准确)。
 *
 * @returns { questionText, referenceAnswer } 或失败时 null
 */
export const generateLayeredQuestionForRound1 = async (
    fullText: string,
    layeredModule: LayeredReadingModule
): Promise<{ questionText: string; referenceAnswer: string } | null> => {
    try {
        const contentPart = getContentPart(fullText);
        const prompt = buildLayeredQuestionRound1Prompt(layeredModule);
        const response = await ai.models.generateContent({
            model: 'gemini-3.1-pro-preview',
            contents: [{ role: 'user', parts: [contentPart, { text: prompt }] }],
            config: {
                responseMimeType: 'application/json',
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        questionText: { type: Type.STRING },
                        referenceAnswer: { type: Type.STRING },
                    },
                    required: ['questionText', 'referenceAnswer'],
                },
            },
        });
        if (!response.text) return null;
        const parsed = JSON.parse(response.text) as {
            questionText?: string;
            referenceAnswer?: string;
        };
        const q = (parsed.questionText ?? '').trim();
        const a = (parsed.referenceAnswer ?? '').trim();
        if (!q || !a) return null;
        return { questionText: q, referenceAnswer: a };
    } catch (e) {
        console.error('generateLayeredQuestionForRound1 Error:', e);
        return null;
    }
};

/**
 * 阶段 4:为某 branch 生成 Round 2 末结构题(铁律 9 步骤完整 + 步骤顺序)。
 */
export const generateLayeredQuestionForRound2 = async (
    fullText: string,
    parentModule: LayeredReadingModule,
    branch: LayeredReadingRound2Branch
): Promise<{ questionText: string; referenceAnswer: string } | null> => {
    try {
        const contentPart = getContentPart(fullText);
        const prompt = buildLayeredQuestionRound2Prompt(parentModule, branch);
        const response = await ai.models.generateContent({
            model: 'gemini-3.1-pro-preview',
            contents: [{ role: 'user', parts: [contentPart, { text: prompt }] }],
            config: {
                responseMimeType: 'application/json',
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        questionText: { type: Type.STRING },
                        referenceAnswer: { type: Type.STRING },
                    },
                    required: ['questionText', 'referenceAnswer'],
                },
            },
        });
        if (!response.text) return null;
        const parsed = JSON.parse(response.text) as {
            questionText?: string;
            referenceAnswer?: string;
        };
        const q = (parsed.questionText ?? '').trim();
        const a = (parsed.referenceAnswer ?? '').trim();
        if (!q || !a) return null;
        return { questionText: q, referenceAnswer: a };
    } catch (e) {
        console.error('generateLayeredQuestionForRound2 Error:', e);
        return null;
    }
};

/**
 * 阶段 4:为某 branch 生成 Round 3 末细节应用题(铁律 9 推理逻辑 + 细节抓取)。
 * 题目基于已展开的 details 列表,要求是应用/推理题而非定义复述题。
 */
export const generateLayeredQuestionForRound3 = async (
    fullText: string,
    parentModule: LayeredReadingModule,
    branch: LayeredReadingRound2Branch,
    details: LayeredReadingRound3Detail[]
): Promise<{ questionText: string; referenceAnswer: string } | null> => {
    try {
        const contentPart = getContentPart(fullText);
        const prompt = buildLayeredQuestionRound3Prompt(parentModule, branch, details);
        const response = await ai.models.generateContent({
            model: 'gemini-3.1-pro-preview',
            contents: [{ role: 'user', parts: [contentPart, { text: prompt }] }],
            config: {
                responseMimeType: 'application/json',
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        questionText: { type: Type.STRING },
                        referenceAnswer: { type: Type.STRING },
                    },
                    required: ['questionText', 'referenceAnswer'],
                },
            },
        });
        if (!response.text) return null;
        const parsed = JSON.parse(response.text) as {
            questionText?: string;
            referenceAnswer?: string;
        };
        const q = (parsed.questionText ?? '').trim();
        const a = (parsed.referenceAnswer ?? '').trim();
        if (!q || !a) return null;
        return { questionText: q, referenceAnswer: a };
    } catch (e) {
        console.error('generateLayeredQuestionForRound3 Error:', e);
        return null;
    }
};

/**
 * 阶段 4:批改用户对某题的答案(铁律 9 按题型分维度)。
 * 不接收 fullText:批改基于参考答案 + 用户答案就够,省 token。
 *
 * @returns LayeredReadingQuestionGrade 或失败时 null
 */
export const gradeLayeredQuestion = async (
    question: LayeredReadingQuestion,
    userAnswer: string
): Promise<LayeredReadingQuestionGrade | null> => {
    try {
        const prompt = buildLayeredQuestionGradingPrompt(question, userAnswer);
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            config: {
                responseMimeType: 'application/json',
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        dimensions: {
                            type: Type.ARRAY,
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    label: { type: Type.STRING },
                                    stars: { type: Type.NUMBER },
                                    comment: { type: Type.STRING },
                                },
                                required: ['label', 'stars', 'comment'],
                            },
                        },
                    },
                    required: ['dimensions'],
                },
            },
        });
        if (!response.text) return null;
        const parsed = JSON.parse(response.text) as {
            dimensions?: Array<{ label?: string; stars?: number; comment?: string }>;
        };
        const rawDims = Array.isArray(parsed.dimensions) ? parsed.dimensions : [];
        // 客户端二次过滤:每个维度必须有 label、合法 stars(1-5 整数)、非空 comment
        const valid = rawDims.filter((d) => {
            const s = typeof d.stars === 'number' ? d.stars : -1;
            return (
                typeof d.label === 'string' &&
                d.label.trim().length > 0 &&
                Number.isFinite(s) &&
                s >= 1 &&
                s <= 5 &&
                typeof d.comment === 'string' &&
                d.comment.trim().length > 0
            );
        });
        if (valid.length < 2) return null; // 必须 2 个维度
        return {
            dimensions: valid.slice(0, 2).map((d) => ({
                label: d.label!.trim(),
                stars: Math.round(d.stars!) as 1 | 2 | 3 | 4 | 5,
                comment: d.comment!.trim(),
            })),
            gradedAt: Date.now(),
        };
    } catch (e) {
        console.error('gradeLayeredQuestion Error:', e);
        return null;
    }
};

const summarizeWitnessForPrompt = (session: StudyWitnessSession) => ({
    id: session.id,
    fileName: session.fileName,
    startedAt: new Date(session.startedAt).toISOString(),
    endedAt: new Date(session.endedAt).toISOString(),
    status: session.status,
    totalMinutes: Math.round(session.totalDurationMs / 6000) / 10,
    activeMinutes: Math.round(session.activeDurationMs / 6000) / 10,
    finalPageNumber: session.finalPageNumber,
    pageSummaries: session.pageSummaries
        .slice()
        .sort((a, b) => b.totalDurationMs - a.totalDurationMs)
        .slice(0, 8)
        .map((page) => ({
            pageNumber: page.pageNumber,
            totalMinutes: Math.round(page.totalDurationMs / 6000) / 10,
            visits: page.visits,
        })),
    awayEvents: session.awayEvents.map((event) => ({
        startedAt: new Date(event.startedAt).toISOString(),
        durationSeconds: Math.round(event.durationMs / 1000),
    })),
});

export const generateProfileNotebookUpdateSuggestion = async (
    currentNotebook: LearnerProfileNotebook,
    currentSession: StudyWitnessSession,
    recentSessions: StudyWitnessSession[]
): Promise<ProfileNotebookUpdateSuggestion> => {
    const recentCutoff = Date.now() - 21 * 24 * 60 * 60 * 1000;
    const recentWindow = recentSessions
        .filter((session) => session.status === 'completed')
        .filter((session) => session.startedAt >= recentCutoff || session.id === currentSession.id)
        .slice(0, 5);

    const prompt = `
你在更新一份"长期画像笔记本"。规则非常重要:
1. 只记看得见的现象，不猜原因，不贴"懒/逃避/自律差/害怕"这类判断。
2. 用户可以编辑画像；当前画像就是最高优先级事实。你只能基于它做轻微印证、修正、补充。
3. 前四栏是长期稳定判断；第 5 栏"最近状态趋势"只看最近 5 次学习和最近 21 天。
4. 输出必须是 JSON，不要输出 markdown。

当前正式笔记本:
${JSON.stringify(currentNotebook, null, 2)}

本次学习录像:
${JSON.stringify(summarizeWitnessForPrompt(currentSession), null, 2)}

最近窗口内的学习录像:
${JSON.stringify(recentWindow.map(summarizeWitnessForPrompt), null, 2)}

请生成:
- sessionSummary: 3 到 5 条本次学习小结，必须是现象描述。
- proposedNotebook: 更新后的五栏文字，保留用户语气，避免过度断言。
`;

    const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: {
            responseMimeType: 'application/json',
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    sessionSummary: {
                        type: Type.ARRAY,
                        items: { type: Type.STRING },
                    },
                    proposedNotebook: {
                        type: Type.OBJECT,
                        properties: {
                            smoothAndStuck: { type: Type.STRING },
                            focusDuration: { type: Type.STRING },
                            stuckReaction: { type: Type.STRING },
                            bestTime: { type: Type.STRING },
                            recentTrend: { type: Type.STRING },
                            welcomeLine: { type: Type.STRING },
                        },
                        required: ['smoothAndStuck', 'focusDuration', 'stuckReaction', 'bestTime', 'recentTrend'],
                    },
                },
                required: ['sessionSummary', 'proposedNotebook'],
            },
        },
    });

    const parsed = JSON.parse(response.text || '{}') as {
        sessionSummary?: string[];
        proposedNotebook?: Partial<LearnerProfileNotebook>;
    };
    const now = Date.now();
    return {
        id: `profile-suggestion-${now}-${Math.random().toString(36).slice(2, 8)}`,
        witnessSessionId: currentSession.id,
        createdAt: now,
        sessionSummary: Array.isArray(parsed.sessionSummary) && parsed.sessionSummary.length > 0
            ? parsed.sessionSummary.map(String).slice(0, 5)
            : ['本次学习已记录，但 AI 没有生成可用小结。'],
        proposedNotebook: {
            ...currentNotebook,
            ...(parsed.proposedNotebook || {}),
            updatedAt: now,
            version: currentNotebook.version + 1,
        },
    };
};

export const translateLectureTranscriptSegment = async (
    text: string,
    recentContext: string[] = []
): Promise<string> => {
    const source = text.trim();
    if (!source) return '';
    const context = recentContext.filter(Boolean).slice(-2).join('\n');
    const prompt = `
你是大学课堂的实时字幕翻译器。把下面老师刚确认的一小段课堂原文翻译成简体中文。

规则：
1. 忠实翻译，不解释、不总结、不扩写。
2. 专业术语、学者姓名、缩写必须准确；术语第一次出现时可保留英文括号。
3. 结合前两段上下文消解代词，但只输出“当前原文”的翻译。
4. 如果原文是残句，保留残句，不擅自补出老师没说的话。
5. 只输出中文译文，不要标题或引号。

最近上下文：
${context || '（无）'}

当前原文：
${source}
`;
    const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: { temperature: 0.15 },
    });
    return (response.text || '').trim();
};

// === Lecture 案件式领读 =====================================================

export interface AnalyzeLectureCaseFitInput {
    pdfDataUrl?: string | null;
    pageTexts: string[];
    pageStart: number;
    pageEnd: number;
    abortSignal?: AbortSignal;
}

export interface LectureCaseAnalysisResult {
    manifest: LectureCaseManifest;
    report: LectureCaseSuitabilityReport;
}

export interface BuildLectureCasePlanInput {
    manifest: LectureCaseManifest;
    report: LectureCaseSuitabilityReport;
    validationFeedback?: string;
    abortSignal?: AbortSignal;
}

export interface AdvanceLectureCaseInput {
    plan: LectureCasePlan;
    episode: LectureCaseEpisode;
    progress: LectureCaseProgress;
    pageTexts: string[];
    history: ChatMessage[];
    userMessage: string;
    abortSignal?: AbortSignal;
}

const CASE_CHUNK_MAX_CHARS = 60_000;

const clampCaseScore = (value: unknown): number => {
    const number = typeof value === 'number' && Number.isFinite(value) ? value : 0;
    return Math.max(0, Math.min(1, number));
};

const parseCaseJson = <T,>(text: string | undefined): T => {
    if (!text) throw new Error('模型没有返回案件式结构化结果。');
    return JSON.parse(cleanJsonString(text)) as T;
};

const buildLectureCaseChunks = (pageTexts: string[], pageStart: number, pageEnd: number) => {
    const chunks: Array<{ pageStart: number; pageEnd: number; text: string; hasVisualOnlyPage: boolean }> = [];
    let currentPages: Array<{ page: number; text: string }> = [];
    let currentLength = 0;
    const flush = () => {
        if (currentPages.length === 0) return;
        chunks.push({
            pageStart: currentPages[0].page,
            pageEnd: currentPages[currentPages.length - 1].page,
            text: currentPages.map(({ page, text }) => `[应用内第 ${page} 页]\n${text || '（本页没有可提取文字，必须结合 PDF 画面归档。）'}`).join('\n\n'),
            hasVisualOnlyPage: currentPages.some(({ text }) => !text.trim()),
        });
        currentPages = [];
        currentLength = 0;
    };

    for (let page = pageStart; page <= pageEnd; page += 1) {
        const raw = pageTexts[page - 1]?.trim() || '';
        const text = raw.length > CASE_CHUNK_MAX_CHARS
            ? `${raw.slice(0, CASE_CHUNK_MAX_CHARS)}\n（本页提取文字过长，余下内容请结合随附 PDF 画面判断。）`
            : raw;
        const addition = text.length + 40;
        if (currentPages.length > 0 && currentLength + addition > CASE_CHUNK_MAX_CHARS) flush();
        currentPages.push({ page, text });
        currentLength += addition;
    }
    flush();
    return chunks;
};

const CASE_UNIT_SCHEMA = {
    type: Type.OBJECT,
    properties: {
        id: { type: Type.STRING },
        title: { type: Type.STRING },
        kind: { type: Type.STRING, enum: ['concept', 'claim', 'evidence', 'method', 'critique', 'example', 'conclusion', 'context'] },
        summary: { type: Type.STRING },
        pageRefs: { type: Type.ARRAY, items: { type: Type.INTEGER } },
        importance: { type: Type.STRING, enum: ['core', 'supporting', 'context'] },
        narrativeRole: { type: Type.STRING, enum: ['spine', 'toolkit', 'evidence', 'supplement'] },
    },
    required: ['id', 'title', 'kind', 'summary', 'pageRefs', 'importance', 'narrativeRole'],
};

const analyzeLectureCaseChunk = async (
    chunk: { pageStart: number; pageEnd: number; text: string; hasVisualOnlyPage: boolean },
    pdfDataUrl?: string | null,
    abortSignal?: AbortSignal,
): Promise<{ pages: LectureCasePageDisposition[]; units: LectureCaseContentUnit[] }> => {
    const prompt = `
你正在为大学 Lecture 建立忠实的逐页内容账本，不是在讲课，也不要编故事。

当前唯一范围：应用内第 ${chunk.pageStart}-${chunk.pageEnd} 页。
要求：
1. 每一页恰好输出一条 pages 记录，不得缺页或越界。
2. substantive=有需要学习的实质内容；duplicate=前后动画递进或重复；transition=过渡；title=纯标题；visual_only=主要信息在图中或没有可提取文字。
3. 每一条记录必须写清处理理由。duplicate 需要说明与哪页重复或递进。
4. 把实质内容拆成可核查的原子 units；一个 unit 可以跨页，但 pageRefs 必须准确。
5. unit.id 在本批次内唯一，使用短英文/数字 ID；pages.unitIds 只能引用本批次 units。
6. narrativeRole 只描述内容天然作用：spine 主线主张/关键结论；toolkit 前置工具；evidence 研究证据；supplement 补充例子或背景。
7. 忠实保留研究设计、反驳、方法限制与结论，不能因为它们不够“有剧情”而删除。
8. 所有给用户看的标题、摘要、理由与内容描述必须使用自然的简体中文。专业术语第一次出现时可写成“中文（English）”，不要输出整段英文；unit.id 等机器字段除外。

逐页原文：
${chunk.text}
`;
    const parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [{ text: prompt }];
    if (chunk.hasVisualOnlyPage && pdfDataUrl?.startsWith('data:')) parts.unshift(getContentPart(pdfDataUrl));
    const response = await ai.models.generateContent({
        model: 'gemini-3.1-pro-preview',
        contents: [{ role: 'user', parts }],
        config: {
            ...(abortSignal ? { abortSignal } : {}),
            responseMimeType: 'application/json',
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    pages: {
                        type: Type.ARRAY,
                        items: {
                            type: Type.OBJECT,
                            properties: {
                                page: { type: Type.INTEGER },
                                kind: { type: Type.STRING, enum: ['substantive', 'duplicate', 'transition', 'title', 'visual_only'] },
                                unitIds: { type: Type.ARRAY, items: { type: Type.STRING } },
                                reason: { type: Type.STRING },
                            },
                            required: ['page', 'kind', 'unitIds', 'reason'],
                        },
                    },
                    units: { type: Type.ARRAY, items: CASE_UNIT_SCHEMA },
                },
                required: ['pages', 'units'],
            },
        },
    });
    return parseCaseJson(response.text);
};

export const analyzeLectureCaseFit = async (
    input: AnalyzeLectureCaseFitInput,
): Promise<LectureCaseAnalysisResult> => {
    const chunks = buildLectureCaseChunks(input.pageTexts, input.pageStart, input.pageEnd);
    if (chunks.length === 0) throw new Error('所选范围没有可分析页面。');

    const pages: LectureCasePageDisposition[] = [];
    const units: LectureCaseContentUnit[] = [];
    for (const chunk of chunks) {
        const raw = await analyzeLectureCaseChunk(chunk, input.pdfDataUrl, input.abortSignal);
        const prefix = `p${chunk.pageStart}`;
        const idMap = new Map<string, string>();
        raw.units.forEach((unit, index) => {
            const id = `${prefix}-${unit.id?.trim() || `unit-${index + 1}`}`;
            idMap.set(unit.id, id);
            units.push({
                ...unit,
                id,
                pageRefs: [...new Set(unit.pageRefs)].filter((page) => page >= chunk.pageStart && page <= chunk.pageEnd),
            });
        });
        raw.pages.forEach((page) => {
            if (page.page < chunk.pageStart || page.page > chunk.pageEnd) return;
            pages.push({ ...page, unitIds: page.unitIds.map((id) => idMap.get(id)).filter((id): id is string => Boolean(id)) });
        });
        for (let page = chunk.pageStart; page <= chunk.pageEnd; page += 1) {
            if (!pages.some((item) => item.page === page)) {
                pages.push({ page, kind: 'visual_only', unitIds: [], reason: '模型未返回本页文字归档；保留为视觉页，需在案件计划中显式处理。' });
            }
        }
    }
    pages.sort((a, b) => a.page - b.page);
    const manifest: LectureCaseManifest = {
        version: 1,
        pageStart: input.pageStart,
        pageEnd: input.pageEnd,
        pages,
        units,
    };

    const compactManifest = JSON.stringify(manifest);
    const reportPrompt = `
请判断下面这份 Lecture 内容账本是否严格适合“案件式领读”。案件式不是虚构故事，而是围绕一个贯穿问题，让竞争主张、预测、证据、反驳和结论自然推进。

严格标准：
- 必须存在清晰且可由内容单元支持的贯穿问题；
- 适合度低于 0.75 应判为不适合；
- 至少能形成 3 个连贯章节；
- 至少 85% 实质内容能直接进入主线，剩余内容仍须作为 toolkit 或 supplement 安置；
- 零散术语、独立例题、公式速查或拼盘式复习不能强行案件化；
- 语气忠实，不虚构人物对白。
- centralQuestion、whySuitable、failureReasons、identifiedClaims、identifiedEvidenceChains、episodePreviews 等所有用户可见文字必须使用自然的简体中文。专业术语第一次出现时可保留英文括注，不要因为原文是英文就输出英文段落。

只返回结构化判断。episodePreviews 是预览，不是最终计划，页码必须来自账本。

内容账本：
${compactManifest}
`;
    const response = await ai.models.generateContent({
        model: 'gemini-3.1-pro-preview',
        contents: [{ role: 'user', parts: [{ text: reportPrompt }] }],
        config: {
            ...(input.abortSignal ? { abortSignal: input.abortSignal } : {}),
            responseMimeType: 'application/json',
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    suitabilityScore: { type: Type.NUMBER },
                    mappableRate: { type: Type.NUMBER },
                    centralQuestion: { type: Type.STRING },
                    fitReasons: { type: Type.ARRAY, items: { type: Type.STRING } },
                    unsuitableReasons: { type: Type.ARRAY, items: { type: Type.STRING } },
                    detectedClaims: { type: Type.ARRAY, items: { type: Type.STRING } },
                    detectedEvidenceGroups: { type: Type.ARRAY, items: { type: Type.STRING } },
                    episodePreviews: {
                        type: Type.ARRAY,
                        items: {
                            type: Type.OBJECT,
                            properties: {
                                title: { type: Type.STRING },
                                role: { type: Type.STRING },
                                pageRefs: { type: Type.ARRAY, items: { type: Type.INTEGER } },
                            },
                            required: ['title', 'role', 'pageRefs'],
                        },
                    },
                    recommendedFallback: { type: Type.STRING, enum: ['continuous', 'records'] },
                },
                required: ['suitabilityScore', 'mappableRate', 'centralQuestion', 'fitReasons', 'unsuitableReasons', 'detectedClaims', 'detectedEvidenceGroups', 'episodePreviews', 'recommendedFallback'],
            },
        },
    });
    const rawReport = parseCaseJson<LectureCaseSuitabilityReport>(response.text);
    return {
        manifest,
        report: {
            ...rawReport,
            suitabilityScore: clampCaseScore(rawReport.suitabilityScore),
            mappableRate: clampCaseScore(rawReport.mappableRate),
            episodePreviews: rawReport.episodePreviews.map((episode) => ({
                ...episode,
                pageRefs: [...new Set(episode.pageRefs)].filter((page) => page >= input.pageStart && page <= input.pageEnd),
            })),
        },
    };
};

export const buildLectureCasePlan = async (
    input: BuildLectureCasePlanInput,
): Promise<LectureCasePlan> => {
    const prompt = `
根据经过适配判断的 Lecture 内容账本，生成一份忠实的案件式领读计划。

要求：
1. 每个内容单元必须且只能分配给一个主章节，unitIds 使用原 ID，不得创建新 ID。
2. 至少 3 章，按材料和推理自然顺序排列；允许前置工具包，但不能把所有内容硬写成法庭戏。
3. 每章 guidingQuestion 必须能引出一个预测、判断、区分或重建动作。
4. pageRefs 必须在 ${input.manifest.pageStart}-${input.manifest.pageEnd} 内；lastPage 设为该章第一来源页。
5. openingPrompt 只做短开场并交出一个认知动作，不一次讲完整章。
6. prerequisiteEpisodeIds 只引用更早章节；用户仍可自由打开后章。
7. status 固定为 not_started，messages 和 unresolvedQuestions 固定为空数组。
8. 不虚构原材料没有的人物、实验或结论。
9. caseTitle、centralQuestion、spineSummary，以及每章的 title、role、guidingQuestion、openingPrompt、bridgeToNext，全部使用自然的简体中文。专业术语第一次出现时可写成“中文（English）”，不得整句照搬英文原文。
10. title 只写章节名称，不要添加“Episode 1”“Chapter 1”或“第 1 章”等序号前缀，界面会统一显示章节序号。
${input.validationFeedback ? `\n上一次计划校验失败，必须逐项修复：\n${input.validationFeedback}` : ''}

适配报告：
${JSON.stringify(input.report)}

内容账本：
${JSON.stringify(input.manifest)}
`;
    const response = await ai.models.generateContent({
        model: 'gemini-3.1-pro-preview',
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: {
            ...(input.abortSignal ? { abortSignal: input.abortSignal } : {}),
            responseMimeType: 'application/json',
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    caseTitle: { type: Type.STRING },
                    centralQuestion: { type: Type.STRING },
                    spineSummary: { type: Type.STRING },
                    episodes: {
                        type: Type.ARRAY,
                        items: {
                            type: Type.OBJECT,
                            properties: {
                                id: { type: Type.STRING },
                                index: { type: Type.INTEGER },
                                title: { type: Type.STRING },
                                role: { type: Type.STRING },
                                guidingQuestion: { type: Type.STRING },
                                pageRefs: { type: Type.ARRAY, items: { type: Type.INTEGER } },
                                unitIds: { type: Type.ARRAY, items: { type: Type.STRING } },
                                prerequisiteEpisodeIds: { type: Type.ARRAY, items: { type: Type.STRING } },
                                openingPrompt: { type: Type.STRING },
                                bridgeToNext: { type: Type.STRING },
                            },
                            required: ['id', 'index', 'title', 'role', 'guidingQuestion', 'pageRefs', 'unitIds', 'prerequisiteEpisodeIds', 'openingPrompt'],
                        },
                    },
                },
                required: ['caseTitle', 'centralQuestion', 'spineSummary', 'episodes'],
            },
        },
    });
    const raw = parseCaseJson<Omit<LectureCasePlan, 'version'> & { episodes: Array<Omit<LectureCaseEpisode, 'status' | 'lastPage' | 'messages' | 'unresolvedQuestions'>> }>(response.text);
    const idMap = new Map(raw.episodes.map((episode, index) => [episode.id, `case-episode-${index + 1}`]));
    const cleanEpisodeTitle = (title: string): string => title
        .replace(/^\s*(?:episode|chapter)\s*\d+\s*[:：.\-–—]?\s*/i, '')
        .replace(/^\s*第\s*\d+\s*章\s*[:：.\-–—]?\s*/i, '')
        .trim();
    return {
        version: 1,
        caseTitle: raw.caseTitle,
        centralQuestion: raw.centralQuestion,
        spineSummary: raw.spineSummary,
        episodes: raw.episodes.map((episode, index) => ({
            ...episode,
            title: cleanEpisodeTitle(episode.title) || `案件章节 ${index + 1}`,
            id: idMap.get(episode.id) ?? `case-episode-${index + 1}`,
            index: index + 1,
            pageRefs: [...new Set(episode.pageRefs)].sort((a, b) => a - b),
            prerequisiteEpisodeIds: episode.prerequisiteEpisodeIds.map((id) => idMap.get(id)).filter((id): id is string => Boolean(id)),
            status: 'not_started',
            lastPage: episode.pageRefs[0] ?? input.manifest.pageStart,
            messages: [],
            unresolvedQuestions: [],
        })),
    };
};

export const advanceLectureCase = async (
    input: AdvanceLectureCaseInput,
): Promise<LectureCaseTurnResult> => {
    const allowedUnits = new Set(input.episode.unitIds);
    const episodeUnits = input.episode.unitIds.map((unitId) => ({ unitId, progress: input.progress.units[unitId] ?? { level: 'unseen' } }));
    const pageSource = input.episode.pageRefs
        .map((page) => `[应用内第 ${page} 页]\n${input.pageTexts[page - 1]?.trim() || '（没有可提取文字，请谨慎依赖本章计划，不要编造视觉细节。）'}`)
        .join('\n\n')
        .slice(0, 60_000);
    const history = input.history.slice(-16).map((message) => `${message.role === 'user' ? '用户' : 'AI'}：${message.text}`).join('\n');
    const prompt = `
你是“案件式领读”的忠实认知向导。案件感来自材料自身的主张、预测、证据和反驳，不得虚构戏剧。

整案：${input.plan.caseTitle}
贯穿问题：${input.plan.centralQuestion}
主线：${input.plan.spineSummary}

当前章节：${input.episode.title}
本章作用：${input.episode.role}
本章核心问题：${input.episode.guidingQuestion}
本章允许更新的内容单元及状态：${JSON.stringify(episodeUnits)}

规则：
1. 一轮只交给用户一个认知动作：prediction、judgment、distinction 或 reconstruction；若用户要求“直接告诉我”，用 reveal 揭晓并停在下一个问题前。
2. 用户说“我没懂”时换一个具体角度解释，相应 unit 标 needs_review。
3. 用户说“我会了”只设置 selfReportedUnderstood=true；除非本轮确实包含无提示正确回答，否则不能标 verified。
4. AI主动展示只能标 introduced；用户实际尝试可标 engaged；只有无提示正确回答才可标 verified。
5. coverageUpdates 只能使用本章 unitId：${[...allowedUnits].join(', ')}。
6. focusPages 只能使用本章来源页：${input.episode.pageRefs.join(', ')}。
7. 内容忠实、简洁，不一次讲完整章。可以用“主张、证据、反驳、债务、裁决”等结构词。
8. messageMarkdown 和 unresolvedQuestions 必须使用自然的简体中文。专业术语第一次出现时可写成“中文（English）”，之后优先使用中文；即使原文、章节计划或历史消息是英文，也不要跟随它们输出整段英文。

本章原文：
${pageSource}

最近对话：
${history || '（尚未开始）'}

用户当前输入：
${input.userMessage}
`;
    const response = await ai.models.generateContent({
        model: 'gemini-3.1-pro-preview',
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: {
            ...(input.abortSignal ? { abortSignal: input.abortSignal } : {}),
            responseMimeType: 'application/json',
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    messageMarkdown: { type: Type.STRING },
                    focusPages: { type: Type.ARRAY, items: { type: Type.INTEGER } },
                    interactionKind: { type: Type.STRING, enum: ['prediction', 'judgment', 'distinction', 'reconstruction', 'reveal', 'none'] },
                    coverageUpdates: {
                        type: Type.ARRAY,
                        items: {
                            type: Type.OBJECT,
                            properties: {
                                unitId: { type: Type.STRING },
                                level: { type: Type.STRING, enum: ['introduced', 'engaged', 'verified', 'needs_review'] },
                                evidence: { type: Type.STRING },
                                selfReportedUnderstood: { type: Type.BOOLEAN },
                            },
                            required: ['unitId', 'level'],
                        },
                    },
                    unresolvedQuestions: { type: Type.ARRAY, items: { type: Type.STRING } },
                    episodeReadyToComplete: { type: Type.BOOLEAN },
                },
                required: ['messageMarkdown', 'focusPages', 'interactionKind', 'coverageUpdates', 'unresolvedQuestions', 'episodeReadyToComplete'],
            },
        },
    });
    const raw = parseCaseJson<LectureCaseTurnResult>(response.text);
    return {
        ...raw,
        focusPages: raw.focusPages.filter((page) => input.episode.pageRefs.includes(page)),
        coverageUpdates: raw.coverageUpdates.filter((update) => allowedUnits.has(update.unitId)),
    };
};

// ─────────────────────────────────────────────────────────────────────────────
// 备考工作台：整场考试对话（独立于知识块私教、BKT 与覆盖判断）
// ─────────────────────────────────────────────────────────────────────────────

type ExamGlobalMaterialSourceBatch = {
  text: string;
  pages: number[];
};

export interface GenerateExamGlobalMaterialManifestInput {
  materialLinkId: string;
  fileName: string;
  batches: ExamGlobalMaterialSourceBatch[];
  routeHints?: string[];
  abortSignal?: AbortSignal;
}

const EXAM_GLOBAL_MANIFEST_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    summary: { type: Type.STRING },
    role: { type: Type.STRING },
    mainQuestions: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: { text: { type: Type.STRING }, pages: { type: Type.ARRAY, items: { type: Type.INTEGER } } },
        required: ['text', 'pages'],
      },
    },
    concepts: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          nameZh: { type: Type.STRING },
          nameEn: { type: Type.STRING },
          text: { type: Type.STRING },
          pages: { type: Type.ARRAY, items: { type: Type.INTEGER } },
        },
        required: ['nameZh', 'text', 'pages'],
      },
    },
    claims: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: { text: { type: Type.STRING }, pages: { type: Type.ARRAY, items: { type: Type.INTEGER } } },
        required: ['text', 'pages'],
      },
    },
    evidence: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: { text: { type: Type.STRING }, pages: { type: Type.ARRAY, items: { type: Type.INTEGER } } },
        required: ['text', 'pages'],
      },
    },
    limitations: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: { text: { type: Type.STRING }, pages: { type: Type.ARRAY, items: { type: Type.INTEGER } } },
        required: ['text', 'pages'],
      },
    },
  },
  required: ['summary', 'role', 'mainQuestions', 'concepts', 'claims', 'evidence', 'limitations'],
};

function normalizeExamGlobalPages(value: unknown, allowedPages: Set<number>): number[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(Number).filter((page) => Number.isInteger(page) && allowedPages.has(page)))]
    .sort((a, b) => a - b);
}

function normalizeExamGlobalPageItems(
  value: unknown,
  allowedPages: Set<number>,
  maxItems: number,
): Array<{ text: string; pages: number[] }> {
  if (!Array.isArray(value)) return [];
  return value.slice(0, maxItems).flatMap((raw) => {
    if (!raw || typeof raw !== 'object') return [];
    const row = raw as Record<string, unknown>;
    const text = typeof row.text === 'string' ? row.text.trim() : '';
    if (!text) return [];
    return [{ text, pages: normalizeExamGlobalPages(row.pages, allowedPages) }];
  });
}

function normalizeExamGlobalManifestDraft(
  raw: string,
  materialLinkId: string,
  fileName: string,
  allowedPages: Set<number>,
): ExamGlobalMaterialManifest {
  const parsed = parseJsonObject(raw);
  const conceptsRaw = Array.isArray(parsed.concepts) ? parsed.concepts : [];
  return {
    materialLinkId,
    fileName,
    summary: typeof parsed.summary === 'string' ? parsed.summary.trim() : '',
    role: typeof parsed.role === 'string' ? parsed.role.trim() : '',
    mainQuestions: normalizeExamGlobalPageItems(parsed.mainQuestions, allowedPages, 12),
    concepts: conceptsRaw.slice(0, 36).flatMap((rawConcept) => {
      if (!rawConcept || typeof rawConcept !== 'object') return [];
      const row = rawConcept as Record<string, unknown>;
      const nameZh = typeof row.nameZh === 'string' ? row.nameZh.trim() : '';
      const text = typeof row.text === 'string' ? row.text.trim() : '';
      if (!nameZh || !text) return [];
      return [{
        nameZh,
        ...(typeof row.nameEn === 'string' && row.nameEn.trim() ? { nameEn: row.nameEn.trim() } : {}),
        text,
        pages: normalizeExamGlobalPages(row.pages, allowedPages),
      }];
    }),
    claims: normalizeExamGlobalPageItems(parsed.claims, allowedPages, 24),
    evidence: normalizeExamGlobalPageItems(parsed.evidence, allowedPages, 24),
    limitations: normalizeExamGlobalPageItems(parsed.limitations, allowedPages, 18),
  };
}

async function generateExamGlobalManifestPart(input: {
  materialLinkId: string;
  fileName: string;
  sourceText: string;
  allowedPages: Set<number>;
  routeHints?: string[];
  synthesis?: boolean;
  abortSignal?: AbortSignal;
}): Promise<ExamGlobalMaterialManifest> {
  const prompt = `${input.synthesis ? '你正在把同一份考试材料的多个局部清单合并成一个完整清单。' : '你正在为一份考试材料建立忠实、紧凑的全局清单。'}

材料：${input.fileName}
合法 PDF 页码：${[...input.allowedPages].sort((a, b) => a - b).join(', ')}
${input.routeHints?.length ? `已有知识路线提示（只能辅助组织，仍以原文为准）：\n${input.routeHints.join('\n')}` : ''}

要求：
1. 中文为主；术语可保留英文名。
2. 提取材料主题、在考试范围中的作用、主要问题、概念、主张、证据和限制。
3. 每个条目只引用上面的合法页码；无法定位时 pages 为空，禁止猜页码。
4. 不补充材料外知识，不把推断伪装成原文。
5. 返回结构化 JSON。

${input.synthesis ? '局部清单：' : '按页原文：'}
${input.sourceText}`;
  const response = await ai.models.generateContent({
    model: 'gemini-3.1-pro-preview',
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    config: {
      responseMimeType: 'application/json',
      responseSchema: EXAM_GLOBAL_MANIFEST_SCHEMA,
      ...(input.abortSignal ? { abortSignal: input.abortSignal } : {}),
    },
  });
  return normalizeExamGlobalManifestDraft(
    response.text || '{}',
    input.materialLinkId,
    input.fileName,
    input.allowedPages,
  );
}

export async function generateExamGlobalMaterialManifest(
  input: GenerateExamGlobalMaterialManifestInput,
): Promise<ExamGlobalMaterialManifest> {
  const allowedPages = new Set(input.batches.flatMap((batch) => batch.pages));
  if (!input.batches.length || allowedPages.size === 0) {
    throw new Error('这份材料没有可用于建立全局地图的文本页。');
  }
  const parts: ExamGlobalMaterialManifest[] = [];
  for (const batch of input.batches) {
    parts.push(await generateExamGlobalManifestPart({
      materialLinkId: input.materialLinkId,
      fileName: input.fileName,
      sourceText: batch.text,
      allowedPages: new Set(batch.pages),
      routeHints: input.routeHints,
      abortSignal: input.abortSignal,
    }));
  }
  if (parts.length === 1) return parts[0]!;
  return generateExamGlobalManifestPart({
    materialLinkId: input.materialLinkId,
    fileName: input.fileName,
    sourceText: JSON.stringify(parts),
    allowedPages,
    routeHints: input.routeHints,
    synthesis: true,
    abortSignal: input.abortSignal,
  });
}

export async function generateExamGlobalMaterialConnections(input: {
  manifests: ExamGlobalMaterialManifest[];
  abortSignal?: AbortSignal;
}): Promise<ExamGlobalMaterialConnection[]> {
  if (input.manifests.length < 2) return [];
  const response = await ai.models.generateContent({
    model: 'gemini-3.1-pro-preview',
    contents: [{
      role: 'user',
      parts: [{ text: `根据下面的考试材料清单，提炼跨材料的共同主题、支持、冲突、互补或推进顺序。只能使用清单已有的 materialLinkId 和页码；不补充外部事实。\n\n${JSON.stringify(input.manifests)}` }],
    }],
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          connections: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                description: { type: Type.STRING },
                kind: { type: Type.STRING, enum: ['common_theme', 'support', 'conflict', 'complement', 'sequence'] },
                materialLinkIds: { type: Type.ARRAY, items: { type: Type.STRING } },
                pageRefs: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      materialLinkId: { type: Type.STRING },
                      pages: { type: Type.ARRAY, items: { type: Type.INTEGER } },
                    },
                    required: ['materialLinkId', 'pages'],
                  },
                },
              },
              required: ['title', 'description', 'kind', 'materialLinkIds', 'pageRefs'],
            },
          },
        },
        required: ['connections'],
      },
      ...(input.abortSignal ? { abortSignal: input.abortSignal } : {}),
    },
  });
  const parsed = parseJsonObject(response.text || '{}');
  const rows = Array.isArray(parsed.connections) ? parsed.connections : [];
  const manifestById = new Map(input.manifests.map((manifest) => [manifest.materialLinkId, manifest]));
  const allowedPagesById = new Map(input.manifests.map((manifest) => [
    manifest.materialLinkId,
    new Set([
      ...manifest.mainQuestions.flatMap((item) => item.pages),
      ...manifest.concepts.flatMap((item) => item.pages),
      ...manifest.claims.flatMap((item) => item.pages),
      ...manifest.evidence.flatMap((item) => item.pages),
      ...manifest.limitations.flatMap((item) => item.pages),
    ]),
  ]));
  return rows.slice(0, 16).flatMap((raw) => {
    if (!raw || typeof raw !== 'object') return [];
    const row = raw as Record<string, unknown>;
    const title = typeof row.title === 'string' ? row.title.trim() : '';
    const description = typeof row.description === 'string' ? row.description.trim() : '';
    const kind = typeof row.kind === 'string' && ['common_theme', 'support', 'conflict', 'complement', 'sequence'].includes(row.kind)
      ? row.kind as ExamGlobalMaterialConnection['kind']
      : 'common_theme';
    const ids = Array.isArray(row.materialLinkIds)
      ? [...new Set(row.materialLinkIds.filter((id): id is string => typeof id === 'string' && manifestById.has(id)))]
      : [];
    if (!title || !description || ids.length < 2) return [];
    const pageRefs = Array.isArray(row.pageRefs) ? row.pageRefs.flatMap((rawRef) => {
      if (!rawRef || typeof rawRef !== 'object') return [];
      const ref = rawRef as Record<string, unknown>;
      const materialLinkId = typeof ref.materialLinkId === 'string' ? ref.materialLinkId : '';
      const allowed = allowedPagesById.get(materialLinkId);
      if (!allowed || !ids.includes(materialLinkId)) return [];
      return [{ materialLinkId, pages: normalizeExamGlobalPages(ref.pages, allowed) }];
    }) : [];
    return [{ title, description, kind, materialLinkIds: ids, pageRefs }];
  });
}

export interface ChatWithExamGlobalAssistantInput {
  examTitle: string;
  materialMemoryJson: string;
  unavailableMaterialNames: string[];
  retrievedChunks: Array<{
    chunkId: string;
    materialLinkId: string;
    materialName: string;
    page: number;
    text: string;
  }>;
  recentTurns: ExamGlobalChatTurn[];
  rollingSummary?: string;
  userMessage: string;
  allowExternalKnowledge: boolean;
  materialMapComplete: boolean;
  abortSignal?: AbortSignal;
}

export async function chatWithExamGlobalAssistant(input: ChatWithExamGlobalAssistantInput): Promise<string> {
  const evidence = input.retrievedChunks.map((chunk) => (
    `[${chunk.chunkId}] material=${chunk.materialLinkId} file=${chunk.materialName} page=${chunk.page}\n${chunk.text}`
  )).join('\n\n');
  const systemInstruction = `你是备考工作台中的“整场考试对话”助手。你像普通 GPT 一样直接、自然地回答用户，但默认只依据当前考试材料。

硬规则：
1. 中文为主，必要英文术语放在括号里。不要自动进入苏格拉底式追问，不要评价掌握度、进度或学习证据。
2. 材料事实必须来自本轮原文片段；在相关句末输出 †chunkId†。只能引用本轮提供的 chunkId，禁止编造材料、页码或引用。
3. 全局材料地图帮助你理解结构，但它不是证据；事实仍要由本轮片段引用。若证据不足，明确说“当前材料中没有找到”或说明当前地图仍未完成。
4. 跨材料综合必须写成“根据这些材料可以推断/综合来看”，不能冒充某一页的原话。
5. ${input.allowExternalKnowledge
    ? '用户本轮明确要求材料外知识。材料内回答之后，可增加独立标题“材料外补充”，其中不得输出任何 † 引用，并提醒它不是考试材料原文。'
    : '用户没有明确要求材料外知识。禁止用模型常识补空白；不要增加“材料外补充”。'}
6. 不要输出文末 citations JSON；只使用 †chunkId†。`;
  const contents: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> = [{
    role: 'user',
    parts: [{ text: `考试：${input.examTitle}\n材料地图完整：${input.materialMapComplete ? '是' : '否'}\n不可用材料：${input.unavailableMaterialNames.join('、') || '无'}\n\n全局材料地图（结构参考，不能直接当证据）：\n${input.materialMemoryJson}` }],
  }];
  if (input.rollingSummary?.trim()) {
    contents.push({ role: 'user', parts: [{ text: `较早对话摘要（只用于记住讨论脉络，不是材料证据）：\n${input.rollingSummary}` }] });
  }
  input.recentTurns.slice(-18).forEach((turn) => {
    contents.push({ role: turn.role, parts: [{ text: turn.text }] });
  });
  contents.push({
    role: 'user',
    parts: [{ text: `用户当前问题：\n${input.userMessage}\n\n本轮可引用原文片段：\n${evidence || '（本轮没有检索到可定位原文；必须明确说明，不能猜测。）'}` }],
  });
  const response = await ai.models.generateContent({
    model: 'gemini-3.1-pro-preview',
    contents,
    config: {
      systemInstruction,
      ...(input.abortSignal ? { abortSignal: input.abortSignal } : {}),
    },
  });
  return response.text?.trim() || '没有生成有效回答，请重试。';
}

export async function summarizeExamGlobalConversation(input: {
  previousSummary?: string;
  turns: ExamGlobalChatTurn[];
  abortSignal?: AbortSignal;
}): Promise<string> {
  if (!input.turns.length) return input.previousSummary ?? '';
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: [{ role: 'user', parts: [{ text: `把下面的考试讨论压缩为不超过 900 字的中文对话记忆。保留用户问过的问题、重要概念、已经形成的结论、仍未解决的问题；不要把它写成材料证据，也不要添加新事实。\n\n旧摘要：${input.previousSummary ?? '无'}\n\n新增对话：${input.turns.map((turn) => `${turn.role === 'user' ? '用户' : 'AI'}：${turn.text}`).join('\n')}` }] }],
    config: input.abortSignal ? { abortSignal: input.abortSignal } : undefined,
  });
  return response.text?.trim() || input.previousSummary || '';
}

export async function generateExamGlobalQuiz(input: {
  questionText: string;
  answerText: string;
  citations: ExamGlobalCitation[];
  abortSignal?: AbortSignal;
}): Promise<ExamGlobalQuiz> {
  const response = await ai.models.generateContent({
    model: 'gemini-3.1-pro-preview',
    contents: [{ role: 'user', parts: [{ text: `只根据下面的问题、回答与材料证据，生成 2-4 道轻量提取题。可以是选择题、简答题或概念题；不要提前在题面透露答案。sourceChunkIds 只能使用证据清单中的 id。\n\n原问题：${input.questionText}\n\n回答：${input.answerText}\n\n证据：${JSON.stringify(input.citations)}` }] }],
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          questions: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                kind: { type: Type.STRING, enum: ['choice', 'short_answer', 'concept'] },
                prompt: { type: Type.STRING },
                options: { type: Type.ARRAY, items: { type: Type.STRING } },
                answer: { type: Type.STRING },
                explanation: { type: Type.STRING },
                sourceChunkIds: { type: Type.ARRAY, items: { type: Type.STRING } },
              },
              required: ['id', 'kind', 'prompt', 'answer', 'explanation', 'sourceChunkIds'],
            },
          },
        },
        required: ['title', 'questions'],
      },
      ...(input.abortSignal ? { abortSignal: input.abortSignal } : {}),
    },
  });
  const parsed = parseJsonObject(response.text || '{}');
  const citationByChunk = new Map(input.citations.map((citation) => [citation.chunkId, citation]));
  const questions = Array.isArray(parsed.questions) ? parsed.questions.slice(0, 4).flatMap((raw, index) => {
    if (!raw || typeof raw !== 'object') return [];
    const row = raw as Record<string, unknown>;
    const prompt = typeof row.prompt === 'string' ? row.prompt.trim() : '';
    const answer = typeof row.answer === 'string' ? row.answer.trim() : '';
    if (!prompt || !answer) return [];
    const kind = typeof row.kind === 'string' && ['choice', 'short_answer', 'concept'].includes(row.kind)
      ? row.kind as ExamGlobalQuizQuestion['kind']
      : 'short_answer';
    const sourceIds = Array.isArray(row.sourceChunkIds)
      ? row.sourceChunkIds.filter((id): id is string => typeof id === 'string' && citationByChunk.has(id))
      : [];
    return [{
      id: typeof row.id === 'string' && row.id.trim() ? row.id.trim() : `q-${index + 1}`,
      kind,
      prompt,
      ...(kind === 'choice' && Array.isArray(row.options)
        ? { options: row.options.filter((option): option is string => typeof option === 'string').slice(0, 5) }
        : {}),
      answer,
      explanation: typeof row.explanation === 'string' ? row.explanation.trim() : '',
      citations: [...new Set(sourceIds)].map((id) => citationByChunk.get(id)!),
    }];
  }) : [];
  if (questions.length < 2) throw new Error('没有生成足够的小测题，请重试。');
  return {
    title: typeof parsed.title === 'string' && parsed.title.trim() ? parsed.title.trim() : '根据这个问题考考我',
    questions,
  };
}

export async function gradeExamGlobalQuiz(input: {
  quiz: ExamGlobalQuiz;
  answers: Record<string, string>;
  abortSignal?: AbortSignal;
}): Promise<ExamGlobalQuizFeedback[]> {
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: [{ role: 'user', parts: [{ text: `根据标准答案与材料证据，简短核对用户的小测回答。不要更新或声称任何掌握状态。每题只能判为 correct、partial 或 incorrect。\n\n${JSON.stringify({ quiz: input.quiz, answers: input.answers })}` }] }],
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          feedback: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                questionId: { type: Type.STRING },
                verdict: { type: Type.STRING, enum: ['correct', 'partial', 'incorrect'] },
                feedback: { type: Type.STRING },
              },
              required: ['questionId', 'verdict', 'feedback'],
            },
          },
        },
        required: ['feedback'],
      },
      ...(input.abortSignal ? { abortSignal: input.abortSignal } : {}),
    },
  });
  const parsed = parseJsonObject(response.text || '{}');
  const ids = new Set(input.quiz.questions.map((question) => question.id));
  return Array.isArray(parsed.feedback) ? parsed.feedback.flatMap((raw) => {
    if (!raw || typeof raw !== 'object') return [];
    const row = raw as Record<string, unknown>;
    const questionId = typeof row.questionId === 'string' ? row.questionId : '';
    if (!ids.has(questionId)) return [];
    const verdict = typeof row.verdict === 'string' && ['correct', 'partial', 'incorrect'].includes(row.verdict)
      ? row.verdict as ExamGlobalQuizFeedback['verdict']
      : 'partial';
    return [{
      questionId,
      verdict,
      feedback: typeof row.feedback === 'string' ? row.feedback.trim() : '',
    }];
  }) : [];
}
