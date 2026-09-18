interface SectionProps {
  id: string;
  title: string;
  lede?: string;
  children: React.ReactNode;
}

/**
 * One section shape for the whole page: a hairline, a quiet sentence-case
 * heading, and the content. Structure comes from the rule and the alignment,
 * which is why there are no cards anywhere in this UI.
 */
export function Section({ id, title, lede, children }: SectionProps) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-heading`}
      className="border-rule scroll-mt-20 border-t pt-8"
    >
      <div className="lg:grid lg:grid-cols-[14rem_minmax(0,1fr)] lg:gap-10">
        <div>
          <h2 id={`${id}-heading`} className="text-ink text-ui font-medium">
            {title}
          </h2>
          {lede !== undefined && (
            <p className="text-ink-muted mt-1 max-w-[30ch] text-label">{lede}</p>
          )}
        </div>
        <div className="mt-5 min-w-0 lg:mt-0">{children}</div>
      </div>
    </section>
  );
}
