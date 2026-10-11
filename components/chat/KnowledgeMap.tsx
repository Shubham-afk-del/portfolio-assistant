"use client";

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import type { CorpusMap, MapDocument } from "@/lib/corpus-map";
import { reducedMotion } from "@/lib/motion";
import { cn, vars } from "@/lib/utils";
import styles from "./KnowledgeMap.module.css";

/** A retrieved chunk. Its id is a MapPoint id; its rank is its place in the array. */
export interface MapHit {
  id: string;
  score: number;
}

type Variant = "hero" | "compact";

/**
 * The similarity range a halo's area spans. Fixed, not fitted to each
 * question's hits: rescaled per question, the best hit of a weak retrieval
 * would look as strong as the best hit of a good one.
 */
const SCORE_LO = 0.3;
const SCORE_HI = 0.65;

/** Every dot is drawn the same size, so size never says anything about the data. */
const CORE_R = 2.4;
const GLOW_R: Record<Variant, number> = { hero: 13, compact: 11 };

/** exp(-(2.2r)²) at a few radii, as [offset, share of the peak]. */
const GLOW_FALLOFF: Array<[number, number]> = [
  [0, 1],
  [0.2, 0.82],
  [0.4, 0.46],
  [0.6, 0.17],
  [0.8, 0.045],
  [1, 0],
];
const RING_R = 6;
const RING_R_ACTIVE = 10;
const CURSOR_R = 8.5;

/** How far the pointer may be from a dot and still be on it, in CSS pixels. */
const REACH = { mouse: 14, touch: 24 };

const PARALLAX_PX = 6;
const LABEL_PX: Record<Variant, number> = { hero: 11.5, compact: 11 };

/** Label layout needs the map's width; until it is measured, assume a typical one. */
const ASSUMED_WIDTH: Record<Variant, number> = { hero: 380, compact: 300 };

/**
 * Colour slots, in the order of the palette in KnowledgeMap.module.css. The
 * three kinds of writing keep fixed colours; repositories take the remaining
 * slots in the order they first appear in the index, which is stable from
 * build to build. A seventh group falls back to a neutral rather than reusing
 * a colour, since two groups in one colour would read as one.
 */
const WRITING_SLOT: Record<string, number> = { "case-study": 0, decision: 1, "interview-answers": 2 };
const FREE_SLOTS = [3, 4, 5, 0, 1, 2];
const NEUTRAL_SLOT = 6;
const SLOT_COUNT = 7;

interface Dot {
  id: string;
  index: number;
  doc: number;
  slot: number;
  /** Position as a fraction of the plotted area, 0 at the left and top. */
  fx: number;
  fy: number;
  /** Place of this passage within its document, from 1. */
  ordinal: number;
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
  fx: number;
  fy: number;
}

interface Model {
  dots: Dot[];
  docs: Doc[];
  groups: Group[];
  /** Consecutive passages of one document, joined in reading order. */
  segments: Array<[number, number]>;
  /** Width over height of the plotted area. */
  ratio: number;
  byId: Map<string, number>;
  documentCount: number;
  keep: number;
}

interface Lit {
  index: number;
  rank: number;
  score: number;
  /** Share of the halo's largest area this score earns, 0 to 1. */
  share: number;
}

interface Spot {
  dx: number;
  dy: number;
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const pct = (fraction: number): string => `${(fraction * 100).toFixed(3)}%`;

const count = (n: number, one: string, many: string): string =>
  `${n.toLocaleString("en-GB")} ${n === 1 ? one : many}`;

const slotClass = (slot: number): string | undefined => styles[`s${String(slot)}`];

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
  // Points share one scale, so the longer side spans 0 to 1 and the other
  // spans its share of that. Dividing by each side's span maps both to the
  // plotted box without stretching either.
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

  const seen = map.documents.map(() => 0);
  const dots: Dot[] = map.points.map((point, index) => {
    const ordinal = (seen[point.doc] ?? 0) + 1;
    seen[point.doc] = ordinal;
    return {
      id: point.id,
      index,
      doc: point.doc,
      slot: docs[point.doc]?.slot ?? NEUTRAL_SLOT,
      fx: clamp(point.x / spanX, 0, 1),
      fy: clamp(point.y / spanY, 0, 1),
      ordinal,
    };
  });

