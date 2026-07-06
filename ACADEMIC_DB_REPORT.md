# 学术语料 × CentricMem 适配报告

> v0.11.1 | 2026-07-06  
> 定位：**L1 域适配案例**，非 CentricMem 产品内核文档

---

## 1. 执行摘要

**问题**：大量带 YAML 元数据的语料已导入 CentricMem，但元数据嵌在 body 内，无法过滤；领域合成工作流未 Skill 化。

**结论**：

- **L0** 增加通用能力：`meta` 存储、`--filter`、`domain_boost` 配置钩子、`rel_path` 导入路径
- **L1** 增加 `academic-db-agent` Skill + 导出脚本，示范**一种**外部 corpus 如何映射到 ImportBundle
- **不做**：表格行分块、在核心硬编码领域维度、为特定 Agent 品牌写解析器

**边界原则**（PRODUCT §2.1）：外部数据 → Skill 映射 → CentricMem 契约。**Adapter in, not Platform out.**

---

## 2. L0 通用能力（任何域可复用）

| 能力 | 用法 | 域无关 |
|------|------|--------|
| `chunk_meta` | frontmatter → JSON | ✅ |
| `--filter key=value` | 精确 metadata 过滤 | ✅ |
| `domain_boost` | config 中 keywords + path_prefix | ✅ 钩子通用，内容在 config |
| `imported[].meta` + `rel_path` | ImportBundle 契约 | ✅ |
| 热字段列 | `hot_columns_enabled` 默认 false | ✅ |

### Schema v5（摘要）

```sql
CREATE TABLE chunk_meta (chunk_id INTEGER PRIMARY KEY, meta_json TEXT NOT NULL);
-- 可选热列：meta_civilization, meta_type, meta_has_incantation
```

### ImportBundle 契约扩展

```json
{
  "title": "…",
  "rel_path": "corpus/recipes/foo.md",
  "meta": { "civilization": "babylonian", "type": "recipe" },
  "body": "markdown without frontmatter"
}
```

---

## 3. L1 适配模式（Skill 负责映射）

```text
你的数据源（DB / files / API）
        │
        ▼  你的导出脚本（一次性或定期）
   ImportBundle JSON
        │
        ▼  centricmem import
   .centricmem/projects/<slug>/imported/
        │
        ▼  centricmem index
   search + --filter + domain_boost（读 config.json）
        │
        ▼  你的域 Skill 教 Agent 何时深读、合成、log-decision
```

**学术域示例文件**（可复制改写成其他领域）：

| 文件 | 角色 |
|------|------|
| `skills/academic-db-agent/SKILL.md` | L1 工作流（搜索→深读→合成→记录） |
| `templates/config.ancient-medicine.json` | 该项目的 `domain_boost` 示例 |
| `export_to_*.py`（用户侧） | 源系统 → ImportBundle 的映射器 |

---

## 4. 反馈回应（摘要）

| 反馈 | 处理 |
|------|------|
| 大规模 metadata 扫描慢 | 热列就位，默认关；MVP 用 json_extract |
| 表格行分块 | 搁置；crosswalk = 1 file = 1 chunk |
| 15 维进核心 taxonomy | 拒绝；仅 config + Skill |
| 合成 > 搜索 | L1 Skill 五步工作流 |

---

## 5. 明确不做

- 核心识别 Cursor / Reasonix / 任何 Agent 品牌
- 核心扫描 session 目录或对接会话浏览器
- Web UI、token 成本追踪
- 在 `classifyIntent()` 硬编码学术维度

---

## 6. 验收

| 项 | 状态 |
|----|------|
| 39 integration + 14 scenarios | ✅ |
| `--filter` / MCP `meta` | ✅ |
| `domain_boost` | ✅ |
| academic-db-agent Skill | ✅ L1 示例 |

---

## 附录 A — 学术库操作手册（单一部署实例）

> 以下仅适用于已选择 `ancient-medicine` 项目 slug 的部署，**不是** CentricMem 通用安装步骤。

```bash
# 1. 导出（你的脚本 → ImportBundle）
python academic/_scripts/export_to_centricmem.py

# 2. 导入
centricmem import academic/_scripts/bundles/corpus-batch-001.json -p ancient-medicine

# 3. 项目 config（domain_boost 示例）
cp templates/config.ancient-medicine.json .centricmem/projects/ancient-medicine/config.json

# 4. 索引与验证
centricmem index -p ancient-medicine
centricmem search "hemorrhoid" -p ancient-medicine --filter civilization=babylonian -t imported
```

合成路径：`search` → 读 crosswalk 全文 → 草稿表 → `log-decision --refs "…"`。

---

## 附录 B — 生态参考（非产品集成）

第三方会话可观测工具（如 AgentsView）与 CentricMem **互补**：前者管原始 transcript，后者管策展记忆。  
**不**在 CentricMem 核心实现桥接；若需要，由用户自己的 L1 Skill 描述工作流。

---

*存档：centricmem-skill / ACADEMIC_DB_REPORT.md*
