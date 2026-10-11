"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { ChevronDown } from "lucide-react";
import { LiquidGlass } from "@/components/shell/LiquidGlass";
import { easing, reducedMotion, useReducedMotion } from "@/lib/motion";
import styles from "./StatusIsland.module.css";

/** How long the pill takes to reach a new width, on the spring token. */
const MORPH_MS = 520;
/** Starting or finishing work is worth hearing soon. */
const ANNOUNCE_URGENT_MS = 450;
/** Anything else waits until it has held still, so typing does not chatter. */
const ANNOUNCE_CALM_MS = 1500;

export interface StatusIslandProps {
  /** An orb or an avatar, 28 to 36px. It is centred in a square the height of the pill. */
  leading: ReactNode;
  title: string;
  status: string;
  /** Working: the dot turns indigo and pulses, and the status line shimmers. */
  busy: boolean;
  /** Makes the island a button, as on phones, where it opens the profile sheet. */
  onClick?: () => void;
  /**
   * Plays the arrival on page load (where the head script allowed entrances):
   * the orb pops in as a drop of glass and the island opens out to fit.
   */
  entrance?: boolean;
  /** The button's accessible name. It should contain the visible title. */
  ariaLabel?: string;
  className?: string;
}

/**
 * The console's header as a floating island of glass: who the visitor is
 * talking to, and what the assistant is doing right now.
 *
 * The status line is the part that changes, and the pill changes with it.
 * When the line gets shorter or longer, the pill's width springs to fit, so
 * the island reads as one object reshaping itself rather than a box whose
 * text jumps. The old line drifts up and out as the new one rises in, and
 * when the assistant starts working one band of light crosses the line
 * while the dot pulses indigo.
 *
 * Screen readers get the status through a polite live region outside the
 * pill (a live region inside a button can be swallowed by it), debounced so
 * that "Listening" coming and going between keystrokes is never read out.
 *
 * Position it with className, for example
 * `absolute inset-x-0 top-3 z-30 mx-auto max-w-[calc(100%-1.5rem)]`. Give it
 * insets on both sides rather than `left-1/2 -translate-x-1/2`, which would
 * cap its width at half the console. It is LiquidGlass, so the placement
 * rules in components/shell/LiquidGlass.tsx apply to its wrappers.
 */
export function StatusIsland({
  leading,
  title,
  status,
  busy,
  onClick,
  ariaLabel,
  entrance = false,
  className = "",
}: StatusIslandProps) {
  const reduced = useReducedMotion();
  const pill = useRef<HTMLElement | null>(null);
  const row = useRef<HTMLSpanElement>(null);
  const attach = useCallback((node: HTMLElement | null) => {
    pill.current = node;
  }, []);
  const [label, settle] = useLabelSwap(status);
  const announced = useAnnouncement(status, busy);
  useWidthMorph(pill, row, `${title}\n${status}`);

  const content = (
    <span ref={row} className={styles.row}>
      {/* Where the particle field sends a keystroke once the welcome orb has gone. */}
      <span className={styles.leading} data-particle-target="island">
        {leading}
      </span>
      <span className={styles.text}>
        <span className="text-ink flex min-w-0 items-center gap-1 text-ui font-semibold">
          <span className="truncate">{title}</span>
          {onClick !== undefined && (
            <ChevronDown aria-hidden className="text-ink-muted size-3.5 shrink-0" strokeWidth={2.4} />
          )}
        </span>
        {/* Hidden from assistive technology: the live region below reads it, once. */}
        <span aria-hidden className={`${styles.status} text-ink-muted text-micro`}>
          <span className={styles.dot} data-busy={busy ? "" : undefined} />
          <span className={styles.labels}>
            <span key={label.count} className={styles.label} data-enter={label.count > 0 ? "" : undefined}>
              {label.shown}
              {busy && !reduced && (
                <span className={styles.sheen}>
                  <span className={styles.sheenText}>{label.shown}</span>
                </span>
              )}
            </span>
            {label.leaving !== null && (
              <span key={`leaving-${String(label.count)}`} className={styles.leaving} onAnimationEnd={settle}>
                {label.leaving}
              </span>
            )}
          </span>
        </span>
      </span>
    </span>
  );

  return (
    <>
      {onClick === undefined ? (
        <LiquidGlass
          ref={attach}
          radius={999}
          bezel={14}
          scale={30}
          aberration
          className={`${styles.island} ${entrance ? styles.enter : ""} ${className}`}
          data-busy={busy ? "" : undefined}
        >
          {content}
        </LiquidGlass>
      ) : (
        <LiquidGlass
          as="button"
          ref={attach}
          onClick={onClick}
          aria-label={ariaLabel}
          radius={999}
          bezel={14}
          scale={30}
          aberration
          className={`${styles.island} ${entrance ? styles.enter : ""} ${className}`}
          data-busy={busy ? "" : undefined}
        >
          {content}
        </LiquidGlass>
      )}
      <span role="status" aria-live="polite" className="sr-only">
        {announced}
      </span>
    </>
  );
}

