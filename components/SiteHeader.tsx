import { getProfile, filled } from "@/lib/profile";

const SECTIONS = [
  { href: "#projects", label: "Work" },
  { href: "#skills", label: "Skills" },
  { href: "#experience", label: "Experience" },
  { href: "#credentials", label: "Credentials" },
] as const;

/**
 * A persistent header, so the name and a way to make contact are always
 * reachable and the page announces what it contains before anyone scrolls.
 *
 * These are real anchors to real sections. The reference build uses tabs here
 * for three assistant modes, which is a good idea, but tabs that do not switch
 * anything are a lie told in UI, so the structure is expressed as navigation
 * until the modes exist.
 */
export function SiteHeader() {
  const profile = getProfile();
  const availability = filled(profile.availability.status);

  return (
    <header className="border-rule bg-paper/85 sticky top-0 z-10 border-b backdrop-blur-sm">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-5 py-3 sm:px-8">
        <a
          href="#top"
          className="text-ink text-ui font-medium tracking-tight whitespace-nowrap"
        >
          {profile.preferred_name} Kumar Singh
        </a>

        <nav aria-label="Sections" className="hidden gap-5 text-label md:flex">
          {SECTIONS.map((section) => (
            <a
              key={section.href}
              href={section.href}
              className="text-ink-muted hover:text-ink hover:decoration-rule-strong underline decoration-transparent decoration-1 underline-offset-4 transition-colors"
            >
              {section.label}
            </a>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-5 text-label">
          {availability !== undefined && (
            <span className="text-ink-muted hidden lg:inline">{availability}</span>
          )}
          <a
            href={`mailto:${profile.contact.email}`}
            className="border-rule-strong text-accent hover:bg-sunken border px-3 py-1.5 transition-colors"
          >
            Get in touch
          </a>
        </div>
      </div>
    </header>
  );
}
