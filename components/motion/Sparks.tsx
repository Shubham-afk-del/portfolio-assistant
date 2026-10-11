import type { Ref } from "react";
import styles from "./Sparks.module.css";

const SLOTS = Array.from({ length: 10 }, (_, index) => index);

/**
 * The sparks for burst() to fire: ten streaks round the aurora, invisible at
 * rest. Place it inside a positioned control; it covers the control and
 * takes no pointer events.
 */
export function Sparks({ ref }: { ref: Ref<HTMLSpanElement> }) {
  return (
    <span ref={ref} aria-hidden className={styles.sparks}>
      {SLOTS.map((slot) => (
        <i key={slot} className={styles.spark} />
      ))}
    </span>
  );
}
