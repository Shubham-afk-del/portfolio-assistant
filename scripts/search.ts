/**
 * `npm run search -- "question"`               the configured pipeline
 * `npm run search -- --dense "question"`       dense only (ablation rows 1 to 3)
 * `npm run search -- --no-rerank "question"`   hybrid without the reranker (rows 4, 5)
 * `npm run search -- --compare "question"`     all three, side by side
 *
 * Retrieval from the command line, before and apart from any UI. Compare
 * mode embeds the question once and runs every config on that vector, so a
 * comparison costs one embedding call, which matters at Voyage's free 3 per
 * minute, plus one reranker call.
 */
import { RETRIEVAL_CONFIG, type RetrievalConfig } from "@/lib/config";
import { embed } from "@/lib/llm";
import { loadIndex } from "@/lib/retrieval/index-store";
import { retrieve, type RetrievalResult } from "@/lib/retrieval/pipeline";

const DENSE_ONLY: RetrievalConfig = { ...RETRIEVAL_CONFIG, hybrid: false, rerank: false };
const HYBRID: RetrievalConfig = { ...RETRIEVAL_CONFIG, rerank: false };

function shortTitle(title: string): string {
  const name = title.includes("/") ? (title.split("/").pop() ?? title) : title;
  return name.length > 60 ? `${name.slice(0, 57)}...` : name;
}

function print(label: string, result: RetrievalResult): void {
  const stages = result.stages.map((stage) => `${stage.id} ${String(stage.ms)}ms`).join(", ");
  const { gate } = result;
  const measure = gate.scale === "rerank" ? "best relevance" : "best similarity";
  console.log(`\n${label}: ${stages}`);
  for (const reason of result.degraded) console.log(`DEGRADED ${reason}`);
  console.log(
    `gate ${gate.passed ? "passes" : "REFUSES"}: ${measure} ${gate.best.toFixed(2)} vs threshold ${gate.threshold.toFixed(2)}`,
  );
  result.hits.forEach((hit, i) => {
    const relevance = hit.relevance === undefined ? "   -" : hit.relevance.toFixed(2);
    const dense = hit.denseRank === undefined ? "  -" : String(hit.denseRank).padStart(3);
    const lexical = hit.lexicalRank === undefined ? "  -" : String(hit.lexicalRank).padStart(3);
    console.log(
      `${String(i + 1).padStart(2)}. rel ${relevance}  cos ${hit.similarity.toFixed(3)}  dense#${dense}  bm25#${lexical}  ${hit.docType.padEnd(17)} ${shortTitle(hit.title)}`,
    );
  });
}

/** How many passages `after` has that `before` did not, and the reverse. */
function churn(before: RetrievalResult, after: RetrievalResult): { gained: number; lost: number } {
  const was = new Set(before.hits.map((hit) => hit.chunkId));
  const now = new Set(after.hits.map((hit) => hit.chunkId));
  return {
    gained: after.hits.filter((hit) => !was.has(hit.chunkId)).length,
    lost: before.hits.filter((hit) => !now.has(hit.chunkId)).length,
  };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const compare = args.includes("--compare");
  const config = args.includes("--dense")
    ? { label: "dense only", value: DENSE_ONLY }
    : args.includes("--no-rerank")
      ? { label: "hybrid, no rerank", value: HYBRID }
      : { label: "configured", value: RETRIEVAL_CONFIG };
  const question = args.filter((arg) => !arg.startsWith("--")).join(" ").trim();
  if (question === "") {
    console.error('usage: npm run search -- [--dense | --no-rerank | --compare] "your question"');
    process.exit(1);
  }

  const index = loadIndex();
  console.log(
    `\n"${question}"\n${String(index.chunks.length)} chunks, ${String(index.documents.length)} documents, built ${index.builtAt.slice(0, 10)}`,
  );

  if (!compare) {
    print(config.label, await retrieve(question, { index, config: config.value }));
    return;
  }

  const started = Date.now();
  const { vectors } = await embed({ input: [question], inputType: "query" });
  const queryVector = vectors[0];
  if (queryVector === undefined) throw new Error("no embedding returned");
  console.log(`embed ${String(Date.now() - started)}ms (shared by all three runs)`);

  const dense = await retrieve(question, { index, config: DENSE_ONLY, queryVector });
  const hybrid = await retrieve(question, { index, config: HYBRID, queryVector });
  const reranked = await retrieve(question, { index, config: RETRIEVAL_CONFIG, queryVector });
  print("dense only", dense);
  print("hybrid (dense + BM25, RRF)", hybrid);
  print("hybrid + rerank", reranked);

  const fusion = churn(dense, hybrid);
  const grading = churn(hybrid, reranked);
  console.log(
    `\nhybrid brought in ${String(fusion.gained)} passage(s) dense did not rank, and dropped ${String(fusion.lost)}.` +
      `\nreranking brought in ${String(grading.gained)} passage(s) hybrid did not rank, and dropped ${String(grading.lost)}.`,
  );
}

main().catch((error: unknown) => {
  console.error(`search failed: ${String(error)}`);
  process.exit(1);
});
