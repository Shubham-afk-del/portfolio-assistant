import { reducedMotion } from "./motion";

/**
 * The signature motion: when a question is sent, a small light with a sharp
 * head and a soft tail travels from wherever it was asked to the assistant's
 * mark, which pulses as it lands. Light that starts where the action started
 * and has a direction says "your question went there"; that is the only job
 * it has, so it runs once per question and never on its own.
 *
 * Imperative on purpose: it lives for under a second, belongs to no
 * component, and must cross the whole page above every panel, so it is a
 * fixed element on <body> rather than part of any React tree. Returns a
 * cancel function for the effect that fired it.
 */
export function fireComet(from: DOMRect, target: Element, onArrive?: () => void): () => void {
  if (reducedMotion()) return () => {};

  // A wide origin (the composer) launches from its trailing end, where the
  // send button is; a small one (a card, a timeline row) from its centre.
  const startX = from.width > 240 ? from.right - 28 : from.left + from.width / 2;
  const startY = from.top + from.height / 2;
  const to = target.getBoundingClientRect();
  const dx = to.left + to.width / 2 - startX;
  const dy = to.top + to.height / 2 - startY;
  if (Math.hypot(dx, dy) < 40) return () => {};
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI;

  const comet = document.createElement("span");
  comet.className = "comet";
  comet.setAttribute("aria-hidden", "true");
  comet.style.left = `${String(startX)}px`;
  comet.style.top = `${String(startY)}px`;
  document.body.appendChild(comet);

  const at = (x: number, y: number, stretch: number): string =>
    `translate(${String(x)}px, ${String(y)}px) rotate(${String(angle)}deg) scaleX(${String(stretch)})`;

  const flight = comet.animate(
    [
      { transform: at(0, 0, 0.15), opacity: 0 },
      { transform: at(dx * 0.12, dy * 0.12, 1), opacity: 1, offset: 0.18 },
      { transform: at(dx, dy, 0.55), opacity: 1, offset: 0.9 },
      { transform: at(dx, dy, 0), opacity: 0 },
    ],
    { duration: 760, easing: "cubic-bezier(0.65, 0, 0.35, 1)" },
  );

  flight.onfinish = () => {
    comet.remove();
    target.animate(
      [
        { transform: "scale(1)", filter: "brightness(1)" },
        { transform: "scale(1.32)", filter: "brightness(1.25)", offset: 0.3 },
        { transform: "scale(1)", filter: "brightness(1)" },
      ],
      { duration: 560, easing: "cubic-bezier(0.16, 1, 0.3, 1)" },
    );
    onArrive?.();
  };

  return () => {
    flight.cancel();
    comet.remove();
  };
}
