import { reducedMotion } from "@/lib/motion";

/**
 * The two display preferences a visitor can set, shared by the theme toggle
 * in the header and the command menu. Both live as data attributes on <html>
 * and in localStorage; the head script in app/layout.tsx restores them before
 * first paint, and these only change them.
 */

type Theme = "light" | "dark";

/**
 * Flips between light and dark, as a circle of the new theme growing out of
 * `origin` (viewport coordinates, usually the centre of whatever was pressed)
 * through the View Transitions API where it exists. Without an origin it
 * grows from the top right corner, where the header's toggle sits. Without
 * the API, or with reduced motion, the theme simply changes.
 */
export function toggleTheme(origin?: { x: number; y: number }): void {
  const root = document.documentElement;
  const next: Theme = root.dataset["theme"] === "dark" ? "light" : "dark";
  const apply = (): void => {
    root.dataset["theme"] = next;
  };
  try {
    localStorage.setItem("theme", next);
  } catch {
    // Storage blocked: the choice lasts for this page view only.
  }

  if (typeof document.startViewTransition !== "function" || reducedMotion()) {
    apply();
    return;
  }

  const x = origin?.x ?? window.innerWidth;
  const y = origin?.y ?? 0;
  const radius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));

  const transition = document.startViewTransition(apply);
  void transition.ready.then(
    () => {
      root.animate(
        {
          clipPath: [
            `circle(0px at ${String(x)}px ${String(y)}px)`,
            `circle(${String(radius)}px at ${String(x)}px ${String(y)}px)`,
          ],
        },
        {
          duration: 620,
          easing: "cubic-bezier(0.65, 0, 0.35, 1)",
          pseudoElement: "::view-transition-new(root)",
        },
      );
    },
    // A skipped transition, say from a second switch mid-reveal, still runs
    // the update; only the reveal is lost, so there is nothing to report.
    () => undefined,
  );
}

/**
 * Stops or restarts the motion that runs on its own: the pointer light, the
 * status-dot halos and any orb that is turning, which app/globals.css and the
 * shader orb pause under data-motion="paused".
 * WCAG 2.2.2 asks for a way to stop motion that plays on its own for more
 * than five seconds, and this is it.
 */
export function setMotionPaused(paused: boolean): void {
  const root = document.documentElement;
  if (paused) root.dataset["motion"] = "paused";
  else delete root.dataset["motion"];
  try {
    if (paused) localStorage.setItem("motion", "paused");
    else localStorage.removeItem("motion");
  } catch {
    // Storage blocked: the choice lasts for this page view only.
  }
}

export function isMotionPaused(): boolean {
  return typeof document !== "undefined" && document.documentElement.dataset["motion"] === "paused";
}
