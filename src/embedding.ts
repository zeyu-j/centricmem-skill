/**
 * embedding.ts — LLM API embeddings for hybrid retrieval.
 */
import type { EmbeddingConfig, MemConfig } from "./core.js";

export function isEmbeddingEnabled(config: MemConfig): boolean {
  const p = config.embedding?.provider ?? "none";
  return p !== "none" && p !== "";
}

export function getEmbeddingApiKey(config: MemConfig): string | null {
  const envName = config.embedding.api_key_env ?? "OPENAI_API_KEY";
  return process.env[envName] ?? process.env.OPENAI_API_KEY ?? null;
}

/** Serialize float vector to Buffer for SQLite BLOB storage. */
export function vectorToBlob(vec: number[]): Buffer {
  const f32 = new Float32Array(vec);
  return Buffer.from(f32.buffer, f32.byteOffset, f32.byteLength);
}

/** Deserialize BLOB to float vector. */
export function blobToVector(blob: Buffer): number[] {
  const f32 = new Float32Array(blob.buffer, blob.byteOffset, blob.length / 4);
  return Array.from(f32);
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (!a.length || a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom > 0 ? dot / denom : 0;
}

export interface EmbedOptions {
  /** Test hook: return fixed vectors without API call. */
  mockVectors?: number[][];
}

/**
 * Batch-embed texts via OpenAI-compatible /embeddings API.
 * Gracefully returns empty array when disabled or no API key.
 */
export async function embedTexts(
  texts: string[],
  config: MemConfig,
  opts?: EmbedOptions,
): Promise<number[][]> {
  if (!texts.length) return [];
  if (opts?.mockVectors) return opts.mockVectors;

  if (!isEmbeddingEnabled(config)) return [];

  const apiKey = getEmbeddingApiKey(config);
  if (!apiKey) return [];

  const emb = config.embedding;
  const model = emb.model ?? "text-embedding-3-small";
  const baseUrl = (emb.base_url ?? "https://api.openai.com/v1").replace(/\/$/, "");

  const res = await fetch(`${baseUrl}/embeddings`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model, input: texts }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Embedding API failed (${res.status}): ${err.slice(0, 200)}`);
  }

  const data = (await res.json()) as {
    data: { index: number; embedding: number[] }[];
  };
  const sorted = [...data.data].sort((a, b) => a.index - b.index);
  return sorted.map((d) => d.embedding);
}

export type { EmbeddingConfig };
