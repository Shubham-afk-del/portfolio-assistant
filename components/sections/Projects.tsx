import { getProfile, filled } from "@/lib/profile";
import { Section } from "@/components/Section";

/**
 * Projects first, because for an ML role the work is the argument. Every number
 * shown here comes from the notebook output it was measured in; nothing is
 * rounded up and nothing is estimated.
 */
export function Projects() {
  const projects = getProfile().projects;

  return (
    <Section
      id="projects"
      title="Work"
      lede="Each of these has a case study behind it: what the problem was, what I chose, and what the numbers came out at."
    >
      <ul className="border-rule grid border-t sm:grid-cols-2 sm:gap-x-8">
        {projects.map((project) => {
          const oneLiner = filled(project.one_liner);
          return (
            <li
              key={project.name}
              className="border-rule flex flex-col border-b py-5 sm:border-b-0 sm:[&:nth-child(n+3)]:border-t"
            >
              <h3 className="text-ink text-ui font-medium">{project.name}</h3>

              {oneLiner !== undefined && (
                <p className="font-prose text-ink mt-1.5 max-w-[46ch] text-prose-sm">
                  {oneLiner}
                </p>
              )}

              {/* Measured figures, in monospace because they are tabular data.
                * Each one traces to the notebook output it came from. */}
              {project.metrics.length > 0 && (
                <dl className="border-rule mt-4 grid grid-cols-3 gap-x-4 border-t pt-3">
                  {project.metrics.map((metric) => (
                    <div key={metric.label}>
                      <dd className="text-ink font-mono text-ui tabular-nums">
                        {metric.value}
                      </dd>
                      <dt className="text-ink-muted mt-0.5 text-label">{metric.label}</dt>
                    </div>
                  ))}
                </dl>
              )}

              <div className="mt-auto pt-4">
                {project.stack.length > 0 && (
                  <p className="text-ink-muted text-label">{project.stack.join(", ")}</p>
                )}

                {project.repo !== undefined && (
                  <a
                    href={project.repo}
                    rel="noopener"
                    target="_blank"
                    className="text-accent decoration-accent/40 hover:decoration-accent mt-2 inline-block text-label underline decoration-1 underline-offset-4"
                  >
                    Source on GitHub
                  </a>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}
