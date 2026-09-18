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
      <ul className="divide-rule divide-y">
        {projects.map((project) => {
          const oneLiner = filled(project.one_liner);
          return (
            <li key={project.name} className="py-5 first:pt-0 last:pb-0">
              <h3 className="text-ink text-ui font-medium">{project.name}</h3>

              {oneLiner !== undefined && (
                <p className="font-prose text-ink mt-1.5 max-w-[62ch] text-prose-sm">
                  {oneLiner}
                </p>
              )}

              {project.stack.length > 0 && (
                <p className="text-ink-muted mt-2.5 text-label">
                  {project.stack.join(", ")}
                </p>
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
            </li>
          );
        })}
      </ul>
    </Section>
  );
}
