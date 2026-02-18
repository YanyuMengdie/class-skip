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
