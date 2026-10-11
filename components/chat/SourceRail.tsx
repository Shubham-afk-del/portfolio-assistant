"use client";

import { useRef, useState } from "react";
import { AnimatePresence, m } from "motion/react";
import {
  ArrowUpRight,
  BookOpen,
  ChevronDown,
  Code2,
  FileText,
  MessageSquareQuote,
  Scale,
  type LucideIcon,
} from "lucide-react";
import { NumberTicker } from "@/components/motion/NumberTicker";
import { useTilt } from "@/components/motion/useTilt";
import { useReducedMotion } from "@/lib/motion";
import { vars } from "@/lib/utils";
import styles from "./SourceRail.module.css";
import type { Hit, SourcesPayload } from "./types";

const KINDS: Record<string, { label: string; Icon: LucideIcon }> = {
  "case-study": { label: "Case study", Icon: BookOpen },
  decision: { label: "Decision record", Icon: Scale },
  "interview-answers": { label: "Interview answers", Icon: MessageSquareQuote },
  code: { label: "Code", Icon: Code2 },
};

const FIRST = 4;

/** A card settling from depth: quick, with a trace of overshoot. */
const DEAL = { type: "spring", stiffness: 280, damping: 26, mass: 0.9 } as const;
/** A height opening or closing: fully damped, so the list below never bounces. */
const OPEN = { type: "spring", stiffness: 220, damping: 32 } as const;
/** When the first card starts, so the list follows the knowledge map in. */
const DEAL_FROM = 0.24;
const DEAL_EVERY = 0.07;

/** Clips for an extra card opening: room for its shadow, or a line along its top. */
const SHOWN = "inset(-14% -4% -30% -4%)";
const HIDDEN = "inset(0% -4% 100% -4%)";

/** Code paths read as "repo/dir/file"; the file is the useful part to show. */
function titleParts(hit: Hit): { title: string; context?: string } {
  if (hit.docType !== "code") return { title: hit.title };
  const segments = hit.title.split("/");
  return {
    title: segments[segments.length - 1] ?? hit.title,
    context: segments.slice(0, -1).join("/"),
  };
}

/**
 * The sources behind an answer, with their real scores.
 *
 * When the reranker ran, the number is its grade, 0 to 1, and the meter is
 * that grade on its own fixed scale: grades mean the same thing from one
 * question to the next, so they need no rescaling. Without it, the number is
 * cosine similarity and the meter is scaled against the best hit in the set,
 * because similarity on this corpus clusters between about 0.4 and 0.6 and a
 * meter scaled to 1.0 would make every result look like a near miss. Either
 * way the raw number sits beside the meter, so the scaling cannot mislead,
 * and a hit under the relevance threshold says "weak match" in words as well
 * as in colour.
 *
 * Motion: the cards are dealt in rank order, each swinging down from a tilt
 * into place with its rank landing a beat later, so the order reads as an
 * order. "Show all" opens the rest the same way, growing each card's height
 * from nothing so the list and everything under it glide down rather than
 * jump; "Show fewer" folds them back up, last first.
 */
export function SourceRail({
  sources,
  activeId = null,
  onActiveChange,
}: {
  sources: SourcesPayload;
  /** A hit pointed at elsewhere, on the knowledge map, to highlight here. */
  activeId?: string | null;
  onActiveChange?: (id: string | null) => void;
}) {
  const [all, setAll] = useState(false);
  const list = useRef<HTMLOListElement>(null);
  useTilt(list);
  const reduced = useReducedMotion();
  const graded = sources.scale === "rerank";
  const best = Math.max(...sources.hits.map((hit) => hit.score), 0.0001);
  const first = sources.hits.slice(0, FIRST);
  const rest = sources.hits.slice(FIRST);

  if (sources.hits.length === 0) return null;

  const card = (hit: Hit, index: number, extra?: { offset: number; count: number }) => {
    const grade = graded ? (hit.relevance ?? 0) : undefined;
    return (
      <SourceCard
        key={hit.id}
        hit={hit}
        index={index}
        extra={extra}
        reduced={reduced}
        grade={grade}
        fill={Math.max(8, Math.round((grade ?? hit.score / best) * 100))}
        weak={(grade ?? hit.score) < sources.threshold}
        active={hit.id === activeId}
        onPoint={onActiveChange}
      />
    );
  };

  return (
    <section aria-label="Sources" className="space-y-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-ink text-label font-medium">
          Sources <span className="text-ink-muted font-normal">{sources.hits.length}</span>
        </h3>
        <span className="text-ink-muted text-micro">
          {graded ? "Bars show the reranker's grade" : "Bars are relative to the best match"}
        </span>
      </div>

      <ol ref={list} className={styles.list}>
        {first.map((hit, index) => card(hit, index))}
        <AnimatePresence initial={false}>
          {all && rest.map((hit, offset) => card(hit, FIRST + offset, { offset, count: rest.length }))}
        </AnimatePresence>
      </ol>

      {rest.length > 0 && (
        <button
          type="button"
          aria-expanded={all}
          onClick={() => {
            setAll((value) => !value);
          }}
          className="touch-target text-evidence hover:bg-sunken inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 text-label font-medium transition-colors"
        >
          {all ? "Show fewer" : `Show all ${String(sources.hits.length)}`}
          <ChevronDown
            aria-hidden
            className={`size-3.5 transition-transform duration-500 ease-[var(--ease-spring)] ${all ? "rotate-180" : ""}`}
          />
        </button>
      )}
    </section>
  );
}

