import { z } from "zod";

/**
 * Schema for content/profile.yaml.
 *
 * Design decision worth defending: TODO(owner) is a *valid* value everywhere.
 * The build must not fail on an unfilled field — it must surface it, and the
 * bot must refuse to answer that topic at runtime. Failing the build would
 * pressure us into inventing content, which is the one thing this system
 * must never do.
 */

const TODO = "TODO(owner)" as const;
const isTodo = (v: unknown): boolean =>
  typeof v === "string" && v.trim().startsWith("TODO(owner)");

/** A field that may be filled or explicitly outstanding. */
const pending = <T extends z.ZodTypeAny>(inner: T) =>
  z.union([z.literal(TODO), z.string().startsWith("TODO(owner)"), inner]);

export const SkillLevel = z.enum(["expert", "strong", "working", "familiar"]);
export type SkillLevel = z.infer<typeof SkillLevel>;

export const Skill = z.object({
  name: z.string().min(1),
  level: pending(SkillLevel),
  years: pending(z.number().nonnegative()),
  evidence: pending(z.string()),
});

export const Role = z.object({
  company: z.string().min(1),
  role: z.string().min(1),
  start: z.string(), // YYYY-MM
  end: z.union([z.string(), z.literal("present")]),
  location: z.string().optional(),
  stack: z.array(z.string()).default([]),
  highlights: z.array(z.string()).default([]),
});

export const Education = z.object({
  school: z.string().min(1),
  credential: z.string().min(1),
  start: z.union([z.string(), z.number()]),
  end: z.union([z.string(), z.number()]),
  status: pending(z.string()).optional(),
  modules: pending(z.array(z.string())).optional(),
});

export const Certification = z.object({
  name: z.string().min(1),
  issuer: z.string().min(1),
  date: z.union([z.string(), z.number()]),
  verified: z.boolean().optional(),
});

export const Project = z.object({
  name: z.string().min(1),
  one_liner: pending(z.string()),
  repo: z.string().url().optional(),
  demo: z.string().url().optional(),
  stack: z.array(z.string()).default([]),
  case_study: z.string().optional(), // path into content/
});

export const Profile = z.object({
  name: z.string().min(1),
  preferred_name: z.string().min(1),
  pronouns: z.string().optional(),
  headline: pending(z.string()),
  location: z.string().min(1),

  contact: z.object({
    email: z.string().email(),
    phone: pending(z.string()).optional(),
    github: z.string().url().optional(),
    linkedin: z.string().url().optional(),
    booking: pending(z.string()).optional(),
  }),

  availability: z.object({
    status: pending(z.string()),
    full_time_from: pending(z.string()).optional(),
    notes: pending(z.string()).optional(),
  }),

  work_authorization: z.object({
    disclose: pending(z.union([z.boolean(), z.literal("refer_to_email")])),
    statement: pending(z.string()),
  }),

  locations_considered: z.array(z.string()).default([]),
  target_roles: z.array(z.string()).default([]),
  summary: pending(z.string()),

  skills: z.array(Skill).default([]),
  experience: z.array(Role).default([]),
  education: z.array(Education).default([]),
  certifications: z.array(Certification).default([]),
  projects: z.array(Project).default([]),

  languages: pending(z.array(z.string())).optional(),
  awards: z.array(z.string()).default([]),
  publications: z.array(z.string()).default([]),
  faq: z.array(z.object({ q: z.string(), a: z.string() })).default([]),

  sensitive_topics: z.record(z.string(), pending(z.string())).default({}),
  do_not_discuss: z.array(z.string()).default([]),
});

export type Profile = z.infer<typeof Profile>;

/**
 * Walks the parsed profile and returns dot-paths of every outstanding field.
 * Printed at build time so unfilled content is visible, and used at runtime to
 * tell the model which topics it must decline.
 */
export function outstandingFields(value: unknown, path: string[] = []): string[] {
  if (isTodo(value)) return [path.join(".")];
  if (Array.isArray(value)) {
    return value.flatMap((v, i) => outstandingFields(v, [...path, String(i)]));
  }
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([k, v]) =>
      outstandingFields(v, [...path, k]),
    );
  }
  return [];
}

/** Skills the bot must describe honestly rather than confidently. */
export function uncalibratedSkills(profile: Profile): string[] {
  return profile.skills
    .filter((s) => isTodo(s.level))
    .map((s) => s.name);
}
