"use client";

import {
  Fragment,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type AnimationEvent,
  type ChangeEvent,
  type KeyboardEvent,
} from "react";
import { ArrowUp, Square } from "lucide-react";
import { burst } from "@/components/motion/burst";
import { useMagnetic } from "@/components/motion/useMagnetic";
import { useLiquidLens, usePointerLight } from "@/components/shell/LiquidGlass";
import { GUARDS } from "@/lib/config";
import { easing, reducedMotion, useReducedMotion } from "@/lib/motion";
import { useActivity, useChatContext } from "./ChatProvider";
import styles from "./Composer.module.css";

/** How long after the last keystroke the visitor counts as no longer typing. */
const TYPING_IDLE_MS = 900;
const MAX_HEIGHT_PX = 200;
/** One line of the field: 16px type on a 24px line. */
const LINE_PX = 24;

/** An insertion longer than this is treated as a paste and fades in as one piece. */
const PASTE_CHARS = 20;
/** Between the letters of one short multi-letter insertion, such as an autocorrection. */
const STAGGER_MS = 16;
/** A fresh letter older than this is settled at the next edit, whatever its animation is doing. */
const STALE_MS = 1000;
/** Every letter is settled this long after the last edit, in case an animationend never arrived. */
const SWEEP_MS = 1200;

/** Energy holds this long after a keystroke, then falls over the 450ms transition in the CSS. */
const HOLD_MS = 180;
/** A pause longer than this starts a new burst of typing rather than slowing the last one. */
const BURST_GAP_MS = 900;

/** One slot per spark in the send burst; Composer.module.css colours them round the aurora. */
const SPARKS = Array.from({ length: 10 }, (_, index) => index);

/**
 * Questions the placeholder types out. Each is answerable from a document
 * already in the index, for the same reason the suggestion chips are.
 */
const EXAMPLES = [
  "What did he automate at Capgemini?",
  "What did 490,000 taxi trips reveal?",
  "Why did he leave IT operations for an MSc?",
  "How did he evaluate the delivery-time model?",
  "Why build the evals before the chat UI?",
] as const;

/** Where the placeholder comes to rest, and all it shows when motion is reduced or paused. */
const RESTING = "Ask anything about Shubham…";

/**
 * The composer, and the one place on the page that answers the visitor's
 * own hands. Each response to typing has a reason:
 *
 * - Every letter blooms in, out of focus and in the brand colour, settling
 *   into ink. The textarea stays on top doing all the real work (caret,
 *   selection, IME, accessibility) with its own letters painted transparent,
 *   and a mirror underneath draws the same text with the newest letters in
 *   animated spans. Only what was just inserted animates; deleting is
 *   immediate, and a paste fades in as one piece.
 * - Typing builds energy instead of firing a pulse per key, because pulses
 *   flicker at speed. The energy rises with typing speed and falls away
 *   after the last key; the glow under the glass swells with it and the
 *   aurora ring turns faster.
 * - The orb in the header ripples on each key, because the assistant should
 *   look like it is listening.
 *
 * The aurora ring draws itself in from the left the moment the field has
 * focus, so the input answers before anything is sent. Sending is felt as
 * well as seen: the glass gives under the press and springs back, a ring
 * and a burst of sparks leave the send button, and the glow surges once, as
 * the typed words lift off and fly into the transcript (see UserBubble). The
 * send button then turns into a stop button for as long as an answer is
 * arriving.
 */
