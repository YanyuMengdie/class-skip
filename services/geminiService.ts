
import { GoogleGenAI, Type } from "@google/genai";
import { ChatMessage, StudyMap, Prerequisite, QuizData, DocType, PersonaSettings, StudyGuideContent, StudyGuideFormat, TurtleSoupPuzzle, MindMapNode, MindMapMultiResult, MindMapEvaluateResult, LSAPContentMap, LSAPKnowledgeComponent, LogicAtom, DisciplineBand, LearnerMood, UrgencyBand, LearnerTurnQuality, TutorScaffoldingContext, KCScopedTutorContext, MultiKCScopedTutorContext, ExamMaterialLink, RetrievedChunk } from "@/types";
import { buildDialogueTeachingSystemPrompt } from "@/data/disciplineTeachingProfiles";
import { buildScaffoldingTurnDirective, getScaffoldingSystemAddendum } from "@/data/scaffoldingPrompt";
import { heuristicQuality } from "@/lib/exam/scaffoldingClassifier";
import { CLASSIFIER_PROMPT, STEM_SYSTEM_PROMPT, HUMANITIES_SYSTEM_PROMPT } from "@/lib/prompts/systemPrompts";

// Ensure API Key exists or fail gracefully in logs (though process.env check is assumed handled elsewhere)
const apiKey = process.env.API_KEY || "";
const ai = new GoogleGenAI({ apiKey: apiKey });

export interface TaskHugResponse {
  message: string;
  steps: string[];
}

