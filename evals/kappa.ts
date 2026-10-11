/**
 * `npm run eval:kappa`: how far the judge agrees with the owner (Phase 3 step
 * 4). An unvalidated LLM judge is an unmeasured instrument
 * (SPEC-v2-ML-OVERLAY §F); this is the measurement.
 *
 * Both say, per reply, whether everything it claims is true: the judge by
 * finding no unsupported claim, the owner by label. Reported: raw agreement,
 * Cohen's κ (agreement corrected for what chance alone would give), the
 * confusion matrix, and how many seeded errors each caught. Writes the judge
 * section of evals/results.json.
 */
import { readFileSync } from "node:fs";
import { MODELS } from "@/lib/config";
import type { LabelItem } from "./label-prep";
import { writeResults } from "./results";
import { LABELS, LABEL_SET, load } from "./store";

interface Label {
  faithful: boolean;
  note?: string;
}

/** Landis and Koch's (1977) bands, the usual reading of κ. */
function band(kappa: number): string {
  if (kappa < 0) return "poor";
  if (kappa <= 0.2) return "slight";
  if (kappa <= 0.4) return "fair";
  if (kappa <= 0.6) return "moderate";
  if (kappa <= 0.8) return "substantial";
  return "almost perfect";
}

function main(): void {
  const set = JSON.parse(readFileSync(LABEL_SET, "utf8")) as { items: LabelItem[] };
  const labels = load<Label>(LABELS);
  const pairs = set.items.flatMap((item) => {
    const label = labels[item.id];
    return label === undefined ? [] : [{ item, human: label.faithful, judge: item.judgeFaithful }];
  });
  if (pairs.length === 0) {
    console.log("No labels yet: open http://localhost:3100/label");
    return;
  }

  const count = (judge: boolean, human: boolean): number =>
    pairs.filter((pair) => pair.judge === judge && pair.human === human).length;
  const both = count(true, true);
  const judgeOnly = count(true, false);
  const humanOnly = count(false, true);
  const neither = count(false, false);
  const n = pairs.length;

  const observed = (both + neither) / n;
  const judgeYes = (both + judgeOnly) / n;
  const humanYes = (both + humanOnly) / n;
  const chance = judgeYes * humanYes + (1 - judgeYes) * (1 - humanYes);
  const kappa = chance === 1 ? null : (observed - chance) / (1 - chance);

  const seeded = pairs.filter((pair) => pair.item.seeded);
  const judgeCaught = seeded.filter((pair) => !pair.judge).length;
  const humanCaught = seeded.filter((pair) => !pair.human).length;

  console.log(`\n${String(n)} of ${String(set.items.length)} items labelled (${String(seeded.length)} seeded). Judge: ${MODELS.judge.model}.\n`);
  console.log(`                      owner: true   owner: wrong`);
  console.log(`judge: faithful       ${String(both).padStart(11)}   ${String(judgeOnly).padStart(12)}`);
  console.log(`judge: unsupported    ${String(humanOnly).padStart(11)}   ${String(neither).padStart(12)}`);
  console.log(`\nraw agreement   ${(100 * observed).toFixed(1)}%`);
  console.log(
    kappa === null
      ? "Cohen's κ       undefined: every label is the same class, so chance agreement is total"
      : `Cohen's κ       ${kappa.toFixed(3)} (${band(kappa)})`,
  );
  console.log(`seeded errors   judge caught ${String(judgeCaught)}/${String(seeded.length)}, owner caught ${String(humanCaught)}/${String(seeded.length)}`);

  const disagreements = pairs.filter((pair) => pair.judge !== pair.human);
  if (disagreements.length > 0) console.log(`\n${String(disagreements.length)} disagreement(s):`);
  for (const { item, human, judge } of disagreements) {
    const said = judge ? "judge passed it" : `judge flagged: ${item.judgeUnsupported.join(" / ").slice(0, 90)}`;
    const note = labels[item.id]?.note;
    console.log(`  ${item.id.padEnd(32)} owner says ${human ? "true" : "wrong"}; ${said}${note === undefined ? "" : ` (note: ${note})`}`);
  }

  writeResults("judge", {
    judge: MODELS.judge,
    labelled: n,
    seeded: seeded.length,
    confusion: { both, judgeOnly, humanOnly, neither },
    agreement: observed,
    kappa,
    kappaBand: kappa === null ? null : band(kappa),
    seededCaught: { judge: judgeCaught, owner: humanCaught },
  });
  console.log(`\nwrote evals/results.json`);
}

main();
