"use client";

import { useEffect, useRef } from "react";
import { useActivity, useChatContext } from "@/components/chat/ChatProvider";
import { useReducedMotion } from "@/lib/motion";
import { isMotionPaused } from "@/lib/theme";
import styles from "./ParticleField.module.css";

/**
 * Light that moves with what the assistant is doing, drawn on one canvas
 * inside the console, above its frosted fill and below its content.
 *
 * - On the welcome screen, a few motes drift up like dust in a beam of
 *   light, in three depths that shift a little with the pointer.
 * - Each keystroke sends a spark from the composer up to the assistant's
 *   orb: the question being heard.
 * - While the answer is being looked for, particles stream in from the
 *   console's edges into the thinking orb: the search, drawn.
 * - When the answer starts, the orb lets out one soft burst.
 * - A question launched from a card or the map leaves a trail of sparks
 *   behind its comet (lib/comet.ts).
 *
 * The motion means something at every moment, so none of it is filler, and
 * all of it stops when it has nothing to say: the loop ends whenever no
 * particle is alive, after twenty seconds without the visitor doing
 * anything, and while the tab is hidden. Reduced motion renders no canvas;
 * paused motion stops every particle. Inside the panel, rather than behind
 * it, the moving light costs compositing only: the panel's glass is blurred
 * once and never re-blurred for it.
 */
export function ParticleField() {
  const reduced = useReducedMotion();
  return reduced ? null : <Field />;
}

type Target = "thinking" | "orb" | "island";

interface Particle {
  kind: "mote" | "seek" | "spark";
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** A seeker's start, and how far its path bows off the straight line. */
  sx: number;
  sy: number;
  bend: number;
  target: Target | null;
  age: number;
  life: number;
  size: number;
  hue: number;
  /** A mote's depth, 0.35 to 1: nearer motes are larger, faster and shift more. */
  depth: number;
  phase: number;
  /** Motes fade in when the field wakes and out when it sleeps. */
  fade: number;
}

/** Indigo, azure, amber, coral: the aurora. Lighter in the dark theme, deeper in the light. */
const HUES = {
  dark: ["#8b9bff", "#5cb2ff", "#f5b83d", "#ff8a6b"],
  light: ["#4058e0", "#1f7fe0", "#d68a00", "#e0533a"],
} as const;

const SPRITE = 64;
/** Past twenty seconds without input the motes settle out and the loop ends. */
const IDLE_MS = 20_000;
const MAX_PARTICLES = 420;

function Field() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const engine = useRef<Engine | null>(null);
  const { status, messages } = useChatContext();
  const { onKeystroke } = useActivity();
  const welcome = messages.length === 0;

  useEffect(() => {
    const element = canvas.current;
    if (element === null) return;
    const created = createEngine(element);
    engine.current = created;
    return () => {
      created.destroy();
      engine.current = null;
    };
  }, []);

  useEffect(() => {
    engine.current?.setState(status, welcome);
  }, [status, welcome]);

  useEffect(
    () =>
      onKeystroke(() => {
        engine.current?.keystroke();
      }),
    [onKeystroke],
  );

  return <canvas ref={canvas} aria-hidden className={styles.field} />;
}

interface Engine {
  setState: (status: string, welcome: boolean) => void;
  keystroke: () => void;
  destroy: () => void;
}

