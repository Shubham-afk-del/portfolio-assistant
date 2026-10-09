"use client";

export interface Hit {
  id: string;
  title: string;
  docType: string;
  score: number;
  path: string;
  url?: string;
  snippet: string;
}

export interface SourcesPayload {
  hits: Hit[];
  threshold: number;
}

/**
 * The sources, with their real similarity scores drawn as bars.
 *
 * The bar is the score, scaled against the best hit in the set rather than
 * against 1.0, because cosine similarity on this corpus clusters between about
 * 0.4 and 0.6 and a bar scaled to 1.0 would make every result look like a near
 * miss. The number beside it is the raw value, so the scaling cannot mislead.
 *
 * Staggered entrance, 40ms apart: enough to read as arriving in rank order,
 * short enough that eight of them are all in before the answer finishes.
 */
export function SourceRail({ sources }: { sources: SourcesPayload }) {
  const best = Math.max(...sources.hits.map((hit) => hit.score), 0.0001);

  return (
    <ul className="space-y-2">
      {sources.hits.map((hit, index) => {
        const width = Math.max(6, Math.round((hit.score / best) * 100));
        const weak = hit.score < sources.threshold;

        return (
          <li
            key={hit.id}
            className="animate-rise group"
            style={{ animationDelay: `${String(index * 40)}ms` }}
          >
            <div className="flex items-baseline gap-3">
              <span className="text-ink-muted w-4 shrink-0 font-mono text-label tabular-nums">
                {index + 1}
              </span>

              <span className="min-w-0 flex-1">
                {hit.url === undefined ? (
                  <span className="text-ink block truncate text-label">{hit.title}</span>
                ) : (
                  <a
                    href={hit.url}
                    rel="noreferrer"
                    target="_blank"
                    className="text-ink hover:text-evidence block truncate text-label underline decoration-transparent underline-offset-4 transition-colors group-hover:decoration-current"
                  >
                    {hit.title}
                  </a>
                )}
              </span>

              <span
                className={`shrink-0 font-mono text-label tabular-nums ${
                  weak ? "text-caution" : "text-ink-muted"
                }`}
              >
                {hit.score.toFixed(3)}
              </span>
            </div>

            {/* The score, drawn. Grows from nothing on arrival. */}
            <div className="mt-1 ml-7 h-px w-full overflow-hidden">
              <span
                aria-hidden
                className={`animate-extend block h-px origin-left ${
                  weak ? "bg-caution/50" : "bg-evidence/60"
                }`}
                style={{
                  width: `${String(width)}%`,
                  animationDelay: `${String(index * 40 + 120)}ms`,
                }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