  const segments: Array<[number, number]> = [];
  for (let i = 1; i < dots.length; i += 1) {
    if (dots[i]?.doc === dots[i - 1]?.doc) segments.push([i - 1, i]);
  }

  // Labels go at each group's true centroid: the mean of its dots.
  const totals = new Map<string, { slot: number; writing: boolean; n: number; x: number; y: number }>();
  for (const dot of dots) {
    const document = map.documents[dot.doc];
    if (document === undefined) continue;
    const total = totals.get(document.group) ?? {
      slot: dot.slot,
      writing: document.kind !== "code",
      n: 0,
      x: 0,
      y: 0,
    };
    total.n += 1;
    total.x += dot.fx;
    total.y += dot.fy;
    totals.set(document.group, total);
  }
  const groups = [...totals]
    .map(([name, total]) => ({
      name,
      slot: total.slot,
      passages: total.n,
      writing: total.writing,
      fx: total.x / total.n,
      fy: total.y / total.n,
    }))
    .sort((a, b) => Number(b.writing) - Number(a.writing) || a.slot - b.slot);

  return {
    dots,
    docs,
    groups,
    segments,
    ratio: 1 / aspect,
    byId: new Map(dots.map((dot) => [dot.id, dot.index])),
    documentCount: new Set(dots.map((dot) => dot.doc)).size,
    keep: Math.round((map.explained[0] + map.explained[1]) * 100),
  };
}

function buildLit(model: Model, hits: readonly MapHit[]): Lit[] {
  const lit: Lit[] = [];
  const taken = new Set<number>();
  hits.forEach((hit, position) => {
    const index = model.byId.get(hit.id);
    if (index === undefined || taken.has(index)) return;
    taken.add(index);
    lit.push({
      index,
      rank: position + 1,
      score: hit.score,
      share: clamp((hit.score - SCORE_LO) / (SCORE_HI - SCORE_LO), 0, 1),
    });
  });
  return lit;
}

/**
 * Group labels at their centroids, nudged apart vertically where two would
 * overlap and kept inside the map. Widths are estimated from the character
 * count, which is close enough for Inter at this size and needs no measuring.
 */
function placeLabels(groups: Group[], width: number, height: number, size: number): Spot[] {
  const boxes = groups.map((group) => {
    const w = group.name.length * size * 0.56 + 8;
    const h = size + 5;
    const x = w >= width ? width / 2 : clamp(group.fx * width, w / 2, width - w / 2);
    return { w, h, x, y: group.fy * height, ax: group.fx * width, ay: group.fy * height };
  });
  for (let pass = 0; pass < 60; pass += 1) {
    let moved = false;
    for (let i = 0; i < boxes.length; i += 1) {
      for (let j = i + 1; j < boxes.length; j += 1) {
        const a = boxes[i];
        const b = boxes[j];
        if (a === undefined || b === undefined) continue;
        const overlapX = (a.w + b.w) / 2 - Math.abs(a.x - b.x);
        const overlapY = (a.h + b.h) / 2 - Math.abs(a.y - b.y);
        if (overlapX <= 0 || overlapY <= 0) continue;
        const push = overlapY / 2 + 0.5;
        const [upper, lower] = a.y <= b.y ? [a, b] : [b, a];
        upper.y -= push;
        lower.y += push;
        moved = true;
      }
    }
    for (const box of boxes) box.y = clamp(box.y, box.h / 2, height - box.h / 2);
    if (!moved) break;
  }
  return boxes.map((box) => ({ dx: box.x - box.ax, dy: box.y - box.ay }));
}

const AROUND: Array<[number, number]> = [
  [0.71, -0.71],
  [0.71, 0.71],
  [-0.71, -0.71],
  [-0.71, 0.71],
  [1, 0],
  [-1, 0],
  [0, -1],
  [0, 1],
];

/**
 * Rank numbers beside their dots, in rank order. Hits often come from one
 * document and sit close together, so each number first tries the side of
 * its dot facing away from the other hits nearby, which fans a cluster's
 * numbers out round its edge instead of threading them between rings, and
 * takes the first spot that collides with no earlier number and no
 * retrieved dot, widening the search in steps.
 */
