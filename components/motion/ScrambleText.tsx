"use client";

import { useEffect, useRef } from "react";
import { useReducedMotion } from "@/lib/motion";

const GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&*+=<>/";

/**
 * Text that decodes from random glyphs into its real characters, left to
 * right, the first time it is seen: a nod to a model emitting tokens, which is
 * what this page is. For monospaced labels only, so the width never jitters.
 *
 * The server renders the final text and reduced motion keeps it; screen
 * readers always get the whole string from the hidden copy. Frames write
 * straight to the text node, so the decode costs no React render.
 */
export function ScrambleText({
  text,
  className,
  duration = 800,
  delay = 0,
}: {
  text: string;
  className?: string;
  duration?: number;
  delay?: number;
}) {
  const box = useRef<HTMLSpanElement>(null);
  const out = useRef<HTMLSpanElement>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    const element = box.current;
    const node = out.current;
    if (element === null || node === null || reduced) return;

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
            const settled = Math.floor(t * text.length);
            let next = "";
            for (let i = 0; i < text.length; i += 1) {
              const char = text[i] ?? "";
              next += i < settled || /\s/.test(char) ? char : (GLYPHS[Math.floor(Math.random() * GLYPHS.length)] ?? "");
            }
            node.textContent = t < 1 ? next : text;
            if (t < 1) frame = requestAnimationFrame(tick);
          };
          frame = requestAnimationFrame(tick);
        }, delay);
      },
      { threshold: 0.6 },
    );
    observer.observe(element);
    return () => {
      observer.disconnect();
      window.clearTimeout(timer);
      cancelAnimationFrame(frame);
      node.textContent = text;
    };
  }, [text, duration, delay, reduced]);

  return (
    <span ref={box} className={className}>
      <span className="sr-only">{text}</span>
      <span ref={out} aria-hidden>
        {text}
      </span>
    </span>
  );
}