export function Composer() {
  const { ask, busy, stop } = useChatContext();
  const { typing, setTyping, keystroke } = useActivity();
  const reduced = useReducedMotion();
  const forced = useForcedColors();
  const bloom = !reduced && !forced;
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [placeholderSpent, setPlaceholderSpent] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  const pill = useRef<HTMLDivElement>(null);
  // The pill's frost bends what passes behind its rim, as the island's does.
  // Sized for the one-line pill (28px corners); a wrapped question eases to
  // 24px, close enough that the corners still read as one piece of glass.
  const frost = useRef<HTMLSpanElement>(null);
  const lens = useLiquidLens(frost, { radius: 28, bezel: 14, scale: 30, aberration: true, blur: 9 });
  usePointerLight(frost);
  const area = useRef<HTMLTextAreaElement>(null);
  const mirror = useRef<HTMLDivElement>(null);
  const pulse = useRef<HTMLSpanElement>(null);
  const send = useRef<HTMLButtonElement>(null);
  // The one control on the console that leans toward the pointer.
  useMagnetic(send, 0.35, 8);
  const sparks = useRef<HTMLSpanElement>(null);
  const ringSwirl = useRef<HTMLSpanElement>(null);
  const glowSwirl = useRef<HTMLSpanElement>(null);
  const composing = useRef(false);
  const idle = useRef<ReturnType<typeof setTimeout>>(undefined);
  const sweep = useRef<ReturnType<typeof setTimeout>>(undefined);
  const energy = useRef<Energy>({
    rate: 0,
    last: Number.NEGATIVE_INFINITY,
    target: 0,
    playback: 1,
    frame: 0,
    at: 0,
    fall: undefined,
  });
  const hint = useId();
  const retirePlaceholder = useCallback(() => {
    setPlaceholderSpent(true);
  }, []);

  const value = draft.value;
  const limit = GUARDS.maxInputChars;
  const over = value.length > limit;
  const near = value.length > limit * 0.8;
  const ready = value.trim() !== "" && !over;

  // Grows with the question up to a cap, then scrolls; the mirror follows.
  useLayoutEffect(() => {
    fit(area.current, pill.current, mirror.current);
  }, [value, bloom]);

  // A new width rewraps the text. The mirror takes the new width at once,
  // and the height is refitted on the next frame rather than inside the
  // observer, which would resize the very element it is observing.
  useLayoutEffect(() => {
    const element = area.current;
    if (element === null) return;
    let width = element.clientWidth;
    let frame = 0;
    const observer = new ResizeObserver(() => {
      if (element.clientWidth === width) return;
      width = element.clientWidth;
      align(element, mirror.current);
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        fit(element, pill.current, mirror.current);
      });
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, []);

  useEffect(() => {
    const state = energy.current;
    return () => {
      clearTimeout(idle.current);
      clearTimeout(sweep.current);
      clearTimeout(state.fall);
      cancelAnimationFrame(state.frame);
    };
  }, []);

  const swirls = (): (HTMLElement | null)[] => [ringSwirl.current, glowSwirl.current];

  /**
   * Feeds one keystroke into the energy. The rate is an exponential moving
   * average of keystrokes per second, so a steady typist settles at a steady
   * glow, and the energy is that rate eased into 0..1.
   */
  const surge = (): void => {
    const wrap = form.current;
    if (wrap === null || reducedMotion()) return;
    const state = energy.current;
    const now = performance.now();
    const gap = now - state.last;
    state.last = now;
    const instant = 1000 / Math.min(Math.max(gap, 40), 1000);
    state.rate = gap > BURST_GAP_MS ? instant : state.rate + (instant - state.rate) * 0.35;
    charge(wrap, state, 1 - Math.exp(-state.rate / 6), swirls());
    clearTimeout(state.fall);
    state.fall = setTimeout(() => {
      charge(wrap, state, 0, swirls());
    }, HOLD_MS);
  };

  /**
   * The send, felt: the glow surges and the aurora whips round once, then
   * both fall away on the energy's usual slow release; the pill gives under
   * the press and springs back, the button squeezes and pops, and a ring and
   * a burst of sparks leave it.
   */
  const launch = (): void => {
    const wrap = form.current;
    const state = energy.current;
    clearTimeout(state.fall);
    state.rate = 0;
    if (wrap === null) return;
    if (reducedMotion()) {
      charge(wrap, state, 0, swirls());
      return;
    }
    charge(wrap, state, 0.9, swirls());
    state.fall = setTimeout(() => {
      charge(wrap, state, 0, swirls());
    }, 140);
    pill.current?.animate(
      [
        { transform: "none", easing: "cubic-bezier(0.3, 0, 0.2, 1)" },
        { transform: "translateY(2px) scale(0.982)", offset: 0.2, easing: easing("--ease-pop") },
        { transform: "none" },
      ],
      { duration: 720 },
    );
    pulse.current?.animate(
      [
        { opacity: 0.6, transform: "scale(1)" },
        { opacity: 0, transform: "scale(2.4)" },
      ],
      { duration: 680, easing: "cubic-bezier(0.16, 1, 0.3, 1)" },
    );
    send.current?.animate(
      [
        { transform: "scale(1)", easing: "cubic-bezier(0.3, 0, 0.2, 1)" },
        { transform: "scale(0.84)", offset: 0.18, easing: easing("--ease-pop") },
        { transform: "scale(1)" },
      ],
      { duration: 640 },
    );
    burst(sparks.current);
  };

  const onChange = (event: ChangeEvent<HTMLTextAreaElement>): void => {
    const next = event.target.value;
    const native = event.nativeEvent;
    // Text being composed by an IME changes shape as it is converted, so it
    // is drawn plainly; blooming each intermediate form would be noise.
    const composed = composing.current || (native instanceof InputEvent && native.isComposing);
    const animate = bloom && !composed;
    const now = performance.now();
    setDraft((current) => edit(current, next, animate, now));
    setPlaceholderSpent(true);
    setTyping(true);
    keystroke();
    surge();
    clearTimeout(idle.current);
    idle.current = setTimeout(() => {
      setTyping(false);
    }, TYPING_IDLE_MS);
    clearTimeout(sweep.current);
    sweep.current = setTimeout(() => {
      setDraft(settleAll);
    }, SWEEP_MS);
  };

  const onBloomEnd = (event: AnimationEvent<HTMLDivElement>): void => {
    const target = event.target;
    if (!(target instanceof HTMLElement) || target.dataset.run === undefined) return;
    const id = Number(target.dataset.run);
    setDraft((current) => settle(current, id));
  };

  const submit = (): void => {
    if (!ready) return;
    if (!ask(value, area.current)) return;
    setDraft((current) => ({ value: "", runs: [], next: current.next }));
    clearTimeout(idle.current);
    setTyping(false);
    launch();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key !== "Enter" || event.shiftKey) return;
    // Enter also confirms an IME conversion. Safari reports that keydown
    // after compositionend, with isComposing false, but keyCode 229.
    if (event.nativeEvent.isComposing || event.keyCode === 229) return;
    event.preventDefault();
    submit();
  };

  return (
    <form
      ref={form}
      className={styles.wrap}
      data-composer=""
      data-typing={typing ? "" : undefined}
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <span aria-hidden className={styles.glow}>
        <span ref={glowSwirl} className={styles.swirl} />
      </span>

      <div ref={pill} className={styles.pill}>
        <span
          ref={frost}
          aria-hidden
          className={styles.fill}
          data-refract={lens.refract ? "" : undefined}
          style={
            lens.backdropFilter === undefined
              ? undefined
              : { backdropFilter: lens.backdropFilter, WebkitBackdropFilter: lens.backdropFilter }
          }
        />
        <span aria-hidden className={styles.core} />
        <span aria-hidden className={styles.light} />
        {lens.defs}

        <div className="relative flex items-end gap-2 p-2 pl-4">
          <div className="min-w-0 flex-1 self-center py-1.5">
            <div className={styles.field} data-bloom={bloom ? "" : undefined}>
              {bloom && (
                <div aria-hidden inert className={styles.mirror}>
                  <div
                    ref={mirror}
                    className={`${styles.text} text-ink text-base leading-6`}
                    onAnimationEnd={onBloomEnd}
                  >
                    {draft.runs.map((run) =>
                      run.kind === "plain" ? (
                        <Fragment key={run.id}>{run.text}</Fragment>
                      ) : (
                        <span
                          key={run.id}
                          data-run={run.id}
                          className={run.kind === "paste" ? styles.paste : styles.letter}
                          style={
                            run.delay > 0 ? { animationDelay: `${String(run.delay)}ms` } : undefined
                          }
                        >
                          {run.text}
                        </span>
                      ),
                    )}
                    {/* Gives a trailing newline a line of its own, as the textarea does. */}
                    {"​"}
                  </div>
                </div>
              )}

              <textarea
                ref={area}
                rows={1}
                value={value}
                onChange={onChange}
                onKeyDown={onKeyDown}
                onScroll={() => {
                  if (area.current !== null) align(area.current, mirror.current);
                }}
                onCompositionStart={() => {
                  composing.current = true;
                }}
                onCompositionEnd={() => {
                  composing.current = false;
                }}
                aria-label="Ask a question about Shubham"
                aria-describedby={hint}
                aria-invalid={over || undefined}
                enterKeyHint="send"
                className={`${styles.text} ${styles.input} text-ink scroll-thin block max-h-[200px] w-full resize-none bg-transparent text-base leading-6 outline-none focus-visible:outline-none`}
              />

              {value === "" && (
                <TypewriterPlaceholder play={!placeholderSpent} onDone={retirePlaceholder} />
              )}
            </div>
          </div>

          {near && (
            <span
              aria-live="polite"
              className={`mb-2.5 shrink-0 font-mono text-micro tabular-nums ${over ? "text-caution font-medium" : "text-ink-muted"}`}
            >
              {value.length.toLocaleString("en-GB")}/{limit.toLocaleString("en-GB")}
            </span>
          )}

          <button
            ref={send}
            type={busy ? "button" : "submit"}
            onClick={busy ? stop : undefined}
            disabled={!busy && !ready}
            data-state={busy ? "busy" : ready ? "ready" : "idle"}
            aria-label={busy ? "Stop the answer" : "Send question"}
            className={styles.send}
          >
            <span ref={pulse} aria-hidden className={styles.pulse} />
            <span ref={sparks} aria-hidden className={styles.sparks}>
              {SPARKS.map((spark) => (
                <i key={spark} className={styles.spark} />
              ))}
            </span>
            {busy && <span aria-hidden className={styles.spinner} />}
            <span aria-hidden className="relative grid size-full place-items-center overflow-hidden rounded-full">
              <ArrowUp className={`${styles.arrow} size-[18px]`} strokeWidth={2.4} />
              <Square className={`${styles.stop} absolute size-3.5 fill-current`} />
            </span>
          </button>
        </div>

        <span aria-hidden className={styles.ring}>
          <span ref={ringSwirl} className={styles.swirl} />
        </span>
      </div>

      <p id={hint} className="sr-only">
        Press Enter to send, or Shift and Enter for a new line.
      </p>
      {over && (
        <p className="text-caution mt-2 px-4 text-label" role="alert">
          That is longer than the {limit.toLocaleString("en-GB")}-character limit.
        </p>
      )}
    </form>
  );
}

