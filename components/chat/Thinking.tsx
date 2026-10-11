import styles from "./Thinking.module.css";

/**
 * Shown between sending and the first streamed part: a real description of
 * what is happening, with a band of light passing over it, rather than a
 * spinner that says nothing. The motes beside it orbit in depth, the same
 * motion as the ring round the assistant's orb while it searches.
 */
export function Thinking({ label }: { label: string }) {
  return (
    <div role="status" className="flex items-center gap-3 py-1">
      <span aria-hidden className={styles.orbit}>
        <span className={styles.plane}>
          <i className={styles.mote} />
          <i className={styles.mote} />
          <i className={styles.mote} />
        </span>
      </span>
      <span className="scan-text text-ui">{label}</span>
    </div>
  );
}
