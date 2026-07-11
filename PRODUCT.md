# CentricMem — 产品设计真源（Product Source of Truth）

> 本文档定义**记忆架构、存储方式、检索方式**。  
> 技术实现见 [ARCHITECTURE.md](./ARCHITECTURE.md)；Agent 行为见 [skills/centricmem-agent/SKILL.md](./skills/centricmem-agent/SKILL.md)。  
> 下列原则对**任何数据存储系统**通用，不仅限于 CentricMem 当前实现。

---

## 1. 产品一句话

**CentricMem 是跨 Agent 的本地项目记忆 OS：用统一的记忆模型管理写入、分类、检索与演化；技术栈（Markdown、FTS5、Skill、Drive MCP）都是可替换的实现层。**

---

## 2. 三层分离（所有记忆产品都应遵守）

```text
┌─────────────────────────────────────────────────────────┐
│  L1 接入与策略层 — 何时读/写/导入/分类（Skill、工作流）      │
├─────────────────────────────────────────────────────────┤
│  L0 记忆核心层 — 架构 + 存储真源 + 检索索引（本地）         │
├─────────────────────────────────────────────────────────┤
│  L2 外部复制层 — 可选 sync / 远程副本（Drive MCP 等）       │
└─────────────────────────────────────────────────────────┘
```

| 层 | 回答的问题 | CentricMem 实现 | 常见误区 |
|----|-----------|-----------------|----------|
| **架构** | 记忆分几类？如何演化？ | 见 §3–§5 | 把「文件夹结构」当架构 |
| **存储** | 真源是什么？如何写入？ | Markdown + append-only | 把索引库当真源 |
| **检索** | 何时搜、搜什么、怎么排序？ | FTS5 + 多信号排序 + 渐进披露 | 把 MCP 当检索引擎 |
| **接入** | Agent 什么时候碰记忆？ | Skill + CLI | 把 MCP 当主入口 |

**MCP 只属于 L2（外部 sync），不属于记忆核心。**

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

不强制卸载用户已有的 memory skill / 插件：

| 角色 | 谁 | 行为 |
|------|-----|------|
| **采集端** | 对方 memory skill、hooks、外部库 | 继续写自己的存储；用户不必迁移写入习惯 |
| **组织/检索端** | CentricMem | ImportBundle / migrate 摄入副本 → stage → classify → ambient / search / links |
| **策展** | CentricMem（`log-decision` / `log-lesson` / `promote`） | 高价值组织结果只落在 CentricMem；**不写回**对方库 |

```text
对方 Memory skill  →  采集
        │  import / 增量 sync（原料副本）
        ▼
CentricMem        →  组织 + 检索（taxonomy / 演化 / ambient / search）
```

**原则**：sync 进来的是原料；标签、supersede、dismiss、promote 以 CentricMem 为真源。

---

## 3. 记忆架构（Memory Architecture）

### 3.1 记忆类型（Taxonomy）

每种类型有不同的**写入频率、检索方式、生命周期**：

| 类型 | 含义 | 存储位置 | 检索优先级 | 生命周期 |
|------|------|----------|------------|----------|
| **Context** | 当前任务焦点（情景记忆） | `active_context.md` | 会话开始必读 | 覆盖写，短周期 |
| **Decision** | 架构/技术抉择（陈述性记忆） | `decisions/NNNN-*.md` | 问「为什么」时 boost | append-only，可 supersede |
| **Rule** | 长期约定（程序性/规范记忆） | `AGENTS.md` Global Rules | 会话开始摘要 | 人工晋升，慢变 |
| **Lesson** | 踩坑与教训（错误记忆） | `lessons.md` | 问「避免什么」时 boost | append-only |
| **Imported** | 外部归档（冷存储） | `imported/` | 按需 | 原料可增量更新（同 `external_id` upsert） |
| **Meta** | 路由与统计 | Memory Map | 始终可见（pinned） | 索引时自动更新 |

**原则**：Agent 写入前必须先判断「这条信息属于哪一类」——类型错了，检索就会一直错。

### 3.2 作用域（Scope）

```text
Agent product home ($CENTRICMEM_HOME, default ~/.centricmem)
  └── Project（slug）← sourceDir 指向代码目录（可无 git）
        └── Memory units（上述类型）
```

| 作用域 | 用途 |
|--------|------|
| **Product home** | Agent 侧独立 hub（不进业务/源码 git） |
| **Project** | 隔离不同代码库/产品的记忆；`sourceDir` 关联本地路径 |
| **unclassified** | **摄入缓冲区** — 所有导入的默认落点，待分类 |

**原则**：开发仓 ≠ 产品根。代码仓库保持源码-only；记忆与 Skill 在 `$CENTRICMEM_HOME`（及 `~/.cursor/skills`）。先摄入、后分类。

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
| **Classify** | 迁入目标 project | Agent 问用户 + `classify` |
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

**原则**：隐式捕获 ≠ 隐式决策。Session 自动记；Decision 需确认或 promote。

### 3.6 记忆链接（Memory Links）

记忆的整体性来自三层「联系」，各司其职、不可互相替代：

| 层 | 语义 | 真源写法 | 用途 |
|----|------|----------|------|
| **Tags** | 主题集合（无方向） | `- **Tags**: redis, auth` | 搜索命中、distill 聚类 |
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

---

## 4. 记忆存储（Memory Storage）

### 4.1 真源 vs 索引（Universal Pattern）

```text
Source of Truth（可 git、可审、可 diff）  →  Index（可删、可重建、可换引擎）
     Markdown files                           SQLite FTS5
```

