import { getProfile, filled } from "@/lib/profile";
import { withoutTodo } from "@/lib/format";
import { Section } from "@/components/Section";
import { SkillLevel } from "@/lib/schema";

/** Strongest first. `familiar` renders as familiar, per SPEC-v2 §11. */
const ORDER: readonly SkillLevel[] = ["expert", "strong", "working", "familiar"];

const MEANING: Record<SkillLevel, string> = {
  expert: "could lead others",
  strong: "production, independent",
  working: "shipped something real",
  familiar: "coursework or tutorials only",
};

/**
 * The calibration is the point of this section, not the list. A visitor who
 * sees PyTorch marked `familiar` next to ServiceNow marked `strong` learns
 * something about the person that a wall of logos cannot tell them.
 *
 * Skills with no level set are omitted rather than shown at a guessed level.
 * So are skills whose evidence line is still outstanding: a level with nothing
 * beside it is exactly the unsupported assertion this profile refuses to make,
 * and an empty cell reads as a broken layout rather than an honest gap.
 */
export function Skills() {
  const skills = getProfile().skills;

  const evidenced = skills.filter((skill) => {
    const evidence = filled(skill.evidence);
    return evidence !== undefined && withoutTodo(evidence).length > 0;
  });

  const grouped = ORDER.map((level) => ({
    level,
    items: evidenced.filter((s) => s.level === level),
  })).filter((group) => group.items.length > 0);

  return (
    <Section
      id="skills"
      title="Skills, calibrated"
      lede="Levels are set against the evidence beside them. Nothing here is rounded up, which is why some of it says coursework."
    >
      <div className="space-y-7">
        {grouped.map((group) => (
          <div key={group.level}>
            <h3 className="text-ink text-label font-medium">
              {group.level}
              <span className="text-ink-muted ml-2 font-normal">
                {MEANING[group.level]}
              </span>
            </h3>

            <dl className="divide-rule mt-2 divide-y border-t border-rule">
              {group.items.map((skill) => (
                <div
                  key={skill.name}
                  className="py-3 sm:grid sm:grid-cols-[11rem_minmax(0,1fr)] sm:gap-6"
                >
                  <dt className="text-ink text-ui">{skill.name}</dt>
                  <dd className="text-ink-muted mt-1 max-w-[58ch] text-label sm:mt-0">
                    {withoutTodo(filled(skill.evidence) ?? "")}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>
    </Section>
  );
}
