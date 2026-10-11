"use client";

import {
  Fragment,
  useId,
  useLayoutEffect,
  useRef,
  useSyncExternalStore,
  type ComponentPropsWithoutRef,
  type CSSProperties,
  type ReactNode,
  type Ref,
  type RefObject,
} from "react";
import styles from "./LiquidGlass.module.css";

/**
 * Glass that bends what is behind it, in the manner of Apple's Liquid Glass.
 *
 * Every browser gets a frosted base (LiquidGlass.module.css): a tint of at
 * least 60%, a blur, a specular rim and a highlight across the top. In
 * Chromium the backdrop is also refracted. An inline SVG filter displaces the
 * backdrop through a lens map painted on a canvas: flat in the middle, so
 * whatever sits under the content is left in place, and bending hard within
 * `bezel` pixels of the edge, as light does through the rounded rim of a
 * thick piece of glass.
 *
 * Only Chromium draws an SVG filter in backdrop-filter. Safari and Firefox
 * parse `backdrop-filter: url(#id)` and CSS.supports reports true for it,
 * but they draw nothing at all, so the check is the browser's brand rather
 * than feature detection (see canRefract).
 *
 * Placement constraints, all of them load-bearing:
 * - Never put this inside an element that has backdrop-filter, filter,
 *   opacity below 1, mask, clip-path or mix-blend-mode, or will-change naming
 *   any of those. Each makes that ancestor the backdrop root, and the glass
 *   would then blur and refract only that ancestor's own content instead of
 *   the page behind it. A fade-in on the glass itself is fine; on a wrapper
 *   it is not.
 * - Children must not use backdrop-filter themselves: the glass is their
 *   backdrop root, so they would only see the glass.
 * - Keep text off the refracting rim. Pad content by at least `bezel` from
 *   every edge, or the text sits on a band of moving, magnified backdrop.
 */

/** Light through crown glass. */
const IOR = 1.5;
/**
 * How tall the bevel stands against its width. Taller glass carries the bend
 * further in from the edge; much taller and the rim turns to mirror.
 */
const THICKNESS = 1.6;
/** Blur on top of the refraction: enough to soften the bent edges, little enough to keep them visible. */
const REFRACT_BLUR_PX = 3;
/** Resizes come in bursts (a window drag, a font swap); the map is repainted once they settle. */
const REBUILD_MS = 150;
/** The map is painted at device resolution, capped, since it is drawn per pixel in script. */
const MAX_DENSITY = 2;

/** Per-channel displacement for chromatic aberration: blue bends a little more than red, as in real glass. */
const CHANNELS = [
  { name: "red", spread: 0.94, matrix: "1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" },
  { name: "green", spread: 1, matrix: "0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0" },
  { name: "blue", spread: 1.06, matrix: "0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0" },
] as const;

/* ------------------------------------------------------------------------- */
/* Whether to refract                                                        */
/* ------------------------------------------------------------------------- */

const QUERIES = [
  "(prefers-reduced-transparency: reduce)",
  "(prefers-contrast: more)",
  "(hover: hover) and (pointer: fine)",
] as const;

interface BrandedNavigator extends Navigator {
  userAgentData?: { brands?: ReadonlyArray<{ brand: string }> };
}

/**
 * True when this browser will actually draw the refraction and the visitor
 * has not asked for less of what it does. User-Agent Client Hints are the
 * reliable tell for Chromium, and Edge, Opera, Arc and Brave all list it too.
 * A visitor who asked for reduced transparency or more contrast gets the
 * frosted glass, which is calmer and keeps text over it steady. Machines with
 * four cores or fewer skip it as well: the filter reruns every frame that
 * anything moves behind the glass.
 */
export function canRefract(): boolean {
  if (typeof window === "undefined") return false;
  const brands = (navigator as BrandedNavigator).userAgentData?.brands ?? [];
  return (
    brands.some(({ brand }) => brand === "Chromium") &&
    !window.matchMedia("(prefers-reduced-transparency: reduce)").matches &&
    !window.matchMedia("(prefers-contrast: more)").matches &&
    navigator.hardwareConcurrency > 4
  );
}

type Mode = "frost" | "refract" | "disperse";

