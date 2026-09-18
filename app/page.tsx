import { SiteHeader } from "@/components/SiteHeader";
import { Identity } from "@/components/hero/Identity";
import { Composer } from "@/components/hero/Composer";
import { Sources } from "@/components/hero/Sources";
import { Projects } from "@/components/sections/Projects";
import { Skills } from "@/components/sections/Skills";
import { Experience } from "@/components/sections/Experience";
import { Credentials } from "@/components/sections/Credentials";
import { getProfile, filled } from "@/lib/profile";

/**
 * Built to the approved plan in DESIGN-TOKENS.md. Structure comes from hairline
 * rules and alignment; there are no cards and no shadows. Two columns from
 * 1024px in the hero: the claim column, and the evidence column that is constant
 * in meaning from first paint.
 *
 * Everything is server-rendered, with no Client Components at all, so the page
 * and the résumé download work with JavaScript disabled.
 *
 * The sections below the hero are a deliberate departure from the phase order.
 * SPEC-v2 §13 puts this material in generative UI blocks the model emits, which
 * is Phase 5 work. Until the assistant can answer, a recruiter arriving here has
 * 90 seconds and nothing to read, so the same verified facts are rendered
 * statically. They come out of content/profile.yaml, so there is one source of
 * truth either way and nothing here is invented.
 */
export default function Page() {
  const profile = getProfile();
  const email = profile.contact.email;
  const linkedin = filled(profile.contact.linkedin);
  const summary = filled(profile.summary);

  return (
    <div id="top" className="flex min-h-[100dvh] flex-col">
      <a
        href="#projects"
        className="focus-visible:bg-paper focus-visible:text-accent sr-only focus-visible:not-sr-only focus-visible:absolute focus-visible:top-2 focus-visible:left-2 focus-visible:z-10 focus-visible:px-3 focus-visible:py-2"
      >
        Skip to the work
      </a>

      <SiteHeader />

      <main className="mx-auto w-full max-w-5xl grow px-5 py-12 sm:px-8 lg:py-16">
        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_17rem] lg:gap-10">
          <div className="min-w-0">
            <Identity />
            <Composer />
          </div>
          <Sources />
        </div>

        <div className="mt-16 space-y-12 lg:mt-20">
          {summary !== undefined && (
            <section aria-label="Summary" className="border-rule border-t pt-8">
              <p className="font-prose text-ink max-w-[68ch] text-prose">{summary}</p>
            </section>
          )}
          <Projects />
          <Skills />
          <Experience />
          <Credentials />
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
