import { getProfile } from "@/lib/profile";
import { loadIndex } from "@/lib/retrieval/index-store";

interface Signal {
  value: string;
  label: string;
}

/**
 * The numbers a recruiter skimming for fifteen seconds should hit first.
 *
 * Every figure is derived, never written down here. Two come from the
 * `metrics` already on the projects in profile.yaml, and two from the built
 * index, so the page reports the real size of the corpus behind it rather than
 * a number someone typed. If a figure cannot be derived it is omitted, which
 * is the same rule the rest of this UI follows.
 */
export function Signals() {
  const projects = getProfile().projects;
  const signals: Signal[] = [];

  for (const project of projects) {
    const first = project.metrics[0];
    if (first !== undefined) signals.push({ value: first.value, label: first.label });
  }

  try {
    const index = loadIndex();
    signals.push({ value: String(index.chunks.length), label: "chunks indexed" });
    signals.push({ value: String(index.documents.length), label: "source documents" });
  } catch {
    // No index yet. The band renders with whatever it has rather than failing.
  }

  if (signals.length === 0) return null;

  return (
    <dl className="border-rule mt-10 grid grid-cols-2 gap-x-6 gap-y-5 border-t pt-5 sm:grid-cols-4">
      {signals.slice(0, 4).map((signal) => (
        <div key={signal.label}>
          <dd className="text-ink font-mono text-lead tabular-nums">{signal.value}</dd>
          <dt className="text-ink-muted mt-1 text-label">{signal.label}</dt>
        </div>
      ))}
    </dl>
  );
}
