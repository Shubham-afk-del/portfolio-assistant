/**
 * `npm run index:check`: is the committed index current with content/?
 *
 * data/index.json is built locally by `npm run ingest` and committed, because
 * building it calls Voyage and Groq on free tiers. Nothing else stops a
 * document from changing while the index that answers from it stays as it
 * was: decision record 003 gained a dated update on 11 Oct 2026 that the
 * assistant could not see until the next ingest, four days later. This
 * compares each public document in content/ with the copy the index was built
 * from, by content hash, and needs no keys and no network.
 *
 * Exits 1 when a document was added, changed or removed since the last
 * ingest. The GitHub sources are not checked: reading them needs the network,
 * and they change on their own schedule.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { loadMarkdown } from "../ingest/loaders/markdown";
import type { CorpusIndex } from "../lib/retrieval/types";

async function main(): Promise<void> {
  const repoRoot = process.cwd();
  const index = JSON.parse(readFileSync(join(repoRoot, "data/index.json"), "utf8")) as CorpusIndex;
  const { loaded } = await loadMarkdown(repoRoot);

  const indexed = new Map(
    index.documents
      .filter((document) => document.path.startsWith("content/"))
      .map((document) => [document.id, document]),
  );

  const problems: string[] = [];
  for (const { document } of loaded) {
    const built = indexed.get(document.id);
    if (built === undefined) problems.push(`${document.path}: not in the index`);
    else if (built.contentHash !== document.contentHash) problems.push(`${document.path}: changed since the index was built`);
    indexed.delete(document.id);
  }
  for (const document of indexed.values()) problems.push(`${document.path}: in the index, but no longer in content/`);

  console.log(`\ndata/index.json, built ${index.builtAt}: ${String(loaded.length)} documents from content/`);
  if (problems.length > 0) {
    console.error(`${problems.map((problem) => `  - ${problem}`).join("\n")}\n  run \`npm run ingest\` and commit data/index.json\n`);
    process.exit(1);
  }
  console.log("  all current\n");
}

main().catch((error: unknown) => {
  console.error(`\nindex check failed: ${String(error)}\n`);
  process.exit(1);
});
