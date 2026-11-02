# 可选的真实 AI 解析服务

这个目录实现 Cloudflare Worker `POST /api/parse`，通过原生 `env.AI.run()` 调用 Workers AI。GitHub Pages 仍负责静态页面；不需要购买常驻服务器，也不需要在前端放 OpenAI 或 Cloudflare API 密钥。

**当前交付验证了接口、校验和失败分支；没有部署到 Cloudflare，也没有完成真实模型调用验收。** 仓库里存在后端代码不代表在线演示已经连上模型。部署后必须完成下面的真实请求检查。

## 部署

需要自己的 Cloudflare 账户、Node.js 和 npm。在本目录运行以下命令；登录、套餐和模型条款由账户所有者确认。

```sh
cd worker
npx wrangler@4 login
npx wrangler@4 secret put APP_TOKEN
npx wrangler@4 deploy
```

`APP_TOKEN` 使用密码管理器新生成的至少 32 个随机字符，在 `secret put` 的交互提示中输入。它是本项目独立的访问口令，不能使用 Cloudflare 账户 API Token 或模型供应商密钥代替。不要写进源码、提交到 Git、放在 URL 中或发到聊天里。

配置说明：

- `wrangler.jsonc` 已绑定 Workers AI 和 `PARSE_LIMITER`，允许的网页来源是 `https://leon777999.github.io`。这里是 origin，不能包含 `/ai-paihuo/` 路径。换域名时同步修改。
- 在前端的 AI 设置中填写部署输出的完整 HTTPS 接口地址（以 `/api/parse` 结尾），并在使用时输入同一个 APP_TOKEN。访问口令应只留在当前页面内存中。
- 默认模型是 `@cf/meta/llama-3.1-8b-instruct-fp8`，上限 600 输出 token。旧名字 `@cf/meta/llama-3.1-8b-instruct` 的模型详情链接已显示不可用，因此没有使用它。
- 若账户、区域容量或模型结构化输出不支持当前配置，接口返回明确错误。应先用真实请求验证；可以在源码 `MODEL` 常量换成当前目录列明支持 JSON Mode 的模型，例如 `@cf/meta/llama-3.3-70b-instruct-fp8-fast`，再重新部署。后者成本更高。
- 本服务只做文本提取，不保存任务，不派发任务，不发送通知。

## 免费额度和成本控制

截至 2026-11-02，Cloudflare 文档列明 Workers AI 每日免费 10,000 Neurons，00:00 UTC 重置；Workers Free 超额后请求失败，需要升级才能继续。个人小规模试用优先保留 Free，额度耗尽时退回有明确标记的本地规则。

当前模型目录的单价是每百万输入 token 0.152 美元、每百万输出 token 0.287 美元。实际每日可解析次数取决于中文 token 数、提示词长度和模型计费，不能把免费额度承诺为固定条数。整个平台还有 Worker 请求等独立限制。

本实现对已授权请求应用约 6 次/分钟的 Cloudflare Rate Limiting binding，并限制 1,000 字符任务、8 KiB 请求正文和 600 输出 token。该限流**按 Cloudflare 节点近似计算，不是严格全局日额度或账单上限**。保留 Free 的供应商硬额度才能避免 AI 超额付费；升级 Paid 后应增加 Durable Object 串行持久计数等严格全局预算措施，不能只依靠此限流。限流或 AI 绑定缺失时服务拒绝调用。

12 秒是本服务等待模型的超时，超时后返回 504。原生 AI binding 没有在这里实施可确认的远端取消；请求可能仍消耗一次推理额度，前端不要无休止自动重试。

## 接口

```http
POST /api/parse
Authorization: Bearer <独立的 APP_TOKEN>
Content-Type: application/json
Origin: https://leon777999.github.io
```

```json
{
  "text": "让小王明天下午三点提交报价",
  "now": "2026-11-02T02:00:00.000Z",
  "timeZone": "Asia/Shanghai"
}
```

成功返回：

