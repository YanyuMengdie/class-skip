# 独立上线：class-skip-flash

此版本使用新的 Vercel 项目 `class-skip-flash`，正式网址为 `https://class-skip-flash.vercel.app`。原 `class-skip-v2` 项目不在本次部署范围内。开发分支为 `codex/class-skip-flash`。

## 接入

- 新增 Vercel Functions，承接 Gemini 阅读、备考、图片和 Canvas 请求；复用原有服务端解析、预算与取消逻辑。
- Vercel 服务端配置 `GEMINI_API_KEY`、`OPENAI_API_KEY`、`ELEVENLABS_API_KEY`，均保存为 Secret，不打包到浏览器。
- 云端接口验证当前 Firebase 用户的 ID token，检查签名、项目、有效期；Canvas 令牌使用单独的授权头。
- 新站沿用 Firebase 项目 `ai-tutor-647fd`，账号与云端资料共享。本地 IndexedDB、sessionStorage 按网址隔离；旧站浏览器中的本地记录不会自动迁移。
- Firebase Authentication 的 Authorized domains 需包含 `class-skip-flash.vercel.app`，否则新域名不能正常发起 Google 登录。

## 较大资料

超过 4 MB 的阅读请求或录音先写入当前用户 Firebase Storage 的临时对象，函数只读取与登录用户匹配的指定路径，并限制大小。服务器读完或浏览器请求结束后尝试删除临时对象。断网或权限变化时删除可能失败，部署后可为 `uploads/request-*` 配置存储生命周期规则。

Canvas 的较大 PDF 通过响应流返回，避免缓冲响应大小限制。原有 Canvas 公开地址检查、正常权限校验与授权令牌限制保持有效。

## 操作边界

只运行 Vercel 部署所必需的云端构建，不运行本地测试、构建、页面功能验证或付费模型验证。Vercel Ready 只证明部署完成，不代表所有功能均已人工验收。
