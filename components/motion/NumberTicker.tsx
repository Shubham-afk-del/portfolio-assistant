"use client";

import { useEffect, useRef } from "react";
import { useReducedMotion } from "@/lib/motion";

/**
 * A measured figure that counts up to its value once, when it is first seen,
 * on an expo-out curve, then rests on the exact value. The server renders the
 * final number and reduced motion keeps it; screen readers get the value from
 * the hidden copy, never the count. Frames write straight to the text node.
 */
export function NumberTicker({
  value,
  decimals = 0,
  duration = 900,
  delay = 0,
  className,
}: {
  value: number;
  decimals?: number;
  duration?: number;
  delay?: number;
  className?: string;
}) {
  const box = useRef<HTMLSpanElement>(null);
  const out = useRef<HTMLSpanElement>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    const element = box.current;
    const node = out.current;
    if (element === null || node === null || reduced) return;

    const format = (n: number): string => n.toFixed(decimals);
    // Parked at zero as soon as it is known to animate, so the figure never
    // shows its final value and then visibly drops back to count up.
    node.textContent = format(0);

    let frame = 0;
    let timer = 0;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting !== true) return;
        observer.disconnect();
        timer = window.setTimeout(() => {
          const start = performance.now();
          const tick = (now: number): void => {
            const t = Math.min(1, (now - start) / duration);
            node.textContent = format(t < 1 ? value * (1 - 2 ** (-10 * t)) : value);
            if (t < 1) frame = requestAnimationFrame(tick);
          };
          frame = requestAnimationFrame(tick);
        }, delay);
      },
      { threshold: 0.5 },
    );
    observer.observe(element);
    return () => {
      observer.disconnect();
      window.clearTimeout(timer);
      cancelAnimationFrame(frame);
      node.textContent = format(value);
    };
  }, [value, decimals, duration, delay, reduced]);

  return (
    <span ref={box} className={className}>
      <span className="sr-only">{value.toFixed(decimals)}</span>
      <span ref={out} aria-hidden className="tabular-nums">
        {value.toFixed(decimals)}
      </span>
    </span>
  );
}
