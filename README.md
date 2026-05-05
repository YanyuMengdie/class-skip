<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/1ySZ0q5YSZWHgOICdfUBc74N2HydgsXLI

## Run Locally

**Prerequisites:**  Node.js

1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

### 开发调试建议

**上传 PDF 时请使用外部浏览器（如 Chrome）打开：**  
在浏览器地址栏输入 **http://localhost:3000** 进行访问。  

Cursor 内置 Browser Tab 预览对文件上传、PDF Worker 等存在兼容限制，可能导致「处理中」卡住或无法选择文件。使用系统浏览器可避免此类问题。

### 备考引用：chunk 索引与检索（1-1 / 1-2）

- **1-1**：PDF 切块持久化至 IndexedDB（`services/examChunkIndexStorage.ts`）。
- **1-2**：`features/exam/lib/examChunkRetrieval.ts` 使用 **Okapi BM25**（自研轻量实现，**无额外 npm 依赖、无向量 API**）。中文为单字 + 二字 bigram 与英文整词混合分词；调试可加 `?debug=1` 在备考台底部试检索。
- **1-3**：用户每轮发送后按 `workspaceKey` 检索，非空则向 `chatWithAdaptiveTutor` 注入 **†chunkId†** 白名单；检索为空时**不**注入 chunk 约束，模型侧**回退**与 1-3 前相同的文末 `citations` JSON 协议。助手回复经 `parseExamWorkspaceModelReply` 剥离暗号并校验链钮。
- **1-4**：多材料同场合并为单条 IndexedDB 记录；`retrieveCandidateChunks` 在**整场** chunk 上检索（可选「仅当前预览材料」筛选）。无索引 / 检索空 / 检索失败时**不**注入 chunk 附录，仅文末 JSON；合并讲义仍以 `mergedContent` 作辅助上下文，**引用以 chunk 白名单或降级 JSON 为准**。

### 略读 vs 备考对话 API

- **备考工作台苏格拉底**：`services/geminiService.ts` 的 **`chatWithAdaptiveTutor`**（可注入 chunk / citations、KC、支架等）。
- **略读 / 智能导读（`SkimPanel`）**：**`chatWithSkimAdaptiveTutor`**，`systemInstruction` 为 **`lib/prompts/systemPrompts.ts`** 的 STEM/HUMANITIES 长提示，与上者分离。