**任何存储系统都应满足**：删掉索引不丢数据；真源格式人类可读。

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
| 4 Classify | `suggest-classify` → `classify --to` | 目标 project |
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

学术域（ancient-medicine）是此模式的第一个消费者；核心不写死 15 个比较维度。

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
| 跨项目 | `search --all` | 逐个读目录 |

**原则**：检索是**策略问题**，不是「一律 search」或「一律读文件」。

### 5.2 排序模型（Multi-Signal Ranking）

当前实现（可换引擎，信号保留）：

```text
score = relevance × time_decay × status_penalty × ref_boost × intent_boost
```

| 信号 | 含义 | 通用性 |
|------|------|--------|
| relevance | 关键词/语义相关 | 任何检索系统 |
| time_decay | 新记忆优先 | 情景记忆衰减 |
| status_penalty | superseded 降权 | 生命周期 |
| ref_boost | 常被引用的更重要 | PageRank-lite |
| intent_boost | 问「为什么」boost decision | 查询路由 |

**未来**：relevance 可换 BM25 → 向量 → 混合，**其他信号应保留**。

### 5.3 渐进披露（Progressive Disclosure）

```text
Level 0: Memory Map + AGENTS 摘要 + active_context 全文
Level 1: search 命中片段
Level 2: 读完整 decision / imported 文件
```

**原则**：默认少占 context window；不够再加深。

### 5.4 检索范围

| 范围 | 命令 | 场景 |
|------|------|------|
| 当前 project | 默认 | 日常开发 |
| 指定 project | `--project <slug>` | 切换上下文 |
| 全 workspace | `--all` | 跨项目联想 |

---

## 6. 接入方式（Agent Integration）

### 6.1 推荐路径（Skill-first）

```text
git clone centricmem-skill → npm link
  → centricmem setup --install-skill
  → Agent 读 Skill
  → CLI + 读文件 + import/classify
  → centricmem skill status（pull-based Skill 更新）
```

### 6.2 可选路径

| 方式 | 角色 |
|------|------|
| **Skill** | 教策略（L1） |
| **CLI** | 执行存储与检索（L0） |
| **读 Markdown** | 直接读真源（L0） |
| **centricmem-mcp** | optional/legacy 工具遥控器 |
| **Drive MCP** | L2 sync |

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

接入：Skill 主路径；MCP 仅外部 sync。

多 project workspace 是一期需求。
```

---

## 8. 当前实现对照（v0.12.0）

| 设计原则 | 实现状态 |
|----------|----------|
| 记忆类型 taxonomy | 有（decision/context/rule/lesson/session/imported） |
| unclassified Staging | 有 |
| ImportBundle 归一化 | 有（含 sessions/research；`meta` + `rel_path`） |
| Supersede 链 | 有 |
| 检索多信号排序 | 有（+ explain + dismiss） |
| Intent router | 有（含 research） |
| Progressive disclosure | 有（readContext + ambient） |
| Session / Episodic 层 | 有（`sessions/` append-only） |
| Promote 工作流 | 有（`centricmem promote --confirm`） |
| suggest-classify | 有 |
| Workspace 健康仪表 | 有（`status --workspace`） |
| 混合检索（BM25 + API embedding） | 有（`search --semantic`） |
| 隐式记忆（ambient + hooks） | 有 |
| Drive sync 契约 | 有（[SYNC.md](./SYNC.md)） |
| Memory Links（project 内） | 有（supersedes/refs/mentions + `refs` 遍历 + ref_boost） |
| Corpus metadata 过滤 | 有（`chunk_meta` + `--filter` / MCP `meta`） |
| domain_boost 排序钩子 | 有（`config.json`，域内容在 L1 config） |
| Skill 版本自检 | 有（`centricmem skill status`，pull-based） |
| L1 域适配示例 | 有（`academic-db-agent` Skill + ancient-medicine config 模板） |
| 远程只读索引 | roadmap（`remote_index_url` 预留） |
| 跨 project 记忆链接 | roadmap |

---

## 9. 优化路线图（v0.12 完成态）

P0–P3、Memory Links、corpus metadata、domain_boost、skill status、agent-agnostic Skill 路径（`.centricmem/skills/`）已落地。

**分工模型**：其他 memory skill 可作为**采集端**继续写入；CentricMem 作为**组织/检索端**（ImportBundle 摄入 → classify → ambient/search）。策展（decision / lesson / promote）落在 CentricMem，不写回对方库。

后续候选：

1. 跨 project 记忆链接与关联推荐
2. 远程只读索引实现
3. 更丰富的 hook 事件（file save、PR merge）
4. Session→Memory bridge（L1 适配器；核心不绑定具体 Agent / UI 产品）

## 10. 通用性声明

CentricMem 的设计可复用到任何「Agent + 持久记忆」场景：

| 概念 | CentricMem | 其他系统可替换 |
|------|------------|----------------|
| 真源 | Markdown | JSONL、Postgres、S3 objects |
| 索引 | SQLite FTS5 | Elasticsearch、向量库 |
| 归一化契约 | ImportBundle | Avro、Protobuf、自定义 schema |
| 摄入缓冲 | unclassified | staging table / queue |
| 接入 | Skill + CLI | 其他 agent 框架 |
| 外部 sync | Drive MCP | S3 sync、git remote |

**不变的是 §3–§5 的架构、存储、检索原则。**

---

## 相关文档

- [ARCHITECTURE.md](./ARCHITECTURE.md) — 模块与代码结构
- [BETA.md](./BETA.md) — 安装与试用
- [skills/centricmem-agent/SKILL.md](./skills/centricmem-agent/SKILL.md) — Agent 工作流
