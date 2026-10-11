import { useEffect, type RefObject } from "react";
import { reducedMotion } from "@/lib/motion";
import { isMotionPaused } from "@/lib/theme";

/**
 * How fast a card's pose approaches the pointer, per second. Exponential
 * approach is a critically damped spring without the overshoot, which keeps
 * text on a tilted card from wobbling as it settles.
 */
const RATE = 14;
const SETTLED = 0.0015;

interface Pose {
  x: number;
  y: number;
  hover: number;
}

const REST: Pose = { x: 0.5, y: 0.5, hover: 0 };

/**
 * Pointer-driven depth for every `[data-tilt]` card in a container: one
 * listener for the whole list, and only the card under the pointer moves.
 *
 * The script writes three numbers per card and nothing else: --tilt-x and
 * --tilt-y, the pointer's position across the card from 0 to 1, and --tilt-h,
 * how hovered it is, also 0 to 1, eased so a card leans in and settles back
 * rather than snapping. Each card's CSS turns those into its own rotation,
 * glare and shadow, so one driver serves cards that tilt and cards that only
 * catch the light. A card carries data-tilting only while it moves, so its
 * stylesheet can keep a resting card flat: a 3D transform left on at rest
 * puts its text on a layer of its own, rasterised less crisply.
 *
 * Mouse and trackpad only, and nothing under reduced motion or paused motion:
 * on touch there is no hover to follow, and a card that leans on its own is
 * exactly what those settings ask to stop.
 */
export function useTilt(container: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const root = container.current;
    if (root === null || !window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;

    const poses = new Map<HTMLElement, Pose>();
    const goals = new Map<HTMLElement, Pose>();
    let active: HTMLElement | null = null;
    let frame = 0;
    let last = 0;

    const write = (card: HTMLElement, pose: Pose): void => {
      card.dataset["tilting"] = "";
      card.style.setProperty("--tilt-x", pose.x.toFixed(4));
      card.style.setProperty("--tilt-y", pose.y.toFixed(4));
      card.style.setProperty("--tilt-h", pose.hover.toFixed(4));
    };

    const clear = (card: HTMLElement): void => {
      delete card.dataset["tilting"];
      card.style.removeProperty("--tilt-x");
      card.style.removeProperty("--tilt-y");
      card.style.removeProperty("--tilt-h");
    };

    const step = (now: number): void => {
      const seconds = Math.min(0.05, (now - last) / 1000);
      last = now;
      const k = 1 - Math.exp(-RATE * seconds);
      let moving = false;

      for (const [card, goal] of goals) {
        const pose = poses.get(card) ?? { ...REST };
        pose.x += (goal.x - pose.x) * k;
        pose.y += (goal.y - pose.y) * k;
        pose.hover += (goal.hover - pose.hover) * k;
        const settled =
          Math.abs(goal.x - pose.x) < SETTLED &&
          Math.abs(goal.y - pose.y) < SETTLED &&
          Math.abs(goal.hover - pose.hover) < SETTLED;

        if (settled && goal.hover === 0) {
          // Back at rest: hand the card back to its stylesheet's defaults.
          goals.delete(card);
          poses.delete(card);
          clear(card);
          continue;
        }
        poses.set(card, pose);
        write(card, pose);
        if (!settled) moving = true;
      }
      frame = moving ? requestAnimationFrame(step) : 0;
    };

    const kick = (): void => {
      if (frame !== 0) return;
      last = performance.now();
      frame = requestAnimationFrame(step);
    };

    const release = (card: HTMLElement): void => {
      goals.set(card, { ...REST });
    };

    const move = (event: PointerEvent): void => {
      if (event.pointerType !== "mouse") return;
      const still = reducedMotion() || isMotionPaused();
      const hit = still || !(event.target instanceof Element) ? null : event.target.closest<HTMLElement>("[data-tilt]");
      const card = hit !== null && root.contains(hit) ? hit : null;
      if (active !== null && active !== card) release(active);
      active = card;
      if (card !== null) {
        const box = card.getBoundingClientRect();
        goals.set(card, {
          x: Math.min(1, Math.max(0, (event.clientX - box.left) / box.width)),
          y: Math.min(1, Math.max(0, (event.clientY - box.top) / box.height)),
          hover: 1,
        });
      }
      kick();
    };

    const leave = (): void => {
      if (active !== null) release(active);
      active = null;
      kick();
    };

    root.addEventListener("pointermove", move, { passive: true });
    root.addEventListener("pointerleave", leave);
    return () => {
      cancelAnimationFrame(frame);
      root.removeEventListener("pointermove", move);
      root.removeEventListener("pointerleave", leave);
      for (const card of poses.keys()) clear(card);
    };
  }, [container]);
}
