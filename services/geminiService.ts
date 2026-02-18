
import { GoogleGenAI, Type } from "@google/genai";
import { ChatMessage, StudyMap, Prerequisite, QuizData, DocType, PersonaSettings } from "../types";
import { CLASSIFIER_PROMPT, STEM_SYSTEM_PROMPT, HUMANITIES_SYSTEM_PROMPT } from "../utils/prompts";

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
  persona?: PersonaSettings
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

    const currentParts: any[] = [{ text: newMessage }];
    if (userImageBase64) {
      const uParts = userImageBase64.split(',');
      const uImgData = uParts[1];
      const uImgMime = uParts[0].split(';')[0].split(':')[1] || 'image/png';
      currentParts.push({ inlineData: { mimeType: uImgMime, data: uImgData } });
    }
    contents.push({ role: 'user', parts: currentParts });

    let systemPrompt = "";
    
    if (mode === 'galgame' && persona) {
        // DYNAMIC PERSONA PROMPT
        systemPrompt = getPersonaSystemPrompt(persona);
    } else {
        // STANDARD TUTOR PROMPT
        systemPrompt = `You are a helpful study assistant. 
        # VISUAL LOGIC PROTOCOL (No Code Blocks)
        1. **Trigger**: When explaining complex logic (e.g., A leads to B which inhibits C).
        2. **Prohibition**: DO NOT use raw code blocks like Mermaid or Graphviz.
        3. **Solution**: Use **Emoji Flows**.
           - Example: **[ Glucose ]** ➔ 🟢 **[ Insulin ]** ➔ 📉 **[ Blood Sugar ]**
        4. **Style**: Magazine-style readability. No technical jargon dumping.`;
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

export const runChatHugAgent = async (history: ChatMessage[], newMessage: string, mode: any): Promise<string> => {
  return "我在听。";
};

export const performPreFlightDiagnosis = async (docContent: string): Promise<StudyMap | null> => {
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/f7788da6-7262-4420-bc72-576f23e0b7d4',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'geminiService.ts:performPreFlightDiagnosis',message:'entry',data:{},timestamp:Date.now(),hypothesisId:'H1'})}).catch(()=>{});
  // #endregion
  try {
    const contentPart = getContentPart(docContent);
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: [
          { role: 'user', parts: [contentPart, { text: `执行【预飞检查】。识别文档的主题领域，并提取 3-5 个读懂该文档必须具备的基础概念（前置知识）。` }] }
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

export const chatWithAdaptiveTutor = async (
    docContent: string,
    history: ChatMessage[],
    newMessage: string,
    mode: 'tutoring' | 'reading',
    docType: DocType = 'STEM'
): Promise<string> => {
    try {
        const contentPart = getContentPart(docContent);
        const contents = [];
        const adaptiveSystemPrompt = docType === 'HUMANITIES' 
            ? HUMANITIES_SYSTEM_PROMPT 
            : STEM_SYSTEM_PROMPT;

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

        contents.push({ role: 'user', parts: [{ text: newMessage }] });

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
