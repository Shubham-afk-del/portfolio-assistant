import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { Profile, outstandingFields, uncalibratedSkills } from "./schema";

/**
 * Server-only. `content/profile.yaml` is the single source of truth for structured
 * facts (SPEC-v2 §4) and is read from disk, so this module must never reach the
 * browser. Import it from Server Components or route handlers only.
 *
 * Validation failures throw — a malformed profile is a real build error. Unfilled
 * TODO(owner) fields do not throw: the schema treats them as valid, and they are
 * surfaced via `outstanding` instead. See lib/schema.ts for why.
 */

const PROFILE_PATH = join(process.cwd(), "content", "profile.yaml");

function load(): Profile {
  const raw = readFileSync(PROFILE_PATH, "utf8");
  const parsed: unknown = parse(raw);
  const result = Profile.safeParse(parsed);

  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new Error(`content/profile.yaml failed validation:\n${issues}`);
  }

  return result.data;
}

export const profile: Profile = load();

/** Dot-paths of every field still marked TODO(owner). */
export const outstanding: readonly string[] = outstandingFields(profile);

/** Skills with no honest level set yet; the bot must not assert a level for these. */
export const uncalibrated: readonly string[] = uncalibratedSkills(profile);

/**
 * True when a value is filled in. Used by the UI to omit outstanding fields
 * entirely rather than render placeholder text — inventing content is the one
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
