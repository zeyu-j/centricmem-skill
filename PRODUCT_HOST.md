# CentricMem 使用面设计 — 云馆员

> **状态**：馆员 API `https://mem.centricmem.com`（Cloudflare 橙云；不是落地首页）。网站 SPA 在 Worker。源站 nginx :443 + Origin CA + Full (strict)。0.21.6：主人忘记密码走邮件重置。0.21.5：客人 CLI 禁止写 leftover hub。采集走 agent 自带记忆，馆员是 manager 层。卡给 Agent；原文人下载。未分级。传入仍只有 Agent。  
> **管什么**：谁写、怎么进、失败怎么办、账号与钥匙、配额与备份。  
> **不管什么**：记忆类型、Markdown 真源形状、检索信号 — 仍以 [PRODUCT.md](./PRODUCT.md) §1–§5 为准。  
> **冲突**：写盘权、接入主路径、MCP 角色，以本文为准，直到合并进 PRODUCT.md。  
> **加密**：第一种 — TLS 在途 + 盘上加密、密钥我们管。**不是**零知识 / CSE / enclave。  
> **依据**：centricmem #0018、#0019、#0020；2026-09-02 云正本拍板。

手感：常驻云上有一个馆员。人登录管库；Agent 用钥匙传入。店里卖的仍是记忆单元，不是书目。

---

## 1. 一句话

**CentricMem 的正本在云馆员的盘上。** 馆员只做传入、传出、检索。人不在服务器上打开或改文件。本机不再跑馆员，也不再 rsync 双向同步。

旧句「跨 Agent」成立的条件：客人能喊到**这一台**云馆员。Skill 文件本身不授予盘权。登录会话不建议写入 Skill；客户自己塞了，挡不住。

---

## 2. 角色

| 角色 | 是谁 | 允许 | 不允许 |
|------|------|------|--------|
| **馆员** | 我们维护的常驻云进程 + 其磁盘 | 收进单元/附件、检索、把字节传出、内部重建索引、restic→R2 | 打开/预览文件；SSH 改 `.md`；当第二套记忆 OS |
| **主人** | 已登录的账号 | 看自己的库、检索、下载、生成/命名/吊销钥匙、看配额与 sweep 余量、拉只读备份 | 从界面 `note`/`keep`/`done`；把只读备份 push 回去 |
| **Agent（客人）** | Skill、宿主 MCP、remote agent | 用**该库的一把 pairing key**（或主人已登录时的桌面会话）做 sweep 传入；检索；上传附件字节 | 在客人盘建 hub；CLI 回落写本机；key 写进公开 repo |
| **访客钥** | 主人签发的 pairing key | 不登录、只开**一座**库（请朋友、给某一个 remote agent） | 开其它库；吊销后继续写 |
| **只读副本** | 人拉到自己电脑的备份（GitHub Desktop 类） | 打开文件、自行浏览 | 当正本写入；含钥匙 |

传入 **只有 Agent**。人侧没有收件箱可点。错 key → 401，不进 `unclassified`。

CLI 与 HTTP 仍不是两套产品：handler 仍是 `memory.ts` / `import.ts` / `indexer.ts`。能 exec 的客人打云 HTTP（或经连接器）；不能 exec 的走宿主 MCP → **云 URL**。不要回落成本机 CLI 写盘。

---

## 3. 不变 / 必变

### 3.1 不变

- 单元仍是 Identity / Details / Tags / Body 的 Markdown（或 lessons/AGENTS 的一个 `##`）。
- 原文在该库 `imported/attach/`，指针在 Details；FTS 不索引附件全文。
- 六种类型、append-only decision（新条 supersede 旧条只打标）、渐进披露 L0–L3。
- Adapter in, not platform out：L0 不识别 Cursor / Codex / Claude 品牌。
- 采集端可继续写自己的库（含 Cursor memories）；组织端经 Agent 把该归档的单元 `import`/`keep` 进馆员。策展不写回对方库。
- Notion 人读视图名与 Skill 检索情景同名；Notion 不是正本。
- Session 文件名带 writer，避免多 Agent 抢同一文件。

### 3.2 必变（相对 0.17.0 / 现行 PRODUCT.md）

| 现行 | 改为 |
|------|------|
| 本机 Manager 是写手；正本在 `$CENTRICMEM_HOME` | **唯一写手是云馆员** |
| 一库一把 pairing token | **一库多把访客钥**（可命名、吊销）+ 主人登录 |
| 环回 `127.0.0.1`；不作为公网服务 | 公网 TLS URL |
| Skill：本机 HTTP → 否则 CLI 写本地 | **只打云 URL**；失败说一次，禁止建本地 hub |
| 知识出现则立刻 `note`/`done` | **Sweep**：未入库先待在 agent memory；session 结束可扫增量 |
| Inbox / 人 Move to library | **不做**云上收件箱。Agent 必须带对库的证件 |
| `keep` 可传服务器路径 | **只收上传字节**（multipart / base64）。馆员不读任意路径 |
| rsync / 文件夹副本 / Drive 当 L2 | **弃置**。冷备份 = restic → R2；人可选只拉副本 |
| 离线本机仍能搜写 | 馆员不可达则不能传入/云检索。人可打开自己已拉的只读副本 |
| 落地页「搜索零云 API」 | 检索走云馆员（本机只读副本可离线翻文件，不是 FTS 正本） |

stdio 遗留 `centricmem-mcp` 仍不是主路径。连接器打云 URL，不 exec `centricmem.cmd`。

---

## 4. 使用面

### 4.1 人 · 注册与第一座库

1. 在网页或 Manager **登录**（账号是钥匙串 + 库所有权，不是第三套记忆）。忘记密码：`/forgot` 发一小时有效的重置邮件到主人邮箱（对不上的地址也回同一句，避免枚举）。`CENTRICMEM_RESEND_API_KEY` + `CENTRICMEM_MAIL_FROM` 发信；`CENTRICMEM_APP_ORIGIN` 是邮件里的网站根（默认 `https://centricmem.com`）。
2. 创建库。免费账号总容量 **100MB**（该账号下所有库的 Markdown + `attach/`，**不含** `.index/`）。付费加大。第一 beta 营运者走最高档。
3. 为该库生成一把或多把 pairing key（标签如 `cursor-cloud`、`friend-x`）。复制到 Agent secrets / 宿主 MCP 配置，**不进 git**。
4. 不必为了「能用」先装本机馆员。本机 Manager 若还在，是云客户端：检索、下载、管钥匙，不 listen 写盘。

### 4.2 人 · 日常

- 检索当前库、下载单元、下载附件后在自己电脑打开。
- 生成 / 吊销 key；看配额；看本库 24h sweep 余量。
- 拉只读备份（导出 Markdown + attach，**不含**钥匙）。只拉不推。
- 不在界面写入记忆。不「打开服务器上的记忆文件夹」。

### 4.3 人 · 第二台电脑 / 重装

登录同一账号 → 看见库与钥匙（当前有效的 key）。客人设备 **不**把 `projects/` 拉来当可写 hub。若要打开文件：下载单件，或拉一份只读备份。

### 4.4 Cursor（能 exec）

Skill：开始 `ambient`（打云 URL）。白天 **不**随触发写库。未入库内容留在 **agent 自己的 memory**（当天 transcripts、打开的工作区）。

每个 session 结束可以 **sweep**：整理增量 → 一次批次 POST 到馆员。人说「不要记」→ 这次跳过。馆员不可达 / 401 / 配额或次数用尽 → 说一次，继续干活，**不**建本地 hub，**不** `setup --bootstrap`。

语料是另一座库：另一把 key（或登录后选库）。不要用产品库的钥匙写语料卡。

### 4.5 沙箱（ChatGPT Desktop / Codex）

宿主 MCP 打 **云 URL** + 该库一把 key（或主人桌面已登录的会话）。禁止 `curl localhost`、禁止沙箱 CLI 写客人盘。馆员不可达 → 连接器报错，Skill 说一次。

### 4.6 Cloud / private worker

用该库 pairing key（环境 secrets，不进 repo）。禁止在 worker 里初始化 hub。没有长期 `libraries.json` 就靠 secrets / 连接器注入。

### 4.7 网页

登录后：管库、检索、下载、删除、钥匙、配额。不在网页里打开正文。传入仍只有 Agent。无本机托盘可开。

### 4.8 馆员没开 / 不可达

对人：状态页「馆员不在」。对客人：说一次。禁止另建 hub；禁止把 R2 或只读备份当正本写。

### 4.9 离线

云检索与传入不可用。人可以翻已经拉下来的只读备份。账号或 R2 失败不影响**已在馆员盘上的**正本；只影响能否备份/找回。

### 4.10 附件与原文

Agent sweep：**POST `/keep/sign`** → **PUT** 字节到 R2 → **POST `/keep` `{ uploadId }`**。馆员不打开原文。指针仍是单元里的 `Attach: imported/attach/…`。人 **传出** 下载后自行打开。配额与会员档尚未计量。

### 4.11 不再做 Inbox

未带对库证件的写入 = 401。没有云上 `unclassified` 给人点。分类发生在 Agent sweep 时选对库。

### 4.12 采集端 dump（Path D）

对方 skill 可把文件写在自己能写的盘上。Agent sweep 再 `keep` 上传字节。那是原料，不是第二记忆 OS。

### 4.13 多客人同一库

Session 文件名含 writer。**Sweep 限额按库共享**（所有 key + 主人会话）。HTTP 限流仍在（429）。写入过密或盘满 → 拒绝并说清。

### 4.14 同机多用户

各用各的登录。不指向本机同一 hub 文件夹——本机没有可写 hub。

### 4.15 卸载客户端

卸的是客人程序。**不动**云正本、R2、账号。不碰 Cursor `state.vscdb` / agent-transcripts。

### 4.16 人改 Markdown

不在馆员盘上改。错字 = Agent 下次 sweep 写新单元（decision 可 supersede 打标）。只读备份上的编辑不会写回。Notion 仍是投影。

### 4.17 团队 / 朋友

发一把该库的 pairing key。默认对该库完整传入+检索，**可以写满主人额度、用尽该库 sweep 次数**。吊销后不能再写；已用次数与已占空间不退。L0 不识别 Agent 品牌。不把「请开 Full Access」写成产品。

### 4.18 移动端（日后）

只读：登录检索 + 下载。传入仍只经 Agent。v1 不做手机传入。

### 4.19 用户说「不要记」

该次 sweep 跳过。无隐式强制 `done`。

### 4.20 密钥

- 主人：**登录会话**（网页 / Manager）。
- Agent / 朋友：**pairing key**（Bearer）。一座库多把；可命名、吊销、再签发。吊销一把不影响主人登录、不影响其它 key。
- 不建议把登录会话写入 Skill；客户执意如此不作为支持路径。
- Key **不进 repo**。公开包与 Skill 正文不得含真实 token。
- API / ambient / FTS 日志不记 token 与请求体里的 credential 形串。

---

## 5. 表面规格

### 5.1 云馆员

- 公网 HTTPS。进程常驻。正本 = 服务器上该账号的库目录（Markdown + attach）。
- 只做传入 / 传出 / 检索。内部可 `index`（不计入 sweep、不计入容量）。
- 允许的 API 变更：新增单元；supersede 打标；**没有** SSH 编辑、没有「打开文件」。
- 不做本机 listen。过渡期若本机托盘仍在听，`doctor` 必须判失败（防双写）。

### 5.2 HTTP

鉴权：主人会话 **或** `Authorization: Bearer <pairing-key>`。无证件 401。访客钥只绑定一座库；`library=` / `-p` 不符 → `LIBRARY_MISMATCH`。`--all` 不泄漏其它库。

| 动词 | 作用 | 谁 | 扣 sweep？ |
|------|------|----|------------|
| `GET /health` | 存活、最低协议 | 均可 | 否 |
| `GET /ambient` | 预检 | 均可 | 否 |
| `GET /doctor` | 诊断 | 主人 / 有钥客人 | 否 |
| `GET /search` | 检索目录（snippet） | 均可 | 否 |
| `GET /show` | Agent 把 **Markdown 卡**取进 context（不是原文） | Agent | 否 |
| `GET /download` | 传出单元或 `original=1` 附件，当附件下载 | 主人 / 有钥客人 | 否 |
| `POST /delete` | 删掉该库一个单元文件 | **主人** | 否 |
| `POST /keep/sign` | 签发短时 PUT URL；凭证不离开馆员 | Agent | 否（完成 keep 才算写入） |
| `POST /keep` | 登记原文（`uploadId` 或小文件字节） | Agent | 否（sweep 批次内） |
| `POST /sweep` | **一次整理入库批次**（内含多条 note/keep/done/import） | Agent | **是（成功且 ≥1 条新单元）** |
| `POST /export` | 只拉备份（无钥匙） | 主人 | 否 |
| 钥匙 CRUD | 列出/生成/吊销 | 主人 | 否 |
| `POST /index` | 重建 FTS | 馆员内部或主人 | 否 |

