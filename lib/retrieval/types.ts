/** Shapes shared by ingestion and retrieval. The index file is this, as JSON. */

export interface CorpusDocument {
  id: string;
  docType: string;
  title: string;
  company?: string;
  project?: string;
  date?: string;
  tech: string[];
  sourceUrl?: string;
  /** Source path, relative to the repo root. */
  path: string;
  contentHash: string;
}

export interface CorpusSection {
  id: string;
  documentId: string;
  heading: string;
  /** The whole section. Sent to the model when parent expansion is on. */
  content: string;
  ord: number;
}

export interface CorpusChunk {
  id: string;
  documentId: string;
  sectionId: string;
  /** The chunk as written. */
  content: string;
  /** One or two sentences situating the chunk, prepended before embedding. */
  contextBlurb: string;
  embedding: number[];
  tokenCount: number;
  /** Hash of the chunk text and its heading. Identifies the chunk. */
  contentHash: string;
  /**
   * Hash of the exact string that was embedded (blurb + content) and the model
   * that embedded it. Embedding reuse keys on this, not on contentHash: the
   * first run reused vectors whose blurb had changed from empty to real, which
   * left stale embeddings behind an index that looked freshly built.
   */
  embedHash: string;
}

export interface CorpusIndex {
  /** Bumped when the on-disk shape changes. */
  version: number;
  builtAt: string;
  embedModel: string;
  dimensions: number;
  /** The retrieval config this index was built under, for the ablation runner. */
  config: {
    chunkStrategy: string;
    chunkTokens: { min: number; max: number };
    contextualiseChunks: boolean;
  };
  documents: CorpusDocument[];
  sections: CorpusSection[];
  chunks: CorpusChunk[];
}

export const INDEX_VERSION = 1;
