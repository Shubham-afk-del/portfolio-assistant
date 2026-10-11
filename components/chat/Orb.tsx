"use client";

import { useEffect, useRef } from "react";
import { reducedMotion } from "@/lib/motion";
import { useActivity } from "./ChatProvider";
import styles from "./Orb.module.css";

export type OrbState = "idle" | "listening" | "thinking" | "writing";

/** Playback rate of the 9s spin in each state. */
const RATE: Record<OrbState, number> = {
  idle: 1,
  listening: 2.2,
  thinking: 5.5,
  writing: 3,
};

/**
 * The assistant's mark: an aurora turning under a glass lens, with an S for
 * Shubham set in the prose face.
 *
 * It is deliberately not his photograph. The assistant speaks about him in
 * the third person, and a face on its messages would suggest the visitor is
 * talking to him rather than to software that represents him.
 *
 * Its speed is its state. The spin is a CSS animation, and a state change
 * moves the animation's playback rate rather than its duration, so the turn
 * accelerates smoothly instead of jumping to a new angle. With `listen` on,
 * every keystroke in the composer sends a ripple out from it, which is how
 * the assistant shows it is paying attention while a question is typed.
 * With `orbit` on, a ring tilted into depth circles it while it searches
 * (Orb.module.css), and fades away once the answer starts.
 */
export function Orb({
  size = 40,
  state = "idle",
  listen = false,
  orbit = false,
  className = "",
}: {
  size?: number;
  state?: OrbState;
  listen?: boolean;
  orbit?: boolean;
  className?: string;
}) {
  const swirl = useRef<HTMLSpanElement>(null);
  const ring = useRef<HTMLSpanElement>(null);
  const { onKeystroke } = useActivity();

  useEffect(() => {
    for (const animation of swirl.current?.getAnimations() ?? []) {
      animation.updatePlaybackRate(RATE[state]);
    }
  }, [state]);

  useEffect(() => {
    if (!listen) return;
    return onKeystroke(() => {
      const element = ring.current;
      if (element === null || reducedMotion()) return;
      element.animate(
        [
          { opacity: 0.6, transform: "scale(1)" },
          { opacity: 0, transform: "scale(1.75)" },
        ],
        { duration: 720, easing: "cubic-bezier(0.16, 1, 0.3, 1)" },
      );
    });
  }, [listen, onKeystroke]);

  return (
    <span
      aria-hidden
      className={`orb ${orbit ? styles.orbiting : ""} ${className}`}
      data-state={state}
      style={{ width: size, height: size }}
    >
      {orbit && (
        <span className={`${styles.orbit} ${styles.back}`}>
          <span className={styles.ring} />
        </span>
      )}
      <span ref={ring} className="orb-ring" />
      <span className="orb-clip">
        <span ref={swirl} className="orb-swirl" />
        <span className="orb-lens" />
      </span>
      <span className="orb-glyph" style={{ fontSize: Math.round(size * 0.46) }}>
        S
      </span>
      {orbit && (
        <span className={`${styles.orbit} ${styles.front}`}>
          <span className={styles.ring} />
        </span>
      )}
    </span>
  );
}
