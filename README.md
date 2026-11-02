# AI 派活助手

老板说一句话 → 整理任务草稿 → 人工核对时间与标准 → 保存在本机 → 分享派活文字。每日汇总在打开页面时计算。

在线演示：https://leon777999.github.io/ai-paihuo/

**默认是免费的本地规则解析，不冒充 AI。** 可选的真实 AI 服务代码在 [`worker/`](worker/README.md)。仅把前端发布到 GitHub Pages，不会自动拥有 AI 服务或后台提醒。

## 本轮改进

- 本地中文规则支持明确日期、下个日历周、中文钟点、分钟/小时后的相对时间；修复周日“下周一”多排一周、删除任务词中的“在/前”等问题。
- 缺失、非法或有歧义的截止时间不自动编成“明天18点”。仅写日期时的18:00默认值会明确提示核对。重复任务、多时刻需要人工确认。
- AI 接口可配置；请求带当前时刻与设备时区，校验服务返回值，失败明确标记“本地规则”。地址必须为 HTTPS；访问口令只留在页面内存，刷新后需重填。
- 保存失败保留草稿；坏数据不覆盖；增加 JSON 备份导出/导入和跨标签页变更检查。沿用 `paihuo_tasks` 键，正常旧数据可继续读取。
- 语音改为点击开始/结束，支持键盘操作。识别错误、临时结果不自动提交；手动修改的文字不会被迟到的语音结果覆盖。
- 分享使用系统分享面板，或复制文字。只有复制确实成功才提示成功；不声称微信已发送或对方已收到。
- 页面恢复时补查提醒；可导出含提醒字段的 `.ics` 文件，交给系统日历处理。

## 最小部署

静态文件 `index.html`、`app.js`、`core.js` 保持同目录，继续使用 GitHub Pages，构建不需要 npm 依赖。合并修复分支后等待现有 Pages 发布，并强制刷新检查是否加载了 `core.js`。

需要真实模型时，再按 [`worker/README.md`](worker/README.md) 部署 Cloudflare Worker。前端输入你部署的完整 `/api/parse` 地址和独立访问口令。Cloudflare 账号 API Token、模型密钥均不得放进前端、Git、URL 或聊天。

默认采用 Workers AI 原生绑定，不需要 OpenAI API 密钥。Worker 代码已提供，**本次尚未部署，也未调用真实模型完成质量验收**；模拟接口测试通过不能证明线上 AI 已开通。

## 提醒怎么选

| 方式 | 新增基础设施 | 能力和限制 |
| --- | --- | --- |
| 页面内提醒 | 无 | 页面运行时约20秒检查一次；关闭、休眠、冻结时不保证执行，恢复后补报 |
| 导出系统日历 | 无服务器 | 每项任务点“导出日历”，手动导入并检查提醒是否保留；关闭网页后由日历执行 |
| 产品自行后台推送 | 数据库、调度、推送服务 | 网页关掉后由服务器发起；仍受网络、通知权限、系统限制，不能保证精确到秒或本人已读 |

**导出成功不等于提醒已启用。** 日历客户端可能忽略导入的 `VALARM`。请在手机日历中检查事件、时区与提醒，设一个两分钟后的测试，关闭网页并锁屏验证。iPhone可通过 Mail 附件导入 `.ics`；网页下载的导入交互因系统和浏览器而异。网页任务完成、修改或删除后，日历副本需另行修改，二者不会自动同步。

若要真正做后台提醒，最小方案是 Worker + D1 保存任务及 UTC 提醒时间，Cron 每分钟领取待发任务，Web Push 发送；记录失败和重试，移除失效订阅，完成任务后取消待发。iPhone需要添加到主屏幕并主动授予 Web Push 权限。单加 Service Worker 或安装 PWA 无法代替服务端调度。

## 成本取舍

截至2026-11-02核对官方文档：静态页面加日历导出无新增服务器费用。Workers AI Free 每日有10,000 Neurons额度，超过后请求失败，额度不等于固定任务条数；先保留 Free，失败时使用本地规则。接口的约6次/分钟限流不是全局费用上限。已有 Paid 账户不能因代码使用了免费额度就认定不会计费。

后台推送的小规模原型可能使用 Workers/D1免费额度（Workers约10万请求/天；D1约500万行读/天、10万行写/天、5GB存储），但开发、监控和维护仍有投入。Workers付费基础订阅目前为5美元/月，加超额用量；短信/邮件等渠道可能另计费用。此轮未添加数据库、Cron或推送服务，优先用日历验证实际使用价值。

## 测试

本地需要 Node.js 22或更新版本；无需安装依赖：

```sh
node --test tests/*.test.js
node --check app.js
node --check core.js
node --check worker/index.mjs
```

通过后的真机和部署验收见 [`docs/VERIFICATION.md`](docs/VERIFICATION.md)。语音需HTTPS或localhost环境；真实麦克风、系统日历锁屏提醒、微信最终发送均需在实际设备中检查。

任务只保存在当前浏览器，不跨设备同步。清理网站数据、私密模式限制、换域名都会影响数据。切换设备或部署域名前请导出备份。启用 AI 会把任务文字发送给指定服务及 Cloudflare；浏览器语音识别也可能使用在线识别服务。

## 官方依据

- [GitHub Pages静态托管](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)
- [浏览器冻结/丢弃与定时器限制](https://developer.chrome.com/docs/web-platform/page-lifecycle-api)
- [Web Speech支持及在线识别限制](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition)
- [iOS主屏幕Web App推送](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)
- [日历与VALARM标准、安全限制](https://www.rfc-editor.org/rfc/rfc5545.html)
- [iPhone导入日历](https://support.apple.com/en-sg/guide/iphone/ipha0d932e96/27/ios/27)
- [Workers AI额度和价格](https://developers.cloudflare.com/workers-ai/platform/pricing/)
- [Workers及D1定价](https://developers.cloudflare.com/workers/platform/pricing/)
- [Cron调度及UTC时间](https://developers.cloudflare.com/workers/configuration/cron-triggers/)
