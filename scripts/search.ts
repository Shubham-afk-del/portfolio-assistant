/**
 * `npm run search -- "kafka"`
 *
 * Proves retrieval works from the command line before any UI exists, which is
 * what Phase 1 is for. Dense only; hybrid and reranking land in Phase 2.
 */
import { embed } from "@/lib/llm";
import { loadIndex, denseSearch } from "@/lib/retrieval/index-store";

async function main(): Promise<void> {
  const query = process.argv.slice(2).join(" ").trim();
  if (query === "") {
    console.error('usage: npm run search -- "your question"');
    process.exit(1);
  }

  const index = loadIndex();
  const started = Date.now();
  const { vectors } = await embed({ input: [query], inputType: "query" });
  const embedMs = Date.now() - started;

  const searchStarted = Date.now();
  const hits = denseSearch(index, vectors[0]!, 5);
  const searchMs = Date.now() - searchStarted;

  console.log(
    `\n"${query}"\n` +
      `${index.chunks.length} chunks, ${index.documents.length} documents, ` +
      `built ${index.builtAt.slice(0, 10)}\n` +
      `embed ${embedMs}ms, search ${searchMs}ms\n`,
  );

  hits.forEach((hit, rank) => {
    const snippet = hit.content.replace(/\s+/g, " ").slice(0, 220);
    console.log(`${rank + 1}. ${hit.score.toFixed(4)}  ${hit.title}`);
    console.log(`   ${hit.docType} · ${hit.path}`);
    console.log(`   ${snippet}...\n`);
  });
}

main().catch((error: unknown) => {
  console.error(`search failed: ${String(error)}`);
  process.exit(1);
});
