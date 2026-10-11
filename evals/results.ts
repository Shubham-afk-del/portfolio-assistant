import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * evals/results.json holds one section per runner (retrieval, answers, judge),
 * each stamped with when it ran. A runner replaces its own section and keeps
 * the other, so the file is always the latest of both.
 */

const RESULTS = join(process.cwd(), "evals", "results.json");

export function writeResults(section: "retrieval" | "answers" | "judge", data: object): void {
  const existing: unknown = existsSync(RESULTS) ? JSON.parse(readFileSync(RESULTS, "utf8")) : {};
  const sections = typeof existing === "object" && existing !== null ? existing : {};
  const next = { ...sections, [section]: { generatedAt: new Date().toISOString(), ...data } };
  writeFileSync(RESULTS, `${JSON.stringify(next, null, 2)}\n`);
}
