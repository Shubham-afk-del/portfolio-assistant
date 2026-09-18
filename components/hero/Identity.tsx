import { profile, filled } from "@/lib/profile";
import { publicFileSize } from "@/lib/asset";

/**
 * Supporting information around the composer, not a banner above it
 * (PHASE-0.md §4). Every field here is omitted entirely when it is still
 * TODO(owner) — never rendered as placeholder text.
 */
export function Identity() {
  const headline = filled(profile.headline);
  const availability = filled(profile.availability.status);
  const resumeSize = publicFileSize("resume.pdf");

  return (
    <header>
      <h1 className="text-lead font-medium tracking-tight">{profile.name}</h1>

      {headline !== undefined && (
        <p className="font-prose mt-2 max-w-[54ch] text-prose-sm">{headline}</p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-label">
        <span className="text-ink-muted">{profile.location}</span>

        {availability !== undefined && (
          <span className="border-rule-strong text-ink border-l pl-3">
            {availability}
          </span>
        )}

        {/* A plain anchor with a download attribute: no JavaScript involved,
         * so the résumé is one click even with scripting disabled. */}
        {/* The size sits outside the anchor: a text-decoration on the anchor
         * propagates to descendants and cannot be switched off by a child, so
         * nesting it would underline the metadata too. */}
        <span className="flex items-baseline gap-1.5">
          <a
            href="/resume.pdf"
            download="Shubham-Kumar-Singh-CV.pdf"
            className="text-accent decoration-accent/40 hover:decoration-accent underline decoration-1 underline-offset-4"
          >
            Download résumé
          </a>
          <span className="text-ink-muted">PDF, {resumeSize}</span>
        </span>
      </div>
    </header>
  );
}
