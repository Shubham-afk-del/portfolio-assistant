import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { z } from "zod";

/**
 * The golden set's shape (SPEC-v2 §14) and its loader. The checker and the
 * eval runner share it, so a case the checker accepts is a case the runner
 * can score. The field meanings are written out at the top of golden.yaml.
 */

export const CATEGORIES = [
  "factual",
  "depth",
  "project",
  "multi_hop",
  "unknown",
  "out_of_scope",
  "injection",
  "ranking",
  "sensitive",
  "identity",
] as const;

export const BEHAVIOURS = [
  "answer",
  "refuse",
  "decline",
  "resist",
  "decline_rank",
  "canned",
  "identity",
] as const;

export type Category = (typeof CATEGORIES)[number];
export type Behaviour = (typeof BEHAVIOURS)[number];

/** A required phrase, or a list of phrases any one of which will do. */
const Needle = z.union([z.string().min(1), z.array(z.string().min(1)).min(1)]);

export const GoldenCase = z
  .object({
    id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "kebab-case"),
    category: z.enum(CATEGORIES),
    question: z.string().min(3),
    expected_behaviour: z.enum(BEHAVIOURS),
    expected_docs: z.array(z.string().min(1)).default([]),
    also_relevant: z.array(z.string().min(1)).default([]),
    must_include: z.array(Needle).default([]),
    must_not_include: z.array(z.string().min(1)).default([]),
    notes: z.string().optional(),
  })
  .strict();

export type GoldenCase = z.infer<typeof GoldenCase>;

export const GOLDEN_PATH = join(process.cwd(), "evals", "golden.yaml");

export function loadGolden(path: string = GOLDEN_PATH): GoldenCase[] {
  const parsed: unknown = parse(readFileSync(path, "utf8"));
  const result = z.array(GoldenCase).safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  ${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("\n");
    throw new Error(`evals/golden.yaml failed validation:\n${issues}`);
  }
  return result.data;
}
