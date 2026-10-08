# Design token plan: Phase 0, step 1

Two-pass process per PHASE-0.md §4. Pass 1 is below, then the critique against the brief,
then the revised plan that gets built. Contrast ratios are computed, not estimated.

> `/mnt/skills/public/frontend-design/SKILL.md` referenced by the kickoff prompt does not
> exist on this machine. The avoid-list and two-pass process in PHASE-0.md §4 are used as the
> brief instead. If the skill file exists somewhere else, point me at it and I will re-run
> the critique against it.

---

## Pass 1

### Direction

The product's one distinctive property is that nothing is asserted without a source. So the
visual system is **an annotated document**: a claim column and a source column, bound by
hairline rules and shared baselines rather than by cards. Structure comes from alignment and
rules; there are no shadowed boxes anywhere in the system.

### Palette (light)

| Token | Hex | Role |
|---|---|---|
| `ink` | `#14171C` | prose and headings |
| `paper` | `#F5F6F8` | page ground, cool neutral, deliberately not cream |
| `sunken` | `#E8EAEE` | quoted source snippets, metric tables, composer well |
| `rule` | `#BFC5CE` | hairlines between claim and source, row separators |
| `accent` | `#14584A` | citation marks, source links, focus ring, nothing else |
| `caution` | `#8A5300` | unknown / unfilled / low-confidence, fit-report gaps |

### Typefaces

| Family | Role |
|---|---|
| Source Serif 4 (variable) | answer prose, 18/28, the claims |
| Inter (variable) | all chrome: identity, composer, chips, citation marks, nav |
| IBM Plex Mono | genuine tabular data only: latency, eval metrics, ablation table |

Citations are first-class type, not superscripts: baseline-aligned `[1]` at 13px Inter with
`font-variant-numeric: tabular-nums`, an accent hairline underline, and a 2px accent left rule
on the expanded snippet.

### Layout: wide (≥1024px)

```
┌──────────────────────────────────────────┬───────────────────────┐
│ Shubham Kumar Singh                      │ SOURCES               │
│ {headline}          [available: …]       │ ───────────────────── │
│                                          │ résumé.pdf     60 KB  │
│ ┌──────────────────────────────────────┐ │ profile.yaml          │
│ │ Ask about his work…            [↵]   │ │ github.com/…          │
│ └──────────────────────────────────────┘ │ linkedin.com/…        │
│                                          │                       │
│ What has he shipped end to end?          │                       │
│ How strong is he on PyTorch, really?     │                       │
│ Paste a job description                  │                       │
│ …                                        │                       │
│                                        ← hairline rule           │
│ Answer prose, 68ch max, serif 18/28,     │ [1] delivery-time     │
│ with citation marks [1] set on the       │     case study        │
│ baseline, aligned to their source note   │     "…R² of 0.71 on…" │
│ in the right column. [2]                 │ [2] profile.yaml      │
└──────────────────────────────────────────┴───────────────────────┘
```

The source column is present from first paint and never changes meaning: it always answers
"where does this come from". Before the first question it lists the canonical sources; after,
retrieved sources are appended, top-aligned to the line carrying their citation mark.

### Layout: mobile (360px floor)

```
┌────────────────────────────┐
│ Shubham Kumar Singh        │
│ {headline}                 │
│ [available: …] [résumé ⤓]  │
│ ┌────────────────────────┐ │
│ │ Ask about his work…    │ │
│ └────────────────────────┘ │
│ What has he shipped…       │
│ How strong on PyTorch…     │
│ Paste a job description    │
│ 3 more                     │
│ ────────────────────────── │
│ Answer prose, serif 17/26. │
│ Claim with a mark [1]      │
│  ├ [1] delivery-time…   ▸  │  ← tap expands inline, in place
└────────────────────────────┘
```

### Principles

1. Nothing asserted without a visible source. Citations are typography, not decoration.
2. Rules, not cards. No shadows in the system at all.
3. One accent, spent only on evidence and focus.
4. Chrome is quiet; the prose and its sources are the product.
5. Monospace means "this is a measurement".

---

## Critique against the brief

**Avoid-list check.** No cream/terracotta pair. No near-black-plus-acid (light is default;
dark mode is a tuned inversion, not a black canvas with a neon accent). No repeated rounded
shadow cards, none at all. No tracked ALL-CAPS eyebrows: `SOURCES` in the wireframe is
exactly that tell and is cut below. No middle-dot meta strings; source rows are a two-column
grid with the size right-aligned. No `→` in button text. No fade-and-slide-up entrances.

Six real problems:

