
import { GoogleGenAI, Type } from "@google/genai";
import { ChatMessage, StudyMap, Prerequisite, QuizData, DocType, PersonaSettings, StudyGuideContent, StudyGuideFormat, TurtleSoupPuzzle } from "../types";
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
3. 分块说明（可加小标题），每块不要太长。
直接输出 Markdown，不要 JSON。`
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

直接输出 Markdown，不要 JSON。数学与公式一律用 LaTeX 行内 $...$ 或块级 $$...$$。`
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
              text: `请根据文档内容，生成一份「考点与陷阱」Markdown，用中文输出，包含：
1. **核心考点**：5～8 个必考知识点，每条一句话概括。
2. **常见陷阱**：3～5 个易错/易混淆点，说明错误思路与正确区分方式。
3. **陷阱题提示**：2～4 道典型陷阱题的题干要点与易错选项特征（不要求完整选项，只写“容易误选…因为…”即可）。

直接输出 Markdown，不要 JSON。`
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

要求：每题包含题干、选项（4 个）、正确答案索引（0-based）、简要解析。用 Markdown 输出，格式示例：
## 第 1 题
**题干** ...
- A. ...
- B. ...
- **答案**：B（索引 1）
**解析**：...

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

/** 生成 Study Guide/Outline */
export const generateStudyGuide = async (
  docContent: string,
  options: { format: StudyGuideFormat }
): Promise<StudyGuideContent | null> => {
  try {
    const contentPart = getContentPart(docContent);
    
    const isDetailed = options.format === 'detailed';
    
    const prompt = isDetailed 
      ? `根据整个文档内容，生成一份**详细的学习指南 (Detailed Study Guide)**。要求：

**1. 章节大纲 (Chapters)**
- 识别文档的所有主要章节和子章节
- 为每个章节标注大致页码范围（如"第1-5页"）
- 列出每个章节下的关键子主题

**2. 核心概念 (Core Concepts)**
- 提取文档中最重要的概念和术语（至少10-15个）
- 为每个概念提供清晰的定义
- 标注重要性等级（high/medium/low）

**3. 学习路径 (Learning Path)**
- 设计一个循序渐进的学习顺序（5-8个步骤）
- 每个步骤包含：标题、详细描述、建议阅读的页码
- 确保步骤之间有逻辑递进关系

**4. 知识点树 (Knowledge Tree)**
- 构建知识点的层级结构
- 根节点：文档的核心主题
- 分支：主要知识领域
- 子分支：具体知识点和细节

**5. 复习建议 (Review Suggestions)**
- 关键要点：列出最重要的复习重点（5-8条）
- 练习建议：提供具体的复习方法和练习方向
- 常见错误：列出学习时容易混淆或出错的地方（可选）

**6. Markdown 格式内容**
- 生成一份完整的 Markdown 格式学习指南
- 包含所有上述内容，格式清晰，层次分明
- 使用 Markdown 语法（标题、列表、表格、代码块等）
- 支持数学公式（使用 LaTeX 格式）

请用中文输出，内容要详细、全面、实用。`
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
