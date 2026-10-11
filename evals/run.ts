/**
 * `npm run eval`: the retrieval half of the eval harness (Phase 3, step 2).
 * `npm run eval -- --runs 3` repeats the reranked row and reports mean ± std.
 *
 * Every golden case that names expected documents goes through three
 * configurations: dense only, hybrid (dense + BM25, RRF) and the shipping
 * configuration, hybrid + rerank. Reported at document level (see
 * metrics.ts): recall@5, recall@10, MRR, nDCG@10 and hit@10, with retrieval
 * latency. Writes evals/results.json.
 *
 * Query embeddings are cached in evals/cache/, made in one batched request
 * the first time and never again, so the dense and hybrid rows cost nothing
 * and repeat exactly. The reranker calls an LLM every run; it is the one
 * stochastic stage, which is why only its row is repeated (SPEC-v2-ML-OVERLAY
 * §F: every reported number is mean ± std over at least three runs).
 *
 * A reranked result that came back degraded (the reranker failed and the
 * fused order stood in) is reported and fails the run: its numbers would
 * describe a different pipeline from the one the row is named for.
 */
import { MODELS, PROVIDER_LIMITS, RETRIEVAL_CONFIG, type RetrievalConfig } from "@/lib/config";
import { loadIndex } from "@/lib/retrieval/index-store";
import { retrieve, type RetrievalResult } from "@/lib/retrieval/pipeline";
import { loadGolden, type GoldenCase } from "./golden";
import { hitAtK, mean, ndcgAtK, percentile, recallAtK, reciprocalRank, std } from "./metrics";
import { writeResults } from "./results";
import { queryVectors } from "./vectors";

const K = 10;

/** recall@10 needs ten results; the shipping configuration returns eight. */
const EVAL_TOP_K = 10;

const CONFIGS: { name: string; config: RetrievalConfig }[] = [
  { name: "dense", config: { ...RETRIEVAL_CONFIG, hybrid: false, rerank: false, finalTopK: EVAL_TOP_K } },
  { name: "hybrid", config: { ...RETRIEVAL_CONFIG, rerank: false, finalTopK: EVAL_TOP_K } },
  { name: "hybrid + rerank", config: { ...RETRIEVAL_CONFIG, finalTopK: EVAL_TOP_K } },
];

/**
 * Reranked cases are spaced to the client's own Gemini budget, with a little
 * margin, so no request ever queues in the throttle. A queued request's wait
 * is otherwise timed as reranking: the first run's 47-second p95 was exactly
 * that, the rate limiter, not the model.
 */
const RERANK_SPACING_MS = Math.ceil(60_000 / (PROVIDER_LIMITS["gemini"]?.requestsPerMinute ?? 10)) + 250;

const METRICS = ["recall@5", "recall@10", "MRR", "nDCG@10", "hit@10"] as const;
type Metric = (typeof METRICS)[number];

interface CaseScore {
  id: string;
  scores: Record<Metric, number>;
  ms: number;
  degraded: string[];
  /** Expected documents with no chunk in the top ten. */
  missed: string[];
  /** Rank of the first chunk from a required document, or null. */
  firstRelevant: number | null;
  /** The documents of the top ten chunks, each once, in rank order: what to read when a case misses. */
  retrieved: string[];
}

function score(golden: GoldenCase, result: RetrievalResult): CaseScore {
  const documents = result.hits.map((hit) => hit.documentId);
  const expected = golden.expected_docs;
  const relevance = { required: expected, acceptable: golden.also_relevant };
  const top = new Set(documents.slice(0, K));
  const first = documents.slice(0, K).findIndex((id) => expected.includes(id));
  return {
    id: golden.id,
    scores: {
      "recall@5": recallAtK(documents, expected, 5),
      "recall@10": recallAtK(documents, expected, K),
      MRR: reciprocalRank(documents, relevance, K),
      "nDCG@10": ndcgAtK(documents, relevance, K),
      "hit@10": hitAtK(documents, relevance, K),
    },
    ms: result.stages.reduce((sum, stage) => sum + stage.ms, 0),
    degraded: result.degraded,
    missed: expected.filter((id) => !top.has(id)),
    firstRelevant: first === -1 ? null : first + 1,
    retrieved: [...new Set(documents.slice(0, K))],
  };
}

/** "content-case-studies-nyc-taxis-eda-md" to "case-studies/nyc-taxis-eda". */
function short(id: string): string {
  return id.replace(/^content-/, "").replace(/-md$/, "").replace(/^(case-studies|decisions|interview-answers)-/, "$1/");
}

function format(values: readonly number[]): string {
  const average = mean(values).toFixed(3);
  return values.length > 1 ? `${average} ± ${std(values).toFixed(3)}` : average;
}

