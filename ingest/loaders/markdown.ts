import { readFileSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { join, relative } from "node:path";
import { parse } from "yaml";
import { z } from "zod";
import { hash } from "../chunk";
import type { CorpusDocument } from "@/lib/retrieval/types";

/**
 * Front matter contract for everything in content/. `visibility` defaults to
 * private rather than public: a document that forgets to declare itself is one
 * the pipeline refuses to publish, which is the direction the mistake should
 * fail in (SPEC-v2 §8).
 */
const FrontMatter = z.object({
  doc_type: z.string().min(1),
  title: z.string().min(1),
  company: z.string().optional(),
  project: z.string().optional(),
  date: z.union([z.string(), z.number()]).optional(),
  tech: z.array(z.string()).default([]),
  source_url: z.string().url().optional(),
  visibility: z.enum(["public", "private"]).default("private"),
  status: z.string().optional(),
});

export interface LoadedDocument {
  document: CorpusDocument;
  body: string;
}

export interface LoadResult {
  loaded: LoadedDocument[];
  /** Paths refused because they are marked private. */
  skippedPrivate: string[];
}

function parseFile(absolutePath: string, repoRoot: string): LoadedDocument | "private" {
  const raw = readFileSync(absolutePath, "utf8");
  const match = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(raw);
  const path = relative(repoRoot, absolutePath);

  if (match === null) {
    throw new Error(`${path} has no front matter. Every corpus document needs one.`);
  }

  const parsed = FrontMatter.safeParse(parse(match[1] ?? ""));
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    throw new Error(`${path} front matter is invalid. ${issues}`);
  }

  if (parsed.data.visibility === "private") return "private";

  const body = (match[2] ?? "").trim();
  const meta = parsed.data;

  return {
    document: {
      id: path.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, ""),
      docType: meta.doc_type,
      title: meta.title,
      ...(meta.company === undefined ? {} : { company: meta.company }),
      ...(meta.project === undefined ? {} : { project: meta.project }),
      ...(meta.date === undefined ? {} : { date: String(meta.date) }),
      tech: meta.tech,
      ...(meta.source_url === undefined ? {} : { sourceUrl: meta.source_url }),
      path,
      contentHash: hash(body),
    },
    body,
  };
}

async function walk(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const full = join(directory, entry.name);
      if (entry.isDirectory()) return walk(full);
      return entry.name.endsWith(".md") ? [full] : [];
    }),
  );
  return files.flat();
}

/**
 * Loads every markdown document under content/, except profile.yaml's
 * neighbours: structured facts live in the system prompt and are never
 * retrieved (SPEC-v2 §4), so nothing in this loader touches them.
 */
export async function loadMarkdown(repoRoot: string): Promise<LoadResult> {
  const paths = (await walk(join(repoRoot, "content"))).sort();
  const loaded: LoadedDocument[] = [];
  const skippedPrivate: string[] = [];

  for (const absolutePath of paths) {
    const result = parseFile(absolutePath, repoRoot);
    if (result === "private") {
      skippedPrivate.push(relative(repoRoot, absolutePath));
      continue;
    }
    loaded.push(result);
  }

  return { loaded, skippedPrivate };
}