function placeRanks(lit: Lit[], dots: Dot[], width: number, height: number): Map<number, Spot> {
  const cores = lit.flatMap((item) => {
    const dot = dots[item.index];
    return dot === undefined ? [] : [{ index: item.index, x: dot.fx * width, y: dot.fy * height }];
  });
  const placed: Array<{ x: number; y: number; w: number; h: number }> = [];
  const spots = new Map<number, Spot>();

  const fits = (x: number, y: number, w: number, h: number): boolean =>
    x - w / 2 > -6 &&
    x + w / 2 < width + 6 &&
    y - h / 2 > -6 &&
    y + h / 2 < height + 6 &&
    !placed.some((box) => Math.abs(box.x - x) < (box.w + w) / 2 && Math.abs(box.y - y) < (box.h + h) / 2) &&
    !cores.some((core) => Math.abs(core.x - x) < w / 2 + RING_R - 1 && Math.abs(core.y - y) < h / 2 + RING_R - 1);

  for (const core of cores) {
    let sumX = 0;
    let sumY = 0;
    let near = 0;
    for (const other of cores) {
      if (other.index === core.index || Math.hypot(other.x - core.x, other.y - core.y) > 40) continue;
      sumX += other.x;
      sumY += other.y;
      near += 1;
    }
    let outX = 0.71;
    let outY = -0.71;
    if (near > 0) {
      const awayX = core.x - sumX / near;
      const awayY = core.y - sumY / near;
      const length = Math.hypot(awayX, awayY);
      if (length > 0.5) {
        outX = awayX / length;
        outY = awayY / length;
      }
    }
    const order = [...AROUND].sort((a, b) => b[0] * outX + b[1] * outY - (a[0] * outX + a[1] * outY));

    const label = core.index;
    const item = lit.find((entry) => entry.index === label);
    const w = 6.5 * String(item?.rank ?? 0).length + 3;
    const h = 11;
    let spot: Spot = { dx: (order[0]?.[0] ?? 0.71) * 11, dy: (order[0]?.[1] ?? -0.71) * 11 };
    let found = false;
    for (const distance of [11, 15, 20]) {
      for (const [ux, uy] of order) {
        if (fits(core.x + ux * distance, core.y + uy * distance, w, h)) {
          spot = { dx: ux * distance, dy: uy * distance };
          found = true;
          break;
        }
      }
      if (found) break;
    }
    placed.push({ x: core.x + spot.dx, y: core.y + spot.dy, w, h });
    spots.set(core.index, spot);
  }
  return spots;
}

function retrievalSentence(model: Model, lit: Lit[]): string {
  const top = lit[0];
  const topDoc = top === undefined ? undefined : model.docs[model.dots[top.index]?.doc ?? -1];
  if (top === undefined || topDoc === undefined) return "";
  const documents = new Set(lit.map((item) => model.dots[item.index]?.doc)).size;
  return `${count(lit.length, "passage", "passages")} from ${count(documents, "document", "documents")} lit; strongest: ${topDoc.spoken}, similarity ${top.score.toFixed(3)}.`;
}

/** Motion the visitor did not directly ask for stays still when motion is reduced or paused. */
function still(): boolean {
  return reducedMotion() || document.documentElement.dataset["motion"] === "paused";
}

/**
 * Everything the assistant can retrieve, as a constellation: each dot is one
 * of the passages it searches, placed by a PCA projection of its embedding
 * (see lib/corpus-map.ts for what that projection can and cannot claim) and
 * coloured by source. Faint lines join a document's passages in reading
 * order, which is real structure; nothing else connects dots.
 *
 * When a question's hits arrive, the reveal follows what retrieval did:
 * every passage was scored, so every dot flashes once together; the hits
 * light up in rank order, each with a halo whose area grows with its score on
 * one fixed range, a ring and its rank number; everything else steps back by
 * the same amount. The question itself is never drawn, because a 30%
 * projection of it would sit nearest to dots it did not retrieve.
 *
 * The hero variant is the welcome card, with a legend and the caption that
 * states the projection's limits; activating a dot there asks about its
 * document. The compact variant sits inside an answer and shows what that
 * question retrieved. Both are one tab stop: arrow keys walk the passages in
 * reading order, Enter asks, Escape clears.
 */
