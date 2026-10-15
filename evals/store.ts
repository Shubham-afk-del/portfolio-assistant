import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { GENERATION, MODELS, RETRIEVAL_CONFIG } from "@/lib/config";
import { offTopicNote } from "@/lib/generation/prompt";
import { GRADING } from "@/lib/llm/gemini";
import type { CorpusIndex } from "@/lib/retrieval/types";
import { JUDGE_SYSTEM } from "./judge";

/**
 * The eval caches and the keys into them, in one place: the answer runner,
 * the labelling page and the judge-agreement report all find a reply by the
 * same formula, so they cannot drift apart.
 */

const CACHE_DIR = join(process.cwd(), "evals", "cache");
export const ANSWERS = join(CACHE_DIR, "answers.json");
export const JUDGEMENTS = join(CACHE_DIR, "judgements.json");
/** The owner's hand labels: kept with the golden set, not in the cache, because they are data. */
export const LABELS = join(process.cwd(), "evals", "labels.json");
/** What the owner is asked to label: built by label-prep.ts from the latest run. */
export const LABEL_SET = join(CACHE_DIR, "label-set.json");
/** The scope check's verdict on each golden question (lib/generation/scope.ts). */
export const SCOPES = join(CACHE_DIR, "scopes.json");

export interface AnswerRecord {
  reply: string;
  /** Set when generation failed outright; the reply is then empty. */
  error?: string;
  degraded: string[];
  /** The visitor's turn exactly as the model received it: passages, question, and any scope note. */
  passages: string;
  /** The scope check's verdict; absent when the check was unavailable. */
  scope?: "owner" | "general";
  gateScale: string;
  firstWordMs: number | null;
  totalMs: number;
}

export const sha = (text: string): string => createHash("sha256").update(text).digest("hex").slice(0, 32);

export function load<T>(path: string): Record<string, T> {
  return existsSync(path) ? (JSON.parse(readFileSync(path, "utf8")) as Record<string, T>) : {};
}

export function save(path: string, data: object): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, path === LABELS ? 2 : undefined));
}

/**
 * Everything that shapes an answer: the retrieval config, the models that
 * retrieve and write (not the judge), the generation settings, the full
 * system prompt, the note sent beside a question the scope check calls
 * general, the reranker's instructions and the index build. The note is
 * keyed by its wording, with a stand-in for the name, which the system
 * prompt already carries; until 15 Oct 2026 it was not keyed at all, so
 * rewording it alone would have reused answers written under the old words.
 * Not the scope check's instructions: what reaches the answer is the check's
 * verdict, which answerKey carries, so rewording the check regenerates only
 * the answers whose verdict it changes.
 */
export function answerRunKey(system: string, index: CorpusIndex): string {
  const { judge: _judge, ...answerModels } = MODELS;
  return sha(
    JSON.stringify({
      RETRIEVAL_CONFIG,
      MODELS: answerModels,
      GENERATION,
      system,
      scopeNote: offTopicNote("{name}"),
      rerank: GRADING,
      index: index.builtAt,
    }),
  );
}

export function answerKey(runKey: string, question: string, scope: string | undefined): string {
  return sha(`${runKey}\n${question}\n${scope ?? "none"}`);
}

/** A verdict is cached on the scope check's own instructions: reworded, it asks again. */
export function scopeKey(scopePrompt: string, question: string): string {
  return sha(`${scopePrompt}\n${question}`);
}

/** A judgement depends on the judge, its instructions, and exactly what the model was given and said. */
export function judgeKey(system: string, passages: string, reply: string, question: string): string {
  return sha(JSON.stringify([MODELS.judge, JUDGE_SYSTEM, system, passages, reply, question]));
}