/** Chromatic aberration is a desktop flourish: a fine pointer means a large screen and a mouse. */
function readMode(): Mode {
  if (!canRefract()) return "frost";
  return window.matchMedia("(hover: hover) and (pointer: fine)").matches ? "disperse" : "refract";
}

function subscribe(onChange: () => void): () => void {
  const lists = QUERIES.map((query) => window.matchMedia(query));
  for (const list of lists) list.addEventListener("change", onChange);
  return () => {
    for (const list of lists) list.removeEventListener("change", onChange);
  };
}

/* ------------------------------------------------------------------------- */
/* The lens map                                                              */
/* ------------------------------------------------------------------------- */

/**
 * How far a ray is bent sideways on its way through the bevel, at fraction t
 * of the way in from the edge (0) to where the face turns flat (1), scaled
 * so the edge is 1. The bevel is a convex squircle, a steep wall rolling
 * over into the face; Snell's law at its surface gives the bend. Most of it
 * happens in the outer fifth, which is what gives the rim its sharp, bright
 * band. Sampled once into a table because the map evaluates it per pixel.
 */
const PROFILE = (() => {
  const bend = (t: number): number => {
    const inward = 1 - t;
    const rise = 1 - inward ** 4;
    const slope = rise <= 0 ? Number.POSITIVE_INFINITY : (THICKNESS * inward ** 3) / rise ** 0.75;
    const incidence = Math.atan(slope);
    return Math.tan(incidence - Math.asin(Math.sin(incidence) / IOR));
  };
  const samples = 128;
  const peak = bend(0);
  return Float32Array.from({ length: samples + 1 }, (_, index) => bend(index / samples) / peak);
})();

function profile(t: number): number {
  const position = Math.min(Math.max(t, 0), 1) * (PROFILE.length - 1);
  const index = Math.floor(position);
  const low = PROFILE[index] ?? 0;
  const high = PROFILE[Math.min(index + 1, PROFILE.length - 1)] ?? 0;
  return low + (high - low) * (position - index);
}

/**
 * Paints the displacement map of a rounded rectangle. Red carries the
 * horizontal shift and green the vertical, with 128 meaning none:
 * feDisplacementMap moves each pixel by scale × (value / 255 − 0.5), so a
 * full-strength edge pixel moves by half the scale. Every shift points
 * inwards, as through a convex bevel, so the rim shows what lies just inside
 * it, stretched; the flat middle samples straight through.
 */
function paintLens(
  width: number,
  height: number,
  radius: number,
  bezel: number,
  density: number,
): HTMLCanvasElement | null {
  const columns = Math.max(1, Math.round(width * density));
  const rows = Math.max(1, Math.round(height * density));
  const canvas = document.createElement("canvas");
  canvas.width = columns;
  canvas.height = rows;
  const context = canvas.getContext("2d");
  if (context === null) return null;

  const image = context.createImageData(columns, rows);
  const data = image.data;
  data.fill(128);

  const halfWidth = width / 2;
  const halfHeight = height / 2;
  const half = Math.min(halfWidth, halfHeight);
  const corner = Math.min(Math.max(radius, 0), half);
  const band = Math.min(Math.max(bezel, 0.5), half);
  // Normals come from corners at least as round as the bezel is deep. On a
  // tighter radius, the true normal flips from horizontal to vertical along
  // the diagonal, and inside the bezel that flip would show as a seam.
  const normalCorner = Math.min(Math.max(corner, band), half);

  for (let row = 0; row < rows; row++) {
    const y = (row + 0.5) / density - halfHeight;
    const ay = Math.abs(y);
    for (let column = 0; column < columns; column++) {
      const index = (row * columns + column) * 4;
      data[index + 3] = 255;

      const x = (column + 0.5) / density - halfWidth;
      const ax = Math.abs(x);
      // Signed distance to the rounded rectangle, negated: depth inside it.
      const qx = ax - (halfWidth - corner);
      const qy = ay - (halfHeight - corner);
      const ox = Math.max(qx, 0);
      const oy = Math.max(qy, 0);
      const depth = corner - Math.sqrt(ox * ox + oy * oy) - Math.min(Math.max(qx, qy), 0);
      if (depth >= band) continue;

      const strength = profile(depth / band) * 127;
      const nx = ax - (halfWidth - normalCorner);
      const ny = ay - (halfHeight - normalCorner);
      let normalX = 0;
      let normalY = 0;
      if (nx > 0 && ny > 0) {
        const length = Math.sqrt(nx * nx + ny * ny);
        normalX = nx / length;
        normalY = ny / length;
      } else if (nx > ny) {
        normalX = 1;
      } else {
        normalY = 1;
      }
      data[index] = 128 - Math.sign(x) * normalX * strength;
      data[index + 1] = 128 - Math.sign(y) * normalY * strength;
    }
  }

  context.putImageData(image, 0, 0);
  return canvas;
}

