# SPEC-ADDENDUM-ESCALATION.md — human-in-the-loop answer relay

> Amends `SPEC-v2.md` and `SPEC-v2-ML-OVERLAY.md`. Slots in as **Phase 8.5**, after the retrieval
> gate and observability exist. Do not build it earlier — it depends on the relevance gate (v2 §9)
> and it needs real traffic to be worth anything.

---

## What it is, and how to describe it

A recruiter asks something the corpus can't answer. Instead of a dead end, the bot escalates to
Shubham, he answers from his phone, the answer reaches the recruiter, and **the answer is written
back into the corpus** so the bot knows it permanently.

Call it what it is: **an active-learning loop with a human oracle.** The system detects its own
knowledge gaps, routes them to a human for labelling, and incorporates the labels into its
knowledge base. That is a real ML systems pattern with a name, and describing it that way is worth
considerably more in an AI/ML interview than "it sends me a notification."

The write-back is the part that makes it impressive. A notification feature is a nice touch. A
closed loop from production gap → human label → re-indexed knowledge → improved coverage, with the
coverage gain measurable on the eval set, is a systems design story. Build the write-back or don't
build the feature.

It also connects directly to the drift monitoring in the ML overlay §F: escalated questions *are*
your out-of-distribution queries, already surfaced and already labelled.

---

## Trigger conditions

Escalate only when **all** of these hold:

1. The scope classifier says in-scope (confidence above threshold) — off-topic questions never reach
   Shubham's phone.
2. The retrieval relevance gate failed: best reranked score below threshold after the agent has
   tried up to 3 searches.
3. The question isn't a near-duplicate of a pending or already-answered escalation
   (cosine similarity ≥ 0.93 against the escalation embedding index → serve the existing answer
   instead, or say "already asked, waiting on him").
4. Under the session and global escalation limits (§ Abuse).

The bot then offers rather than assumes:

> "That's not something I have on file. I can ask Shubham directly — he usually replies within
> {real_median}. Want me to send it over?"

Never escalate silently. Never claim he's online. Never promise a time the data doesn't support.

---

## Flow

```
recruiter asks → gate fails → dedupe check → bot offers to escalate → recruiter accepts
   ↓
escalation row created (status: pending)
   ↓
Telegram message to Shubham:
   ┌──────────────────────────────────────────────┐
   │ 🔔 New question · #a3f9                      │
   │ "Have you worked with PyTorch on a real       │
   │  training job, or just coursework?"           │
   │                                               │
   │ From: recruiter @ {company if given}          │
   │ Conversation: {permalink}                     │
   │ 3 similar questions asked before → {link}     │
   │                                               │
   │ Reply to this message to answer.              │
   │ /skip a3f9   /private a3f9                    │
   └──────────────────────────────────────────────┘
   ↓
Shubham replies from his phone
   ↓
webhook → store answer → deliver:
   ├─ session still open  → streams into the live chat (Realtime channel)
   ├─ email given         → email with the answer + conversation permalink
   └─ neither             → held on the permalink page
   ↓
Shubham confirms "publish to corpus?" → ingest as a new document
   ↓
question added to evals/golden.yaml as a new case
```

---

## Notification channel

**Telegram Bot API.** Free, instant, works on your phone with no app to build, and — critically —
you can answer by replying to the message, which means the whole loop is one tap. Create the bot
with @BotFather, set a webhook to `/api/telegram`, verify the secret token on every request.

Commands: reply-to-message = answer · `/skip {id}` · `/private {id}` (answer the recruiter but
never index it) · `/pending` (list open questions) · `/stats`.

Fallbacks, in order of preference: WhatsApp via Twilio (costs money, needs template approval),
email (slow, you won't reply fast enough), Slack (fine if you're in Slack all day). Don't build
web push — the delivery rates make it unreliable for exactly the moment that matters.

---

## Delivery back to the recruiter

Three paths, all needed:

