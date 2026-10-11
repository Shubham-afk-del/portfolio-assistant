"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { AnimatePresence, m } from "motion/react";
import { Check, ChevronDown, Route } from "lucide-react";
import { easing, reducedMotion, useReducedMotion } from "@/lib/motion";
import { vars } from "@/lib/utils";
import styles from "./RetrievalTrace.module.css";
import { Thinking } from "./Thinking";
import type { TracePayload } from "./types";

/** How long the area takes to reach a new height, on the spring token. */
const MORPH_MS = 460;

export type TracePhase = "thinking" | "live" | "summary";

/** Leaving upward and out of focus, tipping away like a page turned back. */
const FOLD = {
  opacity: 0,
  y: -10,
  rotateX: 24,
  filter: "blur(3px)",
  transition: { duration: 0.3, ease: [0.7, 0, 0.84, 0] },
} as const;

const SPRING = { type: "spring", stiffness: 320, damping: 30, mass: 0.9 } as const;

/**
 * The top of an answer, through the three things it shows: a thinking line
 * until the search reports back, the live pipeline while the stages tick
 * off, and the one-line summary once the answer is being written. They hand
 * over in place. The one leaving folds away on top while the next settles
 * in underneath, and the area springs to the new height instead of
 * jumping, so the answer below glides rather than lurches. Opening the
 * summary's waterfall springs the same way.
 */
