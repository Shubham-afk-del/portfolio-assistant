/**
 * The chat input is the product, so the hero opens with it (PHASE-0.md §4).
 *
 * It is not wired up yet, and it is not pretending to be. The earlier version
 * rendered a flat grey disabled input under an apology, which read as broken
 * rather than as pending: a visitor cannot tell "not built yet" from "it
 * crashed". So the field keeps the accent rail that marks evidence everywhere
 * else in this UI, the state is stated once in plain words, and the questions
 * underneath show what it will be asked.
 *
 * The questions are hardcoded here, which is the one thing on this page that
 * is. SPEC-v2 §13 wants them generated from the corpus, and that arrives with
 * the chat route in Phase 5. They are written as the questions a recruiter
 * actually asks, and each one is answerable from a document already in the
 * index.
 */

const QUESTIONS = [
  "What has he actually shipped end to end?",
  "How strong is he on PyTorch, really?",
  "What went wrong with the delivery-time model?",
  "Why did he leave IT support?",
] as const;

export function Composer() {
  return (
    <section className="mt-9" aria-labelledby="composer-label">
      <h2 id="composer-label" className="text-label text-ink-muted">
        Ask about his engineering work
      </h2>

      <div className="border-rule-strong bg-sunken mt-2 flex items-stretch border">
        <span aria-hidden className="bg-accent w-0.5 shrink-0" />
        <input
          type="text"
          disabled
          aria-describedby="composer-status"
          placeholder="Ask a question…"
          className="placeholder:text-ink-muted min-w-0 flex-1 bg-transparent px-4 py-3.5 text-ui outline-none"
        />
        <kbd className="text-ink-muted my-auto mr-3 border-rule border px-1.5 py-0.5 text-label">
          ⏎
        </kbd>
      </div>

      <p id="composer-status" className="text-ink-muted mt-3 max-w-[62ch] text-label">
        Not answering yet. The retrieval pipeline and its eval harness are built
        first, on purpose, so that the answers can be measured rather than
        asserted. The résumé above is the authoritative record meanwhile.
      </p>

      <ul className="mt-5 flex flex-wrap gap-2" aria-label="Questions it is being built to answer">
        {QUESTIONS.map((question) => (
          <li
            key={question}
            className="border-rule text-ink-muted border px-2.5 py-1.5 text-label"
          >
            {question}
          </li>
        ))}
      </ul>
    </section>
  );
}
