/**
 * templates.ts — all templates: init file scaffolding + project memory templates.
 * (Merged from templates.ts + project-templates.ts)
 */
import fs from "node:fs";
import path from "node:path";
import { resolvePaths, nowISO } from "./core.js";

// ---------------------------------------------------------------------------
// Init file templates
// ---------------------------------------------------------------------------

export function agentsTemplate(projectName: string, createdAt: string): string {
  return `# ${projectName} — Project Memory (AGENTS.md)

> This file is the entry point of the CentricMem memory system.
> Source of Truth: Markdown files under \`.centricmem/\`. The SQLite index is derivative.

## Project Overview

<!-- Describe the project goal, tech stack, and key constraints here. -->

## Global Rules

<!-- Long-term rules promoted from decisions/ go here. Only humans (or an admin agent) should edit this section. -->

## How Agents Should Use This Memory

1. At session start, read \`.centricmem/projects/<current>/AGENTS.md\` and \`active_context.md\` (or run \`centricmem status\`).
2. Before assumptions, run \`centricmem search "<keywords>"\`.
3. After significant decisions, append via \`centricmem import\` or add \`decisions/NNNN-slug.md\`, then \`centricmem index\`.
4. When focus changes, update \`active_context.md\` or \`centricmem\` workflow per Skill.

## Memory Map

<!-- centricmem:map -->
| Type | Count | Last Updated |
|------|-------|--------------|
| Decisions | 0 | — |
| Rules | 0 | — |
| Lessons | 0 | — |
| Imported | 0 | — |
| Sessions | 0 | — |

Last indexed: — | Total chunks: 0
<!-- /centricmem:map -->

| File | Purpose | Load |
|------|---------|------|
| \`AGENTS.md\` | Global rules and project overview (this file) | Always (Level 0) |
| \`active_context.md\` | Current task focus, overwritable | Always (Level 0) |
| \`decisions/\` | Append-only architecture decision records | On demand via \`centricmem search\` (Level 1) |
| \`lessons.md\` | Common pitfalls and hard-won knowledge | On demand via \`centricmem search\` (Level 1) |
| \`sessions/\` | Episodic session log (append-only) | Recent tail at session start; search on demand |
| \`imported/\` | Archived documents imported by \`centricmem migrate\` | On demand (Level 1) |

<!-- centricmem:meta created_at=${createdAt} -->
`;
}

export function activeContextTemplate(createdAt: string): string {
  return `# Active Context

> Current task focus. Overwrite when the focus changes (agents: keep it short).

## Current Focus

(Nothing yet — update me when work begins.)

<!-- centricmem:meta updated_at=${createdAt} updated_by=init -->
`;
}

export function lessonsTemplate(): string {
  return `# Lessons

> Common pitfalls and hard-won knowledge. Append new lessons at the end.
`;
}

export function decisionTemplate(opts: {
  seq: number;
  title: string;
  context: string;
  decision: string;
  consequences?: string;
  agent: string;
  loggedAt: string;
  tags?: string[];
  supersedes?: number;
}): string {
  const id = String(opts.seq).padStart(4, "0");
  const tagsLine = opts.tags?.length ? `\n- **Tags**: ${opts.tags.join(", ")}` : "";
  const supersedesLine = opts.supersedes
    ? `\n- **Supersedes**: #${String(opts.supersedes).padStart(4, "0")}`
    : "";
  return `# ${id}. ${opts.title}

- **Status**: Accepted
- **Logged at**: ${opts.loggedAt}
- **Logged by**: ${opts.agent}${tagsLine}${supersedesLine}

## Context

${opts.context}

## Decision

${opts.decision}

## Consequences

${opts.consequences || "(not specified)"}
`;
}

export function cursorRulesPointer(): string {
  return `# CentricMem Pointer
Please follow the CentricMem Agent Skill: \`.cursor/skills/centricmem-agent/SKILL.md\`
Project memory lives under \`.centricmem/projects/<name>/\`.
Use \`centricmem search\`, \`centricmem import\`, and read \`AGENTS.md\` / \`active_context.md\` for the current project.
MCP (e.g. Drive) is optional — for syncing memory to external storage only.
`;
}

export function claudeMdPointer(): string {
  return `# CentricMem Pointer

Follow \`.cursor/skills/centricmem-agent/SKILL.md\` (or \`skills/centricmem-agent/SKILL.md\` in the package).

Memory: \`.centricmem/projects/<current>/\`
CLI: \`centricmem search\`, \`centricmem import\`, \`centricmem use <project>\`
`;
}

export function indexGitignore(): string {
  return `*\n`;
}

// ---------------------------------------------------------------------------
// Project memory templates (merged from project-templates.ts)
// ---------------------------------------------------------------------------

export interface ProjectTemplate {
  name: string;
  description: string;
  /** Markdown bullet list appended under "## Global Rules" in AGENTS.md. */
  rules: string[];
  /** Starter entries appended to lessons.md (each becomes an H2 section). */
  lessons?: { title: string; body: string }[];
  /** Extra files created under .centricmem/ (relative path -> content). */
  files?: Record<string, string>;
}

