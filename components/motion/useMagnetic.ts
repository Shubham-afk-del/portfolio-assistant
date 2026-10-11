import { useEffect, type RefObject } from "react";
import { reducedMotion } from "@/lib/motion";
import { isMotionPaused } from "@/lib/theme";

/** Per-second approach rate: quick enough to feel attached, soft enough not to twitch. */
const RATE = 16;

/**
 * Pulls an element a little toward the pointer while it is hovered, then lets
 * it spring back, as the portfolio site's primary buttons do. For one or two
 * focal controls per screen, never a list: a page where everything leans is
 * noise.
 *
 * It moves the element with the standalone `translate` property, which
 * composes with any `transform` or `scale` the element already animates
 * (a hover lift, a press), instead of fighting over one transform string.
 * Mouse and trackpad only, and still under reduced or paused motion.
 */
export function useMagnetic(target: RefObject<HTMLElement | null>, strength = 0.3, max = 10): void {
  useEffect(() => {
    const element = target.current;
    if (element === null || !window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;

    let x = 0;
    let y = 0;
    let goalX = 0;
    let goalY = 0;
    let frame = 0;
    let last = 0;

    const step = (now: number): void => {
      const seconds = Math.min(0.05, (now - last) / 1000);
      last = now;
      const k = 1 - Math.exp(-RATE * seconds);
      x += (goalX - x) * k;
      y += (goalY - y) * k;
      const resting = goalX === 0 && goalY === 0 && Math.abs(x) + Math.abs(y) < 0.05;
      element.style.translate = resting ? "" : `${x.toFixed(2)}px ${y.toFixed(2)}px`;
      frame = Math.abs(goalX - x) + Math.abs(goalY - y) > 0.05 ? requestAnimationFrame(step) : 0;
    };

    const kick = (): void => {
      if (frame !== 0) return;
      last = performance.now();
      frame = requestAnimationFrame(step);
    };

    const clamp = (value: number): number => Math.max(-max, Math.min(max, value));

    const move = (event: PointerEvent): void => {
      if (event.pointerType !== "mouse" || reducedMotion() || isMotionPaused()) return;
      // Measured without the pull, so the element does not chase its own offset.
      const box = element.getBoundingClientRect();
      goalX = clamp((event.clientX - (box.left - x + box.width / 2)) * strength);
      goalY = clamp((event.clientY - (box.top - y + box.height / 2)) * strength);
      kick();
    };

    const leave = (): void => {
      goalX = 0;
      goalY = 0;
      kick();
    };

    element.addEventListener("pointermove", move, { passive: true });
    element.addEventListener("pointerleave", leave);
    return () => {
      cancelAnimationFrame(frame);
      element.removeEventListener("pointermove", move);
      element.removeEventListener("pointerleave", leave);
      element.style.translate = "";
    };
  }, [target, strength, max]);
}
