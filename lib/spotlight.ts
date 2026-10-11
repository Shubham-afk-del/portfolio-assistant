import { useEffect, type RefObject } from "react";

/**
 * Drives `.spotlight-card` borders inside a container: one pointer listener
 * for the whole list, batched to one frame, writing each card's --mx/--my as
 * the pointer's position relative to that card. Neighbouring cards catch the
 * edge of the light too, which is what makes it read as one light source.
 *
 * Mouse only. On touch there is no hover to follow, so the borders stay dark.
 */
export function useSpotlight(container: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const root = container.current;
    if (root === null || !window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;

    let frame = 0;
    let x = 0;
    let y = 0;

    const cards = (): NodeListOf<HTMLElement> => root.querySelectorAll<HTMLElement>(".spotlight-card");

    const update = (): void => {
      frame = 0;
      for (const card of cards()) {
        const box = card.getBoundingClientRect();
        card.style.setProperty("--mx", `${String(Math.round(x - box.left))}px`);
        card.style.setProperty("--my", `${String(Math.round(y - box.top))}px`);
      }
    };

    const move = (event: PointerEvent): void => {
      x = event.clientX;
      y = event.clientY;
      if (frame === 0) frame = requestAnimationFrame(update);
    };

    const leave = (): void => {
      for (const card of cards()) {
        card.style.setProperty("--mx", "-999px");
        card.style.setProperty("--my", "-999px");
      }
    };

    root.addEventListener("pointermove", move, { passive: true });
    root.addEventListener("pointerleave", leave);
    return () => {
      cancelAnimationFrame(frame);
      root.removeEventListener("pointermove", move);
      root.removeEventListener("pointerleave", leave);
    };
  }, [container]);
}
