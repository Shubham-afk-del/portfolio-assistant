import { getProfile } from "@/lib/profile";
import { monthLabel, duration } from "@/lib/format";
import { Section } from "@/components/Section";

/**
 * Dates are tabular data, so they take tabular numerals and sit in their own
 * aligned column. Every date here is verified against the employment letters
 * on file rather than transcribed from the résumé.
 */
export function Experience() {
  const roles = getProfile().experience;

  return (
    <Section
      id="experience"
      title="Experience"
      lede="Three years of production IT operations before the MSc. Dates verified against the employment letters."
    >
      <ol className="divide-rule divide-y">
        {roles.map((role) => {
          const span = duration(role.start, role.end);
          return (
            <li key={`${role.company}-${role.start}`} className="py-5 first:pt-0 last:pb-0">
              <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
                <h3 className="text-ink text-ui font-medium">
                  {role.role}
                  <span className="text-ink-muted font-normal">, {role.company}</span>
                </h3>
                <p className="text-ink-muted shrink-0 text-label tabular-nums">
                  {monthLabel(role.start)} to {monthLabel(role.end)}
                  {span !== undefined && <span className="ml-2">{span}</span>}
                </p>
              </div>

              {role.location !== undefined && (
                <p className="text-ink-muted mt-0.5 text-label">{role.location}</p>
              )}

              {role.highlights.length > 0 && (
                <ul className="font-prose text-ink mt-3 max-w-[64ch] space-y-1.5 text-prose-sm">
                  {role.highlights.map((line) => (
                    <li key={line} className="border-rule-strong border-l pl-3">
                      {line}
                    </li>
                  ))}
                </ul>
              )}

              {role.stack.length > 0 && (
                <p className="text-ink-muted mt-3 text-label">{role.stack.join(", ")}</p>
              )}
            </li>
          );
        })}
      </ol>
    </Section>
  );
}
