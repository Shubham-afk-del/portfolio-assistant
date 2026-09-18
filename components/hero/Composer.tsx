/**
 * The chat input is the product, so the hero opens with it (PHASE-0.md §4).
 *
 * In Phase 0 it is inert: there is no retrieval pipeline behind it yet, and the
 * project's whole premise is that nothing gets asserted before there is
 * something real behind it. It is disabled honestly rather than faked, and the
 * note under it points at the authoritative document in the meantime.
 */
export function Composer() {
  return (
    <section className="mt-10" aria-labelledby="composer-label">
      <h2 id="composer-label" className="text-label text-ink-muted">
        Ask about his engineering work
      </h2>

      <div className="border-rule-strong bg-sunken mt-2 flex items-center gap-3 border px-4 py-3">
        <input
          type="text"
          disabled
          aria-describedby="composer-status"
          placeholder="What has he actually shipped end to end?"
          className="placeholder:text-ink-muted min-w-0 flex-1 bg-transparent text-ui outline-none"
        />
        <kbd className="text-ink-muted border-rule border px-1.5 py-0.5 text-label">
          ⏎
        </kbd>
      </div>

      <p id="composer-status" className="text-ink-muted mt-3 max-w-[60ch] text-label">
        The assistant is not answering yet. It goes live once the retrieval
        pipeline and its eval harness are in place. Until then the résumé is the
        authoritative record.
      </p>
    </section>
  );
}