- **Live** — Supabase Realtime or Pusher channel keyed to the conversation. The answer appears in
  the transcript with a distinct treatment: an avatar, "answered directly by Shubham", and a
  timestamp. This is the moment that makes someone screenshot your site and send it to a colleague.
- **Email** — only if they volunteered an address. One email, the answer, the conversation
  permalink, no marketing, no follow-up sequence.
- **Permalink** — every conversation already has a shareable URL (v2 §13). The answer lands there
  regardless, so nothing is ever lost.

Consent line at the point of email capture: what it's used for, that it isn't shared, and that
it's deleted after 90 days. Then actually delete it — a cron job, not an intention.

---

## Corpus write-back

On publish:

1. Create a document: `doc_type: qa`, title = the question, content = the answer, `source: escalation`, `answered_at`.
2. Chunk, contextualise, embed, upsert through the normal pipeline — no special path.
3. Add the question to `evals/golden.yaml` with the answer's key facts as `must_include`, so
   coverage of it is permanently tested.
4. Log it for the drift report.

**Metric to publish on `/stats`:** escalation rate over time. It should fall as the corpus grows.
A downward-sloping chart labelled "questions I couldn't answer" is a compact demonstration that the
loop works, and it is the single best screenshot for a blog post about this build.

`/private` answers deliver to the recruiter and are never indexed. Default to asking before
publishing — you will at some point type something into Telegram that you don't want on a public
website, and that guardrail is the difference between a clever feature and a bad afternoon.

---

## Abuse and failure handling

Your personal phone is now reachable from the public internet. Treat it accordingly.

| Risk | Control |
|---|---|
| Notification spam | 3 escalations per session, 20/day global, per-IP rate limit shared with chat |
| Off-topic questions reaching you | classifier gate is mandatory before escalation |
| Duplicate questions | embedding dedupe at 0.93 |
| Prompt injection via the escalation text | Telegram message renders the question as plain text, escaped, never interpreted; the question is data |
| Abusive content | Haiku toxicity check before it reaches your phone; blocked ones logged, not delivered |
| You're asleep / on a flight | bot never implies live presence; median reply time computed from real data and shown honestly |
| You never answer | after 7 days, status `expired`; if an email was given, send "couldn't get to this — reach him directly at {email}" |
| Telegram webhook down | queue in Postgres, retry with backoff, email fallback after 15 min, Sentry alert |
| Recruiter closes the tab mid-wait | answer lands on the permalink; email if given |

---

## Data model

```sql
escalations (
  id text primary key,              -- short, e.g. a3f9, used in Telegram commands
  conversation_id uuid,
  question text,
  question_embedding vector(1024),
  asker_email text,                 -- nullable, 90-day retention
  asker_context text,               -- optional "who are you / which company"
  status text,                      -- pending | answered | published | private | skipped | expired | blocked
  answer text,
  answered_at timestamptz,
  published_document_id uuid,
  created_at timestamptz
)
```

Index: HNSW on `question_embedding` for the dedupe check.

---

## Build order within Phase 8.5

1. Escalation row + trigger wired to the existing relevance gate. No notifications yet — just
   confirm the right questions get captured, using your own testing.
2. Telegram bot, webhook with secret verification, `/pending`, reply-to-answer.
3. Live delivery via Realtime; the distinct "answered by Shubham" message treatment.
4. Email delivery + consent + the 90-day deletion job.
5. Corpus write-back with the publish confirmation, plus the golden-set append.
6. Dedupe, rate limits, toxicity gate, expiry job.
7. `/stats` escalation-rate chart.

---

## Interview questions this feature earns you

Add to the §20 defense list. These are good questions to be asked — make sure you can answer them.

- How do you decide when the system doesn't know something, rather than letting it guess?
- How did you set the relevance threshold, and what's the cost of getting it wrong in each direction?
- What stops the same question paging you fifty times?
- Your escalation rate fell from X% to Y% — what drove that, and how do you know it wasn't just
  easier questions?
- How does a human-labelled answer get validated before it becomes part of the knowledge base?
- What would you change if this took 1,000 questions a day instead of 10?