interface Swap {
  shown: string;
  /** The line on its way out, kept until its exit animation ends. */
  leaving: string | null;
  /** Bumped on every change, so the incoming line remounts and replays its entrance. */
  count: number;
}

/**
 * Tracks the line on screen and the one leaving it. The previous status is
 * derived during render, which is React's pattern for state that follows a
 * prop: no effect, so the swap lands in the same commit as the new status.
 */
function useLabelSwap(status: string): [Swap, () => void] {
  const [swap, setSwap] = useState<Swap>({ shown: status, leaving: null, count: 0 });
  if (swap.shown !== status) {
    setSwap({ shown: status, leaving: swap.shown, count: swap.count + 1 });
  }
  const settle = useCallback(() => {
    setSwap((current) => (current.leaving === null ? current : { ...current, leaving: null }));
  }, []);
  return [swap, settle];
}

/**
 * What the live region says. A status has to hold still before it is read:
 * briefly when the assistant starts or stops working, longer otherwise, so a
 * visitor typing in bursts does not hear "Listening" every time they pause.
 * Setting the same text again changes nothing in the DOM, so nothing is
 * announced unless the words actually change.
 */
function useAnnouncement(status: string, busy: boolean): string {
  const [announced, setAnnounced] = useState(status);
  const announcedBusy = useRef(busy);

  useEffect(() => {
    const urgent = busy || busy !== announcedBusy.current;
    const timer = setTimeout(
      () => {
        announcedBusy.current = busy;
        setAnnounced(status);
      },
      urgent ? ANNOUNCE_URGENT_MS : ANNOUNCE_CALM_MS,
    );
    return () => {
      clearTimeout(timer);
    };
  }, [status, busy]);

  return announced;
}

/** Layout width, unaffected by a press or entrance transform; includes a running animation's value. */
function widthOf(element: Element): number {
  return Number.parseFloat(getComputedStyle(element).width);
}

/**
 * Springs the pill from its old width to its new one whenever the content
 * changes. At rest the pill is sized by its content (fit-content, capped by
 * max-width), so truncation, viewport changes and font swaps need no script.
 * A change is a FLIP on width: the width it had (kept current by a
 * ResizeObserver on the content), the width it now wants, and an animation
 * between the two, started before the frame is painted. During the morph the
 * content is pinned at its final width, so the text does not re-truncate on
 * every frame; the pill clips it until it has grown to fit. A change that
 * arrives mid-morph starts from wherever the pill is. With reduced motion the
 * width simply changes.
 *
 * Exported for other glass that changes what it holds, like the console's
 * corner controls. Glass that does not clip at rest passes `clip`, and is
 * clipped only while it morphs, so its rim and focus rings stay whole.
 */
export function useWidthMorph(
  pill: RefObject<HTMLElement | null>,
  row: RefObject<HTMLElement | null>,
  content: string,
  { clip = false }: { clip?: boolean } = {},
): void {
  const settled = useRef<number | null>(null);
  const running = useRef<Animation | null>(null);

  useEffect(() => {
    const element = pill.current;
    const inner = row.current;
    if (element === null || inner === null) return;
    const observer = new ResizeObserver(() => {
      if (running.current !== null) return;
      const width = widthOf(element);
      if (Number.isFinite(width)) settled.current = width;
    });
    observer.observe(inner);
    return () => {
      observer.disconnect();
      running.current?.cancel();
    };
  }, [pill, row]);

  useLayoutEffect(() => {
    const element = pill.current;
    const inner = row.current;
    if (element === null || inner === null) return;

    const active = running.current;
    const from = active === null ? settled.current : widthOf(element);
    if (active !== null) {
      running.current = null;
      active.cancel();
    }
    inner.style.removeProperty("width");
    inner.style.removeProperty("flex-shrink");
    if (clip) element.style.removeProperty("overflow");

    const to = widthOf(element);
    if (!Number.isFinite(to)) return;
    settled.current = to;
    if (from === null || !Number.isFinite(from) || Math.abs(to - from) < 0.5 || reducedMotion()) return;

    inner.style.setProperty("width", `${String(widthOf(inner))}px`);
    inner.style.setProperty("flex-shrink", "0");
    if (clip) element.style.setProperty("overflow", "clip");
    const animation = element.animate([{ width: `${String(from)}px` }, { width: `${String(to)}px` }], {
      duration: MORPH_MS,
      easing: easing("--ease-spring"),
    });
    running.current = animation;

    const release = (): void => {
      if (running.current !== animation) return;
      running.current = null;
      inner.style.removeProperty("width");
      inner.style.removeProperty("flex-shrink");
      if (clip) element.style.removeProperty("overflow");
    };
    animation.addEventListener("finish", release);
    animation.addEventListener("cancel", release);
  }, [pill, row, content, clip]);
}
