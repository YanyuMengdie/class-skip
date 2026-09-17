> 历史接入说明：当前文字接口已统一改为 Gemini 3.8 Flash，见 [GEMINI_FLASH.md](./GEMINI_FLASH.md)。以下 Astra 说明不代表当前路由。

# 在副本中试用 GPT-6 Astra

`localhost:3008` 副本中，原先的 Gemini 模型调用已统一切换到 GPT-6 Astra。不需要在功能里选择模型；旧资料、讲解缓存、对话和复习记录保留，新生成的内容使用 Astra。

覆盖范围：

- 备考工作台：KC 提取、逻辑原子、主题分组、出题、独立审核、修补、评价、提示、后续追问、整场材料对话和旧版复习工具。
- 学习页面：资料分类、诊断和学习地图、领读、页面讲解与笔记、私教和页面问答、理解与推演练习。
- “我现在不想学”：大白话/故事总览、大白话从头讲、兴趣入口发现与追问。
- 其他 AI 功能：闪卡、小测、术语、思维导图、费曼讲解、学习指南、字幕翻译、课堂笔记、学习档案和陪伴/任务拆解。
- 角色头像与背景图：Astra 调用 OpenAI 图片工具 `gpt-image-2.5-sunburst` 绘制，继续返回原来的图片上传格式。

录音转写仍由 ElevenLabs 负责；Firebase 登录、资料和记录存储沿用原配置。旧内容不会因为换模型自动重生成。历史中原来由 Gemini 产生的模型标记保留，旧轮次后续生成的题目、评价和帮助单独记录实际 Astra 模型。

## 开通与配置

1. 登录 [OpenAI API 平台账单页](https://platform.openai.com/settings/organization/billing/overview)，按页面提示开通 API 付费额度。
2. 在 [API Keys](https://platform.openai.com/api-keys) 创建一个给本项目使用的密钥，妥善保存，不贴进聊天或截图。
3. 打开**副本目录** `/Users/haoshengliu/.codex/worktrees/5bcb/class-skip-v2/.env.local`，找到 `OPENAI_API_KEY=`，在等号后填入密钥并保存。保留其他配置项。
4. 刷新 `http://localhost:3008`，进入主题复习，页面会自动读取配置，新一轮默认使用 **GPT-6 Astra**，直接点击 **准备这一轮**。如果打开页面后才填写密钥，再点击 **刷新配置状态** 即可。密钥从本地文件动态读取，填好后不需要为此重启服务。
5. 使用领读时直接开始或继续讲解即可；新的领读请求默认发送给 Astra。配置或服务失败时可重试，系统不会自动改用 Gemini。
6. 在“我现在不想学”中照常选择讲解方式和 PDF，新生成的内容默认使用同一个 Astra 配置，无需额外设置。

“已读取 API 密钥”只表示配置存在。账号额度、模型使用权限和实际响应会在首次出题时确认；若失败，页面显示对应错误。

## 试用设置

- 模型固定为 `gpt-6-astra`，中等推理，通过 Responses API 返回结构化结果或文字；原 PDF、图片、历史对话和辅助材料按原领读规则传递。
- 密钥只由本地开发服务读取，不注入浏览器，不保存进 Firebase 或复习记录。
- 所有新的生成请求使用 Astra，包括旧轮次后续的出题、独立审核、修补、评价和提示；历史模型标记不回写。
- 原文引用、KC／逻辑原子绑定、提示条件和评价规则继续沿用现有逻辑。更换模型本身不保证案例生成成功。
- 领读的原文范围、分段页码、骨架完整性校验、一次修复、取消请求和学习状态规则保持不变。看要点仍可在服务失败时从已有可靠骨架整理本地回看内容；这不会调用另一模型，也不代表 Astra 生成成功。
- “我现在不想学”复用同一个本地 Astra 接口。总览仅接受服务端确认完整完成的结果，之后仍检查原文页码、所有核心要点与限定条件；服务失败或空内容不会作为新讲解保存。
- 文本、备考和图片接口都只接受本机开发服务请求，未新增公开部署接口；没有部署、合并或推送。
- `services/geminiService.ts` 保留旧文件名以兼容现有导入；其中已没有 Gemini 请求。`@google/genai` 只保留原请求/schema 类型与枚举，不再创建模型客户端，也不向浏览器注入 Gemini 密钥。
- 兼容性处理：保持 PDF 编码完整；页面上下文按资料发送；保留页面 JSON 与角色脚本数组契约；结构化指南适配严格 schema。
- 自动测试使用模拟响应，不消耗 API 额度；使用真实 Astra 准备和练习时按 API 计费。一次准备会有出题和审核，必要时再修补和复审。图片功能按 OpenAI 图片工具计费。

官方参考：[Astra 模型](https://developers.openai.com/api/docs/models/gpt-6-astra)、[Responses 结构化输出](https://developers.openai.com/api/docs/guides/structured-outputs)、[图片生成工具](https://developers.openai.com/api/docs/guides/image-generation)。