/**
 * Types out the example questions once each while the field is empty, with
 * a little jitter so it reads as typing rather than a ticker, then types the
 * resting line and stops there. It plays through once and never loops:
 * motion that starts on its own and runs on past five seconds needs a way to
 * stop it (WCAG 2.2.2), and stopping by itself is the simplest one. The
 * resting line shows from the start when motion is reduced or paused, and
 * pausing midway freezes it there until motion resumes. Hidden from
 * assistive technology, which gets the field's label instead. The composer
 * retires it for good once it finishes or the visitor starts typing.
 */
function TypewriterPlaceholder({ play, onDone }: { play: boolean; onDone: () => void }) {
  const reduced = useReducedMotion();
  const paused = useMotionPaused();
  const still = reduced || paused || !play;
  const [text, setText] = useState("");
  // Kept in a ref so that pausing and resuming carries on from the same letter.
  const progress = useRef({ line: 0, length: 0, deleting: false });

  useEffect(() => {
    if (still) return;
    const state = progress.current;
    const script = [...EXAMPLES, RESTING];
    let timer: ReturnType<typeof setTimeout>;

    const step = (): void => {
      const line = script[state.line] ?? RESTING;
      if (!state.deleting) {
        state.length += 1;
        setText(line.slice(0, state.length));
        if (state.length < line.length) {
          timer = setTimeout(step, 32 + Math.random() * 46);
          return;
        }
        if (state.line >= script.length - 1) {
          onDone();
          return;
        }
        state.deleting = true;
        timer = setTimeout(step, 1900);
        return;
      }
      state.length -= 1;
      setText(line.slice(0, state.length));
      if (state.length > 0) {
        timer = setTimeout(step, 16);
        return;
      }
      state.deleting = false;
      state.line += 1;
      timer = setTimeout(step, 420);
    };

    timer = setTimeout(step, state.line === 0 && state.length === 0 ? 700 : 300);
    return () => {
      clearTimeout(timer);
    };
  }, [still, onDone]);

  return (
    <span
      aria-hidden
      className={`${styles.placeholder} text-ink-muted pointer-events-none absolute inset-x-0 top-0 truncate text-base leading-6`}
    >
      {still ? RESTING : text}
      {!still && <span className={styles.caret} />}
    </span>
  );
}

