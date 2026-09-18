import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { Profile, outstandingFields, uncalibratedSkills } from "./schema";

/**
 * Server-only. `content/profile.yaml` is the single source of truth for structured
 * facts (SPEC-v2 §4) and is read from disk, so this module must never reach the
 * browser. Import it from Server Components or route handlers only.
 *
 * Validation failures throw, because a malformed profile is a real build error.
 * Unfilled TODO(owner) fields do not: the schema treats them as valid, and they
 * are surfaced via outstanding() instead. See lib/schema.ts for why.
 *
 * Cached on the file's mtime rather than at module scope. The YAML is not in the
 * import graph, so Next has nothing to invalidate when it changes, and a
 * module-scope singleton means every content edit needs a dev server restart.
 * Phase 1 is corpus work, so that would be felt constantly. One statSync per
 * access is cheaper than being wrong.
 */

const PROFILE_PATH = join(process.cwd(), "content", "profile.yaml");

interface Cached {
  mtimeMs: number;
  profile: Profile;
  outstanding: readonly string[];
  uncalibrated: readonly string[];
}

let cached: Cached | undefined;

function load(): Cached {
  const mtimeMs = statSync(PROFILE_PATH).mtimeMs;
  if (cached !== undefined && cached.mtimeMs === mtimeMs) return cached;

  const parsed: unknown = parse(readFileSync(PROFILE_PATH, "utf8"));
  const result = Profile.safeParse(parsed);

  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new Error(`content/profile.yaml failed validation:\n${issues}`);
  }

  cached = {
    mtimeMs,
    profile: result.data,
    outstanding: outstandingFields(result.data),
    uncalibrated: uncalibratedSkills(result.data),
  };
  return cached;
}

export function getProfile(): Profile {
  return load().profile;
}

/** Dot-paths of every field still marked TODO(owner). */
export function outstanding(): readonly string[] {
  return load().outstanding;
}

/** Skills with no honest level set yet; the bot must not assert a level for these. */
export function uncalibrated(): readonly string[] {
  return load().uncalibrated;
}

/**
 * True when a value is filled in. Used by the UI to omit outstanding fields
 * entirely rather than render placeholder text. Inventing content is the one
 * thing this system must never do.
 */
export function isFilled(value: unknown): boolean {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 && !trimmed.startsWith("TODO(owner)");
  }
  return value !== undefined && value !== null;
}

/** Narrowed accessor: returns the string only when it is genuinely filled. */
export function filled(value: unknown): string | undefined {
  return typeof value === "string" && isFilled(value) ? value.trim() : undefined;
}

/** Array variant: drops outstanding entries, returns undefined if nothing remains. */
export function filledList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const kept = value.filter((v): v is string => typeof v === "string" && isFilled(v));
  return kept.length > 0 ? kept : undefined;
}