function crop(source: HTMLCanvasElement, x: number, width: number): string {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = source.height;
  canvas.getContext("2d")?.drawImage(source, x, 0, width, source.height, 0, 0, width, source.height);
  return canvas.toDataURL("image/png");
}

/** How far in from each side the map depends on x. Beyond it, every column is the same. */
function cornerZone(width: number, height: number, radius: number, bezel: number): number {
  const half = Math.min(width, height) / 2;
  return Math.ceil(Math.max(Math.min(radius, half), Math.min(bezel, half)));
}

function place(element: Element, x: number, y: number, width: number, height: number): void {
  element.setAttribute("x", String(x));
  element.setAttribute("y", String(y));
  element.setAttribute("width", String(Math.max(width, 0)));
  element.setAttribute("height", String(Math.max(height, 0)));
}

interface LensParts {
  probe: RefObject<HTMLElement | null>;
  filter: RefObject<SVGFilterElement | null>;
  left: RefObject<SVGFEImageElement | null>;
  middle: RefObject<SVGFEImageElement | null>;
  right: RefObject<SVGFEImageElement | null>;
}

/**
 * Keeps the filter's map the size of the glass.
 *
 * The map is used in three slices: the left and right ends, which hold the
 * corners and do depend on x, and the middle, where every column is the
 * same and one narrow strip is stretched across. A change of width then
 * only moves the right slice and stretches the strip, which is cheap enough
 * to do every frame of a width animation, so the refraction stays exact
 * while the glass morphs. The slices are repainted only when the height or
 * the corner changes, once a burst of resizes has settled. Glass narrower
 * than its two ends gets one whole map, repainted on any resize.
 *
 * Until a map has loaded, and anywhere a slice does not reach, a neutral
 * flood under the slices means "no shift", so the glass never jumps.
 */
function useLensMap(enabled: boolean, parts: LensParts, radius: number, bezel: number): void {
  const { probe, filter, left, middle, right } = parts;

  useLayoutEffect(() => {
    const box = probe.current;
    const region = filter.current;
    const head = left.current;
    const body = middle.current;
    const tail = right.current;
    if (!enabled || box === null || region === null || head === null || body === null || tail === null) {
      return;
    }

    const density = Math.min(Math.max(window.devicePixelRatio, 1), MAX_DENSITY);
    let width = 0;
    let height = 0;
    let built = "";
    let timer: ReturnType<typeof setTimeout> | undefined;

    const shape = (): { zone: number; sliced: boolean; key: string } => {
      const zone = cornerZone(width, height, radius, bezel);
      const sliced = width >= zone * 2 + 2;
      return { zone, sliced, key: sliced ? `slices ${height} ${zone}` : `whole ${width} ${height}` };
    };

    const rebuild = (): void => {
      if (width <= 0 || height <= 0) return;
      const { zone, sliced, key } = shape();
      if (sliced) {
        // A short virtual pill whose ends match the real one exactly.
        const canvas = paintLens(zone * 2 + 2, height, radius, bezel, density);
        if (canvas === null) return;
        const end = Math.round(zone * density);
        head.setAttribute("href", crop(canvas, 0, end));
        body.setAttribute("href", crop(canvas, end, Math.max(1, Math.round(2 * density))));
        tail.setAttribute("href", crop(canvas, canvas.width - end, end));
      } else {
        const canvas = paintLens(width, height, radius, bezel, density);
        if (canvas === null) return;
        head.setAttribute("href", canvas.toDataURL("image/png"));
        body.removeAttribute("href");
        tail.removeAttribute("href");
      }
      built = key;
    };

    const layout = (): void => {
      const { zone, sliced, key } = shape();
      place(region, 0, 0, width, height);
      if (sliced) {
        place(head, 0, 0, zone, height);
        place(body, zone, 0, width - zone * 2, height);
        place(tail, width - zone, 0, zone, height);
      } else {
        place(head, 0, 0, width, height);
        place(body, 0, 0, 0, 0);
        place(tail, 0, 0, 0, 0);
      }
      clearTimeout(timer);
      if (key === built) return;
      timer = setTimeout(rebuild, built === "" ? 0 : REBUILD_MS);
    };

    const observer = new ResizeObserver((entries) => {
      const size = entries[entries.length - 1]?.borderBoxSize[0];
      if (size === undefined) return;
      width = size.inlineSize;
      height = size.blockSize;
      layout();
    });
    observer.observe(box);

    return () => {
      observer.disconnect();
      clearTimeout(timer);
    };
  }, [enabled, probe, filter, left, middle, right, radius, bezel]);
}

