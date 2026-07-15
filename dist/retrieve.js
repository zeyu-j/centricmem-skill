/**
 * retrieve.ts — read-side strategy: retrieval routing (when to read vs search
 * vs walk links) and the implicit-memory ambient preflight block.
 */
import fs from "node:fs";
import path from "node:path";
import { classifyIntent } from "./indexer.js";
import { healthCheck, listDecisions, readRecentSessions, countTodaySessions } from "./memory.js";
import { getCurrentProjectSlug, workspaceHealth } from "./workspace.js";
import { skillStatus, skillStatusHintLine } from "./skill.js";
const RESEARCH_PATTERNS = /调研|研究|survey|research|external|文献|对比/i;
const ACADEMIC_PATTERNS = /维度|对照|crosswalk|语料|corpus|文明|civilization|incantation|咒语|马王堆|巴比伦/i;
const CROSS_PROJECT = /跨项目|其他项目|all projects|cross.?project|别的项目/i;
const UNCERTAIN = /不确定|不知道|忘了|记不清|maybe|not sure/i;
const LINKS_PATTERNS = /依赖|引用|关联|相关决策|depends on|references|referenced|linked|related decisions?/i;
export function routeQuery(query) {
    const q = query.trim();
    const intent = classifyIntent(q);
    if (LINKS_PATTERNS.test(q)) {
        return {
            action: "refs",
            intent: "decision",
            reason: "Dependency/reference query → walk memory links (`centricmem refs <seq>`)",
        };
    }
    if (ACADEMIC_PATTERNS.test(q)) {
        return {
            action: "search",
            intent: "research",
            suggestedType: "imported",
            reason: "Academic/corpus query → search imported docs with --filter; read crosswalk files in full",
        };
    }
    if (RESEARCH_PATTERNS.test(q)) {
        return {
            action: "search",
            intent: "general",
            suggestedType: "imported",
            reason: "Research-style query → search imported docs",
        };
    }
    if (CROSS_PROJECT.test(q)) {
        return {
            action: "search_all",
            intent,
            reason: "Cross-project keywords → search --all",
        };
    }
    if (UNCERTAIN.test(q)) {
        return {
            action: "read_context",
            intent: "general",
            reason: "Uncertain query → read Memory Map + active_context first",
        };
    }
    if (intent === "context") {
        return {
            action: "read_context",
            intent,
            reason: "Current-focus query → read active_context",
        };
    }
    if (intent === "decision") {
        return {
            action: "search",
            intent,
            suggestedType: "decision",
            reason: "Why/rationale query → search decisions",
        };
    }
    if (intent === "lessons") {
        return {
            action: "search",
            intent,
            suggestedType: "lessons",
            reason: "Pitfall/avoid query → search lessons",
        };
    }
    return {
        action: "search",
        intent: "general",
        reason: "Default → search project memory",
    };
}
/** Parseable preflight when `$CENTRICMEM_HOME` has no workspace.json yet. Exit 0 for agents. */
export function formatUninitializedAmbient(home) {
    const text = `CentricMem: state=UNINITIALIZED | home=${home} | next=centricmem setup --bootstrap`;
    return {
        project: "(none)",
        health: 0,
        recentDecisions: [],
        sessionTail: [],
        issues: ["product home not initialized"],
        text,
        state: "UNINITIALIZED",
    };
}
export function formatUninitializedStatus(home) {
    return [
        "CentricMem Status",
        `state: UNINITIALIZED`,
        `home:  ${home}`,
        `next:  centricmem setup --bootstrap`,
    ].join("\n");
}
export function buildAmbient(workspaceRoot, projectSlug) {
    const slug = projectSlug ?? getCurrentProjectSlug(workspaceRoot);
    const h = healthCheck(workspaceRoot, slug);
    const decisions = listDecisions(workspaceRoot, slug);
    const recentDecisions = decisions
        .slice(-3)
        .reverse()
        .map((d) => `${String(d.seq).padStart(4, "0")}. ${d.title}`);
    const sessions = readRecentSessions(workspaceRoot, 7, 3, slug);
    const sessionTail = sessions.map((s) => `${s.heading}: ${s.summary.slice(0, 80)}`);
    const issues = h.issues.filter((i) => i.severity === "warn").map((i) => i.message);
    try {
        const wh = workspaceHealth(workspaceRoot);
        for (const i of wh.issues) {
            if (i.severity !== "warn")
                continue;
            if (!issues.includes(i.message))
                issues.push(i.message);
        }
    }
    catch { /* ignore */ }
    const skillHint = skillStatusHintLine(skillStatus(workspaceRoot));
    const todaySessions = countTodaySessions(workspaceRoot, slug);
    const curateHint = todaySessions === 0
        ? "Curate: today_sessions=0 — Non-Micro must end with log-session --tags … (or done)"
        : `Curate: today_sessions=${todaySessions}`;
    const text = [
        `CentricMem: project=${slug} | Health=${h.score}`,
        recentDecisions.length ? `Recent decisions: ${recentDecisions.join("; ")}` : "Recent decisions: (none)",
        sessionTail.length ? `Session tail: ${sessionTail.join(" | ")}` : "Session tail: (none)",
        issues.length ? `Conflicts: ${issues.join("; ")}` : "Conflicts: none",
        curateHint,
        skillHint ?? "",
    ]
        .filter(Boolean)
        .join(" | ");
    return { project: slug, health: h.score, recentDecisions, sessionTail, issues, text, state: "ok" };
}
export function writeAmbientFile(workspaceRoot, block) {
    const dest = path.join(workspaceRoot, ".ambient.md");
    const body = `# CentricMem Ambient Context

${block.text}

---
_Auto-generated at session start. Run \`centricmem ambient\` to refresh._
`;
    fs.writeFileSync(dest, body, "utf8");
    return dest;
}