/* ---------------------------------------------------------------------------
 * The mirror's model. The question is kept as runs of text that cover it
 * exactly: plain runs, and fresh runs that are still animating in. Every
 * edit is diffed against the previous value by common prefix and suffix, so
 * only what was actually inserted becomes fresh, wherever the caret was.
 * ------------------------------------------------------------------------- */

interface Run {
  id: number;
  text: string;
  kind: "plain" | "letter" | "paste";
  /** Stagger within one insertion, in ms. */
  delay: number;
  /** performance.now() at insertion, so a run whose animation never reported back still settles. */
  born: number;
}

interface Draft {
  value: string;
  runs: Run[];
  /** The next unused run id. Kept in state so that an edit is a pure function of it. */
  next: number;
}

const EMPTY: Draft = { value: "", runs: [], next: 0 };

function edit(draft: Draft, value: string, animate: boolean, now: number): Draft {
  const before = draft.value;
  if (value === before) return draft;

  const shortest = Math.min(before.length, value.length);
  let start = 0;
  while (start < shortest && before.charCodeAt(start) === value.charCodeAt(start)) start += 1;
  let tail = 0;
  while (
    tail < shortest - start &&
    before.charCodeAt(before.length - 1 - tail) === value.charCodeAt(value.length - 1 - tail)
  ) {
    tail += 1;
  }

  // The insertion, widened to whole graphemes so that adding a skin tone to
  // an emoji, or an accent to a letter, re-blooms the character it changes.
  let end = value.length - tail;
  if (end > start) [start, end] = wholeGraphemes(value, start, end);
  const removedTo = before.length - (value.length - end);
  const inserted = value.slice(start, end);

  let id = draft.next;
  const fresh: Run[] = [];
  if (inserted !== "") {
    if (!animate) {
      fresh.push({ id: id++, text: inserted, kind: "plain", delay: 0, born: now });
    } else if (inserted.length > PASTE_CHARS) {
      fresh.push({ id: id++, text: inserted, kind: "paste", delay: 0, born: now });
    } else {
      let order = 0;
      for (const grapheme of graphemes(inserted)) {
        // Whitespace has nothing to show, so it goes in plain.
        if (grapheme.trim() === "") {
          fresh.push({ id: id++, text: grapheme, kind: "plain", delay: 0, born: now });
          continue;
        }
        fresh.push({ id: id++, text: grapheme, kind: "letter", delay: order * STAGGER_MS, born: now });
        order += 1;
      }
    }
  }

  const current = draft.runs.map((run) =>
    run.kind !== "plain" && now - run.born > STALE_MS ? plain(run) : run,
  );
  const runs = splice(current, start, removedTo, fresh, () => id++);
  return { value, runs: merge(runs), next: id };
}