/**
 * A specular spot that follows the pointer across the glass, as Apple's
 * highlights follow the tilt of the device. It writes two custom properties
 * on the glass and nothing else, so it never re-renders, and only for a fine
 * pointer that hovers: a finger has no position until it presses. Reduced
 * motion and the page's pause control leave the light where the stylesheet
 * puts it, at the top left.
 *
 * `probe` is any element inside the glass whose parent is the glass itself:
 * the rim, which already exists to be measured.
 */
export function usePointerLight(probe: RefObject<HTMLElement | null>): void {
  useLayoutEffect(() => {
    const glass = probe.current?.parentElement;
    if (glass === null || glass === undefined) return;
    const hover = window.matchMedia("(hover: hover) and (pointer: fine)");
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");

    const move = (event: PointerEvent): void => {
      if (!hover.matches || reduced.matches) return;
      if (document.documentElement.dataset["motion"] === "paused") return;
      const box = glass.getBoundingClientRect();
      glass.style.setProperty("--lg-x", `${String(event.clientX - box.left)}px`);
      glass.style.setProperty("--lg-y", `${String(event.clientY - box.top)}px`);
      glass.dataset["lit"] = "";
    };
    const leave = (): void => {
      delete glass.dataset["lit"];
    };

    glass.addEventListener("pointermove", move);
    glass.addEventListener("pointerleave", leave);
    return () => {
      glass.removeEventListener("pointermove", move);
      glass.removeEventListener("pointerleave", leave);
    };
  }, [probe]);
}

/* ------------------------------------------------------------------------- */
/* The component                                                             */
/* ------------------------------------------------------------------------- */

interface Own {
  children: ReactNode;
  /** Corner radius in px. Anything over half the height makes a pill. */
  radius?: number;
  /** Depth of the refracting rim in px. Keep content at least this far from the edges. */
  bezel?: number;
  /** feDisplacementMap scale: the strongest shift, at the very edge, is half of it in px. */
  scale?: number;
  /** Splits the bend by colour at the rim. Desktop only; ignored elsewhere. */
  aberration?: boolean;
  className?: string;
  style?: CSSProperties;
}

type DivGlass = Own & { as?: "div"; ref?: Ref<HTMLDivElement> } & Omit<ComponentPropsWithoutRef<"div">, keyof Own>;
type ButtonGlass = Own & { as: "button"; ref?: Ref<HTMLButtonElement> } & Omit<
    ComponentPropsWithoutRef<"button">,
    keyof Own
  >;

export type LiquidGlassProps = DivGlass | ButtonGlass;

/** The element's own attributes, without the glass's props. */
function attributes<T extends Own & { as?: string }>(props: T): Omit<T, keyof Own | "as"> {
  const { children, radius, bezel, scale, aberration, className, style, as, ...rest } = props;
  return rest;
}

export interface LensOptions {
  /** Corner radius in px. Anything over half the height makes a pill. */
  radius: number;
  /** Depth of the refracting rim in px. */
  bezel: number;
  /** feDisplacementMap scale: the strongest shift, at the very edge, is half of it in px. */
  scale: number;
  /** Splits the bend by colour at the rim. Desktop only; ignored elsewhere. */
  aberration?: boolean;
  /**
   * Blur on top of the bend, in px. The default suits small controls that
   * rarely have text behind them; glass that text always passes under, like
   * the composer, wants more, or the text behind reads through the middle.
   */
  blur?: number;
}

