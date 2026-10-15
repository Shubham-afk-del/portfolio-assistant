import { CORPUS_SOURCES, type GithubSource } from "@/lib/config";
import { hash } from "../chunk";
import type { CorpusDocument } from "@/lib/retrieval/types";
import type { LoadedDocument } from "./markdown";

/**
 * Pulls selected files from an allowlist of repositories (SPEC-v2 §8).
 *
 * An allowlist, never a scan. GITHUB_TOKEN is optional: these repositories are
 * public, and unauthenticated reads are enough at this volume. With a token the
 * rate limit goes from 60 requests an hour to 5,000.
 */

const API = "https://api.github.com";

interface TreeResponse {
  tree: { path: string; type: string; size?: number }[];
  truncated: boolean;
}

interface NotebookCell {
  cell_type: string;
  source: string[] | string;
  outputs?: {
    text?: string[] | string;
    data?: Record<string, unknown>;
  }[];
}

function headers(): Record<string, string> {
  const token = process.env["GITHUB_TOKEN"];
  return {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    ...(token === undefined || token === "" ? {} : { Authorization: `Bearer ${token}` }),
  };
}

async function api<T>(path: string): Promise<T> {
  const response = await fetch(`${API}${path}`, { headers: headers() });
  if (!response.ok) {
    const hint =
      response.status === 403
        ? " (rate limited; set GITHUB_TOKEN in .env.local to raise the limit)"
        : "";
    throw new Error(`github ${response.status} on ${path}${hint}`);
  }
  return (await response.json()) as T;
}

function text(source: string[] | string): string {
  return Array.isArray(source) ? source.join("") : source;
}

/**
 * A notebook rendered as markdown: prose stays prose, code becomes a fenced
 * block, and text output is kept but truncated. The outputs are where the
 * numbers are, so dropping them would lose the measurements these repositories
 * exist to evidence. Images are dropped: a base64 PNG embeds to noise.
 */
function notebookToMarkdown(raw: string, path: string): string {
  const notebook = JSON.parse(raw) as { cells?: NotebookCell[] };
  const parts: string[] = [`# ${path}`, ""];

  for (const cell of notebook.cells ?? []) {
    const source = text(cell.source).trim();
    if (source === "") continue;

    if (cell.cell_type === "markdown") {
      parts.push(source, "");
      continue;
    }

    if (cell.cell_type !== "code") continue;
    parts.push("```python", source, "```", "");

    const outputs: string[] = [];
    for (const output of cell.outputs ?? []) {
      const plain =
        output.text !== undefined
          ? text(output.text)
          : typeof output.data?.["text/plain"] === "string"
            ? (output.data["text/plain"] as string)
            : Array.isArray(output.data?.["text/plain"])
              ? (output.data["text/plain"] as string[]).join("")
              : "";
      if (plain.trim() !== "") outputs.push(plain.trim());
    }

    if (outputs.length > 0) {
      const joined = outputs.join("\n").slice(0, CORPUS_SOURCES.notebookMaxOutputChars);
      parts.push("Output:", "```", joined, "```", "");
    }
  }

  return parts.join("\n").trim();
}

function wrapSource(raw: string, path: string): string {
  if (path.endsWith(".md")) return raw;
  const language = path.endsWith(".py")
    ? "python"
    : path.endsWith(".ts")
      ? "typescript"
      : path.endsWith(".js")
        ? "javascript"
        : path.endsWith(".sql")
          ? "sql"
          : "";
  return [`# ${path}`, "", `\`\`\`${language}`, raw.trim(), "```"].join("\n");
}

/**
 * A SQL script with section banners ("-- SECTION 6." and a title on the next
 * line) becomes one heading and one fenced block per section, so the chunker
 * can split it where its author did. Whole, the 29-query solution file in
 * SQL_Farmers_Insurance_Analysis is one passage of about 5,400 tokens: too
 * broad to rank for a question about joins, and most of a prompt when it
 * does. A script without banners stays one block.
 */
