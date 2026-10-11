import assert from "node:assert/strict";
import { test } from "node:test";
import { hitAtK, ndcgAtK, percentile, recallAtK, reciprocalRank } from "./metrics";

/** Each retrieved chunk's document, in rank order. A and B are required; nothing is acceptable. */
const run = ["X", "A", "A", "Y", "B", "Z"];
const expected = ["A", "B"];
const binary = { required: expected, acceptable: [] };

test("recall@k counts expected documents with a chunk in the top k", () => {
  assert.equal(recallAtK(run, expected, 2), 0.5);
  assert.equal(recallAtK(run, expected, 5), 1);
});

test("hit@k is 1 as soon as any expected document appears", () => {
  assert.equal(hitAtK(run, { required: ["A"], acceptable: [] }, 1), 0);
  assert.equal(hitAtK(run, { required: ["A"], acceptable: [] }, 2), 1);
});

test("reciprocal rank uses the first relevant chunk, and is 0 outside k", () => {
  assert.equal(reciprocalRank(run, binary, 10), 0.5);
  assert.equal(reciprocalRank(run, { required: ["Z"], acceptable: [] }, 3), 0);
});

test("nDCG credits a document once, at its first chunk", () => {
  const dcg = 1 / Math.log2(3) + 1 / Math.log2(6);
  const ideal = 1 + 1 / Math.log2(3);
  assert.ok(Math.abs(ndcgAtK(run, binary, 10) - dcg / ideal) < 1e-12);
  assert.equal(ndcgAtK(["A", "B", "X"], binary, 10), 1);
});

test("an acceptable document ranked first counts for MRR and hit, not for recall", () => {
  const graded = { required: ["A"], acceptable: ["X"] };
  assert.equal(reciprocalRank(run, graded, 10), 1);
  assert.equal(hitAtK(run, graded, 1), 1);
  assert.equal(recallAtK(run, graded.required, 1), 0);
});

test("graded nDCG gives an acceptable document half the gain, and the ideal puts required first", () => {
  const graded = { required: ["A"], acceptable: ["X"] };
  // X (0.5) at rank 1, A (1) at rank 2. Ideal: A at 1, X at 2.
  const dcg = 0.5 / Math.log2(2) + 1 / Math.log2(3);
  const ideal = 1 / Math.log2(2) + 0.5 / Math.log2(3);
  assert.ok(Math.abs(ndcgAtK(run, graded, 10) - dcg / ideal) < 1e-12);
});

test("percentile is nearest-rank", () => {
  assert.equal(percentile([4, 1, 3, 2], 50), 2);
  assert.equal(percentile([4, 1, 3, 2], 95), 4);
});
