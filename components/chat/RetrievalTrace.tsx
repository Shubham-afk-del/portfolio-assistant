"use client";

import { useEffect, useState } from "react";

export interface TraceStage {
  id: string;
  label: string;
  ms: number;
}

export interface TracePayload {
  stages: TraceStage[];
  chunks: number;
  documents: number;
}

/**
 * The retrieval pipeline as the loading state.
 *
 * Every other assistant shows a spinner while it waits. This one has something
 * worth watching: the stages it actually ran, in order, each with the time it
 * actually took. SPEC-v2 §13 asks for a trace panel and this is it, promoted
 * from a collapsible panel nobody opens into the thing you look at while the
 * answer arrives.
 *
 * The timings are measured server-side and streamed before the text. The
 * animation reveals them in sequence rather than inventing a duration, so a
 * fast query looks fast.
 */
export function RetrievalTrace({
  trace,
  settled,
}: {
  trace: TracePayload;
  settled: boolean;
}) {
  const [revealed, setRevealed] = useState(0);

  // Derived, not set: a settled trace shows every stage without a state write,
  // which keeps the effect from calling setState synchronously on mount.
  const shown = settled ? trace.stages.length : revealed;

  useEffect(() => {
    if (settled) return;
    let index = 0;
    const tick = (): void => {
      index += 1;
      setRevealed(index);
    };
    const timers = trace.stages.map((_, i) => setTimeout(tick, 90 + i * 150));
    return () => {
      for (const timer of timers) clearTimeout(timer);
    };
  }, [trace.stages, settled]);

  const total = trace.stages.reduce((sum, stage) => sum + stage.ms, 0);

  return (
    <ol className="space-y-1.5" aria-label="Retrieval trace">
      {trace.stages.map((stage, index) => {
        const visible = index < shown;
        return (
          <li
            key={stage.id}
            className={`flex items-baseline gap-2.5 text-label transition-opacity duration-300 ${
              visible ? "opacity-100" : "opacity-0"
            }`}
          >
            <span
              aria-hidden
              className={`bg-evidence mt-[0.4em] h-1 w-1 shrink-0 rounded-full ${
                visible ? "animate-ping-once" : ""
              }`}
            />
            <span className="text-ink-muted">{stage.label}</span>
            <span className="border-rule-on-glass/40 mx-1 hidden flex-1 border-b border-dashed sm:block" />
            <span className="text-ink font-mono tabular-nums">
              {stage.ms}
              <span className="text-ink-muted">ms</span>
            </span>
          </li>
        );
      })}

      <li className="text-ink-muted flex items-baseline gap-2.5 pt-1 text-label">
        <span aria-hidden className="w-1 shrink-0" />
        <span>
          {trace.chunks} chunks, {trace.documents} documents
        </span>
        <span className="border-rule-on-glass/40 mx-1 hidden flex-1 border-b border-dashed sm:block" />
        <span className="text-ink font-mono tabular-nums">
          {total}
          <span className="text-ink-muted">ms</span>
        </span>
      </li>
    </ol>
  );
}
