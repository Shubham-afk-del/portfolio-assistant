import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { complete } from "@/lib/llm";
import { GENERATION } from "@/lib/config";
import type { CorpusDocument } from "@/lib/retrieval/types";

/**
 * A one or two sentence blurb situating each chunk, prepended before embedding
 * (SPEC-v2 §8 step 4, ablation row 5).
 *
 * This is the most expensive step in the pipeline, and on a free tier with a
 * daily request cap it is also the one that will stop the build if it re-runs
 * needlessly. It is therefore cached on disk by content hash, so unchanged
 * prose never pays twice.
 */

const CACHE_PATH = "data/context-cache.json";

const SYSTEM = [
  "You situate an excerpt within the document it came from, so that the excerpt",
  "can be understood on its own when retrieved in isolation.",
  "Reply with one or two sentences and nothing else. No preamble, no quotes, no",
  "markdown. Do not summarise the excerpt and do not add facts that are not in",
  "the document.",
].join(" ");

type Cache = Record<string, string>;

function loadCache(repoRoot: string): Cache {
  const path = join(repoRoot, CACHE_PATH);
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, "utf8")) as Cache;
  } catch {
    console.warn("  context cache unreadable, rebuilding it");
    return {};
  }
}

function saveCache(repoRoot: string, cache: Cache): void {
  writeFileSync(join(repoRoot, CACHE_PATH), `${JSON.stringify(cache, null, 2)}\n`);
}

export interface ContextualiseStats {
  generated: number;
  cached: number;
}

export async function contextualiseAll(
  repoRoot: string,
  items: readonly { hash: string; content: string; document: CorpusDocument }[],
): Promise<{ blurbs: Map<string, string>; stats: ContextualiseStats }> {
  const cache = loadCache(repoRoot);
  const blurbs = new Map<string, string>();
  const stats: ContextualiseStats = { generated: 0, cached: 0 };

  for (const item of items) {
    const hit = cache[item.hash];
    if (hit !== undefined) {
      blurbs.set(item.hash, hit);
      stats.cached += 1;
      continue;
    }

    const prompt = [
      `Document title: ${item.document.title}`,
      `Document type: ${item.document.docType}`,
      item.document.project === undefined ? "" : `Project: ${item.document.project}`,
      item.document.company === undefined ? "" : `Company: ${item.document.company}`,
      "",
      "Excerpt:",
      item.content,
    ]
      .filter((line) => line !== "")
      .join("\n");

    const blurb = await complete({
      system: SYSTEM,
      prompt,
      maxTokens: 400, // reasoning tokens share this budget; see lib/llm/groq.ts
      temperature: GENERATION.temperature,
    });

    const cleaned = blurb.replace(/\s+/g, " ").trim();
    cache[item.hash] = cleaned;
    blurbs.set(item.hash, cleaned);
    stats.generated += 1;
  }

  saveCache(repoRoot, cache);
  return { blurbs, stats };
}
