import { Identity } from "@/components/hero/Identity";
import { Composer } from "@/components/hero/Composer";
import { Sources } from "@/components/hero/Sources";
import { profile, filled } from "@/lib/profile";

/**
 * Phase 0 hero, built to the approved plan in DESIGN-TOKENS.md.
 *
 * Structure comes from hairline rules and alignment; there are no cards and no
 * shadows. Two columns from 1024px: the claim column, and the evidence column
 * that is constant in meaning from first paint. Everything is server-rendered,
 * with no Client Components at all, so the page and the résumé download work
 * with JavaScript disabled.
 */
export default function Page() {
  const email = profile.contact.email;
  const linkedin = filled(profile.contact.linkedin);

  return (
    <div className="flex min-h-[100dvh] flex-col">
      <main className="mx-auto w-full max-w-5xl grow px-5 py-12 sm:px-8 lg:py-20">
        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_17rem] lg:gap-10">
          <div className="min-w-0">
            <Identity />
            <Composer />
          </div>
          <Sources />
        </div>
      </main>

      <footer className="border-rule mx-auto w-full max-w-5xl border-t px-5 py-6 sm:px-8">
        <p className="text-ink-muted max-w-[68ch] text-label">
          An AI assistant, and it may be imprecise. The résumé is the
          authoritative record, and answers will cite their sources so any claim
          can be checked.
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-label">
          <a
            href={`mailto:${email}`}
            className="text-accent decoration-accent/40 hover:decoration-accent underline decoration-1 underline-offset-4"
          >
            {email}
          </a>
          {linkedin !== undefined && (
            <a
              href={linkedin}
              rel="me noopener"
              target="_blank"
              className="border-rule-strong text-accent decoration-accent/40 hover:decoration-accent border-l pl-5 underline decoration-1 underline-offset-4"
            >
              LinkedIn
            </a>
          )}
        </div>
      </footer>

    </div>
  );
}
