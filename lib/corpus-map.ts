import type { CorpusIndex } from "./retrieval/types";

/**
 * The corpus as a picture: every chunk the assistant can retrieve, projected
 * from its embedding to two dimensions with PCA, computed once at build time.
 *
 * What the picture can honestly claim, and the interface says so: the two
 * axes are the two directions along which these embeddings vary most, and
 * together they keep 20% of the variance (measured on 15 Oct 2026 over 238
 * chunks: 10.7% and 8.9%; the 111 chunks of 9 Oct kept 30%, and a corpus
 * with more kinds of work in it spreads its variance over more directions).
 * A projection can only shrink distances, never stretch them, so two dots
 * far apart on the map really are dissimilar, while two dots close together
 * may still differ along a dimension the projection dropped. Nearly a third
 * of each chunk's eight nearest neighbours in the full space are also its
 * nearest on the map (random placement would keep 3%).
 *
 * There is no query point on the map. The question's embedding never reaches
 * the browser, and even a true projection of it would mislead at 20% of the
 * variance: its nearest dots on screen would often not be the retrieved ones.
 * Retrieval is shown by lighting up the chunks it actually returned.
 *
 * PCA rather than UMAP or t-SNE: it is deterministic, needs no dependency,
 * and it does not manufacture clusters the data does not have. Small
 * documents land tightly together; the four notebooks, with 160 chunks
 * between them, spread across about half of the map, which is also true.
 *
 * The welcome screen draws the same points in three dimensions, so a third
 * component, z, rides along. It keeps another 6.6% of the variance (26.2%
 * across all three, measured 15 Oct 2026) and lifts the share of the eight
 * nearest neighbours that survive the projection from 31% to 45%. The first
 * two components and their scale are untouched by it, so the 2D map, which
 * is the galaxy's fallback, draws exactly what it drew before.
 */

export interface MapDocument {
  id: string;
  title: string;
  /** docType from the index: case-study, decision, interview-answers, code. */
  kind: string;
  /**
   * What the dot is coloured by: the repository for code, the kind of
   * writing otherwise. Nine values. Colouring by docType alone would paint
   * 223 of the 238 dots the same colour, since most of the corpus is code.
   */
  group: string;
}

export interface MapPoint {
  /** The chunk id, which is also the id of a retrieved hit, so a hit can find its dot. */
  id: string;
  /** In [0, 1], on one shared scale, so distances compare across both axes. */
  x: number;
  y: number;
  /**
   * The third principal component, for the 3D galaxy on the welcome screen;
   * the 2D map ignores it. On the same scale as x and y, so a unit of depth is
   * a unit across, and from 0. The third axis varies least of the three, so
   * its range is the shortest and the galaxy comes out shallower than it is
   * wide, which is the data's shape, not a styling choice.
   */
  z: number;
  /** Index into `documents`. Points of one document are consecutive, in reading order. */
  doc: number;
}

export interface CorpusMap {
  points: MapPoint[];
  documents: MapDocument[];
  /** Height over width of the occupied area, for sizing the viewBox. */
  aspect: number;
  /** Share of variance kept by each axis, e.g. [0.19, 0.111]. */
  explained: [number, number];
  /** Share of variance kept by the third axis, `z`, e.g. 0.08. */
  explainedZ: number;
}

const WRITING: Record<string, string> = {
  "case-study": "Case studies",
  decision: "Decision records",
  "interview-answers": "Interview answers",
};

/** "LR_Delivery_Time_Prediction_-Shubham-Kumar-Singh-/notebook.ipynb" to "LR Delivery Time Prediction". */
function repositoryLabel(title: string): string {
  const repository = title.split("/")[0] ?? title;
  return repository
    .replace(/[-_]*Shubham[-_]Kumar[-_]Singh[-_]*/i, "")
    .replace(/[_-]+/g, " ")
    .trim();
}

/** A small deterministic generator, so the starting vector, and the map, are the same every build. */
function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296 - 0.5;
  };
}

function normalise(vector: Float64Array): void {
  let norm = 0;
  for (const value of vector) norm += value * value;
  norm = Math.sqrt(norm);
  if (norm === 0) return;
  for (let i = 0; i < vector.length; i += 1) vector[i]! /= norm;
}

/**
 * Leading principal component of the centred rows, by power iteration on the
 * implicit covariance (v ← Xᵀ(Xv)), kept orthogonal to `against`. Each step
 * is two passes over a 238 × 1,024 matrix, so a few hundred steps for all
 * three components take about 150 ms, once per build.
 */