/**
 * Replaces the text between `from` and `to` with `insert`. A fresh run that
 * gets cut settles: its pieces cannot carry one animation between them.
 */
function splice(
  runs: readonly Run[],
  from: number,
  to: number,
  insert: readonly Run[],
  nextId: () => number,
): Run[] {
  const out: Run[] = [];
  let position = 0;
  let placed = false;
  for (const run of runs) {
    const a = position;
    const b = position + run.text.length;
    position = b;
    if (b <= from) {
      out.push(run);
      continue;
    }
    if (a < from) out.push({ ...plain(run), text: run.text.slice(0, from - a) });
    if (!placed) {
      out.push(...insert);
      placed = true;
    }
    if (b > to) {
      out.push(a >= to ? run : { ...plain(run), id: nextId(), text: run.text.slice(to - a) });
    }
  }
  if (!placed) out.push(...insert);
  return out;
}

/** Joins neighbouring plain runs, so the mirror holds a few text nodes rather than one per letter. */
function merge(runs: readonly Run[]): Run[] {
  const out: Run[] = [];
  for (const run of runs) {
    if (run.text === "") continue;
    const previous = out[out.length - 1];
    if (previous !== undefined && previous.kind === "plain" && run.kind === "plain") {
      out[out.length - 1] = { ...previous, text: previous.text + run.text };
    } else {
      out.push(run);
    }
  }
  return out;
}