```json
{
  "who": "小王",
  "task": "提交报价",
  "std": "",
  "due": "2026-11-03T07:00:00.000Z",
  "rem": null,
  "warnings": ["未明确提醒时间，请手动选择；网页关闭后提醒不能保证。"],
  "source": "workers-ai",
  "model": "@cf/meta/llama-3.1-8b-instruct-fp8"
}
```

上述是接口示例，不是已运行的模型结果。模型必须在指定用户时区解释“明天”。无日期、只有“周五前”而无钟点、有歧义或无效日期时，提示词要求 `due: null` 和需要确认的原因。提醒没有明确指定时 `rem: null`。前端应保留空值，展示警告，让用户填完后保存；不要把 null 强转成 1970 年。

模型可能理解错任务或时区。结构化模式并不保证语义正确，服务器进一步验证字段、真实日历日期、显式时区和提醒先后关系；保存前仍需查看草稿。系统只接收一个任务，多任务输入需要拆分检查。

错误采用 `{ "error": "机器可读代码", "message": "中文提示" }`，分别返回 400 无效输入、401 口令错误、403 来源错误、413 正文过大、415 内容类型错误、429 限流、502 模型/输出失败、503 未配置/服务不可用、504 超时。不会返回上游诊断或密钥。

CORS 只允许指定 origin，但不是身份认证。非浏览器客户端可以省略 Origin，但仍必须提供口令。不要公开分享口令；多人服务应改成独立用户登录和按用户配额。

## 测试

从仓库根目录运行：

```sh
node --test tests/worker.test.js
```

这些自动测试使用假的 AI binding，覆盖真实 Worker handler 的鉴权、CORS、格式校验、时区、无效日期、提醒关系、限流和模型错误。它们验证程序行为，不能证明真实模型质量。

部署后使用前端完成以下真实验收，并在 Worker 控制台确认确有 AI 请求：

| 输入/操作 | 应检查的结果 |
| --- | --- |
| 让小王明天下午三点提交报价 | 负责人和动作正确；日期是设备时区的明天 15:00 |
| 让小王尽快完成报价 | 截止为空并提示确认，不能编造明天 18:00 |
| 小李周五前处理在建项目资料 | 保留“在建”；没有钟点时请确认 |
| 让小王2月30日下午三点交材料 | 空日期/错误提示，不能自动滚到3月 |
| 修改口令，再点解析 | 明确显示 401/AI失败并标注本地规则，不显示 AI 已成功 |
| 连续快速发起超过6次请求 | 观察429；跨节点和突发情况允许近似误差 |
| 断开网络、用量耗尽或模型失败 | 可见失败原因，草稿来源与实际一致 |

文字任务会发送到你部署的 Cloudflare Worker 和 Workers AI 处理。不要在输入中包含密钥。本代码不记录任务日志，已关闭 Worker Observability，但平台自身的数据处理与保留仍受 Cloudflare 政策约束。

## 后台提醒边界

此 Worker 只在 HTTP 请求时运行，没有数据库、定时扫描或推送订阅，**不能让静态网页关闭后的 setInterval 继续执行**。最省事的独立提醒是把任务导出到设备日历并确认已导入、已开启系统提醒；日历记录修改与网页任务不会自动同步。产品自行发送后台提醒则需要持久任务数据库、调度/队列、推送或邮件等通道，以及失败重试和投递记录。这些都不在此解析 Worker 的功能承诺中。

## 核验来源

以下均为 Cloudflare 官方文档，2026-11-02 核对：

- [Workers AI binding](https://developers.cloudflare.com/workers-ai/configuration/bindings/)
- [JSON Mode 与结构化输出失败限制](https://developers.cloudflare.com/workers-ai/features/json-mode/)
- [当前默认模型、参数和价格](https://developers.cloudflare.com/workers-ai/models/llama-3.1-8b-instruct-fp8/)
- [Llama 3.3 70B 模型](https://developers.cloudflare.com/workers-ai/models/llama-3.3-70b-instruct-fp8-fast/)
- [Workers AI 免费额度及定价](https://developers.cloudflare.com/workers-ai/platform/pricing/)
- [Rate Limiting 配置、精度及严格全局限制](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/)

模型目录和套餐会变化，部署时重新检查账户实际可用模型与额度。