const DEFAULT_ERROR_SCRIPT = [
    "(鞠躬) 对不起...",
    "可能是因为信号不好，我无法读取这份文件。",
    "请尝试重新上传一下吧！"
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
    return '（暂无转写内容，无法整理）';
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

// Interface for internal JSON handling
interface ExplanationJSON {
  summary: string;
  key_points: string[];
  deep_dive: {
    title: string;
    content: string;
    interactive_question: string;
  };
}

export const generateSlideExplanation = async (imageBase64: string, fullContext?: string): Promise<string> => {
  const parts = imageBase64.split(',');
  const base64Data = parts[1];
  const mimeType = parts[0].split(';')[0].split(':')[1] || 'image/png';

  // 【系统指令：全科自适应深度导师 (中文版)】
  const systemInstruction = `
  角色：你是一位博学多才的顶级教授，精通文理。你拥有整本书的记忆。
  **语言约束：无论 Slide 内容是英文还是中文，你必须始终使用【简体中文】进行讲解。**
  
  [你的大脑 - 完整文档记忆]
  <<<文档开始>>>
  ${fullContext ? fullContext.slice(0, 80000) : "未提供上下文"} 
  <<<文档结束>>>

  [你的核心能力：学科自适应解析]
  当用户展示一张 Slide 时，你必须首先**识别学科类型**，然后采用不同的讲解策略：

  **🔴 场景 A：理科/工科 (STEM - 数学, 物理, 生物, 计算机)**
  - **特征**：包含公式、代码、图表、分子结构、解剖图。
  - **讲解策略 (深度解码)**：
    1.  **拒绝简略**：严禁只给摘要。必须像老师板书一样拆解过程。
    2.  **深度推导**：如果 Slide 有公式，**必须**使用 LaTeX 格式完整复写并逐项解释变量含义。不要跳过步骤。
    3.  **视觉拆解**：对于手写笔记或图表，解释每一个标注、每一个箭头的物理/生物意义。
    4.  **上下文连贯**：如果是推导的中间步骤，明确指出“这一步承接了上一页的...”。

  **🔵 场景 B：人文/社科 (Humanities - 哲学, 历史, 文学, 艺术)**
  - **特征**：主要是文本、论点、历史事件、艺术作品。
  - **讲解策略 (批判性分析)**：
    1.  **论证拆解**：不要只翻译文字。要分析作者的 **前提 (Premise)**、**推论 (Inference)** 和 **结论 (Conclusion)**。
    2.  **历史背景**：利用全书记忆，解释这个观点是在回应历史上的哪场争论？
    3.  **深度赏析**：如果是艺术/文学，分析其隐喻、象征意义。

  [输出格式 - 严格 JSON (四大板块)]
  请严格按照以下结构返回 JSON：
  {
    "summary": "1. 核心摘要：\n一段流畅的中文摘要。理科讲“这一页解决了什么计算难题”，文科讲“这一页提出了什么核心论点”。如果是连续推导，请先承接上文。",
    
    "key_points": [
      "2. 关键概念：",
      "概念 1：定义 + 详细解释 (中文)",
      "概念 2：定义 + 详细解释 (中文)"
    ],
    
    "deep_dive": {
      "title": "3. 详细解析 (自动生成的标题)", 
      "content": "这里是核心内容，必须非常详细且长。请使用 Markdown 分层：\n\n**A. 场景与背景 (Context)**\n(理科：解释初始物理模型/数学设定；文科：解释历史背景)\n\n**B. 核心推导/论证 (The Core)**\n(这是重点！理科：**Step-by-Step 的公式推导**，务必用 LaTeX；文科：**逻辑论证的拆解**。请把页面上的每一个细节都讲清楚。)\n\n**C. 结论与意义 (Conclusion)**\n(理科：公式的物理含义；文科：理论的深远影响)\n\n---\n\n**4. 视觉逻辑流 (Visual Logic)**\n(请用箭头图表示逻辑链条)\n(示例：\`[ 初始状态 ] ➔ [ 关键变换 ] ➔ [ 最终结果 ]\`)",
      "interactive_question": "一个符合学科特色的深度思考题 (中文)。"
    }
  }
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: {
        parts: [
          { inlineData: { mimeType: mimeType, data: base64Data } },
          {
            text: `请深度讲解这张 Slide。
            **要求：**
            1. **必须用中文回答。**
            2. 先判断学科类型 (STEM 或 Humanities)，应用相应的深度策略。
            3. 字数要多，解释要细，逻辑要严密。`
          },
        ],
      },
      config: {
        systemInstruction: systemInstruction,
        responseMimeType: 'application/json'
      }
    });

    const jsonText = response.text || "{}";
    
    // Parse JSON
    let data: ExplanationJSON;
    try {
        data = JSON.parse(jsonText);
    } catch (e) {
        // Fallback for malformed JSON
        console.warn("JSON Parse Error on Explanation, falling back to raw text", e);
        const clean = cleanJsonString(jsonText);
        try {
            data = JSON.parse(clean);
        } catch (e2) {
             return "生成讲解失败，请稍后重试。";
        }
    }

    // Convert Structured JSON to Markdown for UI compatibility
    // Enforcing the Visual Appearance of the 4 Sections
    const markdownOutput = `
# ${data.deep_dive.title}

> **💡 核心摘要**: ${data.summary}

## 🔑 关键概念
${data.key_points.map(k => `- ${k}`).join('\n')}

## 📘 详细解析
${data.deep_dive.content}

---
**🤔 思考**: ${data.deep_dive.interactive_question}
    `.trim();

    return markdownOutput;

  } catch (error) {
    console.error("Error generating explanation:", error);
    return "生成讲解失败，请稍后重试。";
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
  userImageBase64?: string,
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
      if (msg.image && msg.role === 'user') {
        const imgP = msg.image.split(',');
        const imgData = imgP[1];
        const imgMime = imgP[0].split(';')[0].split(':')[1] || 'image/png';
        parts.push({ inlineData: { mimeType: imgMime, data: imgData } });
      }
      contents.push({ role: msg.role, parts: parts });
    });

    let messageForModel = newMessage;
    if (mode === 'standard' && scaffolding) {
      messageForModel = `${newMessage}\n\n${buildScaffoldingTurnDirective(scaffolding)}`;
    }

    const currentParts: any[] = [{ text: messageForModel }];
    if (userImageBase64) {
      const uParts = userImageBase64.split(',');
      const uImgData = uParts[1];
      const uImgMime = uParts[0].split(';')[0].split(':')[1] || 'image/png';
      currentParts.push({ inlineData: { mimeType: uImgMime, data: uImgData } });
    }
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
      model: 'gemini-3-pro-preview',
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
    return '抱歉，回答时遇到问题，请稍后重试。';
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
            model: 'gemini-3-pro-preview',
            contents: [
                { role: 'user', parts: parts }
            ],
            config: {
                responseMimeType: 'application/json'
            }
        });

        if (!response.text) return DEFAULT_ERROR_SCRIPT;

        const cleanedText = cleanJsonString(response.text);
        let parsedData = [];

        try {
            parsedData = JSON.parse(cleanedText);
        } catch (jsonError) {
            console.error("JSON Parse failed:", jsonError);
            return DEFAULT_ERROR_SCRIPT;
        }

        if (Array.isArray(parsedData) && parsedData.length > 0) {
            return parsedData.map(item => String(item));
        }
        
        return DEFAULT_ERROR_SCRIPT;

    } catch (error) {
        console.error("Gemini API Error:", error);
        return DEFAULT_ERROR_SCRIPT;
    }
};

// Legacy re-exports - FIXED TO PASS ARGS
export const generateRemStoryScript = (t: string, i?: string[], p?: PersonaSettings) => generatePersonaStoryScript(t, i, p);

export const runTaskHugAgent = async (userGoal: string): Promise<TaskHugResponse> => {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
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
      model: 'gemini-3-pro-preview',
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
      model: 'gemini-3-pro-preview',
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
      model: 'gemini-3-pro-preview',
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

/** 根据当前阅读阶段对话，生成本模块 3–5 条要点（关键要记下来的）。 */
export const generateModuleTakeaways = async (
  readingMessages: ChatMessage[],
  docType: DocType
): Promise<string[]> => {
  try {
    const convoText = readingMessages
      .map((m) => `${m.role === 'user' ? '用户' : '导读'}: ${m.text}`)
      .join('\n\n');
    if (!convoText.trim()) return [];

    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: `你正在做${docType === 'HUMANITIES' ? '社科/人文' : '理科'}文档的导读。以下是当前模块的对话记录。请根据对话内容，提炼出 3–5 条「本模块关键要点」，适合用户记下来或复述以加深记忆。每条一句话，直接、可背诵。\n\n【对话记录】\n${convoText.slice(-12000)}\n\n请返回 JSON：{ "takeaways": ["要点1", "要点2", ...] }`
            }
          ]
        }
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            takeaways: { type: Type.ARRAY, items: { type: Type.STRING } }
          },
          required: ["takeaways"]
        }
      }
    });
    if (!response.text) return [];
    const parsed = JSON.parse(response.text) as { takeaways: string[] };
    return Array.isArray(parsed.takeaways) ? parsed.takeaways : [];
  } catch (error) {
    console.error("generateModuleTakeaways Error:", error);
    return [];
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
      model: 'gemini-3-pro-preview',
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
      model: 'gemini-3-pro-preview',
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
      model: 'gemini-3-pro-preview',
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
      model: 'gemini-3-pro-preview',
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
      model: 'gemini-3-pro-preview',
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
      model: 'gemini-3-pro-preview',
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
      model: 'gemini-3-pro-preview',
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
      model: 'gemini-3-pro-preview',
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
      model: 'gemini-3-pro-preview',
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
      model: 'gemini-3-pro-preview',
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
      model: 'gemini-3-pro-preview',
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
    return '（生成 5 分钟速览失败，请稍后重试）';
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
      model: 'gemini-3-pro-preview',
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
      model: 'gemini-3-pro-preview',
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
      model: 'gemini-3-pro-preview',
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
      model: 'gemini-3-pro-preview',
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
      model: 'gemini-3-pro-preview',
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
      model: 'gemini-3-pro-preview',
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
      model: 'gemini-3-pro-preview',
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
      model: 'gemini-3-pro-preview',
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
      return `- \`${id}\` ｜ ${sum}`;
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
export function appendReadingModeUserMessageSuffix(
  newMessage: string,
  readingOptions?: { skimGranularity?: 'fine' | 'standard' | 'coarse'; studyMapBriefing?: string; moduleCount?: number }
): string {
  if (!readingOptions) {
    return newMessage;
  }
  const n = readingOptions.moduleCount;
  const hasModuleCount = typeof n === 'number' && n >= 2 && n <= 8;
  const brief = readingOptions.studyMapBriefing?.trim();

  let out = newMessage;

  if (brief) {
    out +=
      "\n\n【必须一致】模块数量、标题与页码范围以紧接其下的学习地图为准。深度领读时必须与该地图保持一致，禁止擅自合并、删减模块或另起一套块数不同的大模块列表：\n\n" +
      brief;
  } else if (hasModuleCount) {
    out += `\n\n【领读模块数】请将文档拆解为 ${n} 个大模块后再输出逻辑路线图与带读。本次要求：${n} 个模块。`;
  }
  if (!hasModuleCount && !brief && readingOptions.skimGranularity) {
    out +=
      "\n\n【领读模块数】请将文档拆解为以下数量的大模块后再输出逻辑路线图与带读：fine 为 5-7 个，standard 为 3-5 个，coarse 为 2-3 个。本次要求：" +
      readingOptions.skimGranularity +
      "。";
  }
  return out;
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
            model: 'gemini-3-pro-preview',
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
  readingOptions?: { skimGranularity?: 'fine' | 'standard' | 'coarse'; studyMapBriefing?: string; moduleCount?: number },
  abortSignal?: AbortSignal
): Promise<string> {
  try {
    const contentPart = getContentPart(docContent);
    const contents: Array<{ role: 'user' | 'model'; parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> }> = [];
    const systemInstruction = docType === 'HUMANITIES' ? HUMANITIES_SYSTEM_PROMPT : STEM_SYSTEM_PROMPT;

    contents.push({
      role: 'user',
      parts: [
        contentPart,
        { text: `Current Mode: ${mode === 'tutoring' ? 'Recursive Tutoring' : 'Deep Lead-Reading (Phase 1/2)'}` }
      ]
    });

    history.forEach((msg) => {
      contents.push({ role: msg.role, parts: [{ text: msg.text }] });
    });

    let finalMessage = newMessage;
    if (mode === 'reading' && readingOptions) {
      finalMessage = appendReadingModeUserMessageSuffix(newMessage, readingOptions);
    }

    contents.push({ role: 'user', parts: [{ text: finalMessage }] });

    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
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
    return '通信中断，请重试。';
  }
}

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
      model: 'gemini-3-pro-preview',
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
- concept: 概念名称
- definition: 简短定义（一句）
- reviewFocus: 复习重点（一句话，严格基于本段）
- sourcePages: 出现过的页码数组（从本段结构推断，如 [1,2,3]）
- examWeight: 考试权重 1-5（5 最重要）
- bloomTargetLevel: 布鲁姆目标层级 1-3（1=记忆/理解，2=应用，3=分析/综合）

请**充分覆盖本段/本讲的核心可考点**，数量随内容复杂度增加；软上限约 **40 个 KC**（内容极少时可少于 5）。输出 JSON：{ "id": "content-map-xxx", "sourceKey": "doc", "kcs": [ ... ], "createdAt": 0 }
createdAt 请填当前时间戳（毫秒）。`
      : `根据以下文档内容，提取「知识组件」(KC)，用于考前掌握度评估。要求严格依据文档，不编造。

对每个知识组件输出：
- id: 唯一标识，如 kc-0, kc-1
- concept: 概念名称
- definition: 简短定义（一句）
- reviewFocus: 复习重点（一句话，便于复习时扫一眼知道要学什么，严格基于文档）
- sourcePages: 出现过的页码数组（从文档结构推断，如 [1,2,3]）
- examWeight: 考试权重 1-5（5 最重要）
- bloomTargetLevel: 布鲁姆目标层级 1-3（1=记忆/理解，2=应用，3=分析/综合）

请覆盖文档中的核心考点，数量 5-15 个。输出 JSON：{ "id": "content-map-xxx", "sourceKey": "doc", "kcs": [ ... ], "createdAt": 0 }
createdAt 请填当前时间戳（毫秒）。`;
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
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
                  reviewFocus: { type: Type.STRING },
                  sourcePages: { type: Type.ARRAY, items: { type: Type.INTEGER } },
                  sourceExcerpt: { type: Type.STRING },
                  examWeight: { type: Type.NUMBER },
                  bloomTargetLevel: { type: Type.INTEGER }
                },
                required: ['id', 'concept', 'definition', 'sourcePages', 'examWeight', 'bloomTargetLevel']
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

    const kcSummaries = copy.kcs
      .map(
        (k) =>
          `- id=${k.id}; concept=${k.concept}; definition=${(k.definition || '').slice(0, 200)}; examWeight=${k.examWeight ?? 3}; bloomTargetLevel=${k.bloomTargetLevel ?? 1}`
      )
      .join('\n');

    const prompt = `你是课程分析助手。下面「DOCUMENT」为${docLabel}（唯一事实来源）。上面列出了已提取的考点（KC）列表。

任务：为**每一个** KC 输出若干「逻辑原子」——能独立判断真假的**最小命题/推理单元**，用于衡量讲义中的命题密度与后续覆盖统计。

硬性规则：
1. 严格依据 DOCUMENT，禁止引入讲义外知识；不要编造页码。
2. 每个 KC 输出 **3～8** 条原子：examWeight 越高、bloomTargetLevel 越高，倾向于取**更多**条（仍不超过 8）。
3. 每条原子用简短 label（≤40 字）+ description（1～2 句，可复述讲义可核对的内容）。
4. 必须覆盖列表中的**全部** KC id；某 KC 在文档中信息极少时可少至 3 条，但不要留空数组。
5. 输出 JSON 仅含 perKc 数组：每项含 kcId（与输入 id 一致）与 atoms（label + description，不要含 id 字段）。

KC 列表：
${kcSummaries}`;

    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
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
                  atoms: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        label: { type: Type.STRING },
                        description: { type: Type.STRING },
                      },
                      required: ['label', 'description'],
                    },
                  },
                },
                required: ['kcId', 'atoms'],
              },
            },
          },
          required: ['perKc'],
        },
      },
    });

    if (!response.text) return null;
    const parsed = JSON.parse(response.text) as { perKc?: Array<{ kcId: string; atoms: Array<{ label: string; description: string }> }> };
    const rows = parsed.perKc;
    if (!Array.isArray(rows)) return null;

    const byKcId = new Map<string, Array<{ label: string; description: string }>>();
    for (const row of rows) {
      if (!row?.kcId) continue;
      if (!byKcId.has(row.kcId)) byKcId.set(row.kcId, row.atoms ?? []);
    }

    for (const kc of copy.kcs) {
      const rawAtoms = byKcId.get(kc.id) ?? [];
      const atoms: LogicAtom[] = rawAtoms.map((a, index) => ({
        id: `atom-${kc.id}-${index}`,
        kcId: kc.id,
        label: (a.label || '').trim() || `原子 ${index + 1}`,
        description: (a.description || '').trim() || '—',
      }));
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
      model: 'gemini-3-pro-preview',
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
      model: 'gemini-3-pro-preview',
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
      model: 'gemini-3-pro-preview',
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
      model: 'gemini-3-pro-preview',
      contents: parts
    });
    return response.text?.trim() || '请对照讲义再想想，或点击「查看讲义」看具体页码。';
  } catch (e) {
    console.error('answerLSAPTeachingQuestion Error:', e);
    return '回答生成失败，请重试或直接查看讲义对应页码。';
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
            model: 'gemini-3-pro-preview',
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
