# Gemini 3.8 Flash 路由

自 2026-09-17 起，所有新发起的文字理解与生成请求固定使用 `gemini-3.8-flash`：领读、大白话、问答、联合复习、出题、审题、判分、课程周报、大纲整理和导读。

- 服务端读取工作副本 `.env.local` 中的 `GEMINI_API_KEY`，不把密钥发送给浏览器。
- `/api/reading/gemini` 接受文字、PDF、图片和既有结构化输出要求。
- `/api/exam/gemini` 处理备考请求；`/api/exam/gemini/status` 只检查本地密钥是否存在，不验证账户余额或模型权限。
- 固定使用 Google `generateContent` 接口；没有跨供应商回退或自动重试。
- 普通请求使用 medium thinking；课程周报使用 low，保留原有请求大小、输出上限、60 秒服务端超时和整轮限制。
- 用量来自 Google 返回的 token 计数，包含思考 token；缺失时仍为未知。
- 已保存的课表、导读、学习记录及其原始模型信息不重写。浏览旧结果不会重新生成；只有新生成的内容使用 Flash。

## 专用接口

Gemini 3.8 Flash 只输出文字，不支持图片生成或 Live API。图片生成保留现有 OpenAI 图片流程，课堂实时转录保留 ElevenLabs。Canvas 和 Firebase 不变。

一些文件与导出仍使用历史 `Astra` 名称，以兼容现有调用；文字请求的实际服务商、路由与模型已经切换为 Gemini。

## 验证边界

按用户要求，本次不运行测试、构建、浏览器验证或付费 API。已有本地 Gemini 密钥，但其有效性、额度及 3.8 Flash 权限未调用 API 验证。

官方模型说明：https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash
