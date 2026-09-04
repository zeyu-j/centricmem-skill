# CentricMem — 产品设计真源（Product Source of Truth）

> 本文档定义**记忆架构、存储方式、检索方式**。  
> 技术实现见 [ARCHITECTURE.md](./ARCHITECTURE.md)；Agent 行为见 [skills/centricmem-agent/SKILL.md](./skills/centricmem-agent/SKILL.md)。  
> 使用面（云馆员、账号、钥匙、失败降级）见 [PRODUCT_HOST.md](./PRODUCT_HOST.md)。写盘权与接入主路径以该草案为准，直到合并进本文。  
> **正本在云馆员的盘上**（过渡期本机 Manager 仍可能 listen；切日后停）。卡给 Agent；原文给人下载后在本机打开。  
> 下列原则对**任何数据存储系统**通用，不仅限于 CentricMem 当前实现。

---

## 1. 产品一句话

**CentricMem 是 agent 自带记忆之上的 manager 层：组织、检索、跨 Agent 的正本。采集仍由 Cursor memories / 其它 memory skill 完成。技术栈（Markdown、FTS5、Skill）是可替换的实现层。正本在馆员盘上，不在业务 git 里。**

### 1.1 一页模型（存储真源）

用法（`note` / `done` / `keep` / `log-decision`、六种类型、搜索前缀）不变。下面是盘上**唯一**的说法；其余名字都指向这里。

```text
Hub ($CENTRICMEM_HOME) — disk root, not the isolation unit
  └── Library (projects/<id>/ + pairing key + one SQLite cache)
        └── Unit (.md 或 lessons/AGENTS 的一个 ##)
              Identity   标题 / 路径 / #0016
              Details    Status、时间、谁写的、Attach、Supersedes、Refs；语料库另有 YAML
              Tags       关于什么（开放 mint）
              Body       记忆本身
              Original   可选，指针在 Details，字节在 imported/attach/
```

- **Library** 是容器（放在哪 + **一把 pairing key**），**Tags** 是 about（关于什么）。不要把 slug 写进 `Tags:`。Agent 可同时连接无数库，像工作区。
- 索引（FTS、`chunk_keys`、`project:` / `type:` / `#id`；`project:` 是库 id 别名）是缓存，可删重建。
- Notion / Drive 是投影或副本，不是第三套库。人读 Notion 时用与 Skill 检索表相同的情景名。
- 语料 YAML / `--filter` 是该库的 Details，不是第七种记忆类型。

---

## 2. 三层分离（所有记忆产品都应遵守）

```text
┌─────────────────────────────────────────────────────────┐
│  L1 接入与策略层 — 何时读/写/导入/分类（Skill、工作流）      │
├─────────────────────────────────────────────────────────┤
│  L0 记忆核心层 — 架构 + 存储真源 + 检索索引（本地）         │
├─────────────────────────────────────────────────────────┤
│  L2 灾备 / 人读副本 — restic→R2；人下载后打开；Notion 投影不是正本   │
└─────────────────────────────────────────────────────────┘
```

| 层 | 回答的问题 | CentricMem 实现 | 常见误区 |
|----|-----------|-----------------|----------|
| **架构** | 记忆分几类？如何演化？ | 见 §3–§5 | 把「文件夹结构」当架构 |
| **存储** | 真源是什么？如何写入？ | Markdown + append-only | 把索引库当真源 |
| **检索** | 何时搜、搜什么、怎么排序？ | FTS5 + 多信号排序 + 渐进披露 | 把 MCP 当检索引擎 |
| **接入** | Agent 什么时候碰记忆？ | Skill +（HTTP \| CLI） | 把 MCP 当主入口 / 第三套库 |

**MCP**：灾备不是 Drive/rsync 产品路径。**宿主连接器**只代理馆员 HTTP，不自带 FTS、不存第二份 Markdown。遗留 stdio `centricmem-mcp` 不是沙箱主路径。

人类不写代码时，用 **网页仪表盘**（登录后检索、下载、管钥匙）。过渡期 Windows **Manager**（`desktop/`）仍可能对着本机 hub listen — 切日后停，避免与云馆员双写。使用面细节见 [PRODUCT_HOST.md](./PRODUCT_HOST.md)。

Manager 的首屏是**运行状态**，不是文件列表：先显示监控、待整理和备份是否正常，再进入浏览。普通流程只使用“首页 / 所有记忆 / 待整理 / 备份”；Markdown、CLI、robocopy、rsync 和远程地址等实现细节不得出现在主流程。首次运行自动发现 hub，只有自动发现失败时才要求选目录。

### 2.1 边界原则（Adapter in, not Platform out）

CentricMem **不识别** Cursor、Claude Code 或任何具体 Agent 品牌。核心只提供：

| L0 提供 | L0 不提供 |
|---------|-----------|
| 记忆类型（taxonomy） | 各 Agent 的 session 路径、日志格式 |
| 写入契约（ImportBundle、log-*、frontmatter `meta`） | 为某一家 Agent 写专用解析器 |
| 检索与过滤（search、`--filter`、config 钩子如 `domain_boost`） | 某领域的业务维度表（如 15 个比较维度） |
| 通用 Skill（`centricmem-agent`）教**何时**读写信道 | 替用户决定数据从哪来 |

**适配方向**：外部数据 → **映射到契约** → CentricMem。  
Skill.md 是 L1 的适配说明书：读你的来源、填 ImportBundle / Markdown / meta，而不是让核心去 `discover` 你的环境。

域 Skill（如 `academic-db-agent`）是**示例适配器**，不是产品内核的一部分。

### 2.2 采集端 vs 组织/检索端（Coexistence）

CentricMem **不是**主采集库。会话里先靠 agent 自带的 memory（Cursor memories / 其它 memory skill / 本聊天）。不要卸载那些；也不要把 CentricMem 写成「每轮把聊天摘要成本机 `.md`」。

不强制卸载用户已有的 memory skill / 插件：

| 角色 | 谁 | 行为 |
|------|-----|------|
| **采集端** | 对方 memory skill、Cursor memories、hooks、外部库 | 继续写自己的存储；用户不必迁移写入习惯 |
| **组织/检索端** | CentricMem（云馆员） | 需要跨 Agent 可检索时才 `keep` / `note` / `log-*` / ImportBundle → ambient / search / links |
| **策展** | CentricMem（`log-decision` / `log-lesson` / `promote`） | 高价值组织结果只落在 CentricMem；**不写回**对方库 |

```text
对方 Memory skill / Cursor memories  →  采集
        │  需要归档时：Agent HTTP keep / note / import
        ▼
CentricMem librarian                 →  组织 + 检索（taxonomy / 演化 / ambient / search）
```

**原则**：agent 记忆是会话采集；馆员盘是组织后的正本。文献库也在馆员上：原文 `keep`，通读后写成卡片。标签、supersede、dismiss、promote 以 CentricMem 为真源。

### 2.3 文献库（database）

CentricMem **仍然是**文献/语料库，不是只给聊天用的检索层。

| 步骤 | 做什么 |
|------|--------|
| 入库原文 | Agent `keep`（R2 原文；卡上 Attach 指针） |
| 通读 | 人打开下载的原文，或 Agent 读卡片 / 你指定的本地副本 |
| 整理成卡片 | Markdown 单元进该库 `imported/`（语料 YAML、`work:`、recipe/volume 卡）。FTS 索引卡片，不索引附件全文 |
| 以后再来 | 同一库的 pairing key；`ambient` 见 `corpus=<id>`；`search` / `--filter` |

域适配器（如 `academic-db-agent`）可选。新文明、新批次走同一契约，不必另起一套 database 产品。

---

## 3. 记忆架构（Memory Architecture）

### 3.1 记忆类型（Taxonomy）

每种类型有不同的**写入频率、检索方式、生命周期**：

| 类型 | 含义 | 存储位置 | 检索优先级 | 生命周期 |
|------|------|----------|------------|----------|
| **Context** | 当前任务焦点（情景记忆） | `active_context.md` | 会话开始必读 | 覆盖写，短周期 |
| **Decision** | 架构/技术抉择（陈述性记忆） | `decisions/NNNN-*.md` | 问「为什么」时 boost | append-only，可 supersede |
| **Rule** | 长期约定（程序性/规范记忆） | `AGENTS.md` Global Rules | 会话开始摘要 | 人工晋升，慢变 |
| **Lesson** | 可复用知识（心智模型、事实、推理、教训） | `lessons.md` | 问「怎么想 / 已知什么 / 避免什么」时 boost | append-only |
| **Imported** | 外部归档（冷存储） | `imported/` | 按需 | 原料可增量更新（同 `external_id` upsert） |
| **Meta** | 路由与统计 | Memory Map | 始终可见（pinned） | 索引时自动更新 |

**原则**：类型只有这几种。包罗万象靠 **写入什么**（任何以后可能有用的信息），不靠加实体种类。默认：可复用知识 → Lesson；抉择 → Decision；这一轮发生了什么 → Session；外部原料 / 原文 → `keep` 或 Imported（原文在 `imported/attach/`，检索走 stub）。

### 3.2 作用域（Scope）

```text
Hub ($CENTRICMEM_HOME)
  └── Library（id / slug）← sourceDirs 指向代码目录（可无 git）；一把 pairing key
        └── Memory units（上述类型）
```

| 作用域 | 用途 |
|--------|------|
| **Client** | CLI / Skill / Manager 安装位置（`npm link`、clone）。不是记忆盘。 |
| **Hub** | 本机盘根（`setup --workspace`，默认 `~/.centricmem`）。原地包装 `projects/<id>/`，不把库拆到多个 `CENTRICMEM_HOME`。 |
| **Library** | 隔离单位：文件夹 + **pairing key**。Agent 像工作区一样可连无数库。`sourceDirs` 关联本地代码路径。 |
| **Inbox**（`unclassified`） | cwd 未 link 时的写入默认落点；导入缓冲；`inbox` / `classify --to <library>` 迁出（Move to library，不是打 topic）。健康基线是空。 |
| **This PC**（`host`） | 无 `sourceDir` 的机器杂务。用 `-p host` 或 tag `host`。 |

**写时路由**：`-p` / `library=` / `CENTRICMEM_PROJECT` → cwd 命中已 link 的 `sourceDir` → 否则 Inbox。HTTP Bearer **就是选库**。`centricmem use` / Manager 切换只影响展示，不作为静默写入目标。各库 `config.json` 可设 `classify_hints` 供 inbox 打分；可设 `display_name`。

**原则**：开发仓 ≠ 产品根。像 Steam：客户端安装位置和游戏库位置分开。代码仓库保持源码-only；记忆盘是 `$CENTRICMEM_HOME`。不要把 CLI 源码目录当成记忆盘。pairing key 在机器本地 catalog（`%APPDATA%/centricmem/libraries.json`），不进网盘副本。

### 3.3 生命周期（Lifecycle）

```text
Capture → Stage → Classify → Active → Supersede → Archive
   │         │          │         │          │          │
   │    unclassified   │    decisions/   旧决策降权   imported/
   │                   │    正确 project
 ImportBundle / migrate / log
```

| 阶段 | 动作 | 谁负责 |
|------|------|--------|
| **Capture** | 从任意来源写入 | Agent + ImportBundle |
| **Stage** | 落入 `unclassified` | 默认策略 |
| **Classify** | 迁入目标 library | Agent 问用户 + `classify --to`（Move to library） |
| **Active** | 参与检索、影响 Agent | 默认状态 |
| **Supersede** | 新决策替代旧决策，保留审计链 | `supersedes` + 双向指针 |
| **Promote** | 重复 pattern → Global Rules | `distill` 建议 + 人工确认 |
| **Archive** | 降权但仍可搜 | status: superseded / historical |

### 3.4 演化规则（Invariant）

1. **Decision append-only** — 不删不改历史，只 supersede
2. **Context 覆盖写** — 只保留当前焦点
3. **Rule 人工晋升** — 系统只建议，不自动改 Global Rules
4. **溯源保留** — `external_id`、`source`、`agent`、`logged_at`
5. **冲突可见** — 标题重叠的 active decisions 要警告

### 3.5 显式 vs 隐式记忆

| 维度 | 显式 | 隐式 |
|------|------|------|
| **用户体验** | 用户说「记一下」 | 项目自己会记得（ambient 已加载） |
| **写入触发** | `log_decision`、ImportBundle | `log-session`、hooks、migrate 发现 |
| **写入落点** | `decisions/`、`lessons.md` | `sessions/` → 可 promote/classify |
| **检索** | 用户发起 search | Skill/hooks 自动路由 + `ambient` |
| **存储格式** | 始终显式 Markdown + 溯源 | 同左 — 隐式的是触发，不是格式 |

**原则**：隐式捕获 ≠ 隐式决策。Chat transcript 是采集端（Agent 自己写的本地 jsonl）；Turn 上的 `done` / `keep` 是组织端。Decision 需确认或 promote。

**三个时钟（不要混用「session」）**：

| 时钟 | 含义 | 本地备份 | CentricMem |
|------|------|----------|------------|
| **Chat** | 一条对话 UUID | Cursor `agent-transcripts/<uuid>.jsonl`（每回合 append） | `keep` 原文到 `imported/attach/`（不进 FTS）；人下载原文 |
| **Turn** | 一次用户发问 | 同一文件已更新 | Non-Micro：`done`；有路径则 `--attach` / `keep` |
| **IDE session** | Cursor hooks `sessionStart/End` | 仅代码仓 hooks，Cloud 不触发 | `log-session --auto` |

不要等「对话结束」才有备份——备份在每回合已经写在 jsonl 里。Skill 策展时**拿这份文件**，不要把对话粘进 note。核心不扫描 `~/.cursor`；L1（Skill / adapter）传入路径。

**接入失败模式**：Skill 文案再严，Cloud / private worker 上若运行用户 PATH 里没有 `centricmem`，记忆从未发生。隐式记忆的机制是 **fresh `ambient` 进入上下文 + 结束时一条 `done`（并 keep transcript）**，不是 200 行协议。Skill 保持短 checklist；细节在 `REFERENCE.md`。无 hooks 的运行时不要把 close 写成“已经发生”。

**Secrets**：真源与 ambient 预览都消毒 credential 形字符串；不要靠 agent 自觉。

### 3.6 记忆链接（Memory Links）

记忆的整体性来自三层「联系」，各司其职、不可互相替代：

| 层 | 语义 | 真源写法 | 用途 |
|----|------|----------|------|
| **Attach** | 原文指针 | `- **Attach**: imported/attach/foo.md` | 人下载；Agent 只读卡 |
| **Supersedes** | 演化边（有向、强类型） | `- **Supersedes**: #0002` | 决策替代链、降权 |
| **Refs / Mentions** | 引用边（有向、轻量） | `- **Refs**: #0001` 或正文 `#NNNN` | 依赖遍历、ref_boost |

```text
Markdown 真源（Tags / Supersedes / Refs / 正文 #NNNN）
        ↓ index 时提取（可重建）
SQLite links 表 (from, rel, to)
        ↓
centricmem refs <seq>   +   ref_boost 排序信号
```

**原则**：
1. 关系声明在 Markdown 里（可 git diff），图只是索引 — 删库不丢边。
2. 正文提到 `#NNNN` 即自动建 `mentions` 边，**零心智负担**；`Refs` 行是显式策展，权重更高。
3. 不引入通用实体体系（Person/Task/Event）— memory unit 本身就是节点。
4. 被引用越多的决策越「承重」，进入 ref_boost；不新增排序信号。
5. Tags / Details 见 §1.1。Tags 是 about（开放 mint；分类词 work/ops 可选）。`--tag` 匹配字段或正文；`type:` / `project:` / `#NNNN` 读索引，不是新类型。

---

## 4. 记忆存储（Memory Storage）

### 4.1 真源 vs 索引（Universal Pattern）

真源是 Markdown 单元（§1.1）。索引（SQLite FTS5、`chunk_keys`）可删重建、可换引擎。删掉索引不丢数据；真源格式人类可读。

### 4.2 归一化写入（Canonical Write Path）

所有来源必须先变成**统一契约**，再落盘：

```text
任意来源 → 映射 → ImportBundle v1 → validate → write → index
```

| 来源示例 | 映射目标 |
|----------|----------|
| cursor-rules | `rules[]` |
| memory-bank decisionLog | `decisions[]` |
| Notion database | `decisions[]` + `external_id` |
| CSV / SQL | Agent 推断列映射 → bundle |

**原则**：适配器可以无限多，**契约只有一个**（ImportBundle）。  
这与数据仓库的 staging → curated 层同构。

**写路径表（采集 → 组织）**：

| 步骤 | 动作 | 落点 |
|------|------|------|
| 1 Capture | 对方 skill / 导出脚本产出记忆 | 对方存储（不动） |
| 2 Map | 字段 → ImportBundle（稳定 `external_id`） | JSON / stdin |
| 3 Ingest | `centricmem import`（原料默认 upsert） | `unclassified` 或指定 project |
| 4 Classify | `inbox` / `suggest-classify` → `classify --to` | 目标 project |
| 5 Retrieve | `ambient` / `search` / `refs` | CentricMem 索引 |
| 6 Curate | `log-decision` / `log-lesson` / `promote` | CentricMem only |

### 4.3 分块策略（Chunking）

索引按**语义边界**切分，不是按字节：

| 文档类型 | 分块单位 |
|----------|----------|
| Decision 文件 | 整文件一块（strip 元数据行） |
| AGENTS / lessons | 按 `##` 标题 |
| imported | 按文件或 `##` |

### 4.4 存储分层（Temperature）

| 温度 | 类型 | Agent 默认是否加载 |
|------|------|-------------------|
| **Hot** | active_context | 是（全文） |
| **Warm** | AGENTS 摘要 + Memory Map | 是（summary） |
| **Cool** | decisions, lessons | 检索命中才加载 |
| **Cold** | imported, superseded | 仅显式搜索 |

### 4.5 Corpus metadata 扩展（v0.11，通用模式）

任何带 YAML frontmatter 的 `imported/` 文档可被索引为可过滤 metadata：

| 机制 | 说明 |
|------|------|
| `chunk_meta` | 完整 frontmatter JSON，低频字段用 `json_extract` 过滤 |
| 热字段列 | `config.metadata.hot_columns` + `hot_columns_enabled`（大规模语料时开启） |
| `--filter` | `centricmem search "…" --filter civilization=chinese` |
| `domain_boost` | 项目 config 定义维度关键词 → `imported/` 路径前缀加权 |
| ImportBundle | `meta` + `rel_path` 写入时保留子目录结构 |

学术域（ancient-medicine）是此模式的第一个消费者。YAML 面是该项目的 Details（§1.1），不是第七种记忆类型；核心不写死 15 个比较维度。

---

## 5. 记忆检索（Memory Retrieval）

### 5.1 检索路由（何时用什么）

| 用户/任务意图 | 检索方式 | 不要 |
|--------------|----------|------|
| 会话开始 | 读 Context + AGENTS summary | 盲目 search |
| 「为什么选 X」 | `search` + intent=decision | 全文扫 decisions/ |
| 「当前在做什么」 | 读 active_context | search |
| 「踩过什么坑」 | `search` + intent=lessons | — |
| 「X 依赖/引用了什么」 | `refs <seq>`（链接遍历） | 全文搜依赖关系 |
| 不确定关键词 | Memory Map → 换关键词再 search | 放弃 |
| 跨库 | CLI `search --all`（已打开的 catalog 库）或 `project:<id>` | HTTP 客人一把 key 只搜这一库；不要默认搜遍别人的库 |
| 按主题 / 编号 / 类型 | `--tag` / `type:decision` / `#0016` / `project:<id>`（§1.1） | 把 Library id 并进 Tags；裸词 `decision` 当类型过滤 |

**原则**：检索是**策略问题**，不是「一律 search」或「一律读文件」。

### 5.2 排序模型（Multi-Signal Ranking）

当前实现（可换引擎，信号保留）：

```text
score = relevance × time_decay × status_penalty × ref_boost × intent_boost × key_boost
```

| 信号 | 含义 | 通用性 |
|------|------|--------|
| relevance | 关键词/语义相关 | 任何检索系统 |
| time_decay | 新记忆优先 | 情景记忆衰减 |
| status_penalty | superseded 降权 | 生命周期 |
| ref_boost | 常被引用的更重要 | PageRank-lite |
| intent_boost | 问「为什么」boost decision | 查询路由 |
| key_boost | Tags / id 字段命中加分（正文仍能召回） | 寻址平面 |

**未来**：relevance 可换 BM25 → 向量 → 混合，**其他信号应保留**。

### 5.3 渐进披露（Progressive Disclosure）

```text
Level 0: search 命中片段（卡片正文附近 + tags / attach 指针）
Level 1: `show <file>` 记忆单元（给 Agent 的卡）
原文: 人 Download Original；不进 Agent 上下文，不进 FTS
```

**原则**：默认少占 context window。卡是给 Agent 的；原文给人下载后在本机打开。不要把 dump 写进 note body，也不要把原文灌进对话（不要 `show --original` / `show?original=` 当 Agent 路径）。

### 5.4 检索范围

| 范围 | 命令 | 场景 |
|------|------|------|
| 当前 library | 默认 / Bearer | 日常开发 |
| 指定 library | `--project` / `--library` / `-p` | 切换上下文（CLI）；HTTP 必须换对应 key |
| 已打开的库 | CLI `--all` | 跨库联想；不是「同一把 key 读全 hub」 |

---

## 6. 接入方式（Agent Integration）

### 6.1 推荐路径（Skill-first）

```text
Skill 安装 → CENTRICMEM_URL + 该库 pairing key
  → Agent 读短 Skill；session start HTTP GET /ambient
  → 检索 GET /search，读卡 GET /show
  → 结束时一次 HTTP sweep（/keep 字节或签名 PUT，/note，/done）
```

### 6.2 可选路径

| 方式 | 角色 |
|------|------|
| **Skill** | 教策略（L1） |
| **Librarian HTTP** | 执行存储与检索（L0）；客人主路径 |
| **CLI** | 馆员主机上的运维 / 脚本，不是 Agent 回落 |
| **读 Markdown** | 人下载后在本机打开（L0） |
| **centricmem-host** | 沙箱连接器 → 云 URL |
| **centricmem-mcp** | optional/legacy 工具遥控器 |
| **restic → R2** | 灾备，不是产品同步 |

---

## 7. 首轮 Prompt 模板（给 Agent / 开发者）

复制以下 block 作为新功能或新项目的起点：

```markdown
我们在做【记忆层产品】，不是【MCP 工具】。

必须定义：
1. 记忆类型 taxonomy 与生命周期
2. 真源格式 + 索引（可重建）
3. 归一化写入契约（如 ImportBundle）
4. 摄入缓冲区（unclassified）+ 分类步骤
5. 检索路由表（何时读文件 vs search vs 全量）
6. 排序信号（相关性、时间、状态、意图）
7. 渐进披露层级

接入：Skill 主路径；HTTP 打馆员；MCP 仅沙箱连接器。不要把 Drive/rsync 当正本。

多 project workspace 是一期需求。
```

---

## 8. 当前实现对照（v0.21.6）

| 设计原则 | 实现状态 |
|----------|----------|
| 记忆类型 taxonomy | 有（decision/context/rule/lesson/session/imported） |
| unclassified Staging / 收件箱 | 有（写时未 link → inbox；`inbox` / `classify`） |
| 写时路由（env / cwd-link / 否则 unclassified） | 有（`use` 不静默接收写入） |
| ImportBundle 归一化 | 有（含 sessions/research；`meta` + `rel_path`） |
| Supersede 链 | 有 |
| 检索多信号排序 | 有（+ explain + dismiss） |
| Intent router | 有（含 research） |
| Progressive disclosure | 有（L0 search / L1 `show` 卡片；原文人下载） + ambient |
| Session / Episodic 层 | 有（`sessions/<stamp>-<writer>-<id>.md`；兼容旧日更文件） |
| Promote 工作流 | 有（`centricmem promote --confirm`） |
| suggest-classify | 有（Tags / slug / sourceDir 加权） |
| inbox 清单 + 高置信度 --apply | 有 |
| Workspace 健康仪表 | 有（`status --workspace`） |
| 混合检索（BM25 + API embedding） | 有（`search --semantic`；RRF 融合见 CHANGELOG） |
| Agent 产品家目录 `$CENTRICMEM_HOME` | 有（默认 `~/.centricmem`，不进业务 git） |
| 客人 CLI 拒绝 leftover hub 写入 | 有（远程 `origin` / `CENTRICMEM_URL`；search/show/ambient 走 HTTP） |
| `--migrate-from-local` | 有 |
| Import upsert（`external_id`） | 有（imported/research） |
| 隐式记忆（ambient + hooks） | 有 |
| Drive / 文件夹双向同步 | 不做产品路径；灾备 restic→R2（[SYNC.md](./SYNC.md)） |
| Memory Links（project 内） | 有（supersedes/refs/mentions + `refs` 遍历 + ref_boost） |
| Corpus metadata 过滤 | 有（`chunk_meta` + `--filter` / MCP `meta`） |
| domain_boost 排序钩子 | 有（`config.json`，域内容在 L1 config） |
| Skill 版本自检 | 有（`centricmem skill status`，pull-based） |
| L1 域适配示例 | 有（`academic-db-agent` Skill + ancient-medicine config 模板） |
| 远程只读索引 | roadmap（`remote_index_url` 预留） |
| 跨 project 记忆链接 | roadmap |

---

## 9. 优化路线图（v0.14 完成态）

P0–P3、Memory Links、corpus metadata、domain_boost、skill status、产品家目录、coexistence / import upsert、**RRF 双路融合**、**valid_from/valid_until**、**explain 轨迹**、ImportBundle 协议文档、hooks `--auto` session 已落地。

**分工模型**：其他 memory skill 可作为**采集端**继续写入；CentricMem 作为**组织/检索端**（ImportBundle 摄入 → classify → ambient/search）。策展（decision / lesson / promote）落在 CentricMem，不写回对方库。

后续候选：

1. 跨 project 记忆链接与关联推荐
2. 远程只读索引实现
3. 更丰富的 hook 事件（file save、PR merge）
4. Session→Memory bridge（L1：`keep` 本地 transcript；核心不解析各家 jsonl）

## 10. 通用性声明

CentricMem 的设计可复用到任何「Agent + 持久记忆」场景：

| 概念 | CentricMem | 其他系统可替换 |
|------|------------|----------------|
| 真源 | Markdown | JSONL、Postgres、S3 objects |
| 索引 | SQLite FTS5 | Elasticsearch、向量库 |
| 归一化契约 | ImportBundle | Avro、Protobuf、自定义 schema |
| 摄入缓冲 | unclassified | staging table / queue |
| 接入 | Skill + 馆员 HTTP | 其他 agent 框架 |
| 灾备 | restic → R2 | 厂商快照、磁带 |

**不变的是 §3–§5 的架构、存储、检索原则。**

---

## 相关文档

- [ARCHITECTURE.md](./ARCHITECTURE.md) — 模块与代码结构
- [PRODUCT_HOST.md](./PRODUCT_HOST.md) — 使用面（云馆员 / HTTP / 钥匙）
- [BETA.md](./BETA.md) — 安装与试用
- [skills/centricmem-agent/SKILL.md](./skills/centricmem-agent/SKILL.md) — Agent 工作流