单条 `note`/`keep`/`done` 若仍暴露，只能作为 sweep 批次的内部步骤，**不能**各自扣次数。`keep` **只接受上传字节或 `uploadId`**，拒绝 `path=` 读馆员盘。大文件走 `/keep/sign` 直传 R2。

错误：401 证件；403 错库；413/配额满；429 sweep 窗口满或限流（须带「还剩多久」）。

查询参数与今日 CLI 对齐：`library`（`project` 为别名）、`tags`、`filter`。

### 5.3 Sweep

- **原料**：agent memory（当天 transcripts、打开的工作区）。入库前不写馆员。
- **时钟**：每个 session 结束可以扫；只处理增量。
- **限额**：记在馆员。按**库**。滚动 **24 小时**内成功 sweep **最多 3 次**（该库所有 key 与会话共享）。空扫（0 条新单元）**不计数**。付费解锁更多次数（具体档后定；最高档营运者自用）。
- **占坑**：先 reserve 再写。并发第四次 → 429。窗口以馆员时钟为准。
- **幂等**：同一 `external_id` / transcript id 重复提交不新占容量、**不新扣**次数。
- **增量**：已扫过的内容记在 agent memory；馆员幂等兜底。
- 次数用尽：客人说明窗口，把未入库的仍留在 agent memory，不写本地 hub。

### 5.4 配额

- 免费 / 付费档 **尚未实施**。先按营运者最高档：不拒 100MB、附件走 R2。日后分级再套配额。`.index/` 不计。
- 打满：传入失败并说出来，不得静默丢附件。
- 访客钥写入计入**主人**账号额度。

### 5.5 Skill（L1）

- §0：云 URL +（登录会话 \| 该库 pairing key）。失败说一次。禁止 CLI 写本机、禁止 `setup --bootstrap` 当修复。
- 不把「再复制一份 SKILL.md」当修复。
- 不把 curl localhost 当沙箱主路径。
- 不把真实 key 写进仓库。Connect Agent = 把一把钥复制到 secrets / MCP 配置。
- Close：sweep 批次，不是每回合 keep+done；ledger 连续对话仍等人类停。

### 5.6 CLI

保留给脚本，但必须指向云馆员，不得以本机 `$CENTRICMEM_HOME` 为可写正本。Windows 不以 `.cmd` 为唯一入口。

### 5.7 MCP

| 种类 | 角色 |
|------|------|
| 宿主连接器 | 打 **云 URL**；不是第二套库 |
| Drive / rsync | **不做**产品同步 |
| stdio `centricmem-mcp` | 遗留，非沙箱主路径 |

### 5.8 账号

- 登录/登出；列出库；钥匙串（当前有效 key，不是 git 历史）。
- 云凭证 ≠ pairing key。吊销访客钥不踢主人。
- 无登录仍可用一把访客钥进**一座**库（邀请 / remote agent）。
- 必须登录才能：建库、管多把钥、导出整库、看账单。

### 5.9 备份（运维，不是产品同步）

- 正本在馆员盘。冷备份：**restic → Cloudflare R2**（加密仓库）。不备份 `.index/`（还原后 `index`）。
- 只留 R2，不做厂商快照（已拍板）。备份失败要能看见。restic 密码与 pairing key 分开放。
- 还原：R2 → 盘 → 起馆员 → `index`。禁止 Agent 直接对 R2 搜写。
- 人的只读备份 ≠ R2；R2 是机房灾备。

---

## 6. 安装与版本

| 用户 | 默认 | 还要什么 |
|------|------|----------|
| 只想检索/下载 | 登录网页或 Manager 客户端 | 无本机 hub |
| Cursor | Skill + 一把库钥（或登录）指向云 URL | secrets，不进 git |
| 第一 beta（营运者） | 最高档；迁现有 hub + 语料 **tree**（不是坏 junction） | 切日停本机 listen |

Skill / 馆员协议版本可探测。`/health` 报最低协议；过旧 Skill 说一次升级，不静默写坏格式。

公开包与落地页：云馆员落地后再改安装句。本稿不是已发布行为。

---

## 7. 安全

- TLS。访客钥是能力凭证。
- 馆员不按路径读盘。客人不可让服务器打开任意文件。
- 导出不含钥匙。
- 多把钥可吊销；吊销不退空间、不退 sweep 次数。
- 限流；配额满拒绝。
- 日志不记密钥。