1. **Three font families breaks SPEC-v2 §13's "one distinctive typeface pairing"** and costs
   first-load budget (<180KB gz). Plex Mono exists only for the metric tables.
2. **`SOURCES` as a tracked-out caps label is on the avoid-list**, and it was in my own
   wireframe, which is how defaults get in.
3. **A column whose contents change meaning is disorienting**, pass 1 had identity in the
   margin, then sources. Also, the brief says identity is supporting information *around* the
   composer, which puts it in the claim column, not the margin.
4. **`accent` as deep green reads as "valid/success"**, which is a claim the system must not
   make. A citation points at a source, it doesn't certify it. Worse, green beside `caution`
   amber in the fit report reads as a pass/fail colour code.
5. **`rule` at 1.61:1 fails WCAG 1.4.11** wherever a hairline is the only boundary of an
   interactive control, the composer, in particular.
6. **Six suggested questions plus identity plus composer does not fit above the fold at
   360×640**, and PHASE-0 §5 wants the hero above the fold on a phone.

---

## Revised plan: what changed and why

**Fonts: two families ship globally.** Source Serif 4 (prose) + Inter (everything else).
IBM Plex Mono is loaded per-route on `/evals`, `/experiments`, `/stats` and lazily with the
metric blocks, so the home route pays nothing for it. Monospace stays restricted to genuine
tabular data.

**The margin column header is a hairline rule plus sentence-case 13px Inter text**
("Sources", `ink` at 60% weight-equivalent via `#55606E`, 5.91:1), not tracked caps.

**Identity moves into the claim column, above the composer**; the margin column is sources
only, from first paint. Two wins: the column's meaning is constant, and identity sits around
the composer as the brief asks. The résumé entry stays a source row *and* gets a plain `<a
href="/resume.pdf" download>` in the identity block, both work with JavaScript off.

**Accent re-hued from green to `#1F3D7A` (deep indigo), 9.68:1 on paper (8.69:1 on `sunken`).** Indigo reads as
reference/annotation rather than success, and it no longer forms a traffic-light pair with
`caution`. Rule added: `accent` and `caution` never appear in the same component row; fit-report
gaps are rule-marked blocks with a `caution` left rule, never a coloured fill.

**`rule` splits into two tokens:** `rule` `#BFC5CE` (1.61:1, decorative separators only) and
`rule-strong` `#7F8894` (3.32:1) for any hairline that bounds an interactive control. Dark
mode gets the same split.

**Mobile hero shows four questions plus a "3 more" disclosure** (7 total: the spec's 6 plus
"paste a job description"), measured at 360×640 before it ships. Desktop shows all seven.

**Keyboard-open layout shift** is handled by keeping the composer in normal flow inside a
`min-height: 100dvh` flex column with `viewport-fit=cover` and safe-area insets, rather than a
`position: fixed` bottom bar. Tested at 360×640 with the on-screen keyboard open.

**Motion budget:** citation expansion (height + opacity, 120ms, `ease-out`), the streaming
caret, and nothing else. Both are disabled under `prefers-reduced-motion: reduce`.

### Final tokens

Light:

| Token | Hex | Contrast on ground | Use |
|---|---|---|---|
| `ink` | `#14171C` | 16.61:1 on paper | prose, headings |
| `ink-muted` | `#55606E` | 5.91:1 on paper | labels, timestamps, source names |
| `paper` | `#F5F6F8` | n/a | page ground |
| `sunken` | `#E8EAEE` | n/a | quoted snippets, metric tables, composer well |
| `rule` | `#BFC5CE` | 1.61:1 | decorative separators only |
| `rule-strong` | `#7F8894` | 3.32:1 | borders of interactive controls |
| `accent` | `#1F3D7A` | 9.68:1 on paper | citation marks, source links, focus ring |
| `caution` | `#8A5300` | 5.85:1 on paper | unknown, unfilled, low-confidence, gaps |

Dark (tuned inversion, same roles):

| Token | Hex | Contrast | Note |
|---|---|---|---|
| `ink` | `#E7E9EC` | 15.31:1 | |
| `ink-muted` | `#9AA4B0` | 7.37:1 | |
| `paper` | `#101317` | n/a | |
| `sunken` | `#171B21` | n/a | |
| `rule` | `#2C333C` | 1.46:1 | decorative only |
| `rule-strong` | `#5A6472` | 3.10:1 | control borders |
| `accent` | `#8FB0FF` | 8.71:1 | indigo raised for dark ground |
| `caution` | `#E0A93B` | 8.79:1 | |

Spacing: 4px scale, per SPEC-v2 §13. Prose measure: 68ch max. Type scale: 13 / 15 / 17 / 18 /
21 / 28 / 34.