function principalComponent(
  rows: Float64Array[],
  dimensions: number,
  against: Float64Array[],
  random: () => number,
): Float64Array {
  let vector = new Float64Array(dimensions);
  for (let i = 0; i < dimensions; i += 1) vector[i] = random();
  normalise(vector);

  for (let step = 0; step < 300; step += 1) {
    const next = new Float64Array(dimensions);
    for (const row of rows) {
      let projection = 0;
      for (let i = 0; i < dimensions; i += 1) projection += row[i]! * vector[i]!;
      for (let i = 0; i < dimensions; i += 1) next[i]! += projection * row[i]!;
    }
    for (const basis of against) {
      let overlap = 0;
      for (let i = 0; i < dimensions; i += 1) overlap += next[i]! * basis[i]!;
      for (let i = 0; i < dimensions; i += 1) next[i]! -= overlap * basis[i]!;
    }
    normalise(next);

    let change = 0;
    for (let i = 0; i < dimensions; i += 1) change += Math.abs(next[i]! - vector[i]!);
    vector = next;
    if (change < 1e-10) break;
  }
  return vector;
}

export function buildCorpusMap(index: CorpusIndex): CorpusMap {
  const documents: MapDocument[] = index.documents.map((document) => ({
    id: document.id,
    title: document.title,
    kind: document.docType,
    group: document.docType === "code" ? repositoryLabel(document.title) : (WRITING[document.docType] ?? "Writing"),
  }));
  const position = new Map(documents.map((document, i) => [document.id, i]));

  const chunks = index.chunks.filter((chunk) => position.has(chunk.documentId));
  const dimensions = chunks[0]?.embedding.length ?? 0;
  if (chunks.length < 3 || dimensions === 0) {
    return { points: [], documents, aspect: 1, explained: [0, 0], explainedZ: 0 };
  }

  // Unit-length rows, so the geometry is cosine geometry, then centred.
  const rows = chunks.map((chunk) => {
    const row = Float64Array.from(chunk.embedding);
    normalise(row);
    return row;
  });
  const mean = new Float64Array(dimensions);
  for (const row of rows) for (let i = 0; i < dimensions; i += 1) mean[i]! += row[i]! / rows.length;
  for (const row of rows) for (let i = 0; i < dimensions; i += 1) row[i]! -= mean[i]!;

  const random = seeded(7);
  const first = principalComponent(rows, dimensions, [], random);
  const second = principalComponent(rows, dimensions, [first], random);
  // Computed after the first two, so it draws later numbers from the same
  // generator and leaves their starting vectors, and the 2D map, unchanged.
  const third = principalComponent(rows, dimensions, [first, second], random);

  const project = (row: Float64Array, axis: Float64Array): number => {
    let sum = 0;
    for (let i = 0; i < dimensions; i += 1) sum += row[i]! * axis[i]!;
    return sum;
  };
  const xs = rows.map((row) => project(row, first));
  const ys = rows.map((row) => project(row, second));

  // A component's sign is arbitrary. Pin it so the map does not mirror itself
  // between builds: the point furthest out along each axis lands on the positive side.
  const pin = (values: number[]): number[] => {
    const extreme = values.reduce((best, value) => (Math.abs(value) > Math.abs(best) ? value : best), 0);
    return extreme < 0 ? values.map((value) => -value) : values;
  };
  const x = pin(xs);
  const y = pin(ys);
  const z = pin(rows.map((row) => project(row, third)));

  let total = 0;
  for (const row of rows) for (const value of row) total += value * value;
  const variance = (values: number[]): number => values.reduce((sum, value) => sum + value * value, 0);
  const explained: [number, number] =
    total === 0 ? [0, 0] : [variance(x) / total, variance(y) / total];
  const explainedZ = total === 0 ? 0 : variance(z) / total;

  const minX = Math.min(...x);
  const minY = Math.min(...y);
  const minZ = Math.min(...z);
  const spanX = Math.max(...x) - minX;
  const spanY = Math.max(...y) - minY;
  // The scale is still set by the first two axes alone, so x and y are
  // exactly what they were before z existed.
  const span = Math.max(spanX, spanY) || 1;

  return {
    // Four decimals is a tenth of a pixel on a 1,000px map; more is payload.
    points: chunks.map((chunk, i) => ({
      id: chunk.id,
      x: Math.round((((x[i] ?? 0) - minX) / span) * 1e4) / 1e4,
      y: Math.round((((y[i] ?? 0) - minY) / span) * 1e4) / 1e4,
      z: Math.round((((z[i] ?? 0) - minZ) / span) * 1e4) / 1e4,
      doc: position.get(chunk.documentId) ?? 0,
    })),
    documents,
    aspect: spanX === 0 ? 1 : Math.round((spanY / spanX) * 1e4) / 1e4,
    explained: [Math.round(explained[0] * 1e3) / 1e3, Math.round(explained[1] * 1e3) / 1e3],
    explainedZ: Math.round(explainedZ * 1e3) / 1e3,
  };
}