async function main(): Promise<void> {
  const runsFlag = process.argv.indexOf("--runs");
  const runs = runsFlag === -1 ? 1 : Math.max(1, Number(process.argv[runsFlag + 1] ?? 1));
  const cases = loadGolden().filter((golden) => golden.expected_docs.length > 0);
  const index = loadIndex();
  const vectors = await queryVectors(cases.map((golden) => golden.question));
  console.log(`\n${String(cases.length)} golden cases with expected documents, ${String(index.chunks.length)} chunks`);

  const rows: {
    name: string;
    runs: number;
    perRun: Record<Metric, number>[];
    latency: { p50: number; p95: number };
    cases: CaseScore[];
  }[] = [];
  let degraded = 0;

  for (const { name, config } of CONFIGS) {
    const repeats = config.rerank ? runs : 1;
    const perRun: Record<Metric, number>[] = [];
    let last: CaseScore[] = [];
    const latencies: number[] = [];
    // Across runs too: the second run's first request is the first run's next.
    let lastStart = 0;

    for (let run = 0; run < repeats; run += 1) {
      const scores: CaseScore[] = [];
      for (const [i, golden] of cases.entries()) {
        if (config.rerank) {
          const wait = lastStart + RERANK_SPACING_MS - Date.now();
          if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
          lastStart = Date.now();
        }
        process.stdout.write(`\r${name}${repeats > 1 ? `, run ${String(run + 1)}/${String(repeats)}` : ""}: ${String(i + 1)}/${String(cases.length)}`);
        const result = await retrieve(golden.question, { index, config, queryVector: vectors.get(golden.question) });
        const scored = score(golden, result);
        if (scored.degraded.length > 0) {
          degraded += 1;
          console.log(`\n  DEGRADED ${golden.id}: ${scored.degraded.join("; ")}`);
        }
        scores.push(scored);
        latencies.push(scored.ms);
      }
      perRun.push(
        Object.fromEntries(METRICS.map((metric) => [metric, mean(scores.map((s) => s.scores[metric]))])) as Record<Metric, number>,
      );
      last = scores;
    }
    process.stdout.write("\n");
    rows.push({
      name,
      runs: repeats,
      perRun,
      latency: { p50: percentile(latencies, 50), p95: percentile(latencies, 95) },
      cases: last,
    });
  }

  // The table.
  const width = runs > 1 ? 15 : 9;
  console.log(`\n${"configuration".padEnd(17)}${METRICS.map((metric) => metric.padStart(width)).join("")}   p50 ms   p95 ms`);
  for (const row of rows) {
    const cells = METRICS.map((metric) => format(row.perRun.map((run) => run[metric])).padStart(width)).join("");
    console.log(`${row.name.padEnd(17)}${cells}${String(row.latency.p50).padStart(9)}${String(row.latency.p95).padStart(9)}`);
  }

  const lift = (from: string, to: string): string => {
    const a = rows.find((row) => row.name === from);
    const b = rows.find((row) => row.name === to);
    if (a === undefined || b === undefined) return "";
    return METRICS.map((metric) => {
      const delta = mean(b.perRun.map((run) => run[metric])) - mean(a.perRun.map((run) => run[metric]));
      return `${metric} ${delta >= 0 ? "+" : ""}${delta.toFixed(3)}`;
    }).join(", ");
  };
  console.log(`\nhybrid over dense:          ${lift("dense", "hybrid")}`);
  console.log(`rerank over hybrid:         ${lift("hybrid", "hybrid + rerank")}`);

  // What the shipping configuration missed, to read rather than to average.
  const shipping = rows[rows.length - 1];
  const misses = shipping?.cases.filter((c) => c.missed.length > 0) ?? [];
  console.log(`\n${shipping?.name ?? ""}: ${String(misses.length)} case(s) missed an expected document in the top ${String(K)}`);
  for (const miss of misses) {
    const first = miss.firstRelevant === null ? "nothing relevant" : `first relevant at ${String(miss.firstRelevant)}`;
    console.log(`  ${miss.id.padEnd(28)} missed ${miss.missed.map(short).join(", ")} (${first})`);
  }

  writeResults("retrieval", {
    index: { builtAt: index.builtAt, embedModel: index.embedModel, chunks: index.chunks.length, documents: index.documents.length },
    rerankModel: MODELS.rerank.model,
    cases: cases.length,
    k: K,
    configurations: rows.map((row) => ({
      name: row.name,
      runs: row.runs,
      metrics: Object.fromEntries(
        METRICS.map((metric) => {
          const values = row.perRun.map((run) => run[metric]);
          return [metric, { mean: mean(values), std: std(values) }];
        }),
      ),
      latencyMs: row.latency,
      cases: row.cases,
    })),
  });
  console.log(`\nwrote evals/results.json`);

  if (degraded > 0) {
    console.error(`\n${String(degraded)} reranked result(s) were degraded; those rows do not measure the reranker.`);
    process.exit(1);
  }
}

main().catch((error: unknown) => {
  console.error(`eval failed: ${String(error)}`);
  process.exit(1);
});
