import { useSyncExternalStore } from "react";

/**
 * Motion helpers for the Web Animations API calls in the chat and profile
 * components. CSS handles every animation it can; these exist for the few
 * that depend on a measurement, such as a question flying from wherever it
 * was asked to where its bubble lands.
 */

const REDUCED = "(prefers-reduced-motion: reduce)";

/** One-off check, for event handlers and effects. */
export function reducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia(REDUCED).matches;
}

function subscribeReduced(onChange: () => void): () => void {
  const query = window.matchMedia(REDUCED);
  query.addEventListener("change", onChange);
  return () => {
    query.removeEventListener("change", onChange);
  };
}

/** Reactive version, for rendering. The server renders as if motion is allowed. */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeReduced,
    () => window.matchMedia(REDUCED).matches,
    () => false,
  );
}

const FALLBACK = "cubic-bezier(0.16, 1, 0.3, 1)";

/**
 * A spring easing from the tokens in app/globals.css, so script animations
 * and CSS ones share one curve rather than a copy of it. Browsers without
 * linear() would throw on it inside element.animate(), so they get the
 * expo-out curve the springs were tuned to resemble.
 */
export function easing(token: "--ease-spring" | "--ease-pop" = "--ease-spring"): string {
  if (typeof window === "undefined") return FALLBACK;
  if (!CSS.supports("animation-timing-function", "linear(0, 1)")) return FALLBACK;
  const value = getComputedStyle(document.documentElement).getPropertyValue(token).trim();
  return value === "" ? FALLBACK : value;
}

const FINE = "(hover: hover) and (pointer: fine)";

function subscribeFine(onChange: () => void): () => void {
  const query = window.matchMedia(FINE);
  query.addEventListener("change", onChange);
  return () => {
    query.removeEventListener("change", onChange);
  };
}

/**
 * A mouse or trackpad, for effects that follow a hovering pointer. The server
 * renders as if there is none, so nothing pointer-driven is in the first HTML.
 */
export function useFinePointer(): boolean {
  return useSyncExternalStore(
    subscribeFine,
    () => window.matchMedia(FINE).matches,
    () => false,
  );
}
