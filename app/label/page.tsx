import { existsSync, readFileSync } from "node:fs";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { LabelItem } from "@/evals/label-prep";
import { LABELS, LABEL_SET, load } from "@/evals/store";
import { LabelDeck } from "./LabelDeck";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Label answers", robots: { index: false, follow: false } };

/**
 * The owner's labelling page for judge validation (Phase 3 step 4).
 * Development only. The client gets each item's question and reply, never
 * the judge's verdict or whether the item is seeded, so the labels are blind.
 */
export default function LabelPage() {
  if (process.env.NODE_ENV === "production") notFound();

  if (!existsSync(LABEL_SET)) {
    return (
      <main className="text-ink grid min-h-dvh place-items-center p-6 text-ui">
        Run <code className="font-mono">npm run eval:label-prep</code> first, then reload.
      </main>
    );
  }
  const { items } = JSON.parse(readFileSync(LABEL_SET, "utf8")) as { items: LabelItem[] };
  const labels = load<{ faithful: boolean }>(LABELS);
  return (
    <LabelDeck
      items={items.map(({ id, question, reply }) => ({ id, question, reply, label: labels[id]?.faithful ?? null }))}
    />
  );
}
