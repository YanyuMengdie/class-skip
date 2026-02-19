# 逃课神器 - 部署说明

## 方式一：Vercel 部署（推荐）

1. **把项目推到 GitHub**
   - 在项目目录执行：
   ```bash
   git init
   git add .
   git commit -m "deploy"
   ```
   - 在 GitHub 新建仓库，按提示 `git remote add origin <你的仓库地址>` 并 `git push -u origin main`。

2. **在 Vercel 部署**
   - 打开 [vercel.com](https://vercel.com)，用 GitHub 登录。
   - 点击 **Add New → Project**，选择刚推送的仓库。
   - **重要**：在 **Environment Variables** 里添加：
     - 名称：`GEMINI_API_KEY`
     - 值：你的 Gemini API Key（在 [Google AI Studio](https://aistudio.google.com/apikey) 获取）
   - 点击 **Deploy**，等待构建完成即可获得访问链接。

3. **后续更新**
   - 代码推送到 GitHub 后，Vercel 会自动重新部署。

---

## 方式二：本地构建后上传

1. **配置 API Key 后构建**
   ```bash
   # 在项目根目录创建 .env 文件，内容：
   # GEMINI_API_KEY=你的Gemini_API_Key

   npm install
   npm run build
   ```
   构建产物在 `dist/` 目录。

2. **托管 dist 目录**
   - 把 `dist/` 里的全部文件上传到任意静态托管（如 Netlify Drop、GitHub Pages、自己的服务器 Nginx 等）即可。

---

## 环境变量说明

| 变量名 | 说明 |
|--------|------|
| `GEMINI_API_KEY` | Google Gemini API 密钥，用于 AI 解读、上课整理等功能。未设置时相关功能会报错。 |

Firebase（登录、云同步）已在代码中配置，无需额外环境变量。