function sqlToMarkdown(raw: string, path: string): string {
  const lines = raw.trim().split("\n");
  const banner = (line: string | undefined): RegExpExecArray | null =>
    /^--\s*SECTION\s+(\d+)\.?\s*$/i.exec(line ?? "");
  const rule = (line: string | undefined): boolean => /^--\s*-{8,}\s*$/.test(line ?? "");
  const neighbour = (from: number, step: 1 | -1): string | undefined => {
    for (let j = from + step; j >= 0 && j < lines.length; j += step) {
      if (lines[j]!.trim() !== "") return lines[j];
    }
    return undefined;
  };

  const sections: { heading: string; lines: string[] }[] = [{ heading: "", lines: [] }];
  lines.forEach((line, i) => {
    const match = banner(line);
    // The dashed rule above a banner opens its section, so it is not left
    // dangling at the end of the previous one.
    const opens =
      match !== null ? !rule(neighbour(i, -1)) : rule(line) && banner(neighbour(i, 1)) !== null;
    if (opens) sections.push({ heading: "", lines: [] });
    const current = sections[sections.length - 1]!;
    if (match !== null) {
      const next = neighbour(i, 1) ?? "";
      const title = next.trimStart().startsWith("--")
        ? next.replace(/^\s*--\s*/, "").replace(/\s*\[[^\]]*\]\s*$/, "").trim()
        : "";
      current.heading = `Section ${match[1]!}${title === "" ? "" : `: ${title}`}`;
    }
    current.lines.push(line);
  });

  if (sections.length === 1) return wrapSource(raw, path);

  const parts: string[] = [`# ${path}`, ""];
  for (const section of sections) {
    const body = section.lines.join("\n").trim();
    if (body === "") continue;
    if (section.heading !== "") parts.push(`## ${section.heading}`, "");
    parts.push("```sql", body, "```", "");
  }
  return parts.join("\n").trim();
}

function wanted(path: string, size: number | undefined): boolean {
  if (CORPUS_SOURCES.githubIgnore.some((ignore) => path.includes(ignore))) return false;

  const cap = path.endsWith(".ipynb")
    ? CORPUS_SOURCES.notebookMaxFileBytes
    : CORPUS_SOURCES.githubMaxFileBytes;
  if (size !== undefined && size > cap) return false;

  return CORPUS_SOURCES.githubExtensions.some((ext) => path.endsWith(ext));
}

async function loadRepo(source: GithubSource): Promise<LoadedDocument[]> {
  const { owner, repo } = source;
  const meta = await api<{ default_branch: string }>(`/repos/${owner}/${repo}`);
  const tree = await api<TreeResponse>(
    `/repos/${owner}/${repo}/git/trees/${meta.default_branch}?recursive=1`,
  );

  if (tree.truncated) {
    console.warn(`  ${repo}: tree truncated by the API, some files were not seen`);
  }

  const paths = tree.tree
    .filter((entry) => entry.type === "blob" && wanted(entry.path, entry.size))
    .map((entry) => entry.path)
    .sort();

  const documents: LoadedDocument[] = [];

  for (const path of paths) {
    const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${meta.default_branch}/${path}`;
    const response = await fetch(rawUrl);
    if (!response.ok) {
      console.warn(`  ${repo}/${path}: ${response.status}, skipped`);
      continue;
    }

    const raw = await response.text();
    let body: string;
    try {
      body = path.endsWith(".ipynb")
        ? notebookToMarkdown(raw, path)
        : path.endsWith(".sql")
          ? sqlToMarkdown(raw, path)
          : wrapSource(raw, path);
    } catch (error) {
      console.warn(`  ${repo}/${path}: could not parse (${String(error)}), skipped`);
      continue;
    }

    if (body.trim().length < 80) continue;

    const document: CorpusDocument = {
      id: `gh-${repo}-${path}`.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, ""),
      docType: "code",
      title: `${repo}/${path}`,
      project: repo,
      tech: [],
      sourceUrl: `https://github.com/${owner}/${repo}/blob/${meta.default_branch}/${path}`,
      path: `github:${owner}/${repo}/${path}`,
      contentHash: hash(body),
    };

    documents.push({ document, body });
  }

  return documents;
}

export async function loadGithub(): Promise<LoadedDocument[]> {
  const all: LoadedDocument[] = [];
  for (const source of CORPUS_SOURCES.github) {
    const documents = await loadRepo(source);
    console.log(`  ${source.repo}: ${documents.length} files`);
    all.push(...documents);
  }
  return all;
}
