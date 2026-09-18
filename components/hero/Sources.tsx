import { profile } from "@/lib/profile";
import { publicFileSize } from "@/lib/asset";

interface Source {
  label: string;
  href: string;
  meta?: string;
  download?: string;
}

/**
 * The evidence column. Present from first paint and constant in meaning: it
 * always answers "where does this come from". Before there are retrieved
 * sources it lists the canonical ones; retrieved sources are appended here,
 * aligned to the line carrying their citation mark (DESIGN-TOKENS.md).
 */
export function Sources() {
  const sources: Source[] = [
    {
      label: "resume.pdf",
      href: "/resume.pdf",
      meta: publicFileSize("resume.pdf"),
      download: "Shubham-Kumar-Singh-CV.pdf",
    },
    { label: "profile.yaml", href: "#", meta: "structured facts" },
  ];

  if (profile.contact.github !== undefined) {
    sources.push({ label: "github", href: profile.contact.github });
  }
  if (profile.contact.linkedin !== undefined) {
    sources.push({ label: "linkedin", href: profile.contact.linkedin });
  }

  return (
    <aside
      aria-labelledby="sources-label"
      className="border-rule mt-12 border-t pt-4 lg:mt-0 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-8"
    >
      <h2 id="sources-label" className="text-ink-muted text-label">
        Sources
      </h2>

      <ul className="mt-3 space-y-2">
        {sources.map((source) => (
          <li key={source.label} className="flex items-baseline justify-between gap-4">
            {source.href === "#" ? (
              <span className="text-ui">{source.label}</span>
            ) : (
              <a
                href={source.href}
                {...(source.download !== undefined
                  ? { download: source.download }
                  : { rel: "me noopener", target: "_blank" })}
                className="text-accent decoration-accent/40 hover:decoration-accent text-ui underline decoration-1 underline-offset-4"
              >
                {source.label}
              </a>
            )}
            {source.meta !== undefined && (
              <span className="text-ink-muted shrink-0 text-label">{source.meta}</span>
            )}
          </li>
        ))}
      </ul>

      <p className="text-ink-muted mt-6 max-w-[34ch] text-label">
        Structured facts come from profile.yaml and go into the prompt verbatim.
        Narrative answers are retrieved, and each one will cite the document it
        came from.
      </p>
    </aside>
  );
}