const TEMPLATES: ProjectTemplate[] = [
  {
    name: "general",
    description: "Generic template (default) — minimal conventions for any project",
    rules: [
      "Log every significant technical decision via `centricmem log-decision` before implementing it.",
      "Keep `active_context.md` updated whenever the task focus changes.",
      "Search memory before proposing architecture changes; respect prior decisions unless explicitly superseded.",
    ],
  },
  {
    name: "web-app",
    description: "React/Next.js web application — component, state, and styling conventions",
    rules: [
      "Use functional React components with hooks; no class components.",
      "Co-locate component files: `Component.tsx` with its styles and tests in the same directory.",
      "Server state belongs in a data-fetching layer (e.g. React Query/SWR); client state stays in local hooks or a single store — never mix the two.",
      "All routes/pages must handle loading and error states explicitly.",
      "Tailwind (or the project's design tokens) over ad-hoc inline styles.",
    ],
    lessons: [
      {
        title: "Hydration mismatches",
        body: "Anything depending on `window`, time, or randomness must be gated behind `useEffect`/dynamic import to avoid SSR hydration mismatches.",
      },
    ],
  },
  {
    name: "api-service",
    description: "REST/GraphQL API service — endpoint, validation, and versioning conventions",
    rules: [
      "Every endpoint validates input at the boundary (schema validation) and returns typed, documented errors.",
      "Breaking API changes require a new version prefix (e.g. `/v2/`); never mutate existing contracts in place.",
      "Database access goes through a repository/service layer — no queries in route handlers.",
      "All external calls must have explicit timeouts and error mapping.",
      "Log decisions about auth, rate limiting, and pagination schemes in decisions/ — these are the most frequently revisited topics.",
    ],
    lessons: [
      {
        title: "N+1 queries",
        body: "Watch for N+1 query patterns when resolving nested resources; prefer batch loading (JOIN or dataloader).",
      },
    ],
  },
  {
    name: "research",
    description: "Academic research project — literature, argument chains, and terminology memory",
    rules: [
      "Every factual claim in drafts must trace to a source recorded in `sources.md` (citation key, page/locator).",
      "Record each major interpretive/argumentative choice as a decision (title = the claim, context = competing readings, decision = adopted position).",
      "Maintain `glossary.md`: every technical term gets a working definition and source on first use; distinguish consensus definitions from contested ones.",
      "Never delete rejected hypotheses — mark the decision as Superseded so the argument trail stays auditable.",
    ],
    files: {
      "sources.md": `# Sources\n\n> Literature index. One entry per source: citation key, full reference, key claims used.\n\n<!-- Add entries as: ## [citekey] Author (Year) Title -->\n`,
      "glossary.md": `# Glossary\n\n> Terminology table. Distinguish consensus definitions from contested ones.\n\n| Term | Working definition | Source | Contested? |\n|------|--------------------|--------|------------|\n`,
    },
    lessons: [
      {
        title: "Citation drift",
        body: "When paraphrasing across drafts, claims drift away from what the source actually says. Re-verify quotes against the original before each submission.",
      },
    ],
  },
];

export function listTemplates(): { name: string; description: string }[] {
  return TEMPLATES.map((t) => ({ name: t.name, description: t.description }));
}

/** Apply a template. Additive and idempotent. Returns list of updated files (relative to root). */
export function applyTemplate(root: string, name: string): string[] {
  const tpl = TEMPLATES.find((t) => t.name === name.toLowerCase());
  if (!tpl) {
    throw new Error(
      `unknown template '${name}'. Available: ${TEMPLATES.map((t) => t.name).join(", ")}`
    );
  }
  const paths = resolvePaths(root);
  const updated: string[] = [];
  const marker = `<!-- centricmem:template ${tpl.name} -->`;

  // 1. Append rules to the Global Rules section of AGENTS.md.
  let agents = fs.readFileSync(paths.agentsFile, "utf8");
  if (!agents.includes(marker)) {
    const block = `\n${marker}\n### Template: ${tpl.name} (applied ${nowISO()})\n\n${tpl.rules.map((r) => `- ${r}`).join("\n")}\n`;
    const anchor = "## Global Rules\n";
    const idx = agents.indexOf(anchor);
    if (idx !== -1) {
      const insertAt = idx + anchor.length;
      agents = agents.slice(0, insertAt) + block + agents.slice(insertAt);
    } else {
      agents += `\n## Global Rules\n${block}`;
    }
    fs.writeFileSync(paths.agentsFile, agents, "utf8");
    updated.push(path.relative(root, paths.agentsFile));
  }

  // 2. Starter lessons.
  if (tpl.lessons?.length) {
    let lessons = fs.existsSync(paths.lessonsFile)
      ? fs.readFileSync(paths.lessonsFile, "utf8")
      : "# Lessons\n";
    if (!lessons.includes(marker)) {
      const block = `\n${marker}\n${tpl.lessons.map((l) => `## ${l.title}\n\n${l.body}`).join("\n\n")}\n`;
      fs.writeFileSync(paths.lessonsFile, lessons.trimEnd() + "\n" + block, "utf8");
      updated.push(path.relative(root, paths.lessonsFile));
    }
  }

  // 3. Extra memory files (never overwrite existing).
  for (const [rel, content] of Object.entries(tpl.files ?? {})) {
    const abs = path.join(paths.memDir, rel);
    if (!fs.existsSync(abs)) {
      fs.writeFileSync(abs, content, "utf8");
      updated.push(path.relative(root, abs));
    }
  }

  return updated;
}
