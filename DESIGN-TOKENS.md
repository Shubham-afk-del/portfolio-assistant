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

---

## Amendment: the recruiter-facing redesign, 9 October 2026

At the owner's request the page was rebuilt as a recruiter-facing chat: glass
throughout, a photograph, experience and education always on screen, direct
contact (portfolio, LinkedIn, email, phone), and real motion when a question
is typed and when an answer arrives. Several Phase 0 rules give way, so they
are listed rather than quietly dropped. The `ui-ux-pro-max` skill was used for
the direction; its design-system pass recommended its "AI-Native UI" style
with a purple and cyan palette, and the purple was declined as the most
generic colour an AI product can pick.

**What gives way.** Radius is no longer 0: panels are 28px, cards 16 to 24px,
chips and the composer are pills. The brand gradient, indigo `#4058e0` to
`#3046c8`, is spent on the visitor's own messages and the primary actions,
which the old "accent on evidence only" rule would not allow. Evidence keeps
its own token for citations, links and focus. An "aurora" (indigo, teal,
amber, violet) is decorative only, on the assistant's orb, the composer ring
and the caret, and no text ever sits on it.

**Layout.** On wide screens a profile sidebar sits beside the console:
photograph, name, programme, availability, a résumé button that states its
measured size, contact tiles, and Experience / Education as two tabs over one
timeline. Each timeline entry has an "Ask" button that sends a question about
it. Below 1024px the sidebar becomes a bottom sheet opened from the header,
and the welcome screen carries availability and one-tap contact so nothing a
recruiter came for needs a tap to find. At 1440 by 900 the sidebar's career
tabs are measured above the fold.

**Theming.** Every colour token is written once as `light-dark()` and
resolves against `color-scheme`, which a head script sets from the stored
choice or the system preference before first paint. That is what makes a
theme toggle possible without a second copy of the palette. The toggle
switches through the View Transitions API as a circle growing from the button.

**Contrast, recomputed.** Against the glass panel composited over the
strongest point of the field (indigo plus violet in light, indigo plus teal
in dark):

| Pair | Light | Dark |
|---|---|---|
| ink on glass | 13.57:1 | 10.88:1 |
| ink-muted on glass | 5.61:1 | 5.50:1 |
| evidence on glass | 5.72:1 | 6.53:1 |
| caution on glass | 5.44:1 | 6.52:1 |
| control border on glass | 3.57:1 | 3.43:1 |
| white on the brand gradient | 5.69 to 7.41:1 | same |

The dark field was strengthened after the first render looked flat, and the
dark `rule-on-glass` lightened from `#6f7a8c` to `#7a8598` to stay above 3:1.

**A glass finding worth keeping.** The first build nested the header and
composer overlays, each with `backdrop-filter`, inside a console panel that
had its own. In headless Chrome the transcript came through the header
perfectly sharp: an element with `backdrop-filter` is a backdrop root for its
descendants, and Chrome then left the scrolled content out of the overlays'
blur. Removing the panel's filter in the same render made the header frost
correctly. Every panel is now two layers, a frosted `.glass-fill` behind the
content as its sibling, and the panel itself, which only clips and casts the
shadow. For the same reason panels enter by moving, never by fading: opacity
below 1 would make the panel a backdrop root for the whole entrance.

**Motion.** Springs are damped-spring step responses sampled into `linear()`
(`--ease-spring`, 2% overshoot, `--ease-pop`, 12.6%), shared by CSS and the
Web Animations API. While typing, an aurora ring draws around the composer, a
glow beneath it pulses per keystroke, and the orb ripples and reads
"Listening". On send the question flies from wherever it was asked (composer,
suggestion card or timeline entry) to its bubble, measured as a FLIP so
layout never animates. While retrieving, the orb speeds up through its
playback rate rather than its duration, so it accelerates instead of jumping.
Answer words arrive out of focus in the evidence colour and settle into ink,
which marks what is new while the answer is still being written. Entrances
fill backwards only, so no finished animation leaves a filter or transform on
every word. Reduced motion stops all of it, including the script-driven
pieces, and the typewriter placeholder becomes one static line.

**Measured cost.** First-load JavaScript for `/` is 300 KB gzipped, down from
317 KB before the redesign. Both miss SPEC-v2 §16's 180 KB: React DOM and the
Next.js runtime are about 155 KB of it on their own, and the largest
app-level cost is zod, pulled in by the AI SDK's `useChat` to validate stream
chunks. Getting under budget means replacing `useChat` with a hand-rolled
stream reader, which belongs with the generation work rather than here.

**Data.** The photographs are the owner's published headshot (also his GitHub
avatar), with no location or camera metadata. The phone number is read from
`CONTACT_PHONE` and never committed (see `content/profile.yaml`); the
portfolio URL was taken from the link on the résumé PDF and checked live.

---

## Amendment: "liquid constellation", 9 October 2026 (second pass)

The owner asked for a bolder, more creative version. Five research passes
(AI assistant interfaces, award-level portfolios, glass and shader techniques,
typing and streaming micro-interactions, and honest embedding visualisation)
fed six component builds. Research changed the direction as much as it added
to it, so what was dropped is recorded with what was built.

