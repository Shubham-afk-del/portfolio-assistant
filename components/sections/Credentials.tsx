import { getProfile, filled } from "@/lib/profile";
import { filledList } from "@/lib/profile";
import { monthLabel } from "@/lib/format";
import { Section } from "@/components/Section";

/** Education and certifications. Dated, and the in-progress ones say so. */
export function Credentials() {
  const profile = getProfile();

  return (
    <Section id="credentials" title="Education and credentials">
      <div className="space-y-7">
        <ol className="divide-rule divide-y border-rule border-t">
          {profile.education.map((entry) => {
            const status = filled(entry.status);
            const modules = filledList(entry.modules);
            return (
              <li key={`${entry.school}-${entry.start}`} className="py-3">
                <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
                  <h3 className="text-ink text-ui">
                    {entry.credential}
                    <span className="text-ink-muted">, {entry.school}</span>
                  </h3>
                  <p className="text-ink-muted shrink-0 text-label tabular-nums">
                    {monthLabel(entry.start)} to {monthLabel(entry.end)}
                    {status !== undefined && <span className="ml-2">{status}</span>}
                  </p>
                </div>
                {modules !== undefined && (
                  <p className="text-ink-muted mt-1 text-label">{modules.join(", ")}</p>
                )}
              </li>
            );
          })}
        </ol>

        <div>
          <h3 className="text-ink text-label font-medium">Certifications</h3>
          <ol className="divide-rule mt-2 divide-y border-rule border-t">
            {profile.certifications.map((cert) => (
              <li
                key={cert.name}
                className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 py-3"
              >
                <p className="text-ink max-w-[52ch] text-ui">
                  {cert.name}
                  <span className="text-ink-muted">, {cert.issuer}</span>
                </p>
                <p className="text-ink-muted shrink-0 text-label tabular-nums">
                  {monthLabel(cert.date)}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </Section>
  );
}
