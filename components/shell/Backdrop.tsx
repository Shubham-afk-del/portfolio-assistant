"use client";

import { useEffect, useRef } from "react";
import { reducedMotion } from "@/lib/motion";

/**
 * The field the glass blurs against. Fixed, behind everything, and saturated
 * on purpose, because nothing readable sits directly on it. Four soft pools
 * of light hold still (app/globals.css says why), and on a desktop a fifth
 * light follows the pointer, eased so it trails rather than snaps: the only
 * thing that moves behind the glass is what the visitor moves.
 *
 * The pointer light is skipped on touch screens, where there is no hover to
 * follow, and when reduced motion is requested.
 */
export function Backdrop() {
  const spot = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = spot.current;
    if (element === null || reducedMotion()) return;
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;

    let x = window.innerWidth / 2;
    let y = window.innerHeight / 3;
    let targetX = x;
    let targetY = y;
    let frame = 0;

    const tick = (): void => {
      x += (targetX - x) * 0.1;
      y += (targetY - y) * 0.1;
      element.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
      frame = Math.abs(targetX - x) + Math.abs(targetY - y) > 0.5 ? requestAnimationFrame(tick) : 0;
    };

    const move = (event: PointerEvent): void => {
      targetX = event.clientX;
      targetY = event.clientY;
      element.dataset["live"] = "";
      if (frame === 0) frame = requestAnimationFrame(tick);
    };

    const leave = (): void => {
      delete element.dataset["live"];
    };

    window.addEventListener("pointermove", move, { passive: true });
    document.documentElement.addEventListener("pointerleave", leave);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", move);
      document.documentElement.removeEventListener("pointerleave", leave);
    };
  }, []);

  return (
    <div aria-hidden className="field">
      <div className="field-orb" data-orb="indigo" />
      <div className="field-orb" data-orb="amber" />
      <div className="field-orb" data-orb="coral" />
      <div className="field-orb" data-orb="azure" />
      <div ref={spot} className="spotlight" />
      <div className="field-grid" />
      <div className="field-grain" />
    </div>
  );
}
