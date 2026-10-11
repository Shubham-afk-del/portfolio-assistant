"use client";

import { useEffect, useRef } from "react";
import { useFinePointer, useReducedMotion } from "@/lib/motion";
import styles from "./Cursor.module.css";

const INTERACTIVE = 'a[href], button:not(:disabled), [role="button"], [role="tab"], summary, label[for]';
const TEXT = 'input, textarea, select, [contenteditable="true"]';

/** Controls up to this size get the halo wrapped round them; anything larger gets a ring. */
const SNAP = { width: 260, height: 64 };

/** How far a wrapped halo leans toward the pointer: enough to feel held, never enough to leave its control. */
const LEAN = 0.14;

/** Per-second approach rate of the halo to its target: quick, so it trails the pointer rather than lags it. */
const RATE = 22;

/**
 * A soft halo that trails the pointer, borrowed from the portfolio site's
 * cursor and redrawn in this page's glass. Over a small control it morphs
 * into that control's own rounded shape and leans a little toward the
 * pointer, the way an iPad pointer settles onto a button; over a larger
 * clickable area, such as a suggestion card, it opens into a ring; over text
 * fields it steps aside, because a caret needs no decoration.
 *
 * The native cursor stays, so the visitor's own cursor size and contrast
 * settings keep working. Mouse and trackpad only, never under reduced
 * motion. Every frame writes one transform, and the mode changes are data
 * attributes that CSS animates, so it costs no React render after mounting.
 */
export function Cursor() {
  const fine = useFinePointer();
  const reduced = useReducedMotion();
  return fine && !reduced ? <Halo /> : null;
}

function Halo() {
  const halo = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = halo.current;
    if (element === null) return;

    let pointerX = -100;
    let pointerY = -100;
    let x = -100;
    let y = -100;
    let targetX = -100;
    let targetY = -100;
    let frame = 0;
    let last = 0;
    let snapped: Element | null = null;

    const aim = (): void => {
      if (snapped === null) {
        targetX = pointerX;
        targetY = pointerY;
        return;
      }
      const box = snapped.getBoundingClientRect();
      const centreX = box.left + box.width / 2;
      const centreY = box.top + box.height / 2;
      targetX = centreX + (pointerX - centreX) * LEAN;
      targetY = centreY + (pointerY - centreY) * LEAN;
    };

    const step = (now: number): void => {
      const seconds = Math.min(0.05, (now - last) / 1000);
      last = now;
      const k = 1 - Math.exp(-RATE * seconds);
      x += (targetX - x) * k;
      y += (targetY - y) * k;
      element.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
      frame = Math.abs(targetX - x) + Math.abs(targetY - y) > 0.3 ? requestAnimationFrame(step) : 0;
    };

    const kick = (): void => {
      if (frame !== 0) return;
      last = performance.now();
      frame = requestAnimationFrame(step);
    };

    const unsnap = (): void => {
      snapped = null;
      element.style.removeProperty("--w");
      element.style.removeProperty("--h");
      element.style.removeProperty("--r");
    };

    const move = (event: PointerEvent): void => {
      if (event.pointerType !== "mouse") return;
      pointerX = event.clientX;
      pointerY = event.clientY;
      if (element.dataset["mode"] === "hidden") {
        // Appear where the pointer is, rather than flying in from the corner.
        x = pointerX;
        y = pointerY;
        element.dataset["mode"] = "idle";
      }
      aim();
      kick();
    };

    const over = (event: PointerEvent): void => {
      if (event.pointerType !== "mouse") return;
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest(TEXT)) {
        unsnap();
        element.dataset["mode"] = "hidden";
        return;
      }
      const control = target?.closest(INTERACTIVE) ?? null;
      if (control === null) {
        unsnap();
        element.dataset["mode"] = "idle";
      } else {
        const box = control.getBoundingClientRect();
        if (box.width <= SNAP.width && box.height <= SNAP.height) {
          snapped = control;
          const radius = Number.parseFloat(getComputedStyle(control).borderTopLeftRadius) || 10;
          element.style.setProperty("--w", `${String(Math.round(box.width + 10))}px`);
          element.style.setProperty("--h", `${String(Math.round(box.height + 10))}px`);
          element.style.setProperty("--r", `${String(Math.round(Math.min(radius, box.height / 2) + 5))}px`);
          element.dataset["mode"] = "snap";
        } else {
          unsnap();
          element.dataset["mode"] = "ring";
        }
      }
      aim();
      kick();
    };

    const press = (): void => {
      element.dataset["pressed"] = "";
    };
    const lift = (): void => {
      delete element.dataset["pressed"];
    };
    const leave = (): void => {
      unsnap();
      element.dataset["mode"] = "hidden";
    };
    // A wrapped control moves when its list scrolls, and the halo goes with it.
    const scrolled = (): void => {
      aim();
      kick();
    };

    window.addEventListener("pointermove", move, { passive: true });
    document.addEventListener("pointerover", over, { passive: true });
    window.addEventListener("pointerdown", press, { passive: true });
    window.addEventListener("pointerup", lift, { passive: true });
    document.documentElement.addEventListener("pointerleave", leave);
    window.addEventListener("scroll", scrolled, { capture: true, passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", move);
      document.removeEventListener("pointerover", over);
      window.removeEventListener("pointerdown", press);
      window.removeEventListener("pointerup", lift);
      document.documentElement.removeEventListener("pointerleave", leave);
      window.removeEventListener("scroll", scrolled, { capture: true });
    };
  }, []);

  return (
    <div aria-hidden className={styles.layer}>
      <div ref={halo} className={styles.halo} data-mode="hidden">
        <span className={styles.ring} />
      </div>
    </div>
  );
}