export interface Lens {
  /** Whether this browser refracts; false means the frosted fallback. */
  refract: boolean;
  /** The inline backdrop-filter to set on the glass, or undefined when frosted. */
  backdropFilter: string | undefined;
  /** The SVG filter the backdrop refers to. Render it inside the glass. */
  defs: ReactNode;
}

/**
 * The refraction on its own: the lens map, the SVG filter and the inline
 * backdrop-filter that points at it. LiquidGlass is built on it, and so is
 * any glass made of its own layers, like the composer, that needs the bend
 * without the component's markup.
 *
 * `probe` is an element with the glass's box, whose size and corners the
 * lens takes. The caller owns it, so nothing returned here is a ref, and the
 * values can be read while rendering.
 */
export function useLiquidLens(
  probe: RefObject<HTMLElement | null>,
  { radius, bezel, scale, aberration = false, blur = REFRACT_BLUR_PX }: LensOptions,
): Lens {
  const id = `lg${useId().replace(/[^A-Za-z0-9_-]/g, "")}`;
  const mode = useSyncExternalStore(subscribe, readMode, () => "frost" as const);
  const refract = mode !== "frost";
  const disperse = mode === "disperse" && aberration;

  const filter = useRef<SVGFilterElement>(null);
  const left = useRef<SVGFEImageElement>(null);
  const middle = useRef<SVGFEImageElement>(null);
  const right = useRef<SVGFEImageElement>(null);
  useLensMap(refract, { probe, filter, left, middle, right }, radius, bezel);

  const defs = refract ? (
    <svg aria-hidden focusable="false" className={styles.defs}>
      <filter
        ref={filter}
        id={id}
        filterUnits="userSpaceOnUse"
        primitiveUnits="userSpaceOnUse"
        colorInterpolationFilters="sRGB"
      >
        <feFlood floodColor="#808080" result="neutral" />
        <feImage ref={left} preserveAspectRatio="none" result="left" />
        <feImage ref={middle} preserveAspectRatio="none" result="middle" />
        <feImage ref={right} preserveAspectRatio="none" result="right" />
        <feMerge result="map">
          <feMergeNode in="neutral" />
          <feMergeNode in="left" />
          <feMergeNode in="middle" />
          <feMergeNode in="right" />
        </feMerge>
        {disperse ? (
          <>
            {CHANNELS.map(({ name, spread, matrix }) => (
              <Fragment key={name}>
                <feDisplacementMap
                  in="SourceGraphic"
                  in2="map"
                  scale={scale * spread}
                  xChannelSelector="R"
                  yChannelSelector="G"
                  result={`${name}-bent`}
                />
                <feColorMatrix in={`${name}-bent`} type="matrix" values={matrix} result={name} />
              </Fragment>
            ))}
            <feBlend in="red" in2="green" mode="screen" result="red-green" />
            <feBlend in="red-green" in2="blue" mode="screen" />
          </>
        ) : (
          <feDisplacementMap in="SourceGraphic" in2="map" scale={scale} xChannelSelector="R" yChannelSelector="G" />
        )}
      </filter>
    </svg>
  ) : null;

  return {
    refract,
    backdropFilter: refract ? `url(#${id}) blur(${String(blur)}px) saturate(1.6)` : undefined,
    defs,
  };
}

export function LiquidGlass(props: LiquidGlassProps) {
  const { children, radius = 24, bezel = 16, scale = 36, aberration = false, className = "", style } = props;
  const probe = useRef<HTMLSpanElement>(null);
  const lens = useLiquidLens(probe, { radius, bezel, scale, aberration });
  usePointerLight(probe);

  const shell = {
    className: `${styles.glass} ${className}`,
    style: {
      ...style,
      borderRadius: radius,
      ...(lens.backdropFilter === undefined ? null : { backdropFilter: lens.backdropFilter }),
    },
    "data-refract": lens.refract ? "" : undefined,
  };

  const layers = (
    <>
      <span aria-hidden className={styles.core} />
      <span aria-hidden className={styles.light} />
      {children}
      <span ref={probe} aria-hidden className={styles.rim} />
      {lens.defs}
    </>
  );

  if (props.as === "button") {
    return (
      <button type="button" {...attributes(props)} {...shell}>
        {layers}
      </button>
    );
  }
  return (
    <div {...attributes(props)} {...shell}>
      {layers}
    </div>
  );
}