### Type-scale note

Citation marks at 13px Inter with tabular numerals sit on the prose baseline with a 1px accent
underline; the expanded snippet is 15px Inter on `sunken` with a 2px `accent` left rule and the
source title in `ink-muted`. That single component is where the boldness is spent, and it is
the same component on both breakpoints, only its position moves.

---

## Amendments, 18 September 2026

Recorded here rather than silently changed, because the point of the plan is that
deviations are visible.

**A persistent header was added.** The plan had no site chrome, on the reasoning that the
composer is the product and everything else should be quiet. With four sections of content
now under the hero, a visitor had no way to see what the page contained or to make contact
without scrolling to the footer. The header is a hairline rule, the name, four section
anchors and one bordered action, and it uses `backdrop-blur` over `paper/85` so the rule
stays the only hard edge.

The reference build this was compared against uses tabs here for three assistant modes
(General, Recruiter, Interview). That is a good product idea and it is now on the Phase 5
list. It was not copied as tabs, because tabs that switch nothing are a lie told in UI. The
same structural affordance is expressed as navigation to sections that exist.

**Monospace on the home route uses the system stack**, not IBM Plex Mono. The plan reserved
mono for `/evals` and `/experiments` and kept the home route to two webfonts. Project metrics
are genuine tabular data and belong in mono, so `--font-mono` is a system stack
(`ui-monospace, SF Mono, Menlo`) and the home route still pays for exactly two font requests.
Plex Mono still loads per-route where the tables are dense.

**Sections carry `scroll-mt-20`.** Without it the sticky header covers the heading an
in-page anchor just jumped to. Verified: with a 59px header, `#experience` lands its section
top at 80px.

**Project metrics are a fixed three-column grid**, not a wrapping flex row. Wrapping put a
value in one row and left its label orphaned in the next, which is precisely the
value-label pairing that has to stay unambiguous in a table of measurements.

**`exactOptionalPropertyTypes` was dropped from tsconfig.json** when AI Elements
was added. It was my addition rather than the spec's, which asks for strict mode
and no `any`, and both of those stay on along with `noUncheckedIndexedAccess`.
Radix and `motion` both type optional props in ways that flag disallows, so
keeping it would have meant hand-patching every component copied in from the
registry and re-patching each one on every update. The trade is a narrow loss of
strictness in exchange for generated files that stay pristine and re-syncable.

---

## Amendment: glass surfaces, 8 October 2026

At the owner's request, the interface moves to a glassmorphic treatment with
motion. This is a real departure from the approved plan, which specified
hairline rules with no cards and no shadows, so it is recorded rather than
quietly applied. The `ui-ux-pro-max` skill was used for the decision, and two
of its findings drove the implementation.

**Its accessibility rating for glassmorphism is "conditional"**, requiring
verified 4.5:1 text contrast, while its own checklist asks for a "vibrant
background verified". Those pull against each other: a saturated field is what
makes glass read, and text over a saturated field is what fails contrast. The
resolution is architectural. **Nothing readable sits on the field.** Every piece
of text sits on a glass panel, which frees the field to be saturated enough for
the blur to have something to do.

**Light and dark tint in opposite directions.** A white panel over a saturated
field in dark mode lifts the surface until muted text fails, measured at
4.11:1. Dark mode therefore uses a black-tinted panel. Every value below was
computed against the composite at the strongest point of the field, not against
the page background:

| Pair | Light | Dark |
|---|---|---|
| ink on glass | 14.92:1 | 12.74:1 |
| ink-muted on glass | 6.10:1 | 6.13:1 |
| evidence on glass | 8.84:1 | 7.25:1 |
| caution on glass | 6.15:1 | 7.31:1 |
| control border on glass | 3.27:1 | 5.05:1 |

Three tokens changed to pass at the stronger field: `ink-muted` darkened from
`#55606E` to `#4C5765`, `caution` from `#8A5300` to `#7C4A00`, and a new
`rule-on-glass` exists because `rule-strong` measured only 2.28:1 against a
glass panel, which is lighter than `paper`.

**Motion** follows the skill's easing guidance rather than one duration
everywhere: entry decelerates on `cubic-bezier(0.16, 1, 0.3, 1)`, and the
duration scales with distance, 180ms for a fade, 260ms for a message arriving,
480ms for the console settling. The streaming caret is the only looping
animation. Everything is still disabled under `prefers-reduced-motion`, which
the skill rates severity High.

**What did not change.** The radius is still 0, the accent is still spent only
on evidence and focus, monospace is still reserved for measured figures, and
the type scale is untouched.
