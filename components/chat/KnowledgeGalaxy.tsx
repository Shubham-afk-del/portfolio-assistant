"use client";

import { Rotate3d } from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import type * as Three from "three";
import type { CorpusMap, MapDocument } from "@/lib/corpus-map";
import { cn } from "@/lib/utils";
import { KnowledgeMap } from "./KnowledgeMap";
import mapStyles from "./KnowledgeMap.module.css";
import styles from "./KnowledgeGalaxy.module.css";

type ThreeModule = typeof Three;
type AskHandler = (question: string, origin: Element) => void;

/* ---------------------------------------------------------------------------
 * Tuning
 * ------------------------------------------------------------------------- */

/** Past 2x, extra pixels buy nothing visible on soft sprites and cost fill rate. */
const MAX_DPR = 2;

/**
 * The resting field of view, in degrees. The fly-in starts much narrower,
 * where a perspective camera is nearly orthographic and the still-flat
 * galaxy is drawn face on, as the 2D map draws it.
 */
const FOV = 38;
const FOV_FLAT = 10;

/**
 * A star at the depth of the galaxy's centre is drawn the size of a dot on
 * the 2D map: a glow 13px in radius round a core of 2.4px. Nearer stars are
 * larger and farther ones smaller, by perspective and nothing else, so size
 * still says nothing about the data.
 */
const STAR_PX = 26;
const CORE_FRACTION = 2.4 / 13;

/** How far the pointer may be from a star and still be on it, in CSS pixels, as on the 2D map. */
const REACH = { mouse: 14, touch: 24 };

/** A press that travels further than this is a drag, not a click. */
const DRAG_SLOP = 5;

/**
 * The arrival. A front of light leaves the centre and lights each star as
 * it passes, while the camera flies in from the flat, face-on view and the
 * galaxy unfolds along its third axis; the floor, the clouds and then the
 * labels follow. It plays once per visit.
 */
const INTRO_MS = 2800;
/** Where the fly-in comes to rest: turned about 45 degrees, looking down onto the floor. */
const YAW_REST = -0.8;
const PITCH_REST = 0.4;
const PITCH_LIMIT = 1.15;

/** One turn in 90 seconds: slow enough to read a label as it passes. */
const CRUISE = (Math.PI * 2) / 90;
const DRAG_RADIANS_PER_PX = 0.0065;

/**
 * With no pointer, key or scroll activity anywhere on the page for this
 * long, the galaxy slows to a stop and the render loop ends. A visitor who
 * walks away leaves a still picture behind, not a GPU loop; any movement
 * starts it again.
 */
const IDLE_MS = 15_000;

/** The floor grid's spacing, in the map's shared scale: square, because one scale runs along all three axes. */
const GRID_STEP = 0.1;
/**
 * The 2D map's grid colour is tuned for a flat grid seen face on. Laid down
 * as a floor it is seen at a glancing angle and fades out radially, so it
 * needs about three times the strength to read as faintly as the flat one.
 */
const GRID_WEIGHT = 3;

/** How brightly the other passages of a hovered passage's document light up, against 1 for the passage itself. */
const RELATED = 0.4;
/** How far everything outside a hovered document steps back, from 0 to 1. A legend hover steps back fully. */
const RELATED_DIM = 0.6;

/** Nebula clouds per group: one on its middle and two thrown out from it. */
const CLOUDS = 3;
/** Energy pulses that may travel the threads at once, and the points that draw each one's tail. */
const PULSES = 5;
const TRAIL = 6;
/** Spacing of a pulse's tail, in the map's shared scale. */
const TRAIL_STEP = 0.011;

/** Gap between a label and its group's bounding circle, in CSS pixels. */
const LABEL_GAP = 6;
/** Where a label may sit round its group, in order of preference: beside it, then above or below, then at a corner. */
const SIDES: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [-1, 0],
  [0, -1],
  [0, 1],
  [1, -1],
  [-1, -1],
  [1, 1],
  [-1, 1],
];

const CORNERS = [-1, -1, 1, -1, 1, 1, -1, 1];

/**
 * Set once the fly-in has played. A galaxy mounted again in the same visit,
 * after the page's pause control is turned off and on, starts at rest: an
 * arrival that repeats stops meaning arrival.
 */
let arrived = false;

/* ---------------------------------------------------------------------------
 * The model: the same groups, colours, tooltips and questions as the 2D map
 * ------------------------------------------------------------------------- */

/**
 * Colour slots, the 2D map's rule (KnowledgeMap.tsx, buildModel): the three
 * kinds of writing keep fixed colours and repositories take the remaining
 * slots in the order they first appear in the index. Kept identical on
 * purpose, so a star and the dot it replaces are the same colour, say the
 * same thing in their tooltip and ask the same question.
 */
const WRITING_SLOT: Record<string, number> = { "case-study": 0, decision: 1, "interview-answers": 2 };
const FREE_SLOTS = [3, 4, 5, 0, 1, 2];
const NEUTRAL_SLOT = 6;
const SLOT_COUNT = 7;

interface Star {
  id: string;
  index: number;
  doc: number;
  slot: number;
  /** Place of this passage within its document, from 1. */
  ordinal: number;
  /** Centred on the 2D map's frame, in its shared scale, with y pointing up. */
  x: number;
  y: number;
  z: number;
}

interface Doc {
  /** The title, or for code the file name. */
  title: string;
  /** For code, the folder inside the repository. */
  context: string | undefined;
  group: string;
  slot: number;
  passages: number;
  /** How a sentence names it: the quoted title, or the file and its repository. */
  spoken: string;
  question: string;
}

interface Group {
  name: string;
  slot: number;
  passages: number;
  writing: boolean;
  /** The mean of its stars, which its label is placed round. */
  x: number;
  y: number;
  z: number;
  /** Root-mean-square distance of its stars from that mean: the size of its clouds. */
  spread: number;
}

interface Model {
  stars: Star[];
  docs: Doc[];
  groups: Group[];
  /** For each star, the index of its group in `groups`. */
  starGroup: number[];
  /** Star index by chunk id, so a passage made active elsewhere can find its star. */
  byId: Map<string, number>;
  /** Consecutive passages of one document, joined in reading order. */
  segments: Array<[number, number]>;
  /** The farthest star from the centre. */
  radius: number;
  /** The lowest star, which the floor sits just under. */
  floor: number;
  /** The 2D map's plotted extent, which the first, face-on frame is scaled to. */
  spanX: number;
  spanY: number;
  documentCount: number;
  /** Percent of the variance the three axes keep between them. */
  keep: number;
}

const count = (n: number, one: string, many: string): string =>
  `${n.toLocaleString("en-GB")} ${n === 1 ? one : many}`;

const slotClass = (slot: number): string | undefined => mapStyles[`s${String(slot)}`];

function describe(document: MapDocument, slot: number, passages: number): Doc {
  if (document.kind !== "code") {
    return {
      title: document.title,
      context: undefined,
      group: document.group,
      slot,
      passages,
      spoken: `“${document.title}”`,
      question: `Tell me about “${document.title}”`,
    };
  }
  // Code titles are repository paths; the file is the part a person names.
  const segments = document.title.split("/");
  const file = segments[segments.length - 1] ?? document.title;
  const folder = segments.slice(1, -1).join("/");
  const verb = /\.(md|mdx|txt)$/i.test(file) ? "cover" : "do";
  return {
    title: file,
    context: folder === "" ? undefined : folder,
    group: document.group,
    slot,
    passages,
    spoken: `${file} in ${document.group}`,
    question: `What does ${file} in ${document.group} ${verb}?`,
  };
}

function buildModel(map: CorpusMap): Model {
  const aspect = map.aspect > 0 ? map.aspect : 1;
  const spanX = aspect > 1 ? 1 / aspect : 1;
  const spanY = spanX * aspect;

  const slots = new Map<string, number>();
  const used = new Set<number>();
  for (const document of map.documents) {
    const slot = WRITING_SLOT[document.kind];
    if (slot === undefined || slots.has(document.group) || used.has(slot)) continue;
    slots.set(document.group, slot);
    used.add(slot);
  }
  const free = FREE_SLOTS.filter((slot) => !used.has(slot));
  for (const document of map.documents) {
    if (!slots.has(document.group)) slots.set(document.group, free.shift() ?? NEUTRAL_SLOT);
  }

  const passages = map.documents.map(() => 0);
  for (const point of map.points) passages[point.doc] = (passages[point.doc] ?? 0) + 1;
  const docs = map.documents.map((document, i) =>
    describe(document, slots.get(document.group) ?? NEUTRAL_SLOT, passages[i] ?? 0),
  );

  // x and y are centred on the 2D map's frame, so looking straight down the
  // z axis shows the 2D map; z is centred on its own range.
  let zMin = Infinity;
  let zMax = -Infinity;
  for (const point of map.points) {
    zMin = Math.min(zMin, point.z);
    zMax = Math.max(zMax, point.z);
  }
  const zMid = map.points.length === 0 ? 0 : (zMin + zMax) / 2;

  const seen = map.documents.map(() => 0);
  const stars: Star[] = map.points.map((point, index) => {
    const ordinal = (seen[point.doc] ?? 0) + 1;
    seen[point.doc] = ordinal;
    return {
      id: point.id,
      index,
      doc: point.doc,
      slot: docs[point.doc]?.slot ?? NEUTRAL_SLOT,
      ordinal,
      x: point.x - spanX / 2,
      y: spanY / 2 - point.y,
      z: point.z - zMid,
    };
  });

  const segments: Array<[number, number]> = [];
  for (let i = 1; i < stars.length; i += 1) {
    if (stars[i]?.doc === stars[i - 1]?.doc) segments.push([i - 1, i]);
  }

  const totals = new Map<string, { slot: number; writing: boolean; members: Star[] }>();
  for (const star of stars) {
    const document = map.documents[star.doc];
    if (document === undefined) continue;
    const total = totals.get(document.group) ?? { slot: star.slot, writing: document.kind !== "code", members: [] };
    total.members.push(star);
    totals.set(document.group, total);
  }
  const groups: Group[] = [...totals]
    .map(([name, total]) => {
      const n = total.members.length;
      const x = total.members.reduce((sum, star) => sum + star.x, 0) / n;
      const y = total.members.reduce((sum, star) => sum + star.y, 0) / n;
      const z = total.members.reduce((sum, star) => sum + star.z, 0) / n;
      const spread = Math.sqrt(
        total.members.reduce((sum, star) => sum + (star.x - x) ** 2 + (star.y - y) ** 2 + (star.z - z) ** 2, 0) / n,
      );
      return { name, slot: total.slot, passages: n, writing: total.writing, x, y, z, spread };
    })
    .sort((a, b) => Number(b.writing) - Number(a.writing) || a.slot - b.slot);
  const groupIndex = new Map(groups.map((group, g) => [group.name, g]));

  const kept = (map.explained[0] + map.explained[1] + map.explainedZ) * 100;
  return {
    stars,
    docs,
    groups,
    starGroup: stars.map((star) => groupIndex.get(docs[star.doc]?.group ?? "") ?? 0),
    byId: new Map(stars.map((star) => [star.id, star.index])),
    segments,
    radius: Math.max(0.05, ...stars.map((star) => Math.hypot(star.x, star.y, star.z))),
    floor: Math.min(0, ...stars.map((star) => star.y)),
    spanX,
    spanY,
    documentCount: new Set(stars.map((star) => star.doc)).size,
    // Rounded from one decimal, so 36.5% reads as 37% rather than falling to
    // 36% on the float error of the sum.
    keep: Math.round(Number(kept.toFixed(1))),
  };
}

/* ---------------------------------------------------------------------------
 * When to fly, and when to keep the 2D map
 * ------------------------------------------------------------------------- */

const REDUCED = "(prefers-reduced-motion: reduce)";

/**
 * The galaxy is for a precise pointer that can hover, with motion allowed.
 * Everywhere else the 2D map is the better tool, not a lesser one:
 *
 * - Reading a star means hovering it, and touch has no hover. The 2D map's
 *   tap to select, tap again to ask, with a 24px reach, works on a phone;
 *   tapping a two-pixel star in a turning cloud does not.
 * - Dragging to orbit and scrolling the page are the same gesture on a touch
 *   screen, so it would trap the scroll or never turn.
 * - A render loop on a phone costs battery on a page whose job is reading,
 *   and skipping it there also skips downloading three.js at all.
 * - Reduced motion, the page's pause control and Save-Data each ask for less
 *   of exactly this, and get the still, readable map.
 *
 * The media part is one query that KnowledgeGalaxy.module.css repeats word
 * for word, so the server's HTML already has the right layout before any
 * script runs. A browser that does not know one of its features fails it in
 * both places alike. WebGL2 is checked here only by presence; if a context
 * cannot actually be created, the galaxy reports the failure and the map
 * comes back.
 */
const GALAXY_MEDIA =
  "(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference) and (scripting: enabled)";

type Mode = "galaxy" | "flat" | "unknown";

