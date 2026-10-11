import { reducedMotion } from "@/lib/motion";

/**
 * A burst of sparks from the middle of a control: the send button's, and now
 * the copy buttons', after the portfolio site's copy burst. Each spark flies
 * out along its own spoke, set a little off even spacing so that no two
 * bursts look stamped from the same die, and thins and fades as it goes,
 * all within about half a second. Written straight to the DOM, so a burst
 * costs React nothing per frame, and skipped under reduced motion.
 *
 * `host` holds the sparks as its children (see Sparks.tsx); each is a short
 * streak whose inner end sits on the host's centre.
 */
export function burst(host: HTMLElement | null): void {
  if (host === null || reducedMotion()) return;
  const sparks = Array.from(host.children);
  const turn = Math.random() * 360;
  for (const [index, spark] of sparks.entries()) {
    const angle = turn + (index * 360) / sparks.length + (Math.random() - 0.5) * 22;
    const reach = 22 + Math.random() * 14;
    const spoke = `rotate(${angle.toFixed(1)}deg)`;
    spark.animate(
      [
        { opacity: 0, transform: `${spoke} translateX(9px) scaleX(0.4)` },
        { opacity: 1, transform: `${spoke} translateX(14px) scaleX(1)`, offset: 0.2 },
        { opacity: 0, transform: `${spoke} translateX(${reach.toFixed(1)}px) scaleX(0.25)` },
      ],
      {
        duration: 420 + Math.random() * 110,
        delay: (index % 3) * 14,
        easing: "cubic-bezier(0.16, 1, 0.3, 1)",
      },
    );
  }
}