function SourceCard({
  hit,
  index,
  extra,
  reduced,
  grade,
  fill,
  weak,
  active,
  onPoint,
}: {
  hit: Hit;
  index: number;
  /** Set for a card beyond the first few, which opens and closes with "Show all". */
  extra: { offset: number; count: number } | undefined;
  reduced: boolean;
  /** The reranker's grade, when it ran. Shown in place of similarity. */
  grade: number | undefined;
  fill: number;
  weak: boolean;
  active: boolean;
  onPoint?: ((id: string | null) => void) | undefined;
}) {
  const kind = KINDS[hit.docType] ?? { label: hit.docType, Icon: FileText };
  const { title, context } = titleParts(hit);

  // When this card's own entrance is about done, for the rank and the meter.
  const delay = extra === undefined ? DEAL_FROM + index * DEAL_EVERY : extra.offset * 0.05;
  const land = `${String(Math.round((delay + 0.24) * 1000))}ms`;

  const enter =
    extra === undefined
      ? {
          initial: { opacity: 0, y: 16, rotateX: -36, z: -40 },
          animate: { opacity: 1, y: 0, rotateX: 0, z: 0 },
          transition: { ...DEAL, delay },
        }
      : {
          initial: { opacity: 0, height: 0, marginTop: 0, rotateX: -48, clipPath: HIDDEN },
          animate: {
            opacity: 1,
            height: "auto",
            marginTop: 8,
            rotateX: 0,
            clipPath: SHOWN,
            transitionEnd: { clipPath: "none" },
          },
          exit: {
            opacity: 0,
            height: 0,
            marginTop: 0,
            rotateX: -28,
            clipPath: [SHOWN, HIDDEN],
            transition: { ...OPEN, delay: (extra.count - 1 - extra.offset) * 0.035, opacity: { duration: 0.16 } },
          },
          transition: {
            ...DEAL,
            delay,
            height: { ...OPEN, delay },
            marginTop: { ...OPEN, delay },
            clipPath: { ...OPEN, delay },
          },
        };

  return (
    <m.li
      {...(reduced ? { initial: false } : enter)}
      style={{ ...vars({ "--land": reduced ? "0ms" : land }), transformPerspective: 900, originY: 0 }}
      className={`min-w-0 ${extra === undefined && index > 0 ? "mt-2" : ""} ${extra !== undefined && reduced ? "mt-2" : ""}`}
      onPointerEnter={() => onPoint?.(hit.id)}
      onPointerLeave={() => onPoint?.(null)}
      onFocus={() => onPoint?.(hit.id)}
      onBlur={() => onPoint?.(null)}
    >
      <details
        className={`${styles.card} glass-inset group rounded-2xl`}
        data-active={active ? "" : undefined}
        data-tilt
      >
        <summary className="flex cursor-pointer list-none items-center gap-3 rounded-2xl p-3 [&::-webkit-details-marker]:hidden">
          <span className="bg-sunken text-evidence relative grid size-9 shrink-0 place-items-center rounded-xl">
            <kind.Icon aria-hidden className="size-4" />
            <span
              aria-label={`Rank ${String(index + 1)}`}
              className={`${styles.rank} bg-brand-a absolute -top-1.5 -left-1.5 grid size-4 place-items-center rounded-full font-mono text-[10px] leading-none font-semibold text-white tabular-nums`}
            >
              {index + 1}
            </span>
          </span>
          <span className="min-w-0 flex-1">
            <span className="text-ink block truncate text-label font-medium">{title}</span>
            <span className="text-ink-muted flex items-center gap-2 text-micro">
              <span className="truncate">{context ?? kind.label}</span>
              {weak && <span className="text-caution shrink-0 font-medium">weak match</span>}
            </span>
          </span>
          <span className="flex shrink-0 flex-col items-end gap-1.5">
            <span
              title={grade === undefined ? "Similarity" : "Reranker grade, 0 to 1"}
              className={`font-mono text-micro tabular-nums ${weak ? "text-caution" : "text-ink"}`}
            >
              {grade === undefined ? (
                hit.score.toFixed(3)
              ) : (
                // The grade counts up as its meter grows, landing with the card.
                <NumberTicker value={grade} decimals={2} duration={700} delay={Math.round((delay + 0.24) * 1000)} />
              )}
            </span>
            <span className="bg-sunken block h-1 w-12 overflow-hidden rounded-full">
              <span
                className={`${styles.meter} animate-grow-x block h-full rounded-full ${
                  weak ? "bg-caution/70" : "from-brand-a bg-linear-to-r to-[#3b9eff]"
                }`}
                style={{ width: `${String(fill)}%` }}
              />
            </span>
          </span>
        </summary>

        <div className={`${styles.body} space-y-3 px-3 pb-3`}>
          {context !== undefined && (
            <p className="text-ink-muted text-micro">
              {kind.label} in <span className="text-ink">{context}</span>
            </p>
          )}
          {hit.docType !== "code" && <p className="text-ink text-label font-medium">{hit.title}</p>}
          {grade !== undefined && (
            <p className="text-ink-muted font-mono text-micro tabular-nums">
              reranker grade {grade.toFixed(2)} · similarity {hit.score.toFixed(3)}
            </p>
          )}
          <p className="font-prose text-ink-muted border-brand-a/40 border-l-2 pl-3 text-label">
            {hit.snippet}…
          </p>
          {hit.url !== undefined && (
            <a
              href={hit.url}
              target="_blank"
              rel="noreferrer"
              className="touch-target text-evidence inline-flex min-h-9 items-center gap-1 text-label font-medium underline-offset-4 hover:underline"
            >
              Open on GitHub
              <ArrowUpRight aria-hidden className="size-3.5" />
              <span className="sr-only">(opens in a new tab)</span>
            </a>
          )}
        </div>
      </details>
    </m.li>
  );
}
