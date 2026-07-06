/**
 * route.ts — retrieval routing (when to read vs search).
 */
import { classifyIntent, type QueryIntent } from "./indexer.js";

export type RouteAction = "read_context" | "search" | "search_all";

export interface RouteResult {
  action: RouteAction;
  intent: QueryIntent;
  suggestedType?: string;
  reason: string;
}

const RESEARCH_PATTERNS = /调研|研究|survey|research|external|文献|对比/i;
const CROSS_PROJECT = /跨项目|其他项目|all projects|cross.?project|别的项目/i;
const UNCERTAIN = /不确定|不知道|忘了|记不清|maybe|not sure/i;

export function routeQuery(query: string): RouteResult {
  const q = query.trim();
  const intent = classifyIntent(q);

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
