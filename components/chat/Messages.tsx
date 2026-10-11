"use client";

import {
  useCallback,
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { AnimatePresence, LazyMotion, domAnimation, m } from "motion/react";
import { CopyButton } from "@/components/shared/CopyButton";
import type { CorpusMap } from "@/lib/corpus-map";
import { fireComet } from "@/lib/comet";
import { easing, reducedMotion, useReducedMotion } from "@/lib/motion";
import { vars } from "@/lib/utils";
import { useChatContext } from "./ChatProvider";
import { KnowledgeMap } from "./KnowledgeMap";
import styles from "./Messages.module.css";
import { Orb } from "./Orb";
import { TraceArea, type TracePhase } from "./RetrievalTrace";
import { SourceRail } from "./SourceRail";
import { plainText, StreamingText } from "./StreamingText";
import { SUGGESTIONS } from "./suggestions";
import { textOf, type AssistantMessage } from "./types";

/** A question's flight from where it was asked to its place in the transcript. */
const FLIGHT_MS = 720;
/** Keyframes the flight's path is sampled into. */
const FLIGHT_STEPS = 32;

/** Cards settling from depth: quick, with a trace of overshoot. */
const SETTLE = { type: "spring", stiffness: 260, damping: 26, mass: 0.9 } as const;
/** Heights opening: slower and fully damped, so nothing below bounces. */
const OPEN = { type: "spring", stiffness: 190, damping: 32 } as const;

/**
 * Opening clips: shown in full with room round it for shadows, or a line
 * along its top. Once open the clip is dropped altogether, so nothing
 * inside (a map tooltip, a focus ring) can ever be cut off.
 */
const CLIP_SHOWN = "inset(-12% -6% -24% -6%)";
const CLIP_HIDDEN = "inset(0% -6% 100% -6%)";

/**
 * One question and the assistant's turn that answers it. The two hand over:
 * when the question lands in the transcript, a comet leaves it for the
 * assistant's orb, which pulses as it arrives. One thing moves at a time,
 * and the eye is led from where the question was asked, to where it now
 * sits, to who is answering it.
 */
export function Exchange({
  user,
  reply,
  live,
  followUps,
  corpus,
}: {
  user: AssistantMessage | undefined;
  reply: AssistantMessage | undefined;
  /** The newest exchange while its answer is on the way. */
  live: boolean;
  followUps: readonly string[];
  corpus: CorpusMap;
}) {
  const mark = useRef<HTMLSpanElement>(null);
  const comet = useRef<(() => void) | null>(null);

  useEffect(
    () => () => {
      comet.current?.();
    },
    [],
  );

  const handOver = useCallback((bubble: DOMRect) => {
    const target = mark.current;
    if (target === null) return;
    comet.current?.();
    // From the bubble's leading edge, the side facing the assistant.
    comet.current = fireComet(new DOMRect(bubble.left + 10, bubble.top + bubble.height / 2, 0, 0), target);
  }, []);

  return (
    <div className="space-y-6">
      {user !== undefined && <UserBubble message={user} onLanded={handOver} />}
      {(reply !== undefined || live) && (
        <AssistantTurn message={reply} active={live} followUps={followUps} corpus={corpus} mark={mark} />
      )}
    </div>
  );
}

/**
 * The visitor's question. It flies in from wherever it was asked: the
 * composer, a suggestion card, a dot on the map or a timeline entry.
 *
 * The flight is a copy of the bubble, fixed above every panel, because the
 * transcript fades out toward the composer and would hide the first half of
 * the trip. Asked in the composer, the copy starts exactly over the words
 * that were typed, the same size and the same ink, so the words themselves
 * seem to lift off: they rise toward the reader (larger, with a deep soft
 * shadow, tipped back a little) on a curve that climbs first and then
 * glides across, gather the bubble round them on the way, and settle into
 * the bubble's place, where the real bubble takes over in the same frame.
 * Asked anywhere else, the copy leaves from the middle of what was clicked.
 * The bubble's place is tracked every frame, so a transcript that scrolls
 * during the flight still gets a clean landing.
 */
export function UserBubble({
  message,
  onLanded,
}: {
  message: AssistantMessage;
  /** Called with the bubble's box once a flight has landed. */
  onLanded?: (bubble: DOMRect) => void;
}) {
  const { claimLaunch } = useChatContext();
  const bubble = useRef<HTMLDivElement>(null);
  const landed = useEffectEvent((box: DOMRect) => {
    onLanded?.(box);
  });

  useLayoutEffect(() => {
    const element = bubble.current;
    if (element === null || reducedMotion()) return;
    const from = claimLaunch(message.id);
    if (from === null) {
      // Nowhere to fly from: it springs up into place instead.
      const rise = element.animate(
        [
          { opacity: 0, transform: "translateY(16px) scale(0.92)" },
          { opacity: 1, transform: "none" },
        ],
        { duration: 560, easing: easing("--ease-spring") },
      );
      return () => {
        rise.cancel();
      };
    }
    return flyQuestion(element, from, landed);
  }, [claimLaunch, message.id]);

  return (
    <div className="flex justify-end pl-10 sm:pl-16">
      <div
        ref={bubble}
        className="bubble max-w-full origin-bottom-right px-4 py-2.5 text-ui break-words whitespace-pre-wrap"
      >
        {textOf(message)}
      </div>
    </div>
  );
}

/**
 * The assistant's side of one exchange, through every state it passes:
 * thinking before anything arrives, the live retrieval trace while the
 * search runs, the answer as it streams, and the sources and actions once it
 * settles. It is rendered from the moment a question is sent, before the
 * reply message exists, so none of those states remounts the turn.
 *
 * Each change of state is a change in place rather than a cut: the trace
 * area springs between its heights (see TraceArea), and what arrives once
 * the answer settles opens downward, sources first and then the actions,
 * with the cards in each dealt in from depth. Motion here is LazyMotion's
 * small DOM bundle; nothing in it needs layout projection.
 */
export function AssistantTurn({
  message,
  active,
  followUps,
  corpus,
  mark,
}: {
  message: AssistantMessage | undefined;
  active: boolean;
  followUps: readonly string[];
  corpus: CorpusMap;
  /** The orb's wrapper, where the comet from the question lands. */
  mark?: RefObject<HTMLSpanElement | null>;
}) {
  // The source under the pointer, shared by the map and the list so each
  // lights the other.
  const [pointed, setPointed] = useState<string | null>(null);
  const reduced = useReducedMotion();

  const trace = message?.parts.find((part) => part.type === "data-trace")?.data;
  const sources = message?.parts.find((part) => part.type === "data-sources")?.data;
  const hits = useMemo(
    () => sources?.hits.map((hit) => ({ id: hit.id, score: hit.score })) ?? [],
    [sources],
  );
  const text = message === undefined ? "" : textOf(message);
  const writing = active && text !== "";
  const phase: TracePhase | null =
    trace === undefined
      ? active && text === ""
        ? "thinking"
        : null
      : active && text === ""
        ? "live"
        : "summary";

  return (
    <LazyMotion features={domAnimation} strict>
      <article
        aria-busy={active}
        aria-label="Assistant reply"
        className={`${styles.turn} flex gap-3 sm:gap-4`}
      >
        <span ref={mark} className={`${styles.mark} mt-3 shrink-0 self-start rounded-full`}>
          <Orb size={32} state={!active ? "idle" : writing ? "writing" : "thinking"} orbit />
        </span>

        {/* The card the answer is written on. Its aurora ring turns only while
          * the answer is being written, so that during the search the orb and
          * the trace are the only things moving here; it winds down when the
          * answer settles. The sweep element only exists once the turn has
          * settled, so its single pass plays at that moment. */}
        <div
          className="answer-shell min-w-0 flex-1 rounded-[1.6rem] p-4 sm:p-5"
          data-live={writing ? "" : undefined}
        >
          <span aria-hidden className="answer-glow" />
          <span aria-hidden className="answer-plate" />
          <span aria-hidden className="answer-ring" />

          {/* No space-y here: it puts its margin on every child but the last,
            * so each block that arrives would shove the one above it down a
            * step. Each block carries its own space instead, inside the part
            * that opens. */}
          <div>
            {phase !== null && <TraceArea phase={phase} trace={trace} />}

            {text !== "" && (
              <div className={phase === null ? undefined : "mt-4"}>
                <StreamingText text={text} streaming={writing} />
              </div>
            )}

            {/* Once settled: where the sources sit among everything the
              * assistant could have drawn on, beside the list of them. */}
            {!active && sources !== undefined && sources.hits.length > 0 && (
              <Opening delay={0.1} reduced={reduced}>
                <div className="grid gap-4 pt-4 md:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] md:items-start">
                  <m.div
                    initial={reduced ? false : { opacity: 0, y: 18, rotateX: 16, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, rotateX: 0, scale: 1 }}
                    transition={{ ...SETTLE, delay: 0.14 }}
                    style={{ transformPerspective: 1000, originY: 0 }}
                  >
                    <KnowledgeMap
                      map={corpus}
                      hits={hits}
                      variant="compact"
                      activeId={pointed}
                      onActiveChange={setPointed}
                      className="max-w-none"
                    />
                  </m.div>
                  <SourceRail sources={sources} activeId={pointed} onActiveChange={setPointed} />
                </div>
              </Opening>
            )}

            {!active && text !== "" && (
              <Opening delay={0.32} reduced={reduced}>
                <TurnActions text={plainText(text)} followUps={followUps} reduced={reduced} />
              </Opening>
            )}
          </div>

          {!active && text !== "" && <span aria-hidden className="answer-sweep" />}
        </div>
      </article>
    </LazyMotion>
  );
}

/**
 * A block that opens downward when it mounts, from nothing to its own
 * height, so the answer card grows smoothly round it instead of jumping.
 * It clips with clip-path rather than overflow, with room to spare round
 * the edges, so a card's lift shadow or a focus ring inside is never cut
 * off once it is open.
 */
function Opening({ delay, reduced, children }: { delay: number; reduced: boolean; children: ReactNode }) {
  return (
    <m.div
      initial={reduced ? false : { height: 0, opacity: 0, clipPath: CLIP_HIDDEN }}
      animate={{ height: "auto", opacity: 1, clipPath: CLIP_SHOWN, transitionEnd: { clipPath: "none" } }}
      transition={{
        height: { ...OPEN, delay },
        clipPath: { ...OPEN, delay },
        opacity: { duration: 0.32, ease: "easeOut", delay },
      }}
    >
      {children}
    </m.div>
  );
}

function TurnActions({
  text,
  followUps,
  reduced,
}: {
  text: string;
  followUps: readonly string[];
  reduced: boolean;
}) {
  const { ask } = useChatContext();

  return (
    <div className="pt-4">
      <CopyButton
        value={text}
        label="answer"
        className="touch-target text-ink-muted hover:text-ink hover:bg-sunken -ml-2 inline-flex min-h-9 items-center gap-2 rounded-full px-3 text-label transition-colors"
      >
        <span>Copy</span>
      </CopyButton>

      {/* The questions to keep exploring belong to the newest answer only.
        * When the next question is sent they fold away instead of vanishing,
        * so this card closes up smoothly under the question in flight. */}
      <AnimatePresence initial={false}>
        {followUps.length > 0 && (
          <m.div
            key="explore"
            initial={reduced ? false : { height: 0, opacity: 0, clipPath: CLIP_HIDDEN }}
            animate={{ height: "auto", opacity: 1, clipPath: CLIP_SHOWN, transitionEnd: { clipPath: "none" } }}
            exit={
              reduced
                ? { height: 0, opacity: 0, transition: { duration: 0 } }
                : {
                    height: 0,
                    opacity: 0,
                    clipPath: [CLIP_SHOWN, CLIP_HIDDEN],
                    transition: { ...OPEN, opacity: { duration: 0.18 } },
                  }
            }
            transition={OPEN}
          >
            <div className="pt-4">
              <p className="text-ink-muted mb-2 text-micro">Keep exploring</p>
              <ul className="flex flex-wrap gap-2">
                {followUps.map((question, index) => (
                  <li key={question} className={styles.chip} style={vars({ "--i": index })}>
                    <button
                      type="button"
                      onClick={(event) => {
                        ask(question, event.currentTarget);
                      }}
                      className={`${styles.chipButton} touch-target glass-inset text-ink min-h-9 rounded-full px-3.5 py-1.5 text-left text-label`}
                    >
                      {question}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </m.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Up to three suggestions the visitor has not already asked. */
export function followUpsFor(messages: AssistantMessage[]): string[] {
  const asked = new Set(
    messages.filter((message) => message.role === "user").map((message) => textOf(message).trim()),
  );
  return SUGGESTIONS.map((suggestion) => suggestion.question)
    .filter((question) => !asked.has(question))
    .slice(0, 3);
}

/* ---------------------------------------------------------------------------
 * The flight. Imperative on purpose, like the comet: it lives for under a
 * second, crosses every panel, and its frames depend on measurements that
 * only exist once the bubble is laid out.
 * ------------------------------------------------------------------------- */

function px(value: string): number {
  const number = Number.parseFloat(value);
  return Number.isFinite(number) ? number : 0;
}

function within(inner: DOMRect, outer: DOMRect): boolean {
  const x = inner.left + inner.width / 2;
  const y = inner.top + inner.height / 2;
  return x >= outer.left && x <= outer.right && y >= outer.top && y <= outer.bottom;
}

/**
 * The spring token as a function of time, read from its linear() stops, so
 * the flight's path follows the very curve every CSS spring on the page
 * uses. Where linear() is unsupported, easing() hands back a cubic-bezier
 * and this falls back to the expo-out the springs were tuned to resemble.
 */
function springCurve(): (t: number) => number {
  const token = easing("--ease-spring").trim();
  const body = /^linear\((.*)\)$/.exec(token)?.[1];
  const fallback = (t: number): number => 1 - (1 - t) ** 4;
  if (body === undefined) return fallback;
  const parts = body.split(",");
  const stops: { at: number; value: number }[] = [];
  for (const [index, part] of parts.entries()) {
    const [value, at] = part.trim().split(/\s+/);
    const position = at === undefined ? (index === 0 ? 0 : index === parts.length - 1 ? 1 : Number.NaN) : px(at) / 100;
    stops.push({ at: position, value: Number(value) });
  }
  if (stops.some((stop) => !Number.isFinite(stop.at) || !Number.isFinite(stop.value))) return fallback;
  return (t: number): number => {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    for (let index = 1; index < stops.length; index++) {
      const a = stops[index - 1];
      const b = stops[index];
      if (a === undefined || b === undefined || t > b.at) continue;
      return a.value + ((b.value - a.value) * (t - a.at)) / Math.max(b.at - a.at, 1e-6);
    }
    return 1;
  };
}

/** Rises from 0 to 1 and back over the first `span` of the flight, gone after it. */
function swell(t: number, span: number): number {
  return t >= span ? 0 : Math.sin((Math.PI * t) / span);
}

/**
 * Flies a copy of `bubble` from `from` into the bubble's place and reveals
 * the bubble when it lands. Returns a cancel function for the effect that
 * started it, which leaves the bubble showing.
 */
function flyQuestion(bubble: HTMLElement, from: DOMRect, onLand: (box: DOMRect) => void): () => void {
  const to = bubble.getBoundingClientRect();
  const look = getComputedStyle(bubble);

  // Asked in the composer: start over the typed words, at their size.
  const field = document.querySelector<HTMLElement>("[data-composer] textarea");
  const composer = field?.closest("[data-composer]")?.getBoundingClientRect();
  const typed = field !== null && field !== undefined && composer !== undefined && within(from, composer);

  let scale0 = 0.9;
  let left0 = from.left + from.width / 2 - (to.width * scale0) / 2;
  let top0 = from.top + from.height / 2 - (to.height * scale0) / 2;
  if (typed) {
    const fieldLook = getComputedStyle(field);
    scale0 = px(fieldLook.fontSize) / Math.max(px(look.fontSize), 1);
    const leading = (px(fieldLook.lineHeight) - px(look.lineHeight) * scale0) / 2;
    left0 = from.left - px(look.paddingLeft) * scale0;
    top0 = from.top + leading - px(look.paddingTop) * scale0;
  }

  // The path of the copy's centre, as offsets from the bubble's centre: a
  // curve that climbs first and then glides across into place.
  const dx = left0 + (to.width * scale0) / 2 - (to.left + to.width / 2);
  const dy = top0 + (to.height * scale0) / 2 - (to.top + to.height / 2);
  const cx = dx * 0.82;
  const cy = dy * 0.22;
  const ease = springCurve();
  // Read before anything is written, so the layout is computed once: the
  // ink the words start in is the page's own.
  const ink = getComputedStyle(document.body).color;

  const ghost = bubble.cloneNode(true) as HTMLElement;
  ghost.classList.remove("bubble");
  ghost.classList.add("flight");
  ghost.setAttribute("aria-hidden", "true");
  ghost.style.transformOrigin = "50% 50%";
  ghost.style.left = `${String(to.left)}px`;
  ghost.style.top = `${String(to.top)}px`;
  ghost.style.width = `${String(to.width)}px`;
  ghost.style.height = `${String(to.height)}px`;
  const lift = document.createElement("span");
  lift.className = "flight-lift";
  const fill = document.createElement("span");
  fill.className = "bubble-fill";
  ghost.prepend(lift, fill);
  document.body.append(ghost);

  const path: Keyframe[] = [];
  const shadow: Keyframe[] = [];
  for (let step = 0; step <= FLIGHT_STEPS; step++) {
    const t = step / FLIGHT_STEPS;
    const p = ease(t);
    const q = 1 - p;
    const x = q * q * dx + 2 * q * p * cx;
    const y = q * q * dy + 2 * q * p * cy;
    const near = swell(t, 0.8);
    const size = (scale0 + (1 - scale0) * p) * (1 + 0.05 * near);
    path.push({
      offset: t,
      transform: `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px) perspective(800px) rotateX(${(9 * near).toFixed(2)}deg) scale(${size.toFixed(4)})`,
    });
    shadow.push({ offset: t, opacity: near });
  }

  const timing: KeyframeAnimationOptions = { duration: FLIGHT_MS, easing: "linear" };
  const flight = ghost.animate(path, timing);
  const animations = [
    flight,
    ghost.animate(
      [
        { offset: 0, color: ink },
        { offset: typed ? 0.14 : 0.04, color: ink },
        { offset: 0.48, color: "#ffffff" },
        { offset: 1, color: "#ffffff" },
      ],
      timing,
    ),
    fill.animate(
      [
        { offset: 0, opacity: 0, transform: "scale(0.84)" },
        { offset: typed ? 0.1 : 0.02, opacity: 0, transform: "scale(0.84)" },
        { offset: 0.46, opacity: 1, transform: "scale(1)" },
        { offset: 1, opacity: 1, transform: "scale(1)" },
      ],
      timing,
    ),
    lift.animate(shadow, timing),
  ];

  bubble.style.opacity = "0";

  // Keeps the landing on the bubble if the transcript scrolls mid-flight,
  // weighted by progress so the take-off point stays where it was.
  let frame = 0;
  const track = (): void => {
    const now = bubble.getBoundingClientRect();
    const time = typeof flight.currentTime === "number" ? flight.currentTime : 0;
    const p = ease(Math.min(time / FLIGHT_MS, 1));
    ghost.style.translate = `${((now.left - to.left) * p).toFixed(2)}px ${((now.top - to.top) * p).toFixed(2)}px`;
    frame = requestAnimationFrame(track);
  };
  frame = requestAnimationFrame(track);

  let done = false;
  const finish = (land: boolean): void => {
    if (done) return;
    done = true;
    cancelAnimationFrame(frame);
    for (const animation of animations) animation.cancel();
    ghost.remove();
    bubble.style.removeProperty("opacity");
    if (land) onLand(bubble.getBoundingClientRect());
  };
  flight.addEventListener("finish", () => {
    finish(true);
  });

  return () => {
    finish(false);
  };
}
