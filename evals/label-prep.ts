/**
 * `npm run eval:label-prep`: the set the owner labels to validate the judge
 * (Phase 3 step 4; Cohen's κ, SPEC-v2-ML-OVERLAY §F).
 *
 * Real replies from the latest answer run that make at least one claim, plus
 * seeded ones: a real reply with one fact swapped for a wrong one. Without
 * them nearly every reply is faithful, the judge is never tested on catching
 * a false claim, and κ cannot even be computed when one class is empty.
 * Seeded replies are judged like any other. The owner labels every item
 * blind: the page shows neither the judge's verdict nor which are seeded.
 *
 * Writes evals/cache/label-set.json, in a fixed shuffled order.
 */
import { getProfile } from "@/lib/profile";
import { systemPrompt } from "@/lib/generation/prompt";
import { type Scope, scopeSystem } from "@/lib/generation/scope";
import { loadIndex } from "@/lib/retrieval/index-store";
import { PROVIDER_LIMITS } from "@/lib/config";
import { loadGolden } from "./golden";
import { type Judgement, judgeReply } from "./judge";
import { ANSWERS, type AnswerRecord, JUDGEMENTS, LABEL_SET, SCOPES, answerKey, answerRunKey, judgeKey, load, save, scopeKey } from "./store";

/** One wrong fact per rule, applied to the first reply that contains it. */
const SWAPS: readonly (readonly [string, string])[] = [
  ["Capgemini", "Infosys"],
  ["Northeastern University London", "Imperial College London"],
  ["175,777", "157,777"],
  ["2 to 5 hours", "10 to 15 hours"],
  ["Senior Analyst", "Team Lead"],
  ["January 2027", "September 2027"],
  ["February 2027", "June 2026"],
  ["96.25", "92.40"],
  ["Tech Mahindra", "Wipro"],
  ["bcrypt", "MD5"],
  ["SvelteKit", "Django"],
  ["489,542", "948,542"],
  ["ServiceNow", "Jira"],
  ["IIIT Bangalore", "IIT Delhi"],
  ["0.88", "0.93"],
];

export interface LabelItem {
  id: string;
  caseId: string;
  question: string;
  reply: string;
  seeded: boolean;
  swap?: readonly [string, string];
  /** The judge's verdict: true when it found no unsupported claim. */
  judgeFaithful: boolean;
  judgeUnsupported: string[];
}

const SLOT_MS = Math.ceil(60_000 / (PROVIDER_LIMITS["gemini"]?.requestsPerMinute ?? 10)) + 250;

/** A small seeded PRNG (mulberry32), so the shuffle is the same on every run. */
function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function main(): Promise<void> {
  const index = loadIndex();
  const system = systemPrompt(getProfile(), process.env["CONTACT_PHONE"]);
  const runKey = answerRunKey(system, index);
  const scopePrompt = scopeSystem(getProfile().preferred_name);
  const scopes = load<Scope>(SCOPES);
  const answers = load<AnswerRecord>(ANSWERS);
  const judgements = load<Judgement>(JUDGEMENTS);
  const cases = [...loadGolden()].sort((a, b) => a.id.localeCompare(b.id));

  const items: LabelItem[] = [];
  const real: { caseId: string; question: string; record: AnswerRecord }[] = [];
  for (const golden of cases) {
    const record = answers[answerKey(runKey, golden.question, scopes[scopeKey(scopePrompt, golden.question)])];
    if (record === undefined || record.reply === "") continue;
    const judgement = judgements[judgeKey(system, record.passages, record.reply, golden.question)];
    if (judgement === undefined || judgement.claims.length === 0) continue;
    real.push({ caseId: golden.id, question: golden.question, record });
    items.push({
      id: golden.id,
      caseId: golden.id,
      question: golden.question,
      reply: record.reply,
      seeded: false,
      judgeFaithful: judgement.claims.every((claim) => claim.supported),
      judgeUnsupported: judgement.claims.filter((claim) => !claim.supported).map((claim) => claim.claim),
    });
  }
  if (items.length === 0) throw new Error("no judged replies with claims: run npm run eval:answers first");

  const used = new Set<string>();
  for (const [from, to] of SWAPS) {
    const source = real.find((entry) => !used.has(entry.caseId) && entry.record.reply.includes(from));
    if (source === undefined) continue;
    used.add(source.caseId);
    const reply = source.record.reply.split(from).join(to);
    const key = judgeKey(system, source.record.passages, reply, source.question);
    let judgement = judgements[key];
    if (judgement === undefined) {
      process.stdout.write(`\rjudging seeded reply for ${source.caseId.padEnd(30)}`);
      await new Promise((resolve) => setTimeout(resolve, SLOT_MS));
      judgement = await judgeReply({ question: source.question, context: `${system}\n\n${source.record.passages}`, reply });
      judgements[key] = judgement;
      save(JUDGEMENTS, judgements);
    }
    items.push({
      id: `seed-${source.caseId}`,
      caseId: source.caseId,
      question: source.question,
      reply,
      seeded: true,
      swap: [from, to],
      judgeFaithful: judgement.claims.every((claim) => claim.supported),
      judgeUnsupported: judgement.claims.filter((claim) => !claim.supported).map((claim) => claim.claim),
    });
  }
  process.stdout.write("\n");

  // Fisher-Yates with the fixed generator, so real and seeded interleave.
  const next = random(20261010);
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(next() * (i + 1));
    [items[i], items[j]] = [items[j]!, items[i]!];
  }

  save(LABEL_SET, { createdAt: new Date().toISOString(), items });
  const seeded = items.filter((item) => item.seeded).length;
  console.log(`${String(items.length)} items to label: ${String(items.length - seeded)} real, ${String(seeded)} seeded. Open http://localhost:3100/label`);
}

main().catch((error: unknown) => {
  console.error(`label prep failed: ${String(error)}`);
  process.exit(1);
});
