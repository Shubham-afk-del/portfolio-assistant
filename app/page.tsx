import { Assistant } from "@/components/chat/Assistant";
import { getProfile, filled } from "@/lib/profile";
import { publicFileSize } from "@/lib/asset";

/**
 * One page: a short line about who this is, and the assistant.
 *
 * The portfolio content that used to live here (work, skills, experience,
 * credentials) is moving to a separate site. What this page demonstrates is
 * the system, so the system is the whole page, and the identity block is
 * deliberately the smallest thing that stops a visitor asking "who?".
 */
export default function Page() {
  const profile = getProfile();
  const headline = filled(profile.headline);
  const availability = filled(profile.availability.status);
  const email = profile.contact.email;
  const linkedin = filled(profile.contact.linkedin);

  return (
    <div className="flex h-[100dvh] flex-col">
      <header className="border-rule shrink-0 border-b">
        <div className="mx-auto w-full max-w-3xl px-5 py-5 sm:px-8 sm:py-6">
          <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
            <h1 className="text-ink text-lead font-medium tracking-tight">
              {profile.name}
            </h1>
            <p className="text-ink-muted text-label">{profile.location}</p>
          </div>

          {headline !== undefined && (
            <p className="font-prose text-ink mt-2 max-w-[56ch] text-prose-sm text-pretty">
              {headline}
            </p>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-label">
            {availability !== undefined && (
              <span className="text-ink-muted">{availability}</span>
            )}
            <span className="flex items-baseline gap-1.5">
              <a
                href="/resume.pdf"
                download="Shubham-Kumar-Singh-CV.pdf"
                className="text-evidence decoration-evidence/40 hover:decoration-evidence underline decoration-1 underline-offset-4"
              >
                Résumé
              </a>
              <span className="text-ink-muted">
                PDF, {publicFileSize("resume.pdf")}
              </span>
            </span>
            <a
              href={`mailto:${email}`}
              className="text-evidence decoration-evidence/40 hover:decoration-evidence underline decoration-1 underline-offset-4"
            >
              Email
            </a>
            {linkedin !== undefined && (
              <a
                href={linkedin}
                rel="me noopener"
                target="_blank"
                className="text-evidence decoration-evidence/40 hover:decoration-evidence underline decoration-1 underline-offset-4"
              >
                LinkedIn
              </a>
            )}
          </div>
        </div>
      </header>

      <Assistant />

      <footer className="border-rule shrink-0 border-t">
        <p className="text-ink-muted mx-auto w-full max-w-3xl px-5 py-3 text-label sm:px-8">
          An AI assistant, and it may be imprecise. The résumé is the
          authoritative record, and every answer shows the sources behind it.
        </p>
      </footer>
    </div>
  );
}
