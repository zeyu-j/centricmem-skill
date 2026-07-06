/**
 * import-schema.ts — ImportBundle v1 Zod schema.
 */
import { z } from "zod";

export const ImportDecisionSchema = z.object({
  title: z.string().min(1),
  context: z.string().default(""),
  decision: z.string().default(""),
  consequences: z.string().optional(),
  agent: z.string().optional(),
  tags: z.array(z.string()).optional(),
  supersedes: z.number().int().min(1).optional(),
  logged_at: z.string().optional(),
  external_id: z.string().optional(),
});

export const ImportLessonSchema = z.object({
  title: z.string().min(1),
  body: z.string().default(""),
  agent: z.string().optional(),
  external_id: z.string().optional(),
});

export const ImportRuleSchema = z.object({
  title: z.string().optional(),
  body: z.string().min(1),
});

export const ImportDocSchema = z.object({
  title: z.string().min(1),
  body: z.string().default(""),
  external_id: z.string().optional(),
});

export const ImportSessionSchema = z.object({
  title: z.string().min(1),
  body: z.string().default(""),
  logged_at: z.string().optional(),
  external_id: z.string().optional(),
});

export const ImportResearchSchema = z.object({
  title: z.string().min(1),
  body: z.string().default(""),
  tags: z.array(z.string()).optional(),
  external_id: z.string().optional(),
});

export const ImportBundleSchema = z.object({
  version: z.literal(1),
  project: z.string().optional(),
  source: z
    .object({
      type: z.string(),
      name: z.string().optional(),
    })
    .optional(),
  decisions: z.array(ImportDecisionSchema).optional(),
  lessons: z.array(ImportLessonSchema).optional(),
  rules: z.array(ImportRuleSchema).optional(),
  context: z.object({ body: z.string() }).optional(),
  imported: z.array(ImportDocSchema).optional(),
  sessions: z.array(ImportSessionSchema).optional(),
  research: z.array(ImportResearchSchema).optional(),
});

export type ImportBundle = z.infer<typeof ImportBundleSchema>;
export type ImportDecision = z.infer<typeof ImportDecisionSchema>;
export type ImportLesson = z.infer<typeof ImportLessonSchema>;