function subscribeCapability(onChange: () => void): () => void {
  const list = window.matchMedia(GALAXY_MEDIA);
  list.addEventListener("change", onChange);
  // The command menu's pause control sets data-motion on <html>.
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-motion"] });
  return () => {
    list.removeEventListener("change", onChange);
    observer.disconnect();
  };
}

function galaxyMode(): Mode {
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  return typeof WebGL2RenderingContext === "function" &&
    window.matchMedia(GALAXY_MEDIA).matches &&
    document.documentElement.dataset["motion"] !== "paused" &&
    connection?.saveData !== true
    ? "galaxy"
    : "flat";
}

/** The server cannot know; the stylesheet decides the layout until the browser does. */
const serverMode = (): Mode => "unknown";

/* ---------------------------------------------------------------------------
 * Paint, read from the 2D map's own tokens
 * ------------------------------------------------------------------------- */

type Rgb = [number, number, number];
type Rgba = [number, number, number, number];

interface Palette {
  dark: boolean;
  /** Per slot: the glow, which is the group colour itself. */
  glow: Rgb[];
  /** Per slot: the core, which the dark theme lifts toward white. */
  core: Rgb[];
  /** The hairline round each core on a light ground. */
  gap: Rgb;
  grid: Rgba;
  glowAlpha: number;
  dim: number;
  line: number;
}

function isDark(): boolean {
  const theme = document.documentElement.dataset["theme"];
  return theme === "dark" || (theme !== "light" && window.matchMedia("(prefers-color-scheme: dark)").matches);
}

/**
 * Resolves the 2D map's palette (light-dark(), var(), color-mix()) to plain
 * sRGB numbers for the GPU. A probe element inside the galaxy's root takes
 * each colour as its `color`, and a one-pixel canvas turns whatever form the
 * browser computed it to (rgb(), oklab(), color()) into bytes.
 */
function readPalette(root: HTMLElement, paint: CanvasRenderingContext2D | null): Palette {
  const probe = document.createElement("span");
  probe.setAttribute("aria-hidden", "true");
  probe.style.cssText = "position:absolute;visibility:hidden;pointer-events:none";
  root.appendChild(probe);

  const resolve = (value: string): Rgba => {
    probe.style.color = "";
    probe.style.color = value;
    const computed = getComputedStyle(probe).color;
    if (paint === null) return [0.5, 0.5, 0.5, 1];
    paint.clearRect(0, 0, 1, 1);
    paint.fillStyle = "#808080";
    paint.fillStyle = computed;
    paint.fillRect(0, 0, 1, 1);
    const [r = 128, g = 128, b = 128, a = 255] = paint.getImageData(0, 0, 1, 1).data;
    return [r / 255, g / 255, b / 255, a / 255];
  };
  const rgb = ([r, g, b]: Rgba): Rgb => [r, g, b];

  const glow: Rgb[] = [];
  const core: Rgb[] = [];
  for (let slot = 0; slot < SLOT_COUNT; slot += 1) {
    probe.className = slotClass(slot) ?? "";
    glow.push(rgb(resolve("var(--c)")));
    // The 2D map's core: the colour itself on a light ground, 72% of it
    // mixed with white on a dark one.
    core.push(rgb(resolve("light-dark(var(--c), color-mix(in oklab, var(--c) 72%, white))")));
  }
  probe.className = "";
  const grid = resolve("var(--km-grid)");
  const gap = rgb(resolve("var(--km-gap)"));

  const css = getComputedStyle(root);
  const number = (name: string, fallback: number): number => {
    const value = Number.parseFloat(css.getPropertyValue(name));
    return Number.isFinite(value) ? value : fallback;
  };
  probe.remove();

  return {
    dark: isDark(),
    glow,
    core,
    gap,
    grid,
    glowAlpha: number("--km-glow", 0.34),
    dim: number("--km-dim", 0.3),
    line: number("--km-line", 0.22),
  };
}

/* ---------------------------------------------------------------------------
 * Shaders. Colours stay in sRGB, as CSS blends them, so a star's glow
 * matches the 2D map's gradient; every output is premultiplied. Every
 * sprite is drawn by its shader, so there are no textures to load or free.
 * ------------------------------------------------------------------------- */

const STAR_VERTEX = /* glsl */ `
attribute vec3 aGlow;
attribute vec3 aCore;
attribute float aEmphasis;
attribute float aDim;
attribute float aSeed;

uniform float uSize;
uniform float uRatio;
uniform float uDistance;
uniform float uTime;
uniform float uTwinkle;
uniform float uWave;
uniform float uDimTo;
uniform vec2 uDepth;

varying vec3 vGlow;
varying vec3 vCore;
varying float vAlpha;
varying float vEmphasis;
varying float vPixel;

void main() {
  vec4 view = modelViewMatrix * vec4(position, 1.0);
  float depth = max(-view.z, 1e-3);
  // Depth reads as distance: the far side of the galaxy is dimmer.
  float far = smoothstep(uDepth.x, uDepth.y, depth);
  // Scintillation from two sines at unrelated rates per star, so no two
  // stars keep step and the pattern never visibly repeats.
  float phase = aSeed * 43.0;
  float twinkle = 1.0 + uTwinkle * (
    0.1 * sin(uTime * (0.55 + 1.2 * aSeed) + phase) +
    0.05 * sin(uTime * (1.9 + 0.7 * fract(aSeed * 7.31)) + phase * 1.7));
  // The arrival: each star lights, with a flash, as the front passes it.
  float r = length(position);
  float lit = 1.0 - smoothstep(uWave - 0.05, uWave, r);
  float front = (r - uWave) * 22.0;
  float flash = exp(-front * front);
  vAlpha = clamp(mix(1.0, 0.42, far) * mix(1.0, uDimTo, aDim) * twinkle, 0.0, 1.0) * max(lit, flash);
  vEmphasis = max(aEmphasis, flash);
  vGlow = aGlow;
  vCore = aCore;
  // The 2D map's size at the centre's depth, scaled by perspective alone.
  float size = uSize * (uDistance / depth) * (1.0 + 0.55 * vEmphasis) * uRatio;
  // A star not yet lit costs no fill at all.
  gl_PointSize = vAlpha < 0.003 ? 0.0 : size;
  vPixel = 2.0 / max(size, 1.0);
  gl_Position = projectionMatrix * view;
}
`;

const STAR_FRAGMENT = /* glsl */ `
uniform float uGlow;
uniform float uCore;
uniform float uGap;
uniform float uRatio;
uniform vec3 uGapColor;

varying vec3 vGlow;
varying vec3 vCore;
varying float vAlpha;
varying float vEmphasis;
varying float vPixel;

void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float r = length(p);
  if (r >= 1.0) discard;
  float aa = vPixel;
  float core = 1.0 - smoothstep(uCore - aa, uCore + aa, r);
  // On a light ground, a hairline of the stage colour keeps touching cores
  // apart, as the 2D map's stroke does.
  float hair = uRatio * vPixel;
  float gap = uGap * (1.0 - smoothstep(uCore + hair - aa, uCore + hair + aa, r)) * (1.0 - core);
  // The 2D map's glow: a Gaussian, exp(-(2.2r)^2), peaking at --km-glow.
  float glow = uGlow * exp(-4.84 * r * r) * (1.0 + 0.7 * vEmphasis);
  vec4 color = vec4(vGlow * glow, glow);
  color = mix(color, vec4(uGapColor, 1.0), gap);
  color = mix(color, vec4(vCore, 1.0), core);
  gl_FragColor = color * vAlpha;
}
`;

/**
 * A wide, faint bloom behind a star, drawn from the stars' own geometry. It
 * shows while a star flares, while it or its document is pointed at, and as
 * the arrival's front passes; at any other moment its sprite has no size,
 * so it costs no fill.
 */
const HALO_VERTEX = /* glsl */ `
attribute vec3 aGlow;
attribute float aEmphasis;
attribute float aDim;
attribute float aSeed;

uniform float uSize;
uniform float uRatio;
uniform float uDistance;
uniform float uTime;
uniform float uTwinkle;
uniform float uWave;
uniform float uDimTo;
uniform vec2 uDepth;

varying vec3 vColor;
varying float vAlpha;

void main() {
  vec4 view = modelViewMatrix * vec4(position, 1.0);
  float depth = max(-view.z, 1e-3);
  float far = smoothstep(uDepth.x, uDepth.y, depth);
  // A slow sine raised to a high power is zero most of the time and peaks
  // briefly, so at any moment a handful of stars flare and fade.
  float swell = sin(uTime * (0.3 + 0.45 * fract(aSeed * 13.7)) + aSeed * 91.0);
  float flare = uTwinkle * pow(max(swell, 0.0), 16.0);
  float r = length(position);
  float lit = 1.0 - smoothstep(uWave - 0.05, uWave, r);
  float front = (r - uWave) * 18.0;
  float flash = exp(-front * front);
  float strength = max(max(flare * 0.85, aEmphasis) * lit, flash);
  vAlpha = strength * mix(1.0, 0.55, far) * mix(1.0, uDimTo, aDim);
  vColor = aGlow;
  gl_PointSize = vAlpha < 0.01 ? 0.0 : uSize * (uDistance / depth) * uRatio * (0.75 + 0.45 * strength);
  gl_Position = projectionMatrix * view;
}
`;

const HALO_FRAGMENT = /* glsl */ `
uniform float uAlpha;
uniform float uRays;

varying vec3 vColor;
varying float vAlpha;

void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot(p, p);
  if (r2 >= 1.0) discard;
  float bloom = exp(-6.0 * r2) * (1.0 - r2);
  // Four thin, faint rays, as a bright star photographs through a lens.
  float rays = uRays * 0.5 * (exp(-abs(p.x) * 46.0) + exp(-abs(p.y) * 46.0)) * (1.0 - sqrt(r2));
  float a = clamp(uAlpha * vAlpha * (bloom + rays), 0.0, 1.0);
  gl_FragColor = vec4(vColor * a, a);
}
`;

const LINE_VERTEX = /* glsl */ `
attribute vec3 aColor;
attribute float aDim;
attribute float aEmphasis;

uniform vec2 uDepth;
uniform float uDimTo;
uniform float uWave;

varying vec3 vColor;
varying float vAlpha;

void main() {
  vec4 view = modelViewMatrix * vec4(position, 1.0);
  float far = smoothstep(uDepth.x, uDepth.y, -view.z);
  // A thread lights with its stars in the arrival, and brightens with a hovered document.
  float lit = 1.0 - smoothstep(uWave - 0.12, uWave, length(position));
  vAlpha = mix(1.0, 0.4, far) * mix(1.0, uDimTo * 0.5, aDim) * (1.0 + 2.6 * aEmphasis) * lit;
  vColor = aColor;
  gl_Position = projectionMatrix * view;
}
`;

const LINE_FRAGMENT = /* glsl */ `
uniform float uAlpha;

varying vec3 vColor;
varying float vAlpha;

void main() {
  float a = min(uAlpha * vAlpha, 0.85);
  gl_FragColor = vec4(vColor * a, a);
}
`;

/* The fade is worked out per fragment: a grid line has a vertex only at each
 * end, both outside the fade, so a per-vertex fade would blank every line. */
const GRID_VERTEX = /* glsl */ `
varying vec2 vFloor;

void main() {
  vFloor = position.xz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const GRID_FRAGMENT = /* glsl */ `
uniform vec4 uColor;
uniform float uShow;
uniform float uExtent;

varying vec2 vFloor;

void main() {
  float fade = 1.0 - smoothstep(0.15, 1.0, length(vFloor) / uExtent);
  float a = uColor.a * fade * fade * uShow;
  gl_FragColor = vec4(uColor.rgb * a, a);
}
`;

/**
 * Each star's shadow on the floor: its place on the plane of the first and
 * third components, so the floor is itself a second, true projection. Drawn
 * as a soft disc squashed by the viewing angle, so it lies on the floor
 * rather than facing the camera.
 */
const SHADOW_VERTEX = /* glsl */ `
attribute vec3 aGlow;
attribute float aDim;

uniform float uSize;
uniform float uRatio;
uniform float uDistance;
uniform float uDimTo;

varying vec3 vColor;
varying float vAlpha;

void main() {
  vec4 view = modelViewMatrix * vec4(position, 1.0);
  float depth = max(-view.z, 1e-3);
  gl_PointSize = uSize * (uDistance / depth) * uRatio;
  vColor = aGlow;
  vAlpha = mix(1.0, uDimTo * 0.5, aDim);
  gl_Position = projectionMatrix * view;
}
`;

const SHADOW_FRAGMENT = /* glsl */ `
uniform float uAlpha;
uniform float uShow;
uniform float uSquash;

varying vec3 vColor;
varying float vAlpha;

void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  p.y /= uSquash;
  float r2 = dot(p, p);
  if (r2 >= 1.0) discard;
  float a = uAlpha * uShow * vAlpha * exp(-4.0 * r2) * (1.0 - r2);
  gl_FragColor = vec4(vColor * a, a);
}
`;

/** The line from the star under the pointer down to its shadow, which shows where in depth it sits. */
const DROP_VERTEX = /* glsl */ `
varying float vAlong;