export function KnowledgeMap({
  map,
  hits,
  variant = "hero",
  activeId,
  onActiveChange,
  onAsk,
  className,
}: {
  map: CorpusMap;
  hits?: readonly MapHit[];
  variant?: Variant;
  activeId?: string | null;
  onActiveChange?: (id: string | null) => void;
  onAsk?: (question: string, origin: Element) => void;
  className?: string;
}) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const frame = useRef<HTMLDivElement>(null);
  const grid = useRef<HTMLDivElement>(null);
  const reported = useRef<string | null>(null);

  const [width, setWidth] = useState(ASSUMED_WIDTH[variant]);
  const [hover, setHover] = useState<number | null>(null);
  const [touched, setTouched] = useState<number | null>(null);
  const [cursor, setCursor] = useState<number | null>(null);
  const [keyboard, setKeyboard] = useState(false);
  const [announcement, setAnnouncement] = useState("");

  const model = useMemo(() => buildModel(map), [map]);
  const lit = useMemo(() => buildLit(model, hits ?? []), [model, hits]);
  const litByIndex = useMemo(() => new Map(lit.map((item) => [item.index, item])), [lit]);
  const signature = lit.map((item) => `${item.index}:${String(item.score)}`).join(",");
  const retrieval = retrievalSentence(model, lit);

  const height = width / model.ratio;
  // The largest halo scales with the map, like the map itself; the score
  // range it spans does not change.
  const haloMax = clamp(width * 0.064, 14, 26);

  // Measured rather than assumed once mounted, for the pixel-sized layout:
  // label nudges, rank number spots and halo size.
  useEffect(() => {
    const element = frame.current;
    if (element === null) return;
    const observer = new ResizeObserver((entries) => {
      const next = entries[0]?.contentRect.width;
      if (next !== undefined && next > 0) setWidth(Math.round(next));
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, []);

  // A live region only speaks when its text changes after it is in the page,
  // so the sentence lands a moment after mount rather than with it.
  useEffect(() => {
    const timer = setTimeout(() => {
      setAnnouncement(retrieval);
    }, 160);
    return () => {
      clearTimeout(timer);
    };
  }, [retrieval]);

  // The compact map sits beside the list of sources, which names every one,
  // and its hits cluster tightly: group labels there only collided with the
  // rank numbers, so it shows none. The tooltip still names the group.
  const labelled = useMemo(() => (variant === "hero" ? model.groups : []), [variant, model]);
  const labelSpots = useMemo(
    () => placeLabels(labelled, width, height, LABEL_PX[variant]),
    [labelled, width, height, variant],
  );
  const rankSpots = useMemo(() => placeRanks(lit, model.dots, width, height), [lit, model, width, height]);

  // The layers that only change with the data or the measured size, built
  // once per change rather than on every pointer move.
  const marks = useMemo(() => {
    const anyLit = lit.length > 0;
    const glow = GLOW_R[variant];
    return (
      <>
        <defs>
          {/* A Gaussian falloff, sampled: light fades that way, and a linear
            * ramp leaves a visible edge round every dot. */}
          {Array.from({ length: SLOT_COUNT }, (_, slot) => (
            <radialGradient key={`glow${String(slot)}`} id={`${uid}-glow-${String(slot)}`}>
              {GLOW_FALLOFF.map(([offset, share]) => (
                <stop
                  key={offset}
                  offset={offset}
                  style={{ stopColor: `var(--km-${String(slot)})`, stopOpacity: `calc(var(--km-glow) * ${String(share)})` }}
                />
              ))}
            </radialGradient>
          ))}
          {/* Flatter than the glow, so the halo's edge, and so its area, reads. */}
          {Array.from({ length: SLOT_COUNT }, (_, slot) => (
            <radialGradient key={`halo${String(slot)}`} id={`${uid}-halo-${String(slot)}`}>
              <stop
                offset="0"
                style={{ stopColor: `var(--km-${String(slot)})`, stopOpacity: "calc(var(--km-halo-alpha) * 1.5)" }}
              />
              <stop
                offset="0.62"
                style={{ stopColor: `var(--km-${String(slot)})`, stopOpacity: "var(--km-halo-alpha)" }}
              />
              <stop
                offset="0.88"
                style={{ stopColor: `var(--km-${String(slot)})`, stopOpacity: "calc(var(--km-halo-alpha) * 0.55)" }}
              />
              <stop offset="1" style={{ stopColor: `var(--km-${String(slot)})`, stopOpacity: 0 }} />
            </radialGradient>
          ))}
        </defs>

        <g>
          {model.segments.map(([from, to]) => {
            const a = model.dots[from];
            const b = model.dots[to];
            if (a === undefined || b === undefined) return null;
            const dim = anyLit && !(litByIndex.has(from) && litByIndex.has(to));
            return (
              <line
                key={from}
                className={cn(styles.line, slotClass(a.slot), dim && styles.lineDim)}
                x1={pct(a.fx)}
                y1={pct(a.fy)}
                x2={pct(b.fx)}
                y2={pct(b.fy)}
              />
            );
          })}
        </g>

        <g>
          {model.dots.map((dot) => (
            <circle
              key={dot.id}
              className={cn(styles.glow, anyLit && !litByIndex.has(dot.index) && styles.dim)}
              cx={pct(dot.fx)}
              cy={pct(dot.fy)}
              r={glow}
              fill={`url(#${uid}-glow-${String(dot.slot)})`}
            />
          ))}
        </g>

        <g>
          {lit.map((item) => {
            const dot = model.dots[item.index];
            const radius = haloMax * Math.sqrt(item.share);
            if (dot === undefined || radius < 0.5) return null;
            return (
              <circle
                key={dot.id}
                className={styles.halo}
                style={vars({ "--r": item.rank - 1 })}
                cx={pct(dot.fx)}
                cy={pct(dot.fy)}
                r={radius}
                fill={`url(#${uid}-halo-${String(dot.slot)})`}
              />
            );
          })}
        </g>

        <g>
          {model.dots.map((dot) => (
            <circle
              key={dot.id}
              data-dot={dot.index}
              className={cn(styles.core, slotClass(dot.slot), anyLit && !litByIndex.has(dot.index) && styles.dim)}
              cx={pct(dot.fx)}
              cy={pct(dot.fy)}
              r={CORE_R}
            />
          ))}
        </g>

        <g style={{ fontSize: LABEL_PX[variant] }}>
          {labelled.map((group, i) => (
            <text
              key={group.name}
              className={styles.label}
              x={pct(group.fx)}
              y={pct(group.fy)}
              dx={labelSpots[i]?.dx ?? 0}
              dy={labelSpots[i]?.dy ?? 0}
            >
              {group.name}
            </text>
          ))}
        </g>

        <g>
          {lit.map((item) => {
            const dot = model.dots[item.index];
            if (dot === undefined) return null;
            const spot = rankSpots.get(item.index);
            const delay = vars({ "--r": item.rank - 1 });
            return (
              <g key={dot.id}>
                <circle className={styles.ring} style={delay} cx={pct(dot.fx)} cy={pct(dot.fy)} r={RING_R} />
                <text
                  className={styles.rank}
                  style={delay}
                  x={pct(dot.fx)}
                  y={pct(dot.fy)}
                  dx={spot?.dx ?? 7}
                  dy={spot?.dy ?? -7}
                >
                  {item.rank}
                </text>
              </g>
            );
          })}
        </g>
      </>
    );
  }, [uid, variant, model, lit, litByIndex, haloMax, labelled, labelSpots, rankSpots]);

  // What the tooltip and the focus ring describe: the dot under the mouse,
  // else the one tapped, else the keyboard's.
  const pointed = hover ?? touched ?? (keyboard ? cursor : null);
  const pointedDot = pointed === null ? undefined : model.dots[pointed];
  const pointedDoc = pointedDot === undefined ? undefined : model.docs[pointedDot.doc];
  const pointedHit = pointed === null ? undefined : litByIndex.get(pointed);

  const activeIndex =
    activeId === undefined ? (pointedHit?.index ?? null) : activeId === null ? null : (model.byId.get(activeId) ?? null);
  const active = activeIndex === null ? undefined : litByIndex.get(activeIndex);
  const activeDot = active === undefined ? undefined : model.dots[active.index];

  const report = (index: number | null): void => {
    const id = index !== null && litByIndex.has(index) ? (model.dots[index]?.id ?? null) : null;
    if (id === reported.current) return;
    reported.current = id;
    onActiveChange?.(id);
  };

  const ask = (index: number): void => {
    const dot = model.dots[index];
    const doc = dot === undefined ? undefined : model.docs[dot.doc];
    const origin = frame.current?.querySelector(`[data-dot="${String(index)}"]`) ?? frame.current;
    if (onAsk === undefined || doc === undefined || origin === null) return;
    onAsk(doc.question, origin);
  };

  const nearest = (clientX: number, clientY: number, reach: number): number | null => {
    const element = frame.current;
    if (element === null) return null;
    const box = element.getBoundingClientRect();
    const x = clientX - box.left;
    const y = clientY - box.top;
    let best: number | null = null;
    let bestDistance = reach * reach;
    for (const dot of model.dots) {
      const dx = dot.fx * box.width - x;
      const dy = dot.fy * box.height - y;
      const distance = dx * dx + dy * dy;
      if (distance <= bestDistance) {
        bestDistance = distance;
        best = dot.index;
      }
    }
    return best;
  };

  const drift = (event: PointerEvent<HTMLDivElement>): void => {
    const element = grid.current;
    if (element === null || event.pointerType !== "mouse" || still()) return;
    const box = event.currentTarget.getBoundingClientRect();
    const nx = ((event.clientX - box.left) / box.width) * 2 - 1;
    const ny = ((event.clientY - box.top) / box.height) * 2 - 1;
    element.style.transform = `translate3d(${(-nx * PARALLAX_PX).toFixed(2)}px, ${(-ny * PARALLAX_PX).toFixed(2)}px, 0)`;
  };

  /** First passage of the next document, or of this one or the previous one going back. */
  const jump = (from: number, direction: 1 | -1): number => {
    const dots = model.dots;
    const doc = dots[from]?.doc;
    if (direction === 1) {
      for (let i = from + 1; i < dots.length; i += 1) if (dots[i]?.doc !== doc) return i;
      return from;
    }
    let start = from;
    while (start > 0 && dots[start - 1]?.doc === doc) start -= 1;
    if (start !== from || start === 0) return start;
    const previous = dots[start - 1]?.doc;
    let first = start - 1;
    while (first > 0 && dots[first - 1]?.doc === previous) first -= 1;
    return first;
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const last = model.dots.length - 1;
    if (last < 0) return;
    const start = lit[0]?.index ?? 0;
    let next: number;
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        next = cursor === null ? start : Math.min(last, cursor + 1);
        break;
      case "ArrowLeft":
      case "ArrowUp":
        next = cursor === null ? start : Math.max(0, cursor - 1);
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = last;
        break;
      case "PageDown":
        next = cursor === null ? start : jump(cursor, 1);
        break;
      case "PageUp":
        next = cursor === null ? start : jump(cursor, -1);
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
        report(hover);
        return;
      default:
        return;
    }
    event.preventDefault();
    setKeyboard(true);
    setCursor(next);
    report(next);
  };

  const options = useMemo(
    () =>
      model.dots.map((dot) => {
        const doc = model.docs[dot.doc];
        const hit = litByIndex.get(dot.index);
        const where = doc === undefined ? "" : `${doc.spoken}, ${doc.group}, passage ${String(dot.ordinal)} of ${String(doc.passages)}`;
        return {
          id: dot.id,
          index: dot.index,
          label: hit === undefined ? where : `${where}, retrieved at rank ${String(hit.rank)}, similarity ${hit.score.toFixed(3)}`,
        };
      }),
    [model, litByIndex],
  );

  if (model.dots.length === 0) {
    return (
      <div className={cn(styles.root, className)}>
        <p className="text-ink-muted text-micro">There are no passages to map.</p>
      </div>
    );
  }

  const hero = variant === "hero";
  const summary = `Map of ${count(model.dots.length, "passage", "passages")} from ${count(model.documentCount, "document", "documents")}, coloured by source and placed by a projection of their embeddings that keeps ${String(model.keep)}% of the variation. ${model.groups.map((group) => `${group.name}: ${String(group.passages)}`).join(", ")}.${retrieval === "" ? "" : ` ${retrieval}`}`;
  const hint =
    onAsk === undefined
      ? undefined
      : hover !== null
        ? "Click to ask about it"
        : touched !== null
          ? "Tap again to ask about it"
          : "Press Enter to ask about it";

  const stage = (
    <div className={cn(styles.stage, hero ? "rounded-2xl p-3 sm:p-4" : "rounded-xl p-3")}>
      <div aria-hidden className={styles.gridClip}>
        <div ref={grid} className={styles.grid} />
      </div>

      <div ref={frame} className="relative" style={{ aspectRatio: String(model.ratio) }}>
        <svg
          key={signature}
          role="img"
          aria-label={summary}
          className={cn(styles.svg, lit.length > 0 && styles.reveal)}
        >
          {marks}

          {active !== undefined && activeDot !== undefined && (
            // Prefixed keys: the active dot and the cursor can be the same dot,
            // and siblings sharing a key can make React drop or duplicate one.
            <g key={`active-${activeDot.id}`} className={cn(styles.emph, slotClass(activeDot.slot))}>
              <circle
                className={cn(styles.ring, styles.ringActive)}
                cx={pct(activeDot.fx)}
                cy={pct(activeDot.fy)}
                r={RING_R_ACTIVE}
              />
              <circle className={styles.core} cx={pct(activeDot.fx)} cy={pct(activeDot.fy)} r={CORE_R} />
              <text
                className={styles.rank}
                x={pct(activeDot.fx)}
                y={pct(activeDot.fy)}
                dx={(rankSpots.get(active.index)?.dx ?? 7) * 1.3}
                dy={(rankSpots.get(active.index)?.dy ?? -7) * 1.3}
              >
                {active.rank}
              </text>
            </g>
          )}

          {pointedDot !== undefined && (
            <circle
              key={`cursor-${pointedDot.id}`}
              className={styles.cursor}
              cx={pct(pointedDot.fx)}
              cy={pct(pointedDot.fy)}
              r={active?.index === pointedDot.index ? RING_R_ACTIVE + 3 : CURSOR_R}
            />
          )}
        </svg>

        {pointedDot !== undefined && pointedDoc !== undefined && (
          <div
            key={pointedDot.id}
            aria-hidden
            className={cn(
              styles.tip,
              "glass-strong border-glass-border rounded-xl border px-3 py-2 shadow-[0_14px_32px_-14px_var(--glass-shadow)]",
            )}
            data-below={pointedDot.fy * height < 118 ? "" : undefined}
            style={{ left: pct(pointedDot.fx), top: pct(pointedDot.fy), ...vars({ "--ax": pointedDot.fx.toFixed(3) }) }}
          >
            <p className="text-ink-muted flex items-center gap-1.5 text-micro">
              <span className={cn(styles.swatch, slotClass(pointedDoc.slot))} />
              {pointedDoc.group}
            </p>
            <p className="text-ink mt-1 text-label leading-snug font-medium">{pointedDoc.title}</p>
            {pointedDoc.context !== undefined && (
              <p className="text-ink-muted truncate text-micro">{pointedDoc.context}</p>
            )}
            <p className="text-ink-muted mt-1 text-micro">
              Passage {pointedDot.ordinal} of {pointedDoc.passages}
              {pointedHit !== undefined && (
                <>
                  {" "}
                  · rank {pointedHit.rank} ·{" "}
                  <span className="text-ink font-mono tabular-nums">{pointedHit.score.toFixed(3)}</span>
                </>
              )}
            </p>
            {hint !== undefined && <p className="text-evidence mt-1 text-micro font-medium">{hint}</p>}
          </div>
        )}
      </div>

      <div
        role="listbox"
        tabIndex={0}
        aria-label="Passages on the map, in reading order"
        aria-describedby={`${uid}-keys`}
        aria-activedescendant={keyboard && cursor !== null ? `${uid}-o${String(cursor)}` : undefined}
        className={styles.overlay}
        data-pointing={onAsk !== undefined && hover !== null ? "" : undefined}
        onPointerMove={(event) => {
          if (event.pointerType === "touch") return;
          drift(event);
          const index = nearest(event.clientX, event.clientY, REACH.mouse);
          if (index === hover) return;
          setHover(index);
          report(index ?? touched ?? (keyboard ? cursor : null));
        }}
        onPointerLeave={() => {
          if (grid.current !== null) grid.current.style.transform = "";
          setHover(null);
          report(touched ?? (keyboard ? cursor : null));
        }}
        onPointerUp={(event) => {
          if (event.pointerType === "touch") {
            const index = nearest(event.clientX, event.clientY, REACH.touch);
            if (index !== null && index === touched) {
              ask(index);
              return;
            }
            setTouched(index);
            report(index);
            return;
          }
          if (event.button !== 0) return;
          const index = nearest(event.clientX, event.clientY, REACH.mouse);
          if (index !== null) ask(index);
        }}
        onFocus={(event) => {
          if (!event.currentTarget.matches(":focus-visible")) return;
          const start = cursor ?? lit[0]?.index ?? 0;
          setKeyboard(true);
          setCursor(start);
          report(start);
        }}
        onBlur={() => {
          setKeyboard(false);
          report(hover ?? touched);
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

      <p id={`${uid}-keys`} className="sr-only">
        Arrow keys move between passages in reading order, and Page Up and Page Down jump between
        documents.{onAsk === undefined ? "" : " Enter asks about the passage's document."} Escape clears.
      </p>
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </div>
  );

  if (!hero) {
    return (
      <div className={cn(styles.root, "w-full max-w-[20rem]", className)}>
        <figure>
          {stage}
          <figcaption className="text-ink-muted flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-1 pt-2 text-micro">
            <span>
              {lit.length > 0
                ? `${String(lit.length)} of ${String(model.dots.length)} passages retrieved`
                : `None of the ${String(model.dots.length)} passages were retrieved`}
              {lit.length > 0 && <span className="sr-only">. Numbers show rank; glow area shows similarity.</span>}
            </span>
            {lit.length > 0 && <Key />}
          </figcaption>
        </figure>
      </div>
    );
  }

  const legend: Array<[string, Group[]]> = [
    ["Writing", model.groups.filter((group) => group.writing)],
    ["Code", model.groups.filter((group) => !group.writing)],
  ];

  return (
    <div className={cn(styles.root, "@container", className)}>
      <figure className="glass-inset grid items-start gap-x-5 gap-y-4 rounded-3xl p-4 sm:p-5 @xl:grid-cols-[minmax(0,1fr)_13rem]">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 @xl:col-span-2">
          <p className="text-ink text-ui font-medium">What I can draw on</p>
          <p className="text-ink-muted text-micro tabular-nums">
            {count(model.dots.length, "passage", "passages")} · {count(model.documentCount, "document", "documents")}
          </p>
        </div>

        {stage}

        <figcaption className="grid gap-4 @xl:pt-1">
          <div className="grid grid-cols-2 gap-x-4 gap-y-3 @xl:grid-cols-1">
            {legend.map(([heading, groups]) =>
              groups.length === 0 ? null : (
                <div key={heading}>
                  <p className="text-ink-muted mb-1.5 text-micro font-medium">{heading}</p>
                  <ul className="space-y-1.5">
                    {groups.map((group) => (
                      <li key={group.name} className="flex items-baseline gap-2 text-label leading-snug">
                        <span aria-hidden className={cn(styles.swatch, slotClass(group.slot), "translate-y-[-1px]")} />
                        <span className="text-ink min-w-0 flex-1">{group.name}</span>
                        <span className="text-ink-muted font-mono text-micro tabular-nums">
                          {group.passages}
                          <span className="sr-only"> passages</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ),
            )}
          </div>
          <p className="text-ink-muted text-micro leading-[1.55] text-pretty">
            Each dot is one of the {model.dots.length} passages I search, coloured by source. Positions
            come from a PCA projection that keeps {model.keep}% of the variation: dots far apart really
            are different; dots close together may still differ.{" "}
            {lit.length > 0
              ? "Lit dots are the passages retrieved for this question (number: rank; glow area: similarity); the question itself isn't plotted."
              : "When you ask, the passages I retrieve light up; the question itself isn't plotted."}
          </p>
        </figcaption>
      </figure>
    </div>
  );
}

/**
 * The compact map's key, drawn with the map's own marks: a ring with its
 * number for rank, and two glows of different size for similarity, since it
 * is the glow's area that grows with the score.
 */
function Key() {
  return (
    <span aria-hidden className="inline-flex items-center gap-3">
      <span className="inline-flex items-center gap-1">
        <svg width="17" height="14" viewBox="0 0 17 14" className="overflow-visible">
          <circle cx="6" cy="8" r="4.5" className={styles.keyRing} />
          <text x="13" y="3.5" className={styles.keyRank}>
            1
          </text>
        </svg>
        rank
      </span>
      <span className="inline-flex items-center gap-1">
        <svg width="20" height="14" viewBox="0 0 20 14">
          <circle cx="3.5" cy="7" r="2.5" className={styles.keyGlow} />
          <circle cx="13.5" cy="7" r="6" className={styles.keyGlow} />
        </svg>
        similarity
      </span>
    </span>
  );
}
