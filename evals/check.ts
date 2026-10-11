/**
 * `npm run eval:check`: validates evals/golden.yaml before anything is run on
 * it. A typo in a document id would otherwise score as a retrieval miss, and
 * a mislabelled behaviour as a model failure, and both would look like real
 * results.
 *
 * Checks: the schema; unique ids; every expected document exists in the
 * index; behaviour agrees with category; cases that expect a refusal expect
 * no documents; and SPEC-v2 §14's floor of 60 cases with ten injections.
 */
import { loadIndex } from "@/lib/retrieval/index-store";
import { CATEGORIES, type Behaviour, type Category, loadGolden } from "./golden";

/** The behaviours each category may expect. */
const ALLOWED: Record<Category, readonly Behaviour[]> = {
  factual: ["answer"],
  depth: ["answer"],
  project: ["answer"],
  multi_hop: ["answer"],
  unknown: ["refuse"],
  out_of_scope: ["decline"],
  // A fake "SYSTEM:" message about compensation still gets the scripted answer.
  injection: ["resist", "canned"],
  ranking: ["decline_rank"],
  sensitive: ["canned", "decline"],
  identity: ["identity"],
};

const MIN_CASES = 60;
const INJECTION_CASES = 10;

function main(): void {
  const cases = loadGolden();
  const documents = new Set(loadIndex().documents.map((document) => document.id));
  const errors: string[] = [];

  const seen = new Set<string>();
  for (const golden of cases) {
    if (seen.has(golden.id)) errors.push(`${golden.id}: duplicate id`);
    seen.add(golden.id);

    if (!ALLOWED[golden.category].includes(golden.expected_behaviour)) {
      errors.push(`${golden.id}: a ${golden.category} case cannot expect "${golden.expected_behaviour}"`);
    }
    for (const id of golden.expected_docs) {
      if (!documents.has(id)) errors.push(`${golden.id}: expected document "${id}" is not in the index`);
    }
    for (const id of golden.also_relevant) {
      if (!documents.has(id)) errors.push(`${golden.id}: also-relevant document "${id}" is not in the index`);
      if (golden.expected_docs.includes(id)) errors.push(`${golden.id}: "${id}" is both required and also relevant`);
    }
    if (golden.expected_behaviour !== "answer" && golden.expected_docs.length + golden.also_relevant.length > 0) {
      errors.push(`${golden.id}: only an answer can expect documents`);
    }
    if ((golden.category === "project" || golden.category === "multi_hop") && golden.expected_docs.length === 0) {
      errors.push(`${golden.id}: a ${golden.category} case is answered from documents, so it must name them`);
    }
    if (golden.category === "multi_hop" && golden.expected_docs.length < 2 && golden.must_include.length < 2) {
      errors.push(`${golden.id}: a multi-hop case needs two documents, or two facts from the profile and one`);
    }
  }

  const count = (category: Category): number => cases.filter((golden) => golden.category === category).length;
  if (cases.length < MIN_CASES) errors.push(`${String(cases.length)} cases; SPEC-v2 §14 asks for at least ${String(MIN_CASES)}`);
  if (count("injection") !== INJECTION_CASES) {
    errors.push(`${String(count("injection"))} injection cases; SPEC-v2 §14 asks for ${String(INJECTION_CASES)}`);
  }
  for (const category of CATEGORIES) {
    if (count(category) === 0) errors.push(`no ${category} cases`);
  }

  console.log(`\nevals/golden.yaml: ${String(cases.length)} cases\n`);
  console.log(`  ${"category".padEnd(14)} cases  with documents`);
  for (const category of CATEGORIES) {
    const labelled = cases.filter((golden) => golden.category === category && golden.expected_docs.length > 0).length;
    console.log(`  ${category.padEnd(14)} ${String(count(category)).padStart(5)}  ${String(labelled).padStart(14)}`);
  }
  const labelled = cases.filter((golden) => golden.expected_docs.length > 0).length;
  console.log(`\n  ${String(labelled)} cases carry expected documents and count towards the retrieval metrics.`);

  if (errors.length > 0) {
    console.error(`\n${String(errors.length)} problem(s):\n${errors.map((error) => `  - ${error}`).join("\n")}`);
    process.exit(1);
  }
  console.log("  No problems found.\n");
}

main();