function createEngine(canvas: HTMLCanvasElement): Engine {
  const context = canvas.getContext("2d");
  if (context === null) return { setState: () => {}, keystroke: () => {}, destroy: () => {} };
  const ctx = context;
  const panel = canvas.parentElement ?? document.body;
  const phone = window.matchMedia("(max-width: 640px)").matches;
  const moteCount = phone ? 16 : 44;
  const streamRate = phone ? 14 : 30;

  let width = 0;
  let height = 0;
  let dpr = 1;
  let dark = true;
  let sprites: HTMLCanvasElement[] = [];
  const particles: Particle[] = [];

  let status = "ready";
  let welcome = true;
  let frame = 0;
  let last = 0;
  let time = 0;
  let streamDebt = 0;
  let lastKey = 0;
  let lastActivity = performance.now();
  let pointerX = 0;
  let pointerY = 0;
  let lastThinking: { x: number; y: number } | null = null;

  /* Sprites: one soft glowing dot per hue, drawn once per theme. ------------- */
  const paint = (): void => {
    dark = document.documentElement.dataset["theme"] !== "light";
    sprites = (dark ? HUES.dark : HUES.light).map((hue) => {
      const sprite = document.createElement("canvas");
      sprite.width = SPRITE;
      sprite.height = SPRITE;
      const pen = sprite.getContext("2d");
      if (pen !== null) {
        const glow = pen.createRadialGradient(SPRITE / 2, SPRITE / 2, 0, SPRITE / 2, SPRITE / 2, SPRITE / 2);
        if (dark) {
          glow.addColorStop(0, "rgba(255,255,255,1)");
          glow.addColorStop(0.16, hue);
          glow.addColorStop(0.42, `${hue}55`);
          glow.addColorStop(1, `${hue}00`);
        } else {
          glow.addColorStop(0, hue);
          glow.addColorStop(0.24, `${hue}bb`);
          glow.addColorStop(0.58, `${hue}22`);
          glow.addColorStop(1, `${hue}00`);
        }
        pen.fillStyle = glow;
        pen.fillRect(0, 0, SPRITE, SPRITE);
      }
      return sprite;
    });
  };

  /* Where things are, in the canvas's own coordinates. Measured at most once
   * a frame each: a stream has dozens of particles seeking the same orb. ---- */
  let origin = canvas.getBoundingClientRect();
  const found = new Map<Target, { x: number; y: number } | null>();

  const resize = (): void => {
    const box = canvas.getBoundingClientRect();
    origin = box;
    dpr = Math.min(2, window.devicePixelRatio || 1);
    width = box.width;
    height = box.height;
    canvas.width = Math.max(1, Math.round(width * dpr));
    canvas.height = Math.max(1, Math.round(height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };

  const centreOf = (element: Element | null | undefined): { x: number; y: number } | null => {
    if (element === null || element === undefined) return null;
    const box = element.getBoundingClientRect();
    if (box.width === 0 || box.height === 0) return null;
    const x = box.left + box.width / 2 - origin.left;
    const y = box.top + box.height / 2 - origin.top;
    // Off the console, or scrolled away under its edge: nowhere to fly to.
    if (x < 0 || y < 0 || x > width || y > height) return null;
    return { x, y };
  };

  const measure = (target: Target): { x: number; y: number } | null => {
    if (target === "thinking") {
      const orbs = panel.querySelectorAll('.orb[data-state="thinking"]');
      return centreOf(orbs[orbs.length - 1]);
    }
    for (const element of panel.querySelectorAll(`[data-particle-target="${target}"]`)) {
      const point = centreOf(element);
      if (point !== null) return point;
    }
    return null;
  };

  const locate = (target: Target): { x: number; y: number } | null => {
    if (!found.has(target)) found.set(target, measure(target));
    return found.get(target) ?? null;
  };

  /** Forget this frame's measurements: the next look is fresh. */
  const remeasure = (): void => {
    origin = canvas.getBoundingClientRect();
    found.clear();
  };

  /* Spawning. --------------------------------------------------------------- */
  const add = (particle: Partial<Particle> & Pick<Particle, "kind" | "x" | "y" | "life" | "size">): void => {
    if (particles.length >= MAX_PARTICLES) return;
    particles.push({
      vx: 0,
      vy: 0,
      sx: particle.x,
      sy: particle.y,
      bend: 0,
      target: null,
      age: 0,
      hue: Math.floor(Math.random() * 4),
      depth: 1,
      phase: Math.random() * Math.PI * 2,
      fade: 1,
      ...particle,
    });
  };

  const mote = (anywhere: boolean): void => {
    const depth = 0.35 + Math.random() * 0.65;
    add({
      kind: "mote",
      x: Math.random() * width,
      y: anywhere ? Math.random() * height : height + 12,
      vy: -(5 + Math.random() * 9) * depth,
      life: Infinity,
      size: (8 + Math.random() * 9) * depth + 4,
      depth,
      fade: anywhere ? 0 : 0.2,
    });
  };

  const seek = (x: number, y: number, target: Target, life: number, size: number): void => {
    add({ kind: "seek", x, y, target, life, size, bend: (Math.random() - 0.5) * 0.9 });
  };

  const spark = (x: number, y: number, speed: number, life: number, size: number): void => {
    const angle = Math.random() * Math.PI * 2;
    const velocity = speed * (0.35 + Math.random() * 0.65);
    add({ kind: "spark", x, y, vx: Math.cos(angle) * velocity, vy: Math.sin(angle) * velocity, life, size });
  };

  /** A point just inside the console's edge, on a side chosen at random. */
  const edgePoint = (): { x: number; y: number } => {
    const side = Math.floor(Math.random() * 4);
    const along = Math.random();
    if (side === 0) return { x: along * width, y: 6 };
    if (side === 1) return { x: width - 6, y: along * height };
    if (side === 2) return { x: along * width, y: height - 6 };
    return { x: 6, y: along * height };
  };

  /* The loop. --------------------------------------------------------------- */
  const ambient = (): boolean =>
    welcome && status === "ready" && performance.now() - lastActivity < IDLE_MS && !isMotionPaused();

  const step = (now: number): void => {
    const seconds = Math.min(0.05, (now - last) / 1000);
    last = now;
    time += seconds;
    remeasure();
    const still = isMotionPaused();

    // The motes: scattered across the console when the field wakes, kept
    // topped up from below while it is awake, faded out when it sleeps.
    const awake = ambient();
    if (awake) {
      let motes = 0;
      for (const particle of particles) if (particle.kind === "mote") motes += 1;
      if (motes === 0) for (let i = 0; i < moteCount; i += 1) mote(true);
      else if (motes < moteCount) mote(false);
    }

    // The search: a stream from the edges into the thinking orb.
    if (status === "submitted" && !still) {
      const orb = locate("thinking");
      if (orb !== null) {
        lastThinking = orb;
        streamDebt += streamRate * seconds;
        while (streamDebt >= 1) {
          streamDebt -= 1;
          const from = edgePoint();
          seek(from.x, from.y, "thinking", 0.9 + Math.random() * 0.6, 9 + Math.random() * 8);
        }
      }
    }

    // A comet in flight sheds sparks from its head. Its head is its anchor,
    // which its transform moves by exactly the translation.
    if (!still) {
      for (const comet of document.querySelectorAll<HTMLElement>(".comet")) {
        const matrix = new DOMMatrixReadOnly(getComputedStyle(comet).transform);
        const x = Number.parseFloat(comet.style.left) + matrix.e - origin.left;
        const y = Number.parseFloat(comet.style.top) + matrix.f - origin.top;
        for (let i = 0; i < 3; i += 1) spark(x, y, 40, 0.35 + Math.random() * 0.3, 6 + Math.random() * 5);
      }
    }

    ctx.clearRect(0, 0, width, height);
    ctx.globalCompositeOperation = dark ? "lighter" : "source-over";
    const shiftX = (pointerX - width / 2) / Math.max(width, 1);
    const shiftY = (pointerY - height / 2) / Math.max(height, 1);

    for (let i = particles.length - 1; i >= 0; i -= 1) {
      const p = particles[i];
      if (p === undefined) continue;
      p.age += seconds;
      let alpha = 1;
      let drawX = p.x;
      let drawY = p.y;

      if (p.kind === "mote") {
        p.fade = Math.max(0, Math.min(1, p.fade + (awake ? seconds * 0.8 : -seconds * 1.4)));
        if (p.fade === 0 && !awake) {
          particles.splice(i, 1);
          continue;
        }
        p.y += p.vy * seconds;
        p.x += Math.sin(time * 0.5 + p.phase) * 7 * p.depth * seconds;
        if (p.y < -12) {
          p.y = height + 12;
          p.x = Math.random() * width;
        }
        alpha = p.fade * (0.48 + 0.34 * Math.sin(time * 1.6 + p.phase * 3)) * (0.45 + 0.55 * p.depth);
        drawX = p.x - shiftX * 26 * p.depth;
        drawY = p.y - shiftY * 18 * p.depth;
      } else if (p.kind === "seek") {
        const goal = p.target === null ? null : (locate(p.target) ?? (p.target === "thinking" ? lastThinking : null));
        const t = Math.min(1, p.age / p.life);
        if (goal === null) {
          particles.splice(i, 1);
          continue;
        }
        // An eased quadratic curve from the start to the target, bowed to one
        // side, so a stream reads as many paths rather than a ruled fan.
        const e = t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
        const midX = (p.sx + goal.x) / 2 - (goal.y - p.sy) * p.bend;
        const midY = (p.sy + goal.y) / 2 + (goal.x - p.sx) * p.bend;
        const at = (k: number): [number, number] => [
          (1 - k) * (1 - k) * p.sx + 2 * (1 - k) * k * midX + k * k * goal.x,
          (1 - k) * (1 - k) * p.sy + 2 * (1 - k) * k * midY + k * k * goal.y,
        ];
        [p.x, p.y] = at(e);
        alpha = Math.min(1, t * 5) * (t > 0.82 ? (1 - t) / 0.18 : 1);
        // A short tail behind the head.
        const sprite = sprites[p.hue];
        if (sprite !== undefined) {
          for (let k = 1; k <= 3; k += 1) {
            const [tx, ty] = at(Math.max(0, e - k * 0.035));
            const size = p.size * (1 - k * 0.2);
            ctx.globalAlpha = alpha * (0.42 - k * 0.11) * (dark ? 0.9 : 0.65);
            ctx.drawImage(sprite, tx - size / 2, ty - size / 2, size, size);
          }
        }
        if (t >= 1) {
          if (!still) for (let k = 0; k < 2; k += 1) spark(goal.x, goal.y, 70, 0.35, 7);
          particles.splice(i, 1);
          continue;
        }
        drawX = p.x;
        drawY = p.y;
      } else {
        const drag = Math.exp(-3.2 * seconds);
        p.vx *= drag;
        p.vy *= drag;
        p.x += p.vx * seconds;
        p.y += p.vy * seconds;
        alpha = Math.max(0, 1 - p.age / p.life);
        if (alpha === 0) {
          particles.splice(i, 1);
          continue;
        }
        drawX = p.x;
        drawY = p.y;
      }

      const sprite = sprites[p.hue];
      if (sprite === undefined) continue;
      ctx.globalAlpha = Math.min(1, alpha) * (dark ? 0.95 : 0.7);
      ctx.drawImage(sprite, drawX - p.size / 2, drawY - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;

    const busy = status === "submitted" || document.querySelector(".comet") !== null;
    frame = particles.length > 0 || busy || ambient() ? requestAnimationFrame(step) : 0;
    if (frame === 0) ctx.clearRect(0, 0, width, height);
  };

  const wake = (): void => {
    if (frame !== 0 || document.hidden) return;
    last = performance.now();
    frame = requestAnimationFrame(step);
  };

  /* Inputs. ----------------------------------------------------------------- */
  const active = (): void => {
    lastActivity = performance.now();
    wake();
  };

  const pointer = (event: PointerEvent): void => {
    pointerX = event.clientX - origin.left;
    pointerY = event.clientY - origin.top;
    active();
  };

  const visibility = (): void => {
    if (document.hidden) {
      cancelAnimationFrame(frame);
      frame = 0;
    } else {
      wake();
    }
  };

  paint();
  resize();
  pointerX = width / 2;
  pointerY = height / 2;
  const resizer = new ResizeObserver(resize);
  resizer.observe(canvas);
  const theme = new MutationObserver(paint);
  theme.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  window.addEventListener("pointermove", pointer, { passive: true });
  window.addEventListener("keydown", active, { passive: true });
  window.addEventListener("wheel", active, { passive: true });
  window.addEventListener("touchstart", active, { passive: true });
  document.addEventListener("visibilitychange", visibility);
  wake();

  return {
    setState(nextStatus, nextWelcome) {
      // The answer has started: the orb lets out what it gathered.
      if (status === "submitted" && nextStatus === "streaming" && lastThinking !== null && !isMotionPaused()) {
        for (let i = 0; i < 26; i += 1) spark(lastThinking.x, lastThinking.y, 170, 0.6 + Math.random() * 0.5, 7 + Math.random() * 7);
      }
      if (nextStatus === "submitted") {
        streamDebt = 0;
        lastThinking = null;
      }
      status = nextStatus;
      welcome = nextWelcome;
      active();
    },
    keystroke() {
      const now = performance.now();
      lastActivity = now;
      if (now - lastKey < 45 || isMotionPaused()) return;
      lastKey = now;
      remeasure();
      const field = panel.querySelector("textarea");
      const target: Target | null = locate("orb") !== null ? "orb" : locate("island") !== null ? "island" : null;
      if (field === null || target === null) return;
      const box = field.getBoundingClientRect();
      const x = box.left - origin.left + 18 + Math.random() * Math.min(box.width * 0.6, 420);
      const y = box.top - origin.top + box.height / 2;
      seek(x, y, target, 0.75 + Math.random() * 0.35, 8 + Math.random() * 5);
      wake();
    },
    destroy() {
      cancelAnimationFrame(frame);
      resizer.disconnect();
      theme.disconnect();
      window.removeEventListener("pointermove", pointer);
      window.removeEventListener("keydown", active);
      window.removeEventListener("wheel", active);
      window.removeEventListener("touchstart", active);
      document.removeEventListener("visibilitychange", visibility);
    },
  };
}