function plain(run: Run): Run {
  return { ...run, kind: "plain", delay: 0 };
}

/** A run whose animation has finished goes back to being plain text. */
function settle(draft: Draft, id: number): Draft {
  if (!draft.runs.some((run) => run.id === id && run.kind !== "plain")) return draft;
  return { ...draft, runs: merge(draft.runs.map((run) => (run.id === id ? plain(run) : run))) };
}

function settleAll(draft: Draft): Draft {
  if (draft.runs.every((run) => run.kind === "plain")) return draft;
  return { ...draft, runs: merge(draft.runs.map(plain)) };
}

let graphemeSegmenter: Intl.Segmenter | null | undefined;

/** Grapheme segmentation, so an emoji or a flag blooms as one character. Null where unsupported. */
function segmenter(): Intl.Segmenter | null {
  if (graphemeSegmenter === undefined) {
    graphemeSegmenter =
      typeof Intl.Segmenter === "function"
        ? new Intl.Segmenter(undefined, { granularity: "grapheme" })
        : null;
  }
  return graphemeSegmenter;
}

function graphemes(text: string): string[] {
  const split = segmenter();
  return split === null ? Array.from(text) : Array.from(split.segment(text), (part) => part.segment);
}

/** Widens [start, end) in `text` to grapheme boundaries, or at least code point boundaries. */
function wholeGraphemes(text: string, start: number, end: number): [number, number] {
  const split = segmenter();
  if (split === null) {
    const low = (index: number): boolean => {
      const code = text.charCodeAt(index);
      return code >= 0xdc00 && code <= 0xdfff;
    };
    return [start > 0 && low(start) ? start - 1 : start, end < text.length && low(end) ? end + 1 : end];
  }
  const segments = split.segment(text);
  const first = segments.containing(start);
  const last = segments.containing(end - 1);
  return [first?.index ?? start, last === undefined ? end : last.index + last.segment.length];
}

/* ---------------------------------------------------------------------------
 * Layout and energy, written straight to the DOM from effects and handlers:
 * they change on every keystroke or frame, and none of it is React's to
 * render.
 * ------------------------------------------------------------------------- */

