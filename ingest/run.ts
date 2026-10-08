/**
 * The ingestion pipeline. Runnable as `npm run ingest`, idempotent, and
 * triggered by the ingest Action on a push that touches content/.
 *
 * load -> chunk -> contextualise -> embed -> write data/index.json
 *
 * There is no database. At this corpus size a vector store is a network round
 * trip that buys nothing, so the index is a committed JSON file the serverless
 * function loads once per cold start (ZERO-COST-STACK §4, ARCHITECTURE.md §2).
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { MODELS, RETRIEVAL_CONFIG } from "@/lib/config";
import { embed } from "@/lib/llm";
import { chunkDocument, hash, type RawChunk } from "./chunk";
import { contextualiseAll } from "./contextualise";
import { loadMarkdown } from "./loaders/markdown";
import { loadGithub } from "./loaders/github";
import {
  INDEX_VERSION,
  type CorpusChunk,
  type CorpusIndex,
  type CorpusSection,
} from "@/lib/retrieval/types";

const INDEX_PATH = "data/index.json";

function readExistingIndex(repoRoot: string): CorpusIndex | undefined {
  const path = join(repoRoot, INDEX_PATH);
  if (!existsSync(path)) return undefined;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as CorpusIndex;
  } catch {
    return undefined;
  }
}

async function main(): Promise<void> {
  const repoRoot = process.cwd();
  const started = Date.now();

  const { loaded: written, skippedPrivate } = await loadMarkdown(repoRoot);
  console.log(`\ningest: ${written.length} documents from content/`);
  for (const path of skippedPrivate) {
    console.log(`  refused (visibility: private): ${path}`);
  }
  if (written.length === 0) throw new Error("no public documents found in content/");

  console.log("  from the GitHub allowlist:");
  const code = await loadGithub();
  const loaded = [...written, ...code];

  // Chunk.
  const sections: CorpusSection[] = [];
  const pending: { base: RawChunk; documentIndex: number }[] = [];

  loaded.forEach((entry, documentIndex) => {
    const { sections: docSections, chunks } = chunkDocument(entry.document.id, entry.body);
    sections.push(...docSections);
    for (const base of chunks) pending.push({ base, documentIndex });
  });

  const tokenCounts = pending.map((p) => p.base.tokenCount).sort((a, b) => a - b);
  const median = tokenCounts[Math.floor(tokenCounts.length / 2)] ?? 0;
  console.log(
    `  ${sections.length} sections, ${pending.length} chunks ` +
      `(median ~${median} tokens, min ~${tokenCounts[0] ?? 0}, max ~${tokenCounts[tokenCounts.length - 1] ?? 0})`,
  );

  // Contextualise, cached by content hash.
  let blurbs = new Map<string, string>();
  if (RETRIEVAL_CONFIG.contextualiseChunks) {
    const result = await contextualiseAll(
      repoRoot,
      pending.map((p) => ({
        hash: p.base.contentHash,
        content: p.base.content,
        document: loaded[p.documentIndex]!.document,
      })),
    );
    blurbs = result.blurbs;
    console.log(
      `  contextualised ${result.stats.generated} chunks (${result.stats.cached} from cache)`,
    );
  }

  // Embed. The blurb is prepended to the text that gets embedded, never to the
  // text shown to a reader.
  const previous = readExistingIndex(repoRoot);
  const previousByEmbedHash = new Map(
    (previous?.chunks ?? [])
      .filter((chunk) => chunk.embedHash !== undefined && chunk.embedding.length > 0)
      .map((chunk) => [chunk.embedHash, chunk]),
  );

  const chunks: CorpusChunk[] = [];
  const toEmbed: { index: number; text: string }[] = [];

  pending.forEach((entry, index) => {
    const blurb = blurbs.get(entry.base.contentHash) ?? "";
    const text = blurb === "" ? entry.base.content : `${blurb}\n\n${entry.base.content}`;
    const embedHash = hash(text, MODELS.embed.model);
    const reusable = previousByEmbedHash.get(embedHash);

    chunks.push({
      ...entry.base,
      contextBlurb: blurb,
      embedHash,
      embedding: reusable?.embedding ?? [],
    });

    if (reusable === undefined) toEmbed.push({ index, text });
  });

  if (toEmbed.length > 0) {
    const { vectors, tokens } = await embed({
      input: toEmbed.map((item) => item.text),
      inputType: "document",
    });
    toEmbed.forEach((item, i) => {
      chunks[item.index]!.embedding = vectors[i]!;
    });
    console.log(`  embedded ${toEmbed.length} chunks (${tokens} tokens)`);
  }
  const reused = chunks.length - toEmbed.length;
  if (reused > 0) console.log(`  reused ${reused} embeddings unchanged since last run`);

  // Diff against the previous index.
  const previousHashes = new Set((previous?.chunks ?? []).map((c) => c.contentHash));
  const currentHashes = new Set(chunks.map((chunk) => chunk.contentHash));
  const added = [...currentHashes].filter((h) => !previousHashes.has(h)).length;
  const removed = [...previousHashes].filter((h) => !currentHashes.has(h)).length;

  const index: CorpusIndex = {
    version: INDEX_VERSION,
    builtAt: new Date().toISOString(),
    embedModel: MODELS.embed.model,
    dimensions: MODELS.embed.dimensions,
    config: {
      chunkStrategy: RETRIEVAL_CONFIG.chunkStrategy,
      chunkTokens: RETRIEVAL_CONFIG.chunkTokens,
      contextualiseChunks: RETRIEVAL_CONFIG.contextualiseChunks,
    },
    documents: loaded.map((entry) => entry.document),
    sections,
    chunks,
  };

  writeFileSync(join(repoRoot, INDEX_PATH), `${JSON.stringify(index)}\n`);

  const bytes = Buffer.byteLength(JSON.stringify(index));
  console.log(
    `\n  +${added} chunks, -${removed}, ${chunks.length} total\n` +
      `  ${INDEX_PATH} is ${(bytes / 1024 / 1024).toFixed(2)} MB\n` +
      `  done in ${((Date.now() - started) / 1000).toFixed(1)}s\n`,
  );
}

main().catch((error: unknown) => {
  console.error(`\ningest failed: ${String(error)}\n`);
  process.exit(1);
});