---

## 8. 失败矩阵

| 现象 | 对人 | 对客人 | 禁止 |
|------|------|--------|------|
| 馆员不可达 | 状态「不在」 | 说一次 | 另建 hub；写只读备份 |
| Token 吊销/错误 | 钥匙页再签发 | 401，说一次 | 无鉴权回落 |
| Sweep 24h 已满 | 显示余时 | 429 + 余时；未入库留在 agent memory | 改写本机 |
| 配额满 | 升级/清附件 | 失败说清 | 静默丢文件 |
| 沙箱无 CLI | — | 云 HTTP；否则说一次 | Full Access 当设计 |
| R2 备份失败 | 告警；正本仍在馆员 | 不挡传入 | 假装已备份 |
| 两路当写手（本机托盘+云） | `doctor` 失败 | — | 继续双写 |
| 用户不要记 | — | 跳过该次 sweep | 仍强制写入 |
| 只读备份被当正本 | 说明只拉不推 | — | push / 本地 `note` |

`doctor` / 状态页必须区分：未登录、馆员不可达、钥失败、配额、sweep 窗口、备份失败。不要一律「未安装」。

---

## 9. 分期

| 期 | 内容 | 说明 |
|----|------|------|
| **A–C** | 已落地：本机环回馆员、一库一钥（过渡） | 切日后停用本机写手 |
| **D** | 采集适配器 | 仍有效；dump 经 sweep 上传 |
| **F** | **本稿目标**：云馆员、登录、多把访客钥、sweep 限额、R2、只拉备份 | 不再标「日后」 |
| **E** | 取消「账号拉可写副本」 | 账号是所有权与钥匙串，不是 rsync |

建议：**先 F 单租户（营运者最高档）** → 多把钥与 sweep 限额 → 免费 100MB 档。不要复活本机馆员或 rsync。

---

## 10. 对现行文档的改句清单（合并时用）

**PRODUCT.md**

- §1：正本在云馆员；本机进程不是写手。
- §2 接入：Skill + 云 HTTP（连接器或 CLI 指向云）。
- 删 local wins / 本机离线必写。
- §8：云 API、账号、访客钥；标明实现=草案。

**ARCHITECTURE.md**

- 馆员绑定公网 TLS，不绑环回。
- `keep` 无路径读盘。连接器打云 URL。

**SYNC.md**

- 改为：产品不做 rsync/Drive。灾备 restic→R2。人只拉不推。不同步 `.index/`。

**desktop/README.md**

- 客户端：登录、检索、下载、管钥匙。不是馆员。无备份页 rsync。

**SKILL.md**

- §0：云 URL + 库钥或登录。失败说一次。Close = sweep 批次。禁止本地 hub。

**落地页 `web/src/data/content.ts`**

- F 落地后改：检索走馆员；删除「搜索零云 API」与 rsync 备份句。

---

## 11. 明确不做

- 本机馆员；环回当正本写手。
- 产品 rsync / 文件夹双向副本 / Drive 同步。
- 把 R2 或只读备份当可写正本。
- Key 进 git / 公开 Skill。
- 馆员按路径打开或读取客人未上传的盘。
- 云上 Inbox / 未指定库进 unclassified。
- 人从 UI 传入记忆。
- 零知识 / CSE。
- MCP 当第三套库或云端第二份 FTS 正本。
- 为某家 Cloud 把路径写进 L0；Full Access 当设计。
- 自动 merge `decisions/`。
- 清理 Cursor `state.vscdb` / agent-transcripts。
- v1 手机传入。

---

## 12. 验收（F 单租户试点）

1. 公网 TLS 馆员；无证件 401；错库 `LIBRARY_MISMATCH`。
2. 主人登录可检索、下载、建钥、吊销钥；UI 不能 `note`。
3. Agent 一次 sweep 写入多条只计 **1** 次；24h 内第 4 次 429；空扫不计；并发 reserve。
4. `keep` 拒路径、收字节；人下载后在本机打开。
5. 导出无钥匙；本地副本无法写回。
6. 本机若仍 listen，doctor 失败。Skill 失败不 `setup --bootstrap`。
7. restic→R2 跑通，并做过一次还原 + `index`。
8. 日志无 token。公开文案不承诺「有 Skill 就能写本地记忆」。