/** Sizes the textarea to its content up to the cap, marks the pill as multi-line, and lines up the mirror. */
function fit(area: HTMLTextAreaElement | null, pill: HTMLElement | null, mirror: HTMLElement | null): void {
  if (area === null) return;
  area.style.height = "auto";
  const content = area.scrollHeight;
  area.style.height = `${String(Math.min(content, MAX_HEIGHT_PX))}px`;
  pill?.toggleAttribute("data-multiline", content > LINE_PX * 1.5);
  align(area, mirror);
}

/**
 * Matches the mirror to the textarea's text box: the same width without any
 * scrollbar (clientWidth), and the same scroll position once the question
 * outgrows the cap.
 */
function align(area: HTMLTextAreaElement, mirror: HTMLElement | null): void {
  if (mirror === null) return;
  mirror.style.width = `${String(area.clientWidth)}px`;
  mirror.style.transform = area.scrollTop > 0 ? `translateY(${String(-area.scrollTop)}px)` : "";
}

interface Energy {
  /** Keystrokes per second, smoothed. */
  rate: number;
  /** performance.now() at the last keystroke. */
  last: number;
  /** Where the energy is heading, 0..1. */
  target: number;
  /** The aurora's playback rate, eased toward 1 + 2 * target. */
  playback: number;
  frame: number;
  at: number;
  fall: ReturnType<typeof setTimeout> | undefined;
}

/**
 * Sets the energy. The CSS transition on the registered --energy smooths
 * the glow; the turn speeds up through the animations' playback rate, never
 * their duration, so it accelerates instead of jumping to a new angle.
 */
function charge(wrap: HTMLElement, state: Energy, level: number, swirls: (HTMLElement | null)[]): void {
  state.target = level;
  wrap.dataset.energy = level > 0 ? "up" : "down";
  wrap.style.setProperty("--energy", level.toFixed(3));
  steer(state, swirls);
}

/** Eases the playback rate toward the target, a frame at a time, and stops once it arrives. */
function steer(state: Energy, swirls: (HTMLElement | null)[]): void {
  if (state.frame !== 0) return;
  state.at = performance.now();
  const tick = (time: number): void => {
    const elapsed = Math.min(Math.max(time - state.at, 0), 64);
    state.at = time;
    const goal = 1 + 2 * state.target;
    const lag = goal > state.playback ? 160 : 300;
    state.playback += (goal - state.playback) * (1 - Math.exp(-elapsed / lag));
    if (Math.abs(goal - state.playback) < 0.01) state.playback = goal;
    for (const swirl of swirls) {
      for (const animation of swirl?.getAnimations() ?? []) animation.updatePlaybackRate(state.playback);
    }
    state.frame = state.playback === goal ? 0 : requestAnimationFrame(tick);
  };
  state.frame = requestAnimationFrame(tick);
}

/* ---------------------------------------------------------------------------
 * Two more things the composer has to respect, read the same way as
 * useReducedMotion. The server renders as if neither applies.
 * ------------------------------------------------------------------------- */

const FORCED = "(forced-colors: active)";

function subscribeForced(onChange: () => void): () => void {
  const query = window.matchMedia(FORCED);
  query.addEventListener("change", onChange);
  return () => {
    query.removeEventListener("change", onChange);
  };
}

/** Forced colours (Windows contrast themes) recolour the textarea but not a mirror's spans, so the mirror stands down. */
function useForcedColors(): boolean {
  return useSyncExternalStore(
    subscribeForced,
    () => window.matchMedia(FORCED).matches,
    () => false,
  );
}

function subscribeMotion(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-motion"] });
  return () => {
    observer.disconnect();
  };
}

/** True while the visitor has paused motion (data-motion="paused" on <html>, set from the command menu). */
function useMotionPaused(): boolean {
  return useSyncExternalStore(
    subscribeMotion,
    () => document.documentElement.dataset.motion === "paused",
    () => false,
  );
}
