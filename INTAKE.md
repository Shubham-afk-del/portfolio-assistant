# INTAKE.md — everything I need from you

Fill this in. Blank fields become `TODO(owner)` in the build and the bot will refuse to answer
those topics rather than invent something. That's by design — but a half-filled intake makes a
half-useful bot, so spend a proper evening on §3 and §4.

**Already confirmed from your résumé, certificate and GitHub** — correct me if anything is wrong:
name, London, phone, email, GitHub `Shubham-afk-del`, LinkedIn `shubham-singh-00236a191`, the four
education entries, the three Tech Mahindra / Capgemini roles with dates, four certifications, and
the IIIT-B Advanced Certificate in Data Science with NLP specialisation (28 Oct 2025).

---

## 1. Positioning — decide these first, everything else follows

- **Exact target job titles** (pick 2–3, the wording recruiters use):
  e.g. AI Engineer / Machine Learning Engineer / ML Engineer (NLP) / Applied Scientist
  → `________`
- **What are you actually looking for right now?** ← this one blocks the build
  - [ ] Summer internship 2027
  - [ ] Industrial placement / year in industry
  - [ ] Part-time alongside the MSc (how many hours/week? `___`)
  - [ ] Full-time from graduation (month/year: `___`)
  - [ ] Open to all of the above
- **Earliest start date**: `________`
- **Locations**: London only / UK-wide / remote / open to relocation → `________`
- **Company types you want**: `________` (you said product-based — name a few targets)
- **One-line headline** the site leads with. Draft yours; here's a shape that fits your facts:
  *"MSc AI candidate at Northeastern London. 3 years in enterprise IT, now building ML systems."*
  → `________`

## 2. Work authorisation — your call, and a real decision

UK recruiters ask this immediately, so silence reads as a red flag, but it's yours to disclose.
Pick one:

- [ ] State it plainly in the profile (write the exact sentence you want the bot to use: `________`)
- [ ] Bot says "best discussed directly — email Shubham" and nothing more
- [ ] Omit the topic entirely

Whatever you choose, write the sentence yourself. I won't draft this one for you.

## 3. Skill calibration — the table that keeps the bot honest

For each skill: an honest level and **where you actually used it**. The `evidence` column is what
makes the bot credible; without it the bot is just asserting things.

Levels: `expert` (could lead others) · `strong` (production, independent) · `working` (shipped
something real) · `familiar` (coursework or tutorials only).

| Skill | Level | Years | Where you used it — be specific |
|---|---|---|---|
| Python | | | Capgemini automation? which scripts? |
| SQL | | | |
| Pandas / NumPy | | | |
| Scikit-learn | | | |
| PyTorch or TensorFlow | | | ← if this is `familiar`, say `familiar` |
| NLP (from the IIIT-B specialisation) | | | which techniques, which assignments |
| LLMs / RAG / prompting | | | be honest — this project will change this row |
| Docker | | | |
| AWS | | | which services, beyond the cert |
| Git | | | |
| JavaScript | | | Notes_App_AE2 |
| C++ | | | |

**Do not round up.** Your bot enforces calibration on itself; a `familiar` shown as `familiar` is
more persuasive to an engineer than a `strong` that collapses under one follow-up question.

## 4. Case studies — the highest-value work in this whole project

Write these as prose, ~400–600 words each, using this structure every time:

> **Problem** → **Constraints** → **Options I considered** → **What I chose and why** →
> **What happened (with numbers)** → **What I'd do differently**

The "options considered" and "what I'd do differently" sections are what separate this from a
README. Do not skip them.

**Write these four:**

1. **LR_Delivery_Time_Prediction** — I need: dataset and row count, features you engineered, why
   linear regression and what you compared it against, your actual metrics (R², MAE/RMSE), whether
   you checked residuals or multicollinearity, what the model got wrong.
2. **EDA_Optimising_NYC_Taxis** — dataset and size, the questions you asked, data quality problems
   you hit and how you handled them, and the actual finding. An EDA with a conclusion is a case
   study; one without is a notebook.
3. **The Capgemini Python automation** — this is your only production Python and your résumé gives
   it one line. I need: what task it automated, what it did technically, how much time it saved per
   week, who used it, whether it's still running. Quantify it.
4. **This assistant** — written *after* Phase 4, with the ablation numbers, the classifier model
   card, and the negative results. This becomes your strongest ML case study. Leave it blank for now.

**Also useful, if they exist:** your IIIT-B NLP capstone or assignments (what did you build?), and
your current MSc modules with any coursework worth describing.

## 5. Decision log — 3 to 5 short entries

ADR-style, 150 words each. Real technical or professional calls you made and your reasoning.
Candidates: why you chose the IIIT-B NLP specialisation, how you decided to move from IT support
into ML, a debugging call on one of the projects, why you picked a particular tool at Capgemini.
These are the documents recruiters' engineers find most interesting, and almost nobody writes them.

## 6. The questions the bot will definitely be asked

Write your real answer to each. These go in `content/interview-answers/` and keep the bot
consistent with what you say in the room.

- Why the move from IT support to AI/ML engineering?
- What ML have you actually shipped, end to end?
- Three years of IT support — what does that give you that a CS graduate doesn't have?
- Walk me through a model you built and what went wrong with it.
- You're mid-MSc — how do you handle a role alongside study?
- Why did Capgemini end in Dec 2025?
- What are you weakest at right now?

## 7. Sensitive topics — canned answers the bot uses verbatim

- **Compensation**: `________` (safe default: "Best discussed directly — shubhamsingh90390@gmail.com")
- **Reason for leaving Capgemini**: `________` (if it was to start the MSc, say so — it's a clean answer)
- **Aug 2021 – May 2022 then Aug 2022 gap**: `________`
- **One date to check**: your résumé lists "Foundations of Responsible AI, Northeastern University
  2024" but your MSc starts 2025. Confirm the year or the issuer — the bot will be asked to
  reconcile dates and must not get caught out.
- **`doNotDiscuss` list**: `________`

## 8. Assets

- [ ] Résumé PDF, final version → `public/resume.pdf`
- [ ] Headshot (square, 800px+)
- [ ] Domain name (buy one — `shubhamsingh.dev` or similar; a Vercel subdomain undercuts the whole thing)
- [ ] Booking link (Cal.com free tier) → `________`
- [ ] Preferred name for the bot to use: Shubham / Shubham Kumar Singh → `________`
- [ ] GitHub tidy-up: update the bio (Capgemini ended Dec 2025), strip your name from repo names,
      and either un-fork the vaccination tracker or make your contribution explicit in its README

## 9. For the escalation feature (see `SPEC-ADDENDUM-ESCALATION.md`)

- **Notification channel**: Telegram (recommended — free, instant, reply from your phone) /
  WhatsApp / email / Slack → `________`
- **Telegram username**, once you've made a bot with @BotFather: `________`
- **Realistic reply time** — what should the bot promise? (Under-promise. "Usually within a day"
  beats "within an hour" and a missed one.) → `________`
- **Auto-publish your answers to the corpus, or approve each one first?**
  → recommended: approve each one. You'll occasionally answer something you don't want indexed.

---

## Order of work

1. §1, §2, §8 — one hour. Unblocks the build.
2. §3 — one hour.
3. §7, §6 — one evening.
4. §4 case studies 1–3 and §5 — one weekend. Start here if you only have one weekend.
5. Run Phase 0.
6. §4 case study 4 after Phase 4.