**Dropped, because research named it as a generic-AI tell.** Purple and cyan
as brand colours, gradient text, sparkle icons, and glow that is always on and
means nothing. The aurora palette is now indigo `#4058e0`, azure `#3b9eff`,
gold `#f5b83d` and coral `#f97352`. The field no longer drifts: it is a still,
grainy gradient, which also lets the browser blur each glass panel once and
cache it instead of re-blurring every frame. Orbs rest when idle. The only
motion that runs on its own is the pointer light, which follows the visitor,
and the status-dot halos; both stop under the command menu's "pause motion"
(WCAG 2.2.2), which is persisted and applied before first paint.

**Contrast, rechecked on the new field** (glass composited over its strongest
overlaps: indigo with coral in light, indigo with azure in dark):

| Pair | Light | Dark |
|---|---|---|
| ink on glass | 13.90:1 | 10.90:1 |
| ink-muted on glass | 5.75:1 | 5.51:1 |
| evidence on glass (also the headline's italic word) | 5.86:1 | 6.55:1 |
| caution on glass | 5.57:1 | 6.53:1 |
| control border on glass | 3.65:1 | 3.44:1 |

**Floating chrome.** The console's header and composer bars became small
pieces of glass: a status island at the top centre, round controls in the
corner (⌘K, new chat, theme) and a floating composer. The transcript fades out
before it reaches them (a mask on the scroller), so text never collides with
chrome. The island is "Liquid Glass" in Chromium, refracting what passes
under its rim through an SVG displacement filter in `backdrop-filter`; Safari
and Firefox cannot run that and get frosted glass that is finished on its own.

**Signature motion, once per question.** Research recommended one meaningful
motion over many decorative ones. When a question is sent it flies from where
it was asked into its bubble (the FLIP from the first pass), and a comet of
light with a sharp head travels from the same spot to the assistant's mark,
which pulses as it lands (`lib/comet.ts`). The answer card's ring turns only
while that answer is being written, winds down over half a second through a
registered `--ring` property, and one band of light crosses the finished text.

**The knowledge map.** Every passage the assistant can retrieve, projected
from its embedding to 2D with PCA at build time (`lib/corpus-map.ts`; 30% of
the variance kept). The welcome shows it as a hero with a caption that states
what the projection can and cannot claim; each answer shows a compact copy
beside its sources with the retrieved passages lit in rank order, linked both
ways on hover. There is deliberately no query point. Measured: about half of
each chunk's eight nearest neighbours in the full space stay nearest on the
map, against 7% for random placement.

**Components.** `ShaderOrb` (raw WebGL2, the CSS orb underneath as fallback,
its render loop stopped at rest; at most two instances, since browsers cap
WebGL contexts), `KnowledgeMap` (SVG, keyboard-walkable, polite live summary),
`StatusIsland` and `LiquidGlass`, a rebuilt `Composer` (letters bloom in from
indigo through a mirror layer under the real textarea; typing speed drives the
ring and glow as one smoothed "energy" value; the example placeholder plays
once), `HoloCard` (the headshot as a holographic badge, foil masked off the
face, flipping to his London time, measured figures and a downloadable contact
card), and a ⌘K `CommandPalette` whose menu and `cmdk` load only when first
opened.

**Type.** Headlines are set in Inter with one italic word in Instrument Serif,
in solid evidence colour. One more font file, one weight and style.

**Measured cost.** First-load JavaScript for `/` is 324 KB gzipped, 24 KB more
than the first pass for everything above. It still misses SPEC-v2 §16's 180 KB
for the reasons recorded before (React DOM and the Next.js runtime are about
155 KB of it, zod via the AI SDK most of the rest). The obvious next saving is
loading the shader orb's engine on demand behind its CSS fallback.

## Amendment: Apple-style Liquid Glass, 9 October 2026 (third pass)

The owner asked for glass "like Apple's". Apple's Liquid Glass (iOS 26, macOS
Tahoe) is a lens rather than frost: clear, bending what is behind it at the
rim, with a specular edge, and Apple keeps it to the controls that float over
content, never the content itself. This pass follows that rule.

**More of the floating layer is real glass.** Until now only the status island
refracted. The corner controls, the jump-to-latest pill, the phones' profile
pill and the composer now do too. The lens moved out of `LiquidGlass` into a
`useLiquidLens(probe, options)` hook, so glass built from its own layers (the
composer's frost) bends the same way without the component's markup. It takes
a `blur`: 3px by default for small controls, 9px on the composer, which text
always passes under and would otherwise read through.

**Clearer, with contrast held.** Refracting, the tint now splits 45% at the
rim and a feathered 60% core behind the content (composer: 45% and 70%). The
rim is clear enough to read as a lens; the centre, where text sits, stays at
or above the panels' own tint (alpha 0.65 against 0.60 light, 0.62 against
0.55 dark), which is what the text contrast was measured against, and the
glass floats over a panel besides. Safari and Firefox keep the frosted base
unchanged.

**Light.** An inner glow, a pointer-following specular spot (fine pointers
only; still under reduced motion and the pause control), and a spring "give"
when a glass button is pressed. The two big panels gain a 1px gradient rim and
an inner glow; their frost and tint are untouched.