export function TraceArea({ phase, trace }: { phase: TracePhase; trace: TracePayload | undefined }) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  useHeightMorph(outer, inner);

  return (
    <div ref={outer} className={styles.area}>
      <div ref={inner} className="relative">
        <AnimatePresence mode="popLayout" initial={false}>
          {phase === "thinking" && (
            <m.div
              key="thinking"
              exit={reduced ? { opacity: 0, transition: { duration: 0 } } : { ...FOLD, rotateX: 0 }}
            >
              <Thinking label="Searching his work" />
            </m.div>
          )}

          {phase === "live" && trace !== undefined && (
            <m.div
              key="live"
              style={{ transformPerspective: 700, originY: 0 }}
              exit={reduced ? { opacity: 0, transition: { duration: 0 } } : FOLD}
            >
              <LiveTrace trace={trace} />
            </m.div>
          )}

          {phase === "summary" && trace !== undefined && (
            <m.div
              key="summary"
              initial={reduced ? false : { opacity: 0, y: 10, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ ...SPRING, delay: 0.06 }}
              style={{ originX: 0 }}
            >
              <TraceSummary trace={trace} />
            </m.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

/**
 * The retrieval pipeline, shown while it runs.
 *
 * Most assistants show a spinner while they wait. This one has something
 * worth watching: the stages it actually ran, in order, each with the time it
 * actually took. The timings are measured on the server and streamed before
 * the text. The reveal is paced so the stages read in sequence, but no
 * duration is invented, so a fast query still shows fast numbers.
 */
export function LiveTrace({ trace }: { trace: TracePayload }) {
  const [shown, setShown] = useState(0);

  useEffect(() => {
    const timers = trace.stages.map((_, index) =>
      setTimeout(() => {
        setShown(index + 1);
      }, 140 + index * 180),
    );
    return () => {
      for (const timer of timers) clearTimeout(timer);
    };
  }, [trace.stages]);

  const last = trace.stages.length - 1;
  const progress = last <= 0 ? 1 : Math.min(shown, last) / last;

  return (
    <ol aria-label="Retrieval steps" className={styles.live} style={vars({ "--progress": progress })}>
      {trace.stages.map((stage, index) => {
        const state = index < shown ? "done" : index === shown ? "current" : "next";
        return (
          <li
            key={stage.id}
            data-state={state}
            className={`${styles.stage} text-label`}
            style={vars({ "--i": index })}
          >
            <span aria-hidden className={styles.node}>
              {state === "done" && <Check className="size-2.5" strokeWidth={3.5} />}
            </span>
            <span className={state === "current" ? "scan-text" : undefined}>{stage.label}</span>
            {state === "done" && <span className={styles.ms}>{stage.ms} ms</span>}
          </li>
        );
      })}
    </ol>
  );
}

/**
 * The same trace once the answer has started: one line, closed by default as
 * SPEC-v2 §13 asks, opening to a waterfall where each bar starts where the
 * previous stage ended and is as long as the stage took.
 */
export function TraceSummary({ trace }: { trace: TracePayload }) {
  const [open, setOpen] = useState(false);
  const reduced = useReducedMotion();
  const id = useId();
  const total = trace.stages.reduce((sum, stage) => sum + stage.ms, 0);
  const starts = trace.stages.map((_, index) =>
    trace.stages.slice(0, index).reduce((sum, stage) => sum + stage.ms, 0),
  );
  const percent = (ms: number): number => (total === 0 ? 0 : (ms / total) * 100);

  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => {
          setOpen((value) => !value);
        }}
        className="touch-target hairline text-ink-muted hover:text-ink hover:bg-sunken inline-flex min-h-9 items-center gap-2 rounded-full border px-3 py-1.5 text-label transition-colors"
      >
        <Route aria-hidden className="size-3.5" />
        <span>
          Searched {trace.documents} documents in{" "}
          <span className="text-ink font-mono tabular-nums">{total} ms</span>
        </span>
        <ChevronDown
          aria-hidden
          className={`size-3.5 transition-transform duration-300 ${open ? "rotate-180" : ""}`}
        />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <m.div
            key="waterfall"
            id={id}
            initial={reduced ? false : { opacity: 0, y: -6, rotateX: -14 }}
            animate={{ opacity: 1, y: 0, rotateX: 0 }}
            exit={reduced ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, y: -4, transition: { duration: 0.16 } }}
            transition={SPRING}
            style={{ transformPerspective: 900, originY: 0 }}
            className="glass-inset mt-3 rounded-2xl p-4"
          >
            <ol className={`${styles.waterfall} space-y-3`}>
              {trace.stages.map((stage, index) => (
                <li
                  key={stage.id}
                  className="animate-rise grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1.5 text-label"
                  style={vars({ "--i": index })}
                >
                  <span className="text-ink-muted">{stage.label}</span>
                  <span className="text-ink font-mono tabular-nums">{stage.ms} ms</span>
                  <span className="bg-sunken relative col-span-2 h-1.5 overflow-hidden rounded-full">
                    <span
                      className="animate-grow-x from-brand-a absolute inset-y-0 rounded-full bg-linear-to-r to-[#3b9eff]"
                      style={{
                        ...vars({ "--i": index }),
                        left: `${String(percent(starts[index] ?? 0))}%`,
                        width: `max(${String(percent(stage.ms))}%, 4px)`,
                      }}
                    />
                  </span>
                </li>
              ))}
            </ol>
            <p className="text-ink-muted mt-3 text-micro">
              {trace.chunks} passages across {trace.documents} documents. Every timing is
              measured on the server, not estimated.
            </p>
          </m.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * Springs `outer` from its old height to its new one whenever the content in
 * `inner` changes size, rather than letting the change jump. A ResizeObserver
 * on the content sees the new height; the box animates there from wherever
 * it was, clipping while it does, and a change mid-spring starts from the
 * height on screen. With reduced motion the height simply changes.
 */
function useHeightMorph(outer: RefObject<HTMLElement | null>, inner: RefObject<HTMLElement | null>): void {
  useLayoutEffect(() => {
    const box = outer.current;
    const content = inner.current;
    if (box === null || content === null) return;

    let height = content.offsetHeight;
    let running: Animation | null = null;

    const observer = new ResizeObserver(() => {
      const next = content.offsetHeight;
      if (next === height) return;
      const from = running === null ? height : box.getBoundingClientRect().height;
      running?.cancel();
      running = null;
      height = next;
      if (reducedMotion() || Math.abs(next - from) < 1) return;

      box.style.overflow = "clip";
      const animation = box.animate([{ height: `${String(from)}px` }, { height: `${String(next)}px` }], {
        duration: MORPH_MS,
        easing: easing("--ease-spring"),
      });
      running = animation;
      const release = (): void => {
        if (running !== animation) return;
        running = null;
        box.style.removeProperty("overflow");
      };
      animation.addEventListener("finish", release);
      animation.addEventListener("cancel", release);
    });
    observer.observe(content);

    return () => {
      observer.disconnect();
      running?.cancel();
    };
  }, [outer, inner]);
}
