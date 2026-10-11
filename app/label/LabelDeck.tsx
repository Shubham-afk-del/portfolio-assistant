"use client";

import { useEffect, useState } from "react";
import { Check, ChevronLeft, ChevronRight, X } from "lucide-react";
import { StreamingText } from "@/components/chat/StreamingText";

interface Item {
  id: string;
  question: string;
  reply: string;
  label: boolean | null;
}

/**
 * One reply at a time: is everything it says about you true? Y and N answer
 * from the keyboard. Each label is saved as it is given, so the page can be
 * closed and picked up again where it stopped.
 */
export function LabelDeck({ items }: { items: Item[] }) {
  const [labels, setLabels] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(items.flatMap((item) => (item.label === null ? [] : [[item.id, item.label]]))),
  );
  const [index, setIndex] = useState(() => {
    const first = items.findIndex((item) => item.label === null);
    return first === -1 ? items.length : first;
  });
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  const item = items[index];
  const done = Object.keys(labels).length;

  const record = async (faithful: boolean): Promise<void> => {
    if (item === undefined || saving) return;
    setSaving(true);
    setFailed(false);
    const response = await fetch("/api/label", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: item.id, faithful, note }),
    }).catch(() => undefined);
    setSaving(false);
    if (response?.ok !== true) {
      setFailed(true);
      return;
    }
    const next = { ...labels, [item.id]: faithful };
    setLabels(next);
    setNote("");
    const after = items.findIndex((candidate, i) => i > index && next[candidate.id] === undefined);
    const before = items.findIndex((candidate) => next[candidate.id] === undefined);
    setIndex(after !== -1 ? after : before !== -1 ? before : items.length);
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.target instanceof HTMLTextAreaElement || event.metaKey || event.ctrlKey) return;
      if (event.key === "y") void record(true);
      if (event.key === "n") void record(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  });

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-5 px-4 py-8 sm:py-12">
      <header className="space-y-3">
        <p className="text-ink-muted text-micro font-medium">Judge validation · Phase 3 step 4</p>
        <h1 className="text-ink text-lead font-semibold text-balance">Is everything this answer says about you true?</h1>
        <div className="flex items-center gap-3">
          <span className="bg-sunken block h-1.5 flex-1 overflow-hidden rounded-full">
            <span
              className="from-brand-a block h-full rounded-full bg-linear-to-r to-[#14b8a6] transition-[width] duration-500"
              style={{ width: `${String((100 * done) / Math.max(1, items.length))}%` }}
            />
          </span>
          <span className="text-ink-muted font-mono text-micro tabular-nums">
            {done}/{items.length}
          </span>
        </div>
      </header>

      {item === undefined ? (
        <section className="glass-inset rounded-3xl p-6 text-center">
          <p className="text-ink text-lead font-semibold">All {items.length} labelled. Thank you.</p>
          <p className="text-ink-muted mt-2 text-ui">Tell Claude you have finished, and it will measure how far the judge agrees with you.</p>
        </section>
      ) : (
        <section key={item.id} className="glass-inset animate-rise space-y-5 rounded-3xl p-5 sm:p-6">
          <div>
            <p className="text-ink-muted text-micro font-medium">The recruiter asked</p>
            <p className="text-ink mt-1 text-ui font-semibold">{item.question}</p>
          </div>
          <div>
            <p className="text-ink-muted mb-2 text-micro font-medium">The assistant answered</p>
            <StreamingText text={item.reply} streaming={false} />
          </div>

          <label className="block">
            <span className="text-ink-muted text-micro font-medium">What is wrong, if anything? (optional)</span>
            <textarea
              value={note}
              onChange={(event) => {
                setNote(event.target.value);
              }}
              rows={2}
              className="bg-sunken text-ink mt-1 block w-full resize-none rounded-xl px-3 py-2 text-label outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-a)]"
            />
          </label>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={() => void record(true)}
              className="bg-brand-a inline-flex min-h-11 items-center gap-2 rounded-full px-5 text-ui font-semibold text-white transition-transform active:scale-[0.97] disabled:opacity-60"
            >
              <Check aria-hidden className="size-4" /> All true <kbd className="font-mono text-micro opacity-75">Y</kbd>
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => void record(false)}
              className="glass-inset text-ink inline-flex min-h-11 items-center gap-2 rounded-full px-5 text-ui font-semibold transition-transform active:scale-[0.97] disabled:opacity-60"
            >
              <X aria-hidden className="size-4" /> Something is wrong <kbd className="font-mono text-micro opacity-75">N</kbd>
            </button>
            <span className="ml-auto flex items-center gap-1">
              <button
                type="button"
                aria-label="Previous answer"
                disabled={index === 0}
                onClick={() => {
                  setIndex((current) => Math.max(0, current - 1));
                }}
                className="text-ink-muted hover:text-ink grid size-11 place-items-center rounded-full disabled:opacity-40"
              >
                <ChevronLeft aria-hidden className="size-5" />
              </button>
              <button
                type="button"
                aria-label="Next answer, without labelling this one"
                disabled={index >= items.length - 1}
                onClick={() => {
                  setIndex((current) => Math.min(items.length - 1, current + 1));
                }}
                className="text-ink-muted hover:text-ink grid size-11 place-items-center rounded-full disabled:opacity-40"
              >
                <ChevronRight aria-hidden className="size-5" />
              </button>
            </span>
          </div>
          {labels[item.id] !== undefined && (
            <p className="text-ink-muted text-micro">You marked this {labels[item.id] ? "all true" : "something is wrong"}; answering again replaces it.</p>
          )}
          {failed && <p className="text-caution text-micro font-medium">That label did not save. Try again.</p>}
        </section>
      )}
    </main>
  );
}