void main() {
  vAlong = float(gl_VertexID);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const DROP_FRAGMENT = /* glsl */ `
uniform vec3 uColor;
uniform float uAlpha;

varying float vAlong;

void main() {
  // Strongest at the star, fading toward the floor.
  float a = uAlpha * mix(1.0, 0.25, vAlong);
  gl_FragColor = vec4(uColor * a, a);
}
`;

/**
 * Nebulae: a few camera-facing quads per group, since point sprites are
 * capped in size by the GPU. Each cloud is lopsided, two soft lobes at
 * seeded places on a Gaussian body, so its very slow turn about its own
 * centre, and a small drifting loop, read as weather rather than as a disc.
 */
const CLOUD_VERTEX = /* glsl */ `
attribute vec2 aCorner;
attribute vec3 aColor;
attribute float aSize;
attribute float aDim;
attribute float aSeed;

uniform float uTime;

varying vec2 vUv;
varying vec3 vColor;
varying float vDim;
varying float vSeed;
varying vec4 vLobes;

void main() {
  vec4 view = modelViewMatrix * vec4(position, 1.0);
  float turn = aSeed * 6.2832 + uTime * (0.018 + 0.02 * aSeed) * (aSeed > 0.5 ? 1.0 : -1.0);
  float c = cos(turn);
  float s = sin(turn);
  vec2 corner = vec2(c * aCorner.x - s * aCorner.y, s * aCorner.x + c * aCorner.y);
  view.xy += vec2(cos(uTime * 0.05 + aSeed * 9.0), sin(uTime * 0.043 + aSeed * 5.0)) * aSize * 0.1;
  view.xy += corner * aSize;
  vUv = aCorner;
  vColor = aColor;
  vDim = aDim;
  vSeed = aSeed;
  float angle = aSeed * 6.2832;
  vLobes = vec4(cos(angle), sin(angle), cos(angle + 2.4), sin(angle + 2.4)) * vec4(0.34, 0.34, 0.44, 0.44);
  gl_Position = projectionMatrix * view;
}
`;

const CLOUD_FRAGMENT = /* glsl */ `
uniform float uAlpha;
uniform float uDimTo;
uniform float uShow;

varying vec2 vUv;
varying vec3 vColor;
varying float vDim;
varying float vSeed;
varying vec4 vLobes;

void main() {
  float r2 = dot(vUv, vUv);
  if (r2 >= 1.0) discard;
  vec2 a = vUv - vLobes.xy;
  vec2 b = vUv - vLobes.zw;
  float body = exp(-3.2 * r2);
  float lobes = exp(-8.0 * dot(a, a)) + 0.75 * exp(-10.0 * dot(b, b));
  float wisp = 0.82 + 0.18 * sin(vUv.x * 6.5 + vSeed * 21.0) * sin(vUv.y * 5.5 - vSeed * 13.0);
  float alpha = uAlpha * uShow * (0.5 * body + 0.5 * lobes) * wisp * (1.0 - r2) * mix(1.0, uDimTo * 0.4, vDim);
  gl_FragColor = vec4(vColor * alpha, alpha);
}
`;

/** Energy pulses: a bright head and a short tail, placed along the threads by the CPU each frame. */
const PULSE_VERTEX = /* glsl */ `
attribute vec3 aColor;
attribute float aAlpha;

uniform float uSize;
uniform float uRatio;
uniform float uDistance;

varying vec3 vColor;
varying float vAlpha;

void main() {
  vec4 view = modelViewMatrix * vec4(position, 1.0);
  float depth = max(-view.z, 1e-3);
  vColor = aColor;
  vAlpha = aAlpha;
  gl_PointSize = aAlpha < 0.004 ? 0.0 : uSize * (uDistance / depth) * uRatio * (0.55 + 0.45 * aAlpha);
  gl_Position = projectionMatrix * view;
}
`;

const PULSE_FRAGMENT = /* glsl */ `
uniform float uWhite;

varying vec3 vColor;
varying float vAlpha;

void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot(p, p);
  if (r2 >= 1.0) discard;
  float core = exp(-28.0 * r2);
  float glow = 0.5 * exp(-6.0 * r2);
  // In the dark the head burns white hot; on a light ground white would
  // vanish, so there it keeps its colour.
  vec3 color = mix(vColor, vec3(1.0), core * 0.75 * uWhite);
  float a = clamp(vAlpha * (core + glow) * (1.0 - r2), 0.0, 1.0);
  gl_FragColor = vec4(color * a, a);
}
`;

/* ---------------------------------------------------------------------------
 * The engine, kept outside React. Everything that changes per frame lives in
 * this closure, so a frame never touches component state; React hears from
 * it only when the first frame is up, when the star under the pointer
 * changes, when the fly-in settles, and if the GPU gives out.
 * ------------------------------------------------------------------------- */

interface Dom {
  /** Carries the 2D map's palette variables, which the probe reads. */
  root: HTMLElement;
  /** The clipped layer the canvas and the labels live in. */
  host: HTMLElement;
  /** Its children are the group labels, in `model.groups` order. */
  labels: HTMLElement;
  ring: HTMLElement;
  tip: HTMLElement;
  /** The legend's chips along the bottom of the stage: the galaxy is framed above them. */
  legend: HTMLElement;
  /** The drag hint in the stage's top corner, which labels keep clear of. */
  hint: HTMLElement;
}

interface Events {
  ready: () => void;
  hover: (index: number | null) => void;
  settled: () => void;
  fail: () => void;
}

interface Engine {
  /** The pointer moved over the stage without a button down. */
  move: (clientX: number, clientY: number) => void;
  leave: () => void;
  grab: (clientX: number, clientY: number) => void;
  drag: (clientX: number, clientY: number) => void;
  release: () => void;
  /** The star nearest a point on screen, within `reach` CSS pixels. */
  pick: (clientX: number, clientY: number, reach: number) => number | null;
  /** The star the ring, the tooltip and the emphasis follow. */
  point: (index: number | null) => void;
  /** Brings one group forward and steps the rest back, or clears with null. */
  focus: (slot: number | null) => void;
  /** Holds the rotation still while the keyboard is in the galaxy. */
  hold: (on: boolean) => void;
  /** Moves the ring onto a star now, so a question can launch from it. */
  place: (index: number) => void;
  destroy: () => void;
}

/** One energy pulse's run along a document's thread, in reading order. */
interface Run {
  /** The passage the run starts from, or -1 while the slot waits. */
  from: number;
  hops: number;
  /** Distance travelled along the thread, in the map's shared scale. */
  at: number;
  length: number;
  speed: number;
  /** Distance at which the next passage is reached. */
  edge: number;
  passed: number;
  /** Seconds until the slot launches again. */
  wait: number;
}

/** One group label's layout state, kept between frames and reused, never reallocated. */
interface Name {
  element: HTMLElement | undefined;
  group: Group;
  index: number;
  w: number;
  h: number;
  anchorX: number;
  anchorY: number;
  depth: number;
  radius: number;
  /** Where the label's corner is drawn, and where it is going, relative to its anchor. */
  offX: number;
  offY: number;
  goalX: number;
  goalY: number;
  /** The candidate place chosen last layout, or -1 when nothing fitted. */
  choice: number;
  opacity: number;
  writtenOpacity: number;
  writtenX: number;
  writtenY: number;
}

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const smoothstep = (edge0: number, edge1: number, x: number): number => {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
};
const easeInOut = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const easeOut = (t: number): number => 1 - (1 - t) ** 3;
/** An element of a typed array or tuple, as a number. */
const num = (array: ArrayLike<number>, i: number): number => array[i] ?? 0;

/** Exponential approach, scaled by the frame's duration, so 60Hz and 120Hz screens settle alike. */
function approach(value: number, target: number, dt: number, rate: number): number {
  const next = target + (value - target) * Math.exp(-dt * rate);
  return Math.abs(next - target) < 0.002 ? target : next;
}

/** A stable pseudo-random number in [0, 1) per index, for twinkle phases and cloud placement. */
function hash(i: number): number {
  const s = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/** A small seeded generator (mulberry32), so the pulses run the same course on every visit. */
function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Every layer draws in one call, without depth; applyPalette sets its blending per theme. */
function layerMaterial(
  three: ThreeModule,
  uniforms: Record<string, { value: unknown }>,
  vertexShader: string,
  fragmentShader: string,
): Three.ShaderMaterial {
  return new three.ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
}

function createGalaxy(three: ThreeModule, dom: Dom, model: Model, events: Events): Engine {
  const canvas = document.createElement("canvas");
  canvas.className = styles.gl ?? "";
  canvas.setAttribute("aria-hidden", "true");
  dom.host.prepend(canvas);

  let renderer: Three.WebGLRenderer;
  try {
    renderer = new three.WebGLRenderer({
      canvas,
      alpha: true,
      premultipliedAlpha: true,
      antialias: true,
      powerPreference: "low-power",
    });
  } catch (error) {
    canvas.remove();
    throw error;
  }

  let failed = false;
  /** Whether the renderer's animation loop is on. It runs only while something moves. */
  let running = false;
  const pause = (): void => {
    if (!running) return;
    running = false;
    renderer.setAnimationLoop(null);
  };
  const fail = (): void => {
    if (failed) return;
    failed = true;
    pause();
    events.fail();
  };
  // A shader that does not compile would leave an empty stage; the map is better.
  renderer.debug.onShaderError = (gl, program, vertex, fragment) => {
    if (process.env.NODE_ENV !== "production") {
      const logs = [gl.getProgramInfoLog(program), gl.getShaderInfoLog(vertex), gl.getShaderInfoLog(fragment)];
      console.warn("The knowledge galaxy is showing the 2D map instead:", ...logs.filter(Boolean));
    }
    fail();
  };
  renderer.setClearColor(0x000000, 0);

  // Reduced motion is sent to the 2D map before it gets here (galaxyMode),
  // so this is a backstop: if it ever did run, it would hold still, with no
  // turn, twinkle, drifting cloud, pulse or fly-in.
  const still = window.matchMedia(REDUCED).matches;

  const scene = new three.Scene();
  const camera = new three.PerspectiveCamera(FOV_FLAT, 1, 0.02, 60);
  const target = new three.Vector3();
  const galaxy = new three.Group();
  scene.add(galaxy);

  /* Stars ------------------------------------------------------------------ */

  const n = model.stars.length;
  const positions = new Float32Array(n * 3);
  const glowColors = new Float32Array(n * 3);
  const coreColors = new Float32Array(n * 3);
  /** What the GPU draws: the eased hover emphasis plus the spark a pulse leaves on arrival. */
  const emphasis = new Float32Array(n);
  const eased = new Float32Array(n);
  const sparks = new Float32Array(n);
  const dims = new Float32Array(n);
  const seeds = new Float32Array(n);
  const order = new Uint16Array(n);
  model.stars.forEach((star, i) => {
    positions[i * 3] = star.x;
    positions[i * 3 + 1] = star.y;
    positions[i * 3 + 2] = star.z;
    seeds[i] = hash(i);
    order[i] = i;
  });

  const starGeometry = new three.BufferGeometry();
  starGeometry.setAttribute("position", new three.BufferAttribute(positions, 3));
  const glowAttribute = new three.BufferAttribute(glowColors, 3);
  const coreAttribute = new three.BufferAttribute(coreColors, 3);
  const emphasisAttribute = new three.BufferAttribute(emphasis, 1).setUsage(three.DynamicDrawUsage);
  const dimAttribute = new three.BufferAttribute(dims, 1).setUsage(three.DynamicDrawUsage);
  const orderAttribute = new three.BufferAttribute(order, 1).setUsage(three.DynamicDrawUsage);
  starGeometry.setAttribute("aGlow", glowAttribute);
  starGeometry.setAttribute("aCore", coreAttribute);
  starGeometry.setAttribute("aEmphasis", emphasisAttribute);
  starGeometry.setAttribute("aDim", dimAttribute);
  starGeometry.setAttribute("aSeed", new three.BufferAttribute(seeds, 1));
  starGeometry.setIndex(orderAttribute);

  const starUniforms = {
    uSize: { value: STAR_PX },
    uRatio: { value: 1 },
    uDistance: { value: 1 },
    uTime: { value: 0 },
    uTwinkle: { value: still ? 0 : 1 },
    uWave: { value: -1 },
    uDimTo: { value: 0.3 },
    uDepth: { value: new three.Vector2(1, 2) },
    uGlow: { value: 0.34 },
    uCore: { value: CORE_FRACTION },
    uGap: { value: 0 },
    uGapColor: { value: new three.Vector3(1, 1, 1) },
  };
  const starMaterial = layerMaterial(three, starUniforms, STAR_VERTEX, STAR_FRAGMENT);
  const stars = new three.Points(starGeometry, starMaterial);
  stars.frustumCulled = false;
  stars.renderOrder = 4;
  galaxy.add(stars);

  /* Halos, from the stars' own geometry, so one can never drift from its star */

  const haloUniforms = {
    uSize: { value: STAR_PX * 3.4 },
    uRatio: starUniforms.uRatio,
    uDistance: starUniforms.uDistance,
    uTime: starUniforms.uTime,
    uTwinkle: starUniforms.uTwinkle,
    uWave: starUniforms.uWave,
    uDimTo: starUniforms.uDimTo,
    uDepth: starUniforms.uDepth,
    uAlpha: { value: 0.22 },
    uRays: { value: 1 },
  };
  const haloMaterial = layerMaterial(three, haloUniforms, HALO_VERTEX, HALO_FRAGMENT);
  const halos = new three.Points(starGeometry, haloMaterial);
  halos.frustumCulled = false;
  halos.renderOrder = 3;
  galaxy.add(halos);

  /* Reading-order threads, the only lines between stars ---------------------- */

  const segmentCount = model.segments.length;
  const linePositions = new Float32Array(segmentCount * 6);
  const lineColors = new Float32Array(segmentCount * 6);
  const lineDims = new Float32Array(segmentCount * 2);
  const lineEmphasis = new Float32Array(segmentCount * 2);
  model.segments.forEach(([from, to], k) => {
    for (let axis = 0; axis < 3; axis += 1) {
      linePositions[k * 6 + axis] = num(positions, from * 3 + axis);
      linePositions[k * 6 + 3 + axis] = num(positions, to * 3 + axis);
    }
  });
  const lineGeometry = new three.BufferGeometry();
  lineGeometry.setAttribute("position", new three.BufferAttribute(linePositions, 3));
  const lineColorAttribute = new three.BufferAttribute(lineColors, 3);
  const lineDimAttribute = new three.BufferAttribute(lineDims, 1).setUsage(three.DynamicDrawUsage);
  const lineEmphasisAttribute = new three.BufferAttribute(lineEmphasis, 1).setUsage(three.DynamicDrawUsage);
  lineGeometry.setAttribute("aColor", lineColorAttribute);
  lineGeometry.setAttribute("aDim", lineDimAttribute);
  lineGeometry.setAttribute("aEmphasis", lineEmphasisAttribute);
  const lineUniforms = {
    uAlpha: { value: 0.22 },
    uDimTo: { value: 0.3 },
    uDepth: starUniforms.uDepth,
    uWave: starUniforms.uWave,
  };
  const lineMaterial = layerMaterial(three, lineUniforms, LINE_VERTEX, LINE_FRAGMENT);
  const threads = new three.LineSegments(lineGeometry, lineMaterial);
  threads.frustumCulled = false;
  threads.renderOrder = 2;
  galaxy.add(threads);

  /* Nebulae: where each group's passages sit, as faint coloured weather ----- */

  const groupCount = model.groups.length;
  const cloudCount = groupCount * CLOUDS;
  const cloudCentres = new Float32Array(cloudCount * 12);
  const cloudCorners = new Float32Array(cloudCount * 8);
  const cloudColors = new Float32Array(cloudCount * 12);
  const cloudSizes = new Float32Array(cloudCount * 4);
  const cloudDims = new Float32Array(cloudCount * 4);
  const cloudSeeds = new Float32Array(cloudCount * 4);
  const cloudIndex = new Uint16Array(cloudCount * 6);
  model.groups.forEach((group, g) => {
    for (let k = 0; k < CLOUDS; k += 1) {
      const c = g * CLOUDS + k;
      // The first cloud sits on the group's middle; the others are thrown a
      // seeded way out from it, so each group's haze is uneven, like a real one.
      const theta = hash(2000 + c * 13) * Math.PI * 2;
      const tilt = Math.acos(2 * hash(3000 + c * 17) - 1);
      const out = k === 0 ? 0 : group.spread * 0.7;
      const x = group.x + out * Math.sin(tilt) * Math.cos(theta);
      const y = group.y + out * Math.cos(tilt);
      const z = group.z + out * Math.sin(tilt) * Math.sin(theta);
      // Small groups still get a visible cloud; large ones are held back so
      // the notebooks do not wash over everything.
      const size = clamp(group.spread * (k === 0 ? 2.4 : 1.7), 0.07, 0.4);
      const seed = hash(1000 + c * 7);
      for (let corner = 0; corner < 4; corner += 1) {
        const v = c * 4 + corner;
        cloudCentres[v * 3] = x;
        cloudCentres[v * 3 + 1] = y;
        cloudCentres[v * 3 + 2] = z;
        cloudCorners[v * 2] = num(CORNERS, corner * 2);
        cloudCorners[v * 2 + 1] = num(CORNERS, corner * 2 + 1);
        cloudSizes[v] = size;
        cloudSeeds[v] = seed;
      }
      cloudIndex.set([c * 4, c * 4 + 1, c * 4 + 2, c * 4, c * 4 + 2, c * 4 + 3], c * 6);
    }
  });
  const cloudGeometry = new three.BufferGeometry();
  cloudGeometry.setAttribute("position", new three.BufferAttribute(cloudCentres, 3));
  cloudGeometry.setAttribute("aCorner", new three.BufferAttribute(cloudCorners, 2));
  const cloudColorAttribute = new three.BufferAttribute(cloudColors, 3);
  const cloudDimAttribute = new three.BufferAttribute(cloudDims, 1).setUsage(three.DynamicDrawUsage);
  cloudGeometry.setAttribute("aColor", cloudColorAttribute);
  cloudGeometry.setAttribute("aSize", new three.BufferAttribute(cloudSizes, 1));
  cloudGeometry.setAttribute("aDim", cloudDimAttribute);
  cloudGeometry.setAttribute("aSeed", new three.BufferAttribute(cloudSeeds, 1));
  cloudGeometry.setIndex(new three.BufferAttribute(cloudIndex, 1));
  const cloudUniforms = {
    uAlpha: { value: 0.06 },
    uDimTo: { value: 0.3 },
    uShow: { value: 0 },
    uTime: starUniforms.uTime,
  };
  const cloudMaterial = layerMaterial(three, cloudUniforms, CLOUD_VERTEX, CLOUD_FRAGMENT);
  const clouds = new three.Mesh(cloudGeometry, cloudMaterial);
  clouds.frustumCulled = false;
  clouds.renderOrder = 1;
  galaxy.add(clouds);

  /* The floor: the 2D map's square grid, laid down under the galaxy -------- */

  const extent = Math.ceil((model.radius * 1.6) / GRID_STEP) * GRID_STEP;
  const floorY = model.floor - 0.12;
  const gridLines: number[] = [];
  for (let v = -extent; v <= extent + 1e-6; v += GRID_STEP) {
    gridLines.push(v, floorY, -extent, v, floorY, extent, -extent, floorY, v, extent, floorY, v);
  }
  const gridGeometry = new three.BufferGeometry();
  gridGeometry.setAttribute("position", new three.BufferAttribute(new Float32Array(gridLines), 3));
  const gridUniforms = {
    uExtent: { value: extent },
    uColor: { value: new three.Vector4(0, 0, 0, 0.05) },
    uShow: { value: 0 },
  };
  const gridMaterial = layerMaterial(three, gridUniforms, GRID_VERTEX, GRID_FRAGMENT);
  const grid = new three.LineSegments(gridGeometry, gridMaterial);
  grid.frustumCulled = false;
  grid.renderOrder = 0;
  scene.add(grid);

  /* Shadows on the floor, and the drop line under the pointed star ----------- */

  const shadowPositions = new Float32Array(n * 3);
  model.stars.forEach((star, i) => {
    shadowPositions[i * 3] = star.x;
    shadowPositions[i * 3 + 1] = floorY;
    shadowPositions[i * 3 + 2] = star.z;
  });
  const shadowGeometry = new three.BufferGeometry();
  shadowGeometry.setAttribute("position", new three.BufferAttribute(shadowPositions, 3));
  // The stars' own colour and dimming, shared rather than copied.
  shadowGeometry.setAttribute("aGlow", glowAttribute);
  shadowGeometry.setAttribute("aDim", dimAttribute);
  const shadowUniforms = {
    uSize: { value: STAR_PX * 1.1 },
    uRatio: starUniforms.uRatio,
    uDistance: starUniforms.uDistance,
    uDimTo: starUniforms.uDimTo,
    uAlpha: { value: 0.16 },
    uShow: { value: 0 },
    uSquash: { value: 0.4 },
  };
  const shadowMaterial = layerMaterial(three, shadowUniforms, SHADOW_VERTEX, SHADOW_FRAGMENT);
  const shadows = new three.Points(shadowGeometry, shadowMaterial);
  shadows.frustumCulled = false;
  shadows.renderOrder = 0;
  galaxy.add(shadows);

  const dropPositions = new Float32Array(6);
  const dropAttribute = new three.BufferAttribute(dropPositions, 3).setUsage(three.DynamicDrawUsage);
  const dropGeometry = new three.BufferGeometry();
  dropGeometry.setAttribute("position", dropAttribute);
  const dropUniforms = {
    uColor: { value: new three.Vector3(1, 1, 1) },
    uAlpha: { value: 0 },
  };
  const dropMaterial = layerMaterial(three, dropUniforms, DROP_VERTEX, DROP_FRAGMENT);
  const drop = new three.LineSegments(dropGeometry, dropMaterial);
  drop.frustumCulled = false;
  drop.renderOrder = 2;
  galaxy.add(drop);
  /** The star the drop line hangs from; kept after the pointer leaves, so the line can fade. */
  let dropIndex: number | null = null;

  /* Energy pulses along the threads -------------------------------------------- */

  const pulsePositions = new Float32Array(PULSES * TRAIL * 3);
  const pulseColors = new Float32Array(PULSES * TRAIL * 3);
  const pulseAlphas = new Float32Array(PULSES * TRAIL);
  const pulseGeometry = new three.BufferGeometry();
  const pulsePositionAttribute = new three.BufferAttribute(pulsePositions, 3).setUsage(three.DynamicDrawUsage);
  const pulseColorAttribute = new three.BufferAttribute(pulseColors, 3).setUsage(three.DynamicDrawUsage);
  const pulseAlphaAttribute = new three.BufferAttribute(pulseAlphas, 1).setUsage(three.DynamicDrawUsage);
  pulseGeometry.setAttribute("position", pulsePositionAttribute);
  pulseGeometry.setAttribute("aColor", pulseColorAttribute);
  pulseGeometry.setAttribute("aAlpha", pulseAlphaAttribute);
  const pulseUniforms = {
    uSize: { value: STAR_PX * 0.9 },
    uRatio: starUniforms.uRatio,
    uDistance: starUniforms.uDistance,
    uWhite: { value: 1 },
  };
  const pulseMaterial = layerMaterial(three, pulseUniforms, PULSE_VERTEX, PULSE_FRAGMENT);
  const pulses = new three.Points(pulseGeometry, pulseMaterial);
  pulses.frustumCulled = false;
  pulses.renderOrder = 5;
  galaxy.add(pulses);

  /** Distance from each passage to the next one of its document, or 0 at a document's last passage. */
  const hopLength = new Float32Array(n);
  const runStarts: number[] = [];
  const docFirst = new Int32Array(model.docs.length).fill(-1);
  const docLast = new Int32Array(model.docs.length).fill(-1);
  model.stars.forEach((star, i) => {
    if (num(docFirst, star.doc) < 0) docFirst[star.doc] = i;
    docLast[star.doc] = i;
    const next = model.stars[i + 1];
    if (next === undefined || next.doc !== star.doc) return;
    const length = Math.hypot(next.x - star.x, next.y - star.y, next.z - star.z);
    hopLength[i] = length;
    if (length > 0) runStarts.push(i);
  });
  const runs: Run[] = Array.from({ length: PULSES }, (_, k) => ({
    from: -1,
    hops: 0,
    at: 0,
    length: 0,
    speed: 0,
    edge: 0,
    passed: 0,
    // Staggered, so the first pulses do not all leave together.
    wait: 0.6 + k * 0.85,
  }));
  const random = seededRandom(0x2545f491);
  let pulsesInFlight = false;

  const materials = [
    starMaterial,
    haloMaterial,
    lineMaterial,
    cloudMaterial,
    gridMaterial,
    shadowMaterial,
    dropMaterial,
    pulseMaterial,
  ];
  const geometries = [starGeometry, lineGeometry, cloudGeometry, gridGeometry, shadowGeometry, dropGeometry, pulseGeometry];

  /* Theme -------------------------------------------------------------------- */

  const paint = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
  let palette = readPalette(dom.root, paint);
  let gridAlpha = 0.05;

  function applyPalette(): void {
    palette = readPalette(dom.root, paint);
    // Additive light on a dark ground, so overlapping glows brighten the way
    // light does; ordinary compositing on a light one, where additive light
    // would wash out to white. The 2D map makes the same switch with
    // mix-blend-mode: plus-lighter.
    for (const material of materials) {
      material.blending = three.CustomBlending;
      material.blendEquation = three.AddEquation;
      material.blendEquationAlpha = three.AddEquation;
      material.blendSrc = three.OneFactor;
      material.blendSrcAlpha = three.OneFactor;
      material.blendDst = palette.dark ? three.OneFactor : three.OneMinusSrcAlphaFactor;
      material.blendDstAlpha = palette.dark ? three.OneFactor : three.OneMinusSrcAlphaFactor;
      material.premultipliedAlpha = true;
    }
    model.stars.forEach((star, i) => {
      glowColors.set(palette.glow[star.slot] ?? [0.5, 0.5, 0.5], i * 3);
      coreColors.set(palette.core[star.slot] ?? [0.5, 0.5, 0.5], i * 3);
    });
    model.segments.forEach(([from], k) => {
      const color = palette.glow[model.stars[from]?.slot ?? NEUTRAL_SLOT] ?? [0.5, 0.5, 0.5];
      lineColors.set(color, k * 6);
      lineColors.set(color, k * 6 + 3);
    });
    model.groups.forEach((group, g) => {
      const color = palette.glow[group.slot] ?? [0.5, 0.5, 0.5];
      for (let v = g * CLOUDS * 4; v < (g + 1) * CLOUDS * 4; v += 1) cloudColors.set(color, v * 3);
    });
    glowAttribute.needsUpdate = true;
    coreAttribute.needsUpdate = true;
    lineColorAttribute.needsUpdate = true;
    cloudColorAttribute.needsUpdate = true;

    starUniforms.uGlow.value = palette.glowAlpha;
    starUniforms.uDimTo.value = palette.dim;
    starUniforms.uGap.value = palette.dark ? 0 : 1;
    starUniforms.uGapColor.value.set(...palette.gap);
    lineUniforms.uDimTo.value = palette.dim;
    cloudUniforms.uDimTo.value = palette.dim;
    cloudUniforms.uAlpha.value = palette.dark ? 0.06 : 0.05;
    haloUniforms.uAlpha.value = palette.dark ? 0.22 : 0.13;
    // Lens rays are a thing of light on dark; on paper they would read as scratches.
    haloUniforms.uRays.value = palette.dark ? 1 : 0;
    pulseUniforms.uWhite.value = palette.dark ? 1 : 0;
    shadowUniforms.uAlpha.value = palette.dark ? 0.16 : 0.1;
    const [r, g, b, a] = palette.grid;
    gridAlpha = a;
    gridUniforms.uColor.value.set(r, g, b, gridAlpha * ratio * GRID_WEIGHT);
    layoutDirty = true;
    request();
  }

  /* Size and framing ---------------------------------------------------------- */

  let width = 0;
  let height = 0;
  let ratio = 1;
  /** Pixels per unit of the shared scale at the galaxy's centre: face on at the start, and at rest. */
  let flatScale = 1;
  let restScale = 1;
  let restDistance = 2;
  /** The legend's height at the bottom of the stage, which the galaxy is framed above. */
  let insetBottom = 0;
  /** The vertical offset last written into the projection, so it is rewritten only when it changes. */
  let shifted = Number.NaN;

  /**
   * The closest the camera can rest, at its resting tilt, with every star in
   * view at every turn of the galaxy and above the legend: tighter than a
   * bounding sphere, which would leave the galaxy small in its stage, and
   * safe through a full turn.
   */
  function restingDistance(): number {
    const tanV = Math.tan((FOV * Math.PI) / 360);
    const tanH = tanV * (width / height);
    const margin = 18;
    const usable = Math.max(40, height - insetBottom);
    const limitX = tanH * Math.max(0.2, 1 - (2 * margin) / width);
    const limitY = tanV * (usable / height) * Math.max(0.2, 1 - (2 * margin) / usable);
    const sp = Math.sin(PITCH_REST);
    const cp = Math.cos(PITCH_REST);
    let needed = 0;
    for (let step = 0; step < 24; step += 1) {
      const yaw = (step / 24) * Math.PI * 2;
      const sy = Math.sin(yaw);
      const cy = Math.cos(yaw);
      for (const star of model.stars) {
        // Camera axes for this yaw and the resting pitch: right, up, and back toward the camera.
        const right = star.x * cy - star.z * sy;
        const up = -star.x * sp * sy + star.y * cp - star.z * sp * cy;
        const back = star.x * cp * sy + star.y * sp + star.z * cp * cy;
        needed = Math.max(needed, back + Math.abs(right) / limitX, back + Math.abs(up) / limitY);
      }
    }
    return Math.max(needed, model.radius * 1.2);
  }

  function resize(): void {
    const box = dom.host.getBoundingClientRect();
    const w = Math.round(box.width);
    const h = Math.round(box.height);
    if (w < 8 || h < 8) return;
    width = w;
    height = h;
    ratio = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    renderer.setPixelRatio(ratio);
    renderer.setSize(w, h, false);
    starUniforms.uRatio.value = ratio;
    // A WebGL line is one device pixel wide whatever the ratio; the 2D map's
    // threads are 0.8 CSS px and its grid 1 CSS px, so their opacity carries
    // the difference in weight.
    lineUniforms.uAlpha.value = palette.line * 0.8 * ratio;
    gridUniforms.uColor.value.w = gridAlpha * ratio * GRID_WEIGHT;

    // The legend and the hint share the stage's corner with the canvas, so
    // offsets from the stage are offsets from the canvas.
    const legendTop = dom.legend.offsetHeight > 0 ? dom.legend.offsetTop : h;
    insetBottom = clamp(h - legendTop + 6, 0, h * 0.45);
    keepOut.x0 = dom.hint.offsetLeft - 6;
    keepOut.y0 = dom.hint.offsetTop - 4;
    keepOut.x1 = dom.hint.offsetLeft + dom.hint.offsetWidth + 6;
    keepOut.y1 = dom.hint.offsetTop + dom.hint.offsetHeight + 4;

    const pad = 16;
    flatScale = Math.max(1, Math.min((w - 2 * pad) / model.spanX, (h - insetBottom - 2 * pad) / model.spanY));
    restDistance = restingDistance();
    restScale = h / (2 * restDistance * Math.tan((FOV * Math.PI) / 360));
    measureLabels();
    layoutDirty = true;
    request();
  }

  /* Labels: one per group, laid out each frame the camera moves ----------- */

  const labelElements = [...dom.labels.children] as HTMLElement[];
  const names: Name[] = model.groups.map((group, index) => ({
    element: labelElements[index],
    group,
    index,
    w: 0,
    h: 0,
    anchorX: 0,
    anchorY: 0,
    depth: 0,
    radius: 0,
    offX: 0,
    offY: 0,
    goalX: 0,
    goalY: 0,
    choice: -1,
    opacity: 0,
    writtenOpacity: -1,
    writtenX: Number.NaN,
    writtenY: Number.NaN,
  }));
  /** Bigger groups choose first; when space runs out it is the smallest that fade. */
  const byPriority = [...names].sort((a, b) => b.group.passages - a.group.passages);
  /** The boxes placed so far in a layout, as x0, y0, x1, y1, reused every frame. */
  const placed = new Float32Array(names.length * 4);
  /** The drag hint's box, which no label may cover. */
  const keepOut = { x0: 0, y0: 0, x1: 0, y1: 0 };

  function measureLabels(): void {
    for (const name of names) {
      if (name.element === undefined) continue;
      name.w = name.element.offsetWidth;
      name.h = name.element.offsetHeight;
    }
  }

  /* State ---------------------------------------------------------------------- */

  let yawBase = 0;
  let pitchBase = 0;
  let yawVelocity = 0;
  let pitchVelocity = 0;
  let auto = 0;
  let autoTarget = 0;
  let introStart = -1;
  let progress = 0;
  let unfold = 0;
  let show = 0;
  let labelsShow = 0;
  let time = 0;
  let last = -1;
  let drawn = false;
  let settled = false;
  let onScreen = true;
  let inView = false;
  let lastActivity = performance.now();
  let dragging = false;
  let holding = false;
  let inside = false;
  let pointerX = 0;
  let pointerY = 0;
  let lastDrag = { x: 0, y: 0, t: 0 };
  let pointed: number | null = null;
  let hovered: number | null = null;
  let focusSlot: number | null = null;
  let easing = false;
  /** Set when something other than the camera changes where things fall on screen. */
  let layoutDirty = true;
  let frames = 0;
  let layouts = 0;
  let skipped = 0;

  const world = new three.Vector3();
  const viewSpace = new three.Vector3();
  /** Every star's place on screen and depth, from the last frame drawn: what the pointer is measured against. */
  const sx = new Float32Array(n);
  const sy = new Float32Array(n);
  const sd = new Float32Array(n);
  const projected = { x: 0, y: 0, depth: 0 };
  /** The camera as last laid out: its world matrix, the projection terms that move the picture, and the unfold. */
  const cameraKey = new Float64Array(20);
  const groupDim = new Float32Array(groupCount);

  function request(): void {
    if (running || failed) return;
    running = true;
    renderer.setAnimationLoop(tick);
  }

  const idle = (now: number): boolean => now - lastActivity > IDLE_MS;

  /** Where a point of the galaxy is drawn, in CSS pixels from the stage's corner, and how far it is from the camera. */
  function project(x: number, y: number, z: number): void {
    world.set(x, y, z).applyMatrix4(galaxy.matrixWorld);
    viewSpace.copy(world).applyMatrix4(camera.matrixWorldInverse);
    world.project(camera);
    projected.x = (world.x + 1) * 0.5 * width;
    projected.y = (1 - world.y) * 0.5 * height;
    projected.depth = -viewSpace.z;
  }

  function projectStars(): void {
    for (let i = 0; i < n; i += 1) {
      project(num(positions, i * 3), num(positions, i * 3 + 1), num(positions, i * 3 + 2));
      sx[i] = projected.x;
      sy[i] = projected.y;
      sd[i] = projected.depth;
    }
  }

  function cameraMoved(): boolean {
    const e = camera.matrixWorld.elements;
    const p = camera.projectionMatrix.elements;
    let moved = false;
    for (let i = 0; i < 20; i += 1) {
      const value =
        i < 16 ? num(e, i) : i === 16 ? num(p, 0) : i === 17 ? num(p, 5) : i === 18 ? num(p, 9) : galaxy.scale.z;
      if (Math.abs(value - num(cameraKey, i)) > 1e-7) {
        cameraKey[i] = value;
        moved = true;
      }
    }
    return moved;
  }

  function nearest(x: number, y: number, reach: number): number | null {
    // Stars still unlit in the arrival cannot be picked.
    if (progress < 0.6) return null;
    let best: number | null = null;
    let bestScore = Infinity;
    for (let i = 0; i < n; i += 1) {
      const depth = num(sd, i);
      if (depth <= camera.near) continue;
      const distance = Math.hypot(num(sx, i) - x, num(sy, i) - y);
      if (distance > reach) continue;
      // Between stars about equally close on screen, the nearer one wins:
      // it is the one drawn on top.
      const score = distance + depth * 2;
      if (score < bestScore) {
        bestScore = score;
        best = i;
      }
    }
    return best;
  }

  function placeCamera(): void {
    const ease = easeInOut(progress);
    // The fly-in is a dolly zoom: from a narrow, nearly orthographic view of
    // the still-flat galaxy, the camera flies in as the field of view
    // widens, so perspective, and with it depth, arrives as the galaxy
    // unfolds along its third axis.
    const fov = lerp(FOV_FLAT, FOV, ease);
    const scale = lerp(flatScale, restScale, ease);
    const distance = height / (2 * scale * Math.tan((fov * Math.PI) / 360));
    const yaw = yawBase + YAW_REST * ease;
    const pitch = clamp(pitchBase + PITCH_REST * ease, -PITCH_LIMIT, PITCH_LIMIT);
    const aspect = width / height;
    const shift = insetBottom / height;

    if (camera.fov !== fov || camera.aspect !== aspect || shifted !== shift) {
      camera.fov = fov;
      camera.aspect = aspect;
      camera.updateProjectionMatrix();
      // An off-centre frustum lifts the picture into the middle of the space
      // above the legend. A pan would do it too, but would make the galaxy
      // swing about a point below its centre as it turns.
      camera.projectionMatrix.elements[9] = -shift;
      camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
      shifted = shift;
    }
    const cp = Math.cos(pitch);
    target.set(0, 0, 0);
    camera.position.set(Math.sin(yaw) * cp * distance, Math.sin(pitch) * distance, Math.cos(yaw) * cp * distance);
    camera.lookAt(target);
    camera.updateMatrixWorld();

    galaxy.scale.set(1, 1, Math.max(unfold, 1e-4));
    galaxy.updateMatrixWorld();

    starUniforms.uDistance.value = distance;
    starUniforms.uDepth.value.set(distance - model.radius, distance + model.radius);
    // A disc on the floor, seen from this elevation, is this much shorter than it is wide.
    shadowUniforms.uSquash.value = Math.max(Math.sin(Math.abs(pitch)), 0.12);
  }

  function launch(run: Run, k: number, preferDoc: number): void {
    let from = runStarts[Math.floor(random() * runStarts.length)] ?? -1;
    // While a passage is pointed at, most pulses run along its own document.
    const first = preferDoc >= 0 ? num(docFirst, preferDoc) : -1;
    const lastStar = preferDoc >= 0 ? num(docLast, preferDoc) : -1;
    if (first >= 0 && lastStar > first && random() < 0.75) from = first + Math.floor(random() * (lastStar - first));
    if (from < 0) {
      run.wait = 1;
      return;
    }
    const want = 2 + Math.floor(random() * 4);
    let hops = 0;
    let length = 0;
    while (hops < want && num(hopLength, from + hops) > 0) {
      length += num(hopLength, from + hops);
      hops += 1;
    }
    if (hops === 0) {
      run.wait = 0.4;
      return;
    }
    run.from = from;
    run.hops = hops;
    run.at = 0;
    run.length = length;
    run.passed = 0;
    run.edge = num(hopLength, from);
    // Slow enough to follow, and never so quick on a short run that it is only a blink.
    run.speed = Math.min(0.12 + random() * 0.1, length / 0.7);
    const color = palette.glow[model.stars[from]?.slot ?? NEUTRAL_SLOT] ?? [1, 1, 1];
    for (let j = 0; j < TRAIL; j += 1) pulseColors.set(color, (k * TRAIL + j) * 3);
    pulseColorAttribute.needsUpdate = true;
  }

  /** Writes the point a distance `s` along a run's thread into the pulse positions at `offset`. */
  function along(run: Run, s: number, offset: number): void {
    let from = run.from;
    let left = Math.max(0, s);
    for (let h = 0; h < run.hops; h += 1, from += 1) {
      const length = num(hopLength, from);
      if (left > length && h < run.hops - 1) {
        left -= length;
        continue;
      }
      const t = length > 0 ? Math.min(1, left / length) : 0;
      for (let axis = 0; axis < 3; axis += 1) {
        const a = num(positions, from * 3 + axis);
        pulsePositions[offset + axis] = a + (num(positions, (from + 1) * 3 + axis) - a) * t;
      }
      return;
    }
  }

  function advancePulses(dt: number, launching: boolean, preferDoc: number): void {
    let inFlight = false;
    for (let k = 0; k < runs.length; k += 1) {
      const run = runs[k];
      if (run === undefined) continue;
      if (run.from < 0 && launching) {
        run.wait -= dt;
        if (run.wait <= 0) launch(run, k, preferDoc);
      }
      if (run.from < 0) {
        pulseAlphas.fill(0, k * TRAIL, (k + 1) * TRAIL);
        continue;
      }
      inFlight = true;
      run.at += run.speed * dt;
      // Each passage a pulse reaches flares for a moment, as if the energy arrived.
      while (run.passed < run.hops && run.at >= run.edge) {
        run.passed += 1;
        const reached = run.from + run.passed;
        sparks[reached] = 1;
        run.edge += num(hopLength, reached);
      }
      if (run.at >= run.length) {
        run.from = -1;
        run.wait = 0.5 + random() * 2.4;
        pulseAlphas.fill(0, k * TRAIL, (k + 1) * TRAIL);
        continue;
      }
      const life = Math.min(1, run.at / (0.18 * run.length), (run.length - run.at) / (0.22 * run.length));
      const fade = 1 - 0.75 * num(dims, run.from);
      for (let j = 0; j < TRAIL; j += 1) {
        const s = run.at - j * TRAIL_STEP;
        const index = k * TRAIL + j;
        if (s < 0) {
          pulseAlphas[index] = 0;
          continue;
        }
        along(run, s, index * 3);
        pulseAlphas[index] = life * fade * (1 - j / TRAIL) ** 1.6;
      }
    }
    pulsesInFlight = inFlight;
    pulsePositionAttribute.needsUpdate = true;
    pulseAlphaAttribute.needsUpdate = true;
  }

  function step(now: number, dt: number): void {
    if (introStart < 0 && (still || arrived || inView) && !document.hidden) {
      introStart = still || arrived ? now - INTRO_MS : now;
    }
    progress = introStart < 0 ? 0 : clamp((now - introStart) / INTRO_MS, 0, 1);
    unfold = smoothstep(0.1, 0.85, progress);
    show = smoothstep(0.35, 1, progress);
    labelsShow = smoothstep(0.72, 1, progress);
    // The arrival's front runs from the centre to past the farthest star in
    // the first 60% of the fly-in, fast at first and slowing as it goes.
    starUniforms.uWave.value =
      progress >= 1 ? 1e3 : lerp(-0.08, model.radius + 0.12, easeOut(clamp(progress / 0.6, 0, 1)));
    cloudUniforms.uShow.value = show;
    gridUniforms.uShow.value = show;
    shadowUniforms.uShow.value = show;
    if (progress >= 1 && !settled) {
      settled = true;
      arrived = true;
      events.settled();
    }

    autoTarget = !still && introStart >= 0 && !inside && !dragging && !holding && !idle(now) ? 1 : 0;
    // Slow to start, quicker to stop: it should never feel like it lurches.
    auto = approach(auto, autoTarget, dt, autoTarget > auto ? 0.9 : 2.4);

    if (!dragging) {
      yawBase += yawVelocity * dt;
      pitchBase += pitchVelocity * dt;
      const decay = Math.exp(-dt * 3.2);
      yawVelocity = Math.abs(yawVelocity * decay) < 0.003 ? 0 : yawVelocity * decay;
      pitchVelocity = Math.abs(pitchVelocity * decay) < 0.003 ? 0 : pitchVelocity * decay;
      // Once the hand is off and the throw has died, the tilt eases back to
      // the resting one; the turn stays wherever it was left.
      if (pitchVelocity === 0 && !inside) pitchBase = approach(pitchBase, 0, dt, 0.8);
    }
    pitchBase = clamp(pitchBase, -PITCH_LIMIT - PITCH_REST, PITCH_LIMIT - PITCH_REST);
    yawBase += CRUISE * auto * dt;
    // Kept small, so the float the GPU never sees cannot lose precision either.
    if (Math.abs(yawBase) > Math.PI * 4) yawBase %= Math.PI * 2;
    if (!still) time += dt;
    starUniforms.uTime.value = time;

    const pointedDoc = pointed === null ? -1 : (model.stars[pointed]?.doc ?? -1);
    // Pulses run once the galaxy has arrived; once the page goes idle no new
    // ones leave, and those in flight finish.
    if (settled && !still) advancePulses(dt, !idle(now), pointedDoc);

    // The pointed star, its document's other passages, and how far
    // everything else steps back, eased per star.
    easing = false;
    let emphasisMoved = false;
    let dimMoved = false;
    const sparkDecay = Math.exp(-dt * 4.5);
    for (let i = 0; i < n; i += 1) {
      const star = model.stars[i];
      if (star === undefined) continue;
      const related = pointedDoc >= 0 && star.doc === pointedDoc;
      const emphasisTarget = i === pointed ? 1 : related ? RELATED : 0;
      const nextEased = approach(num(eased, i), emphasisTarget, dt, 14);
      eased[i] = nextEased;
      const spark = num(sparks, i) * sparkDecay;
      sparks[i] = spark < 0.01 ? 0 : spark;
      const shown = Math.min(1, nextEased + num(sparks, i) * 0.6);
      if (shown !== num(emphasis, i)) {
        emphasis[i] = shown;
        emphasisMoved = true;
      }
      const dimTarget =
        focusSlot !== null ? (star.slot === focusSlot ? 0 : 1) : pointedDoc >= 0 && !related ? RELATED_DIM : 0;
      const nextDim = approach(num(dims, i), dimTarget, dt, 9);
      if (nextDim !== num(dims, i)) {
        dims[i] = nextDim;
        dimMoved = true;
      }
      if (nextEased !== emphasisTarget || nextDim !== dimTarget || num(sparks, i) > 0) easing = true;
    }
    if (emphasisMoved) {
      emphasisAttribute.needsUpdate = true;
      model.segments.forEach(([from, to], k) => {
        lineEmphasis[k * 2] = num(eased, from);
        lineEmphasis[k * 2 + 1] = num(eased, to);
      });
      lineEmphasisAttribute.needsUpdate = true;
    }

    if (pointed !== null && pointed !== dropIndex) {
      dropIndex = pointed;
      const x = num(positions, pointed * 3);
      const z = num(positions, pointed * 3 + 2);
      dropPositions.set([x, num(positions, pointed * 3 + 1), z, x, floorY, z]);
      dropAttribute.needsUpdate = true;
      dropUniforms.uColor.value.set(...(palette.glow[model.stars[pointed]?.slot ?? NEUTRAL_SLOT] ?? [1, 1, 1]));
    }
    // The line follows the star's emphasis, so it fades with it.
    dropUniforms.uAlpha.value = dropIndex === null ? 0 : num(eased, dropIndex) * 0.6 * show;

    if (dimMoved) {
      dimAttribute.needsUpdate = true;
      model.segments.forEach(([from, to], k) => {
        lineDims[k * 2] = num(dims, from);
        lineDims[k * 2 + 1] = num(dims, to);
      });
      lineDimAttribute.needsUpdate = true;
      // A group's clouds step back by the mean of its stars.
      groupDim.fill(0);
      for (let i = 0; i < n; i += 1) {
        const g = model.starGroup[i] ?? 0;
        groupDim[g] = num(groupDim, g) + num(dims, i);
      }
      model.groups.forEach((group, g) => {
        cloudDims.fill(num(groupDim, g) / Math.max(1, group.passages), g * CLOUDS * 4, (g + 1) * CLOUDS * 4);
      });
      cloudDimAttribute.needsUpdate = true;
    }

    placeCamera();
    // Stars move on screen only when the camera does. Otherwise their
    // projection, the light theme's depth order and the label layout all
    // stand, and are skipped.
    if (cameraMoved() || layoutDirty) {
      layoutDirty = false;
      projectStars();
      // On a light ground stars composite in order, so draw them back to front.
      if (!palette.dark) {
        order.sort((a, b) => num(sd, b) - num(sd, a));
        orderAttribute.needsUpdate = true;
      }
      layoutLabels();
      layouts += 1;
    } else {
      skipped += 1;
    }

    // The galaxy turns under a still pointer, so the star under it can change.
    if (inside && !dragging) report(nearest(pointerX, pointerY, REACH.mouse));
  }

  function report(index: number | null): void {
    if (index === hovered) return;
    hovered = index;
    events.hover(index);
  }

  /**
   * Places each group's label beside its group, never on it. Each label's
   * anchor is its group's middle on screen, with a bounding circle from the
   * spread of its stars there. Groups choose in priority order, biggest
   * first, from eight places round the circle (then eight closer in, at a
   * cost), refusing any that leave the stage, cover the hint or touch a
   * label already placed, and preferring the place that covers fewest stars
   * and the one chosen last time. A label with nowhere to go fades out.
   */
  function layoutLabels(): void {
    for (const name of names) {
      project(name.group.x, name.group.y, name.group.z);
      name.anchorX = projected.x;
      name.anchorY = projected.y;
      name.depth = projected.depth;
      let sum = 0;
      let members = 0;
      for (let i = 0; i < n; i += 1) {
        if (model.starGroup[i] !== name.index) continue;
        const dx = num(sx, i) - name.anchorX;
        const dy = num(sy, i) - name.anchorY;
        sum += dx * dx + dy * dy;
        members += 1;
      }
      name.radius = clamp(Math.sqrt(sum / Math.max(1, members)) * 1.15 + 4, 6, Math.min(width, height) * 0.3);
    }

    const maxX = width - 6;
    const maxY = height - insetBottom - 2;
    let placedCount = 0;
    for (const name of byPriority) {
      let best = -1;
      let bestScore = Infinity;
      let bestX = 0;
      let bestY = 0;
      for (let c = 0; c < SIDES.length * 2; c += 1) {
        const side = SIDES[c % SIDES.length];
        if (side === undefined) continue;
        const [ax, ay] = side;
        const inner = c >= SIDES.length;
        const diagonal = ax !== 0 && ay !== 0 ? Math.SQRT1_2 : 1;
        const away = (inner ? name.radius * 0.45 : name.radius) + LABEL_GAP;
        const x0 = name.anchorX + ax * diagonal * away + ((ax - 1) * name.w) / 2;
        const y0 = name.anchorY + ay * diagonal * away + ((ay - 1) * name.h) / 2;
        const x1 = x0 + name.w;
        const y1 = y0 + name.h;
        if (x0 < 6 || y0 < 6 || x1 > maxX || y1 > maxY) continue;
        if (x0 < keepOut.x1 && x1 > keepOut.x0 && y0 < keepOut.y1 && y1 > keepOut.y0) continue;
        let clash = false;
        for (let p = 0; p < placedCount && !clash; p += 1) {
          clash =
            x0 < num(placed, p * 4 + 2) + 4 &&
            x1 > num(placed, p * 4) - 4 &&
            y0 < num(placed, p * 4 + 3) + 3 &&
            y1 > num(placed, p * 4 + 1) - 3;
        }
        if (clash) continue;
        let score = (c % SIDES.length) * 0.1 + (inner ? 2.5 : 0) - (c === name.choice ? 0.75 : 0);
        for (let i = 0; i < n; i += 1) {
          const x = num(sx, i);
          const y = num(sy, i);
          if (x > x0 - 3 && x < x1 + 3 && y > y0 - 3 && y < y1 + 3) score += 1;
        }
        if (score < bestScore) {
          bestScore = score;
          best = c;
          bestX = x0;
          bestY = y0;
        }
      }
      name.choice = best;
      if (best < 0) continue;
      name.goalX = bestX - name.anchorX;
      name.goalY = bestY - name.anchorY;
      placed[placedCount * 4] = bestX;
      placed[placedCount * 4 + 1] = bestY;
      placed[placedCount * 4 + 2] = bestX + name.w;
      placed[placedCount * 4 + 3] = bestY + name.h;
      placedCount += 1;
    }
  }

  /**
   * Eases each label toward its place and its opacity. The place is kept
   * relative to the anchor, so a label follows its group exactly as the
   * galaxy turns and only a change of side glides; while it glides it dips
   * nearly out of sight, so a move reads as a fade, never a jump. Labels
   * leave faster than they arrive.
   */
  function fadeLabels(dt: number): void {
    // While a tooltip is up it names the group itself; labels step back
    // rather than show through its glass.
    const quiet = pointed === null ? 1 : 0.32;
    const distance = starUniforms.uDistance.value;
    for (const name of names) {
      const element = name.element;
      if (element === undefined) continue;
      const far = smoothstep(distance - model.radius, distance + model.radius, name.depth);
      const focused = focusSlot === null || name.group.slot === focusSlot ? 1 : 0.25;
      const gap = Math.hypot(name.goalX - name.offX, name.goalY - name.offY);
      const goal =
        name.choice < 0
          ? 0
          : labelsShow * focused * quiet * lerp(1, 0.6, far) * (1 - 0.85 * clamp(gap / 28, 0, 1));
      if (name.opacity < 0.02) {
        name.offX = name.goalX;
        name.offY = name.goalY;
      } else {
        name.offX = approach(name.offX, name.goalX, dt, 12);
        name.offY = approach(name.offY, name.goalY, dt, 12);
      }
      const next = drawn ? approach(name.opacity, goal, dt, goal > name.opacity ? 8 : 14) : goal;
      name.opacity = next;
      if (next !== goal || name.offX !== name.goalX || name.offY !== name.goalY) easing = true;
      const x = name.anchorX + name.offX;
      const y = name.anchorY + name.offY;
      if (!(Math.abs(x - name.writtenX) < 0.05 && Math.abs(y - name.writtenY) < 0.05)) {
        element.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
        name.writtenX = x;
        name.writtenY = y;
      }
      if (Math.abs(next - name.writtenOpacity) > 0.003 || (next === 0 && name.writtenOpacity !== 0)) {
        element.style.opacity = next.toFixed(3);
        name.writtenOpacity = next;
      }
    }
  }

  function track(dt: number): void {
    if (pointed !== null) {
      const x = num(sx, pointed);
      const y = num(sy, pointed);
      const depth = Math.max(num(sd, pointed), 1e-3);
      const transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
      dom.ring.style.transform = `${transform} scale(${clamp(starUniforms.uDistance.value / depth, 0.8, 1.5).toFixed(3)})`;
      dom.tip.style.transform = transform;
      dom.tip.style.setProperty("--ax", clamp(x / width, 0, 1).toFixed(3));
      dom.tip.toggleAttribute("data-below", y < 118);
    }
    fadeLabels(dt);
  }

  function wantsFrames(now: number): boolean {
    if (!onScreen || document.hidden) return false;
    if (introStart >= 0 && progress < 1) return true;
    if (dragging || yawVelocity !== 0 || pitchVelocity !== 0) return true;
    if (auto !== 0 || (autoTarget !== 0 && !idle(now))) return true;
    if (pitchBase !== 0 && !inside) return true;
    // Twinkle, drifting clouds and pulses keep it alive until the page has
    // been idle a while; pulses already in flight finish first.
    if (!still && settled && (!idle(now) || pulsesInFlight)) return true;
    return easing;
  }

  function tick(now: number): void {
    if (failed || width === 0) {
      pause();
      return;
    }
    const dt = last < 0 ? 0 : Math.min((now - last) / 1000, 0.1);
    last = now;
    step(now, dt);
    renderer.render(scene, camera);
    track(dt);
    frames += 1;
    if (!drawn) {
      drawn = true;
      events.ready();
    }
    if (!wantsFrames(now)) {
      pause();
      last = -1;
    }
  }

  /* Wiring ---------------------------------------------------------------------- */

  const resizer = new ResizeObserver(resize);
  resizer.observe(dom.host);

  const visibility = new IntersectionObserver(
    (entries) => {
      const entry = entries[entries.length - 1];
      if (entry === undefined) return;
      onScreen = entry.isIntersecting;
      // The fly-in waits until enough of the stage is on screen to be seen.
      inView = entry.intersectionRatio >= 0.3;
      last = -1;
      request();
    },
    { threshold: [0, 0.3] },
  );
  visibility.observe(dom.host);

  const onVisibility = (): void => {
    last = -1;
    if (document.hidden) pause();
    else request();
  };
  const wake = (): void => {
    const now = performance.now();
    const wasIdle = idle(now);
    lastActivity = now;
    if (wasIdle) request();
  };
  const themeWatcher = new MutationObserver(applyPalette);
  themeWatcher.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  const systemTheme = window.matchMedia("(prefers-color-scheme: dark)");
  const onLost = (): void => {
    fail();
  };

  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("resize", resize);
  for (const type of ["pointermove", "pointerdown", "keydown", "wheel"] as const) {
    window.addEventListener(type, wake, { passive: true });
  }
  window.addEventListener("scroll", wake, { passive: true, capture: true });
  systemTheme.addEventListener("change", applyPalette);
  canvas.addEventListener("webglcontextlost", onLost);
  // Labels and chips are measured in the page's font; until it has loaded
  // they would be measured in the fallback.
  document.fonts.ready.then(
    () => {
      if (!failed) resize();
    },
    () => undefined,
  );

  applyPalette();
  resize();

  // A read-out for checking motion in development without filming frames:
  // frame and layout counts, pulses in flight, and where each label sits.
  if (process.env.NODE_ENV !== "production") {
    Object.assign(window, {
      __knowledgeGalaxy: {
        stats: () => ({
          frames,
          layouts,
          skipped,
          running,
          progress: Number(progress.toFixed(3)),
          settled,
          auto: Number(auto.toFixed(3)),
          time: Number(time.toFixed(2)),
          pulses: runs.filter((run) => run.from >= 0).length,
          inset: Math.round(insetBottom),
          size: [width, height],
          labels: names.map((name) => ({
            text: name.group.name,
            opacity: Number(name.opacity.toFixed(2)),
            side: name.choice,
            box: [Math.round(name.anchorX + name.offX), Math.round(name.anchorY + name.offY), name.w, name.h],
          })),
        }),
      },
    });
  }

  const toLocal = (clientX: number, clientY: number): { x: number; y: number } => {
    const box = dom.host.getBoundingClientRect();
    return { x: clientX - box.left, y: clientY - box.top };
  };

  return {
    move(clientX, clientY) {
      const local = toLocal(clientX, clientY);
      pointerX = local.x;
      pointerY = local.y;
      if (!inside) {
        inside = true;
        request();
      }
      if (!dragging) report(nearest(pointerX, pointerY, REACH.mouse));
    },
    leave() {
      inside = false;
      report(null);
      request();
    },
    grab(clientX, clientY) {
      dragging = true;
      yawVelocity = 0;
      pitchVelocity = 0;
      lastDrag = { x: clientX, y: clientY, t: performance.now() };
      report(null);
      request();
    },
    drag(clientX, clientY) {
      if (!dragging) return;
      const now = performance.now();
      const dx = clientX - lastDrag.x;
      const dy = clientY - lastDrag.y;
      const dt = Math.max((now - lastDrag.t) / 1000, 1 / 240);
      yawBase -= dx * DRAG_RADIANS_PER_PX;
      pitchBase += dy * DRAG_RADIANS_PER_PX;
      // The throw is the recent velocity, smoothed, so a flick carries on
      // turning and a slow drag that stops before release does not.
      yawVelocity = lerp(yawVelocity, (-dx * DRAG_RADIANS_PER_PX) / dt, 0.35);
      pitchVelocity = lerp(pitchVelocity, (dy * DRAG_RADIANS_PER_PX) / dt, 0.35);
      lastDrag = { x: clientX, y: clientY, t: now };
      request();
    },
    release() {
      if (!dragging) return;
      dragging = false;
      if (performance.now() - lastDrag.t > 90) {
        yawVelocity = 0;
        pitchVelocity = 0;
      }
      yawVelocity = clamp(yawVelocity, -6, 6);
      pitchVelocity = clamp(pitchVelocity, -4, 4);
      request();
    },
    pick(clientX, clientY, reach) {
      const local = toLocal(clientX, clientY);
      return nearest(local.x, local.y, reach);
    },
    point(index) {
      pointed = index;
      easing = true;
      request();
    },
    focus(slot) {
      focusSlot = slot;
      easing = true;
      request();
    },
    hold(on) {
      holding = on;
      request();
    },
    place(index) {
      dom.ring.style.transform = `translate3d(${num(sx, index).toFixed(1)}px, ${num(sy, index).toFixed(1)}px, 0)`;
    },
    destroy() {
      failed = true;
      pause();
      resizer.disconnect();
      visibility.disconnect();
      themeWatcher.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("resize", resize);
      for (const type of ["pointermove", "pointerdown", "keydown", "wheel"] as const) {
        window.removeEventListener(type, wake);
      }
      window.removeEventListener("scroll", wake, { capture: true });
      systemTheme.removeEventListener("change", applyPalette);
      canvas.removeEventListener("webglcontextlost", onLost);
      // Geometry and materials are all there is to free: no layer uses a texture.
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
      renderer.dispose();
      // The canvas is this engine's own, never reused (React's StrictMode
      // remount gets a new one), so its context can be released at once
      // rather than waiting for garbage collection.
      if (!renderer.getContext().isContextLost()) renderer.forceContextLoss();
      canvas.remove();
      if (process.env.NODE_ENV !== "production") Reflect.deleteProperty(window, "__knowledgeGalaxy");
    },
  };
}

/* ---------------------------------------------------------------------------
 * The 3D figure
 * ------------------------------------------------------------------------- */

function Galaxy({
  model,
  onAsk,
  activeId,
  live,
  onFail,
}: {
  model: Model;
  onAsk?: AskHandler;
  activeId?: string | null;
  /** Whether the engine may run. The frame renders either way, so the server's HTML has the galaxy's layout. */
  live: boolean;
  onFail: () => void;
}) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");

  const root = useRef<HTMLDivElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const labels = useRef<HTMLDivElement>(null);
  const ring = useRef<HTMLSpanElement>(null);
  const tip = useRef<HTMLDivElement>(null);
  const legendList = useRef<HTMLUListElement>(null);
  const hintNote = useRef<HTMLParagraphElement>(null);
  const engine = useRef<Engine | null>(null);
  const failRef = useRef(onFail);
  // What the engine should show the moment it exists, for anything pointed
  // at or focused while three.js was still loading.
  const latest = useRef<{ pointed: number | null; focusSlot: number | null; keyboard: boolean }>({
    pointed: null,
    focusSlot: null,
    keyboard: false,
  });
  const press = useRef<{ id: number; x: number; y: number; moved: boolean; touch: boolean } | null>(null);

  const [ready, setReady] = useState(false);
  const [settled, setSettled] = useState(false);
  const [turned, setTurned] = useState(false);
  const [hover, setHover] = useState<number | null>(null);
  const [touched, setTouched] = useState<number | null>(null);
  const [cursor, setCursor] = useState<number | null>(null);
  const [keyboard, setKeyboard] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [focusSlot, setFocusSlot] = useState<number | null>(null);

  useEffect(() => {
    failRef.current = onFail;
  }, [onFail]);

  useEffect(() => {
    if (!live) return;
    const dom =
      root.current === null ||
      host.current === null ||
      labels.current === null ||
      ring.current === null ||
      tip.current === null ||
      legendList.current === null ||
      hintNote.current === null
        ? null
        : {
            root: root.current,
            host: host.current,
            labels: labels.current,
            ring: ring.current,
            tip: tip.current,
            legend: legendList.current,
            hint: hintNote.current,
          };
    if (dom === null) return;
    let disposed = false;
    let created: Engine | null = null;
    // three.js loads here, on the client, only once the galaxy is allowed:
    // it never enters the first-load bundle, and phones never fetch it.
    import("three").then(
      (three) => {
        if (disposed) return;
        try {
          created = createGalaxy(three, dom, model, {
            ready: () => {
              setReady(true);
            },
            hover: (index) => {
              setHover(index);
            },
            settled: () => {
              setSettled(true);
            },
            fail: () => {
              failRef.current();
            },
          });
          engine.current = created;
          created.point(latest.current.pointed);
          created.focus(latest.current.focusSlot);
          created.hold(latest.current.keyboard);
        } catch (error) {
          if (process.env.NODE_ENV !== "production") console.warn("The knowledge galaxy is showing the 2D map instead:", error);
          failRef.current();
        }
      },
      (error: unknown) => {
        if (disposed) return;
        if (process.env.NODE_ENV !== "production") console.warn("three.js did not load; showing the 2D map:", error);
        failRef.current();
      },
    );
    return () => {
      disposed = true;
      created?.destroy();
      engine.current = null;
    };
  }, [model, live]);

  const activeIndex = activeId === undefined || activeId === null ? null : (model.byId.get(activeId) ?? null);
  // What the tooltip and the ring describe: the star under the mouse, else
  // the one tapped, else the keyboard's, else the one the page made active.
  // Nothing while dragging.
  const pointed = dragging ? null : (hover ?? touched ?? (keyboard ? cursor : null) ?? activeIndex);
  const pointedStar = pointed === null ? undefined : model.stars[pointed];
  const pointedDoc = pointedStar === undefined ? undefined : model.docs[pointedStar.doc];

  useEffect(() => {
    latest.current = { ...latest.current, pointed };
    engine.current?.point(pointed);
  }, [pointed]);

  useEffect(() => {
    latest.current = { ...latest.current, focusSlot };
    engine.current?.focus(focusSlot);
  }, [focusSlot]);

  useEffect(() => {
    latest.current = { ...latest.current, keyboard };
    engine.current?.hold(keyboard);
  }, [keyboard]);

  const ask = (index: number): void => {
    const star = model.stars[index];
    const doc = star === undefined ? undefined : model.docs[star.doc];
    const origin = ring.current;
    if (onAsk === undefined || doc === undefined || origin === null) return;
    engine.current?.place(index);
    onAsk(doc.question, origin);
  };

  /** First passage of the next document, or of this one or the previous one going back. */
  const jump = (from: number, direction: 1 | -1): number => {
    const stars = model.stars;
    const doc = stars[from]?.doc;
    if (direction === 1) {
      for (let i = from + 1; i < stars.length; i += 1) if (stars[i]?.doc !== doc) return i;
      return from;
    }
    let start = from;
    while (start > 0 && stars[start - 1]?.doc === doc) start -= 1;
    if (start !== from || start === 0) return start;
    const previous = stars[start - 1]?.doc;
    let first = start - 1;
    while (first > 0 && stars[first - 1]?.doc === previous) first -= 1;
    return first;
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const lastIndex = model.stars.length - 1;
    if (lastIndex < 0) return;
    let next: number;
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        next = cursor === null ? 0 : Math.min(lastIndex, cursor + 1);
        break;
      case "ArrowLeft":
      case "ArrowUp":
        next = cursor === null ? 0 : Math.max(0, cursor - 1);
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = lastIndex;
        break;
      case "PageDown":
        next = cursor === null ? 0 : jump(cursor, 1);
        break;
      case "PageUp":
        next = cursor === null ? 0 : jump(cursor, -1);
        break;
      case "Enter":
        if (cursor === null || onAsk === undefined) return;
        event.preventDefault();
        ask(cursor);
        return;
      case "Escape":
        // Nothing to clear: let the key reach whatever is listening outside.
        if (cursor === null && touched === null) return;
        event.preventDefault();
        setCursor(null);
        setTouched(null);
        return;
      default:
        return;
    }
    event.preventDefault();
    setKeyboard(true);
    setCursor(next);
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>): void => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    press.current = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      moved: false,
      touch: event.pointerType === "touch",
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    engine.current?.grab(event.clientX, event.clientY);
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>): void => {
    const held = press.current;
    if (held !== null && held.id === event.pointerId) {
      if (!held.moved && Math.hypot(event.clientX - held.x, event.clientY - held.y) > DRAG_SLOP) {
        held.moved = true;
        setDragging(true);
        setTurned(true);
        setTouched(null);
      }
      if (held.moved) engine.current?.drag(event.clientX, event.clientY);
      return;
    }
    if (event.pointerType === "touch") return;
    engine.current?.move(event.clientX, event.clientY);
  };

  const endPress = (event: PointerEvent<HTMLDivElement>, cancelled: boolean): void => {
    const held = press.current;
    if (held === null || held.id !== event.pointerId) return;
    press.current = null;
    engine.current?.release();
    if (held.moved || cancelled) {
      setDragging(false);
      return;
    }
    const index = engine.current?.pick(event.clientX, event.clientY, held.touch ? REACH.touch : REACH.mouse) ?? null;
    if (held.touch) {
      // Touch has no hover: the first tap shows the tooltip, the second asks.
      if (index !== null && index === touched) {
        ask(index);
        return;
      }
      setTouched(index);
      return;
    }
    if (index !== null) ask(index);
  };

  const options = useMemo(
    () =>
      model.stars.map((star) => {
        const doc = model.docs[star.doc];
        return {
          id: star.id,
          index: star.index,
          label:
            doc === undefined
              ? ""
              : `${doc.spoken}, ${doc.group}, passage ${String(star.ordinal)} of ${String(doc.passages)}`,
        };
      }),
    [model],
  );

  const summary = `Galaxy of ${count(model.stars.length, "passage", "passages")} from ${count(model.documentCount, "document", "documents")}, coloured by source and placed in three dimensions by a projection of their embeddings that keeps ${String(model.keep)}% of the variation. ${model.groups.map((group) => `${group.name}: ${String(group.passages)}`).join(", ")}.`;
  const hint =
    onAsk === undefined
      ? undefined
      : hover !== null
        ? "Click to ask about it"
        : touched !== null
          ? "Tap again to ask about it"
          : keyboard && cursor !== null
            ? "Press Enter to ask about it"
            : undefined;

  return (
    <div ref={root} className={cn(mapStyles.root, styles.galaxy)} data-ready={ready ? "" : undefined}>
      <figure className="glass-inset grid gap-y-4 rounded-3xl p-4 sm:p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <p className="text-ink text-ui font-medium">What I can draw on</p>
          <p className="text-ink-muted text-micro tabular-nums">
            {count(model.stars.length, "passage", "passages")} · {count(model.documentCount, "document", "documents")}
          </p>
        </div>

        <div className={cn(mapStyles.stage, styles.stage, "relative rounded-2xl")}>
          <div ref={host} role="img" aria-label={summary} className={styles.clip}>
            <div ref={labels} aria-hidden>
              {model.groups.map((group) => (
                <span key={group.name} className={styles.label}>
                  <span className={cn(styles.labelDot, slotClass(group.slot))} />
                  {group.name}
                </span>
              ))}
            </div>
          </div>

          <span ref={ring} aria-hidden className={styles.ring} data-on={pointed !== null ? "" : undefined} />

          <p
            ref={hintNote}
            aria-hidden
            className={cn(styles.hint, "text-ink-muted text-micro")}
            data-on={settled && !turned ? "" : undefined}
          >
            <Rotate3d aria-hidden className="size-3.5" />
            Drag to turn
          </p>

          <div ref={tip} aria-hidden className={styles.tipAnchor}>
            {pointedStar !== undefined && pointedDoc !== undefined && (
              <div
                key={pointedStar.id}
                className={cn(
                  styles.tip,
                  "glass-strong border-glass-border rounded-xl border px-3 py-2 shadow-[0_14px_32px_-14px_var(--glass-shadow)]",
                )}
              >
                <p className="text-ink-muted flex items-center gap-1.5 text-micro">
                  <span className={cn(mapStyles.swatch, slotClass(pointedDoc.slot))} />
                  {pointedDoc.group}
                </p>
                <p className="text-ink mt-1 text-label leading-snug font-medium">{pointedDoc.title}</p>
                {pointedDoc.context !== undefined && (
                  <p className="text-ink-muted truncate text-micro">{pointedDoc.context}</p>
                )}
                <p className="text-ink-muted mt-1 text-micro">
                  Passage {pointedStar.ordinal} of {pointedDoc.passages}
                </p>
                {hint !== undefined && <p className="text-evidence mt-1 text-micro font-medium">{hint}</p>}
              </div>
            )}
          </div>

          {ready && (
            <div
              role="listbox"
              tabIndex={0}
              aria-label="Passages in the galaxy, in reading order"
              aria-describedby={`${uid}-keys`}
              aria-activedescendant={keyboard && cursor !== null ? `${uid}-o${String(cursor)}` : undefined}
              className={styles.overlay}
              data-pointing={onAsk !== undefined && hover !== null && !dragging ? "" : undefined}
              data-dragging={dragging ? "" : undefined}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={(event) => {
                endPress(event, false);
              }}
              onPointerCancel={(event) => {
                endPress(event, true);
              }}
              onPointerLeave={() => {
                engine.current?.leave();
              }}
              onFocus={(event) => {
                if (!event.currentTarget.matches(":focus-visible")) return;
                setKeyboard(true);
                setCursor(cursor ?? 0);
              }}
              onBlur={() => {
                setKeyboard(false);
              }}
              onKeyDown={onKeyDown}
            >
              {options.map((option) => (
                <span
                  key={option.id}
                  id={`${uid}-o${String(option.index)}`}
                  role="option"
                  aria-selected={cursor === option.index ? true : undefined}
                  className="sr-only"
                >
                  {option.label}
                </span>
              ))}
            </div>
          )}

          <p id={`${uid}-keys`} className="sr-only">
            Arrow keys move between passages in reading order, and Page Up and Page Down jump between
            documents.{onAsk === undefined ? "" : " Enter asks about the passage's document."} Escape clears.
          </p>

          <ul ref={legendList} aria-label="Sources, by colour" className={styles.legend}>
            {model.groups.map((group) => (
              <li
                key={group.name}
                className={cn(styles.chip, slotClass(group.slot))}
                data-on={focusSlot === group.slot || pointedDoc?.group === group.name ? "" : undefined}
                onPointerEnter={() => {
                  setFocusSlot(group.slot);
                }}
                onPointerLeave={() => {
                  setFocusSlot(null);
                }}
              >
                <span aria-hidden className={styles.chipDot} />
                {group.name}
                <span className={cn(styles.chipCount, "font-mono tabular-nums")}>
                  {group.passages}
                  <span className="sr-only"> passages</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <figcaption className="text-ink-muted text-micro leading-[1.55] text-pretty">
          Each star is one of the {model.stars.length} passages I search, coloured by source, and threads join a
          document&apos;s passages in reading order. Positions come from a 3D PCA projection that keeps {model.keep}%
          of the variation: stars far apart really are different; stars close together may still differ. When you
          ask, the passages I retrieve light up; the question itself isn&apos;t plotted.
        </figcaption>
      </figure>
    </div>
  );
}

/**
 * The welcome screen's knowledge map, in three dimensions: every passage the
 * assistant can retrieve is a star, placed by the first three principal
 * components of its embedding (lib/corpus-map.ts says what that projection
 * can and cannot claim) and coloured, labelled and asked about exactly as
 * the 2D map does it. Threads join a document's passages in reading order,
 * coloured clouds mark where each group sits, the 2D map's grid becomes the
 * floor, and the legend sits in the stage as chips.
 *
 * It arrives as a front of light leaving the centre and lighting each star
 * while the camera flies in from a flat, face-on view and the galaxy unfolds.
 * After that it turns slowly, its stars twinkle and now and then flare, and
 * pulses of light run along the threads; it stops under the pointer so a
 * star can be read and clicked, lights the pointed passage's document and
 * steps the rest back, throws with inertia when dragged, and comes to rest
 * when the page has been idle a while.
 *
 * The 2D map is rendered too, for browsers that cannot or should not run the
 * galaxy (see galaxyMode); the stylesheet picks which figure shows before
 * any script runs, so nothing shifts on hydration. Keyboard use matches the
 * map: one tab stop, arrows walk the passages in reading order, Enter asks,
 * Escape clears. `activeId`, if given, points at a passage as the 2D map's
 * does.
 */
export function KnowledgeGalaxy({
  map,
  onAsk,
  activeId,
  className,
}: {
  map: CorpusMap;
  onAsk?: AskHandler;
  activeId?: string | null;
  className?: string;
}) {
  const mode = useSyncExternalStore(subscribeCapability, galaxyMode, serverMode);
  // Set from the engine's own callbacks when a context cannot be had or is
  // lost; once broken, the map stays for the rest of the visit.
  const [broken, setBroken] = useState(false);
  const fail = useCallback(() => {
    setBroken(true);
  }, []);
  const model = useMemo(() => buildModel(map), [map]);
  const empty = map.points.length === 0;

  return (
    <div className={cn(styles.root, className)} data-flat={mode === "flat" || broken || empty ? "" : undefined}>
      <div className={styles.flat}>
        <KnowledgeMap map={map} variant="hero" onAsk={onAsk} activeId={activeId} />
      </div>
      {!empty && (
        <Galaxy model={model} onAsk={onAsk} activeId={activeId} live={mode === "galaxy" && !broken} onFail={fail} />
      )}
    </div>
  );
}
