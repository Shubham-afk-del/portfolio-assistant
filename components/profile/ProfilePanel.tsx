"use client";

import {
  useId,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import {
  AnimatePresence,
  LayoutGroup,
  MotionConfig,
  motion,
  useMotionValue,
  useSpring,
  useTransform,
  type Transition,
  type Variants,
} from "motion/react";
import {
  ArrowDown,
  ArrowUpRight,
  BadgeCheck,
  Briefcase,
  FileDown,
  GraduationCap,
  MessageCircleQuestion,
} from "lucide-react";
import { useChatContext } from "@/components/chat/ChatProvider";
import { useMagnetic } from "@/components/motion/useMagnetic";
import { CopyButton } from "@/components/shared/CopyButton";
import { reducedMotion } from "@/lib/motion";
import { useSpotlight } from "@/lib/spotlight";
import { vars } from "@/lib/utils";
import type { CertificationEntry, ContactLink, ProfileView, TimelineEntry } from "@/lib/view";
import { HoloCard } from "./HoloCard";
import { CONTACT_ICONS } from "./icons";
import { useSheetClose } from "./ProfileSheet";
import styles from "./ProfilePanel.module.css";

/** CSS module lookups are typed as possibly undefined, so they are joined here. */
function css(...names: (string | false | undefined)[]): string {
  return names.filter(Boolean).join(" ");
}

/** A step in the entrance: its place in the order, which sets its delay. */
const step = (index: number): CSSProperties => vars({ "--i": index });

/*
 * The order things arrive in, after the card. Each step is 70ms after the
 * last (ProfilePanel.module.css), so the panel reads top to bottom.
 */
const ORDER = {
  availability: 0,
  resume: 1,
  tiles: 2,
  rows: 5,
  career: 6,
} as const;

/**
 * When the timeline starts, in ms after the panel's own start: in the
 * sidebar it follows the tabs in the load-time entrance; in the sheet it
 * follows them as the sheet slides up; after a tab switch it starts at once.
 */
const TIMELINE_START = { sidebar: 760, sheet: 640, switched: 40 } as const;

/**
 * Who the assistant is about: the photograph, how to reach him, and where he
 * has worked and studied. It is the sidebar on wide screens and the body of
 * the profile sheet on narrow ones.
 *
 * Everything here comes from content/profile.yaml through lib/view.ts, which
 * has already dropped any field still marked TODO(owner).
 *
 * The panel arrives in order: the card is dealt in, then the availability,
 * the résumé, the contact tiles one by one, the tabs, and the timeline. In
 * the sidebar that is part of the load-time entrance, which only plays when
 * the page is visible and motion is allowed; in the sheet it plays as the
 * sheet slides up.
 */
export function ProfilePanel({
  profile,
  variant = "sidebar",
}: {
  profile: ProfileView;
  variant?: "sidebar" | "sheet";
}) {
  const sidebar = variant === "sidebar";
  const resume = useRef<HTMLAnchorElement>(null);
  // The panel's one focal control leans toward the pointer.
  useMagnetic(resume, 0.22, 8);

  return (
    // Motion's own animations (the tab indicator, the panel switch) follow
    // the reduced-motion setting rather than ignoring it.
    <MotionConfig reducedMotion="user">
      <div
        className={css(
          styles.panel,
          sidebar ? styles.sidebar : styles.sheet,
          "flex flex-col gap-4 p-5",
        )}
      >
        {/* Photo, name, programme and location: the badge carries all four, and
          * its back carries his local time, the roles he wants and a contact card. */}
        <HoloCard profile={profile} variant={variant} />

        {profile.availability !== undefined && (
          <p
            className={css(styles.step, "text-ink flex items-start gap-2.5 text-label")}
            style={step(ORDER.availability)}
          >
            <span aria-hidden className="bg-online pulse-dot mt-1.5 size-2 shrink-0 rounded-full" />
            <span>
              <span className="sr-only">Availability: </span>
              {profile.availability}
            </span>
          </p>
        )}

        <a
          ref={resume}
          href={profile.resume.href}
          download={profile.resume.filename}
          className={css(
            styles.step,
            styles.resume,
            "group from-brand-a to-brand-b flex items-center justify-between gap-3 rounded-2xl bg-linear-to-br px-4 py-3 text-white",
          )}
          style={step(ORDER.resume)}
        >
          <span className="relative z-[1] flex items-center gap-3">
            <span className={css(styles.resumeIcon, "grid size-10 place-items-center rounded-xl bg-white/15")}>
              <FileDown aria-hidden className="size-[18px]" />
            </span>
            <span>
              <span className="block text-ui font-semibold">Download résumé</span>
              <span className="block text-micro text-white/90">PDF, {profile.resume.size}</span>
            </span>
          </span>
          <ArrowDown aria-hidden className={css(styles.resumeArrow, "relative z-[1] size-4")} />
        </a>

        <ContactList contacts={profile.contacts} />

        <CareerTabs
          experience={profile.experience}
          education={profile.education}
          certifications={profile.certifications}
          variant={variant}
        />
      </div>
    </MotionConfig>
  );
}

/** A tile leans toward the pointer and lifts; its icon travels further, so it reads as standing off the tile. */
const MAGNET = { stiffness: 320, damping: 22, mass: 0.6 };
const PULL = 4;
const LIFT = 3;

/**
 * Links a recruiter follows sit in one row of tiles; the two values they are
 * more likely to copy, email and phone, get full rows with their value shown
 * and a copy button. Five full rows cost the sidebar its career section above
 * the fold on a 900px-tall laptop screen.
 */
function ContactList({ contacts }: { contacts: ContactLink[] }) {
  const links = contacts.filter((contact) => contact.external);
  const values = contacts.filter((contact) => !contact.external);

  return (
    <section aria-label="Contact" className="space-y-2">
      {links.length > 0 && (
        <ul className="grid grid-cols-3 gap-2">
          {links.map((contact, index) => (
            <li key={contact.kind} className={styles.tile} style={step(ORDER.tiles + index)}>
              <MagneticTile contact={contact} />
            </li>
          ))}
        </ul>
      )}

      {values.length > 0 && (
        <ul
          className={css(
            styles.step,
            "glass-inset divide-rule-on-glass/20 divide-y overflow-hidden rounded-2xl",
          )}
          style={step(ORDER.rows)}
        >
          {values.map((contact) => {
            const Icon = CONTACT_ICONS[contact.kind];
            return (
              <li
                key={contact.kind}
                className={css(
                  styles.row,
                  "group hover:bg-sunken relative flex items-center gap-3 py-1.5 pr-1.5 pl-3 transition-colors",
                )}
              >
                <span
                  className={css(
                    styles.rowIcon,
                    "bg-sunken text-ink grid size-8 shrink-0 place-items-center rounded-xl",
                  )}
                >
                  <Icon aria-hidden className="size-4" />
                </span>
                <a
                  href={contact.href}
                  className="min-w-0 flex-1 rounded-lg after:absolute after:inset-0 after:content-[''] focus-visible:outline-none"
                >
                  <span className="sr-only">{contact.label}: </span>
                  <span className="text-ink block truncate text-label font-medium">
                    {contact.display}
                  </span>
                </a>
                {contact.copy !== undefined && (
                  <CopyButton
                    value={contact.copy}
                    label={contact.label.toLowerCase()}
                    className="touch-target text-ink-muted hover:text-ink hover:bg-sunken z-10 grid size-10 shrink-0 place-items-center rounded-xl transition-colors"
                  />
                )}
                {/* The row is the link's hit area, so its focus ring goes on the row. */}
                <span
                  aria-hidden
                  className="group-has-[a:focus-visible]:ring-evidence pointer-events-none absolute inset-1 rounded-xl ring-2 ring-transparent transition-shadow"
                />
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/**
 * One contact tile, with a magnetic hover: springs pull it a few pixels
 * toward the pointer and lift it, and its icon travels half as far again, so
 * it reads as standing off the tile. A light under the pointer follows too.
 * Mouse only; a touch gets the press feedback and nothing that sticks.
 */
function MagneticTile({ contact }: { contact: ContactLink }) {
  const Icon = CONTACT_ICONS[contact.kind];
  const pullX = useMotionValue(0);
  const pullY = useMotionValue(0);
  const x = useSpring(pullX, MAGNET);
  const y = useSpring(pullY, MAGNET);
  const iconX = useTransform(x, (value) => value * 0.6);
  const iconY = useTransform(y, (value) => value * 0.6);

  // Measured against the list item, which stays put, rather than the tile,
  // which is moving toward the pointer and would chase it.
  const onPointerMove = (event: PointerEvent<HTMLAnchorElement>): void => {
    if (event.pointerType !== "mouse" || reducedMotion()) return;
    const tile = event.currentTarget;
    const box = (tile.parentElement ?? tile).getBoundingClientRect();
    const across = (event.clientX - box.left) / box.width;
    const down = (event.clientY - box.top) / box.height;
    pullX.set((across * 2 - 1) * PULL);
    pullY.set((down * 2 - 1) * PULL - LIFT);
    tile.style.setProperty("--tile-x", `${(across * 100).toFixed(1)}%`);
    tile.style.setProperty("--tile-y", `${(down * 100).toFixed(1)}%`);
  };

  const onPointerLeave = (): void => {
    pullX.set(0);
    pullY.set(0);
  };

  return (
    <motion.a
      href={contact.href}
      target="_blank"
      rel="me noopener noreferrer"
      title={contact.display}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
      style={{ x, y }}
      className={css(
        styles.tileLink,
        "glass-inset text-ink flex h-full flex-col items-center gap-1.5 rounded-2xl px-2 py-3 text-micro font-medium",
      )}
    >
      <motion.span aria-hidden className="relative grid place-items-center" style={{ x: iconX, y: iconY }}>
        <Icon className={css(styles.tileIcon, "size-[18px]")} />
      </motion.span>
      <span className="relative">{contact.label}</span>
      <span className="sr-only">, {contact.display} (opens in a new tab)</span>
    </motion.a>
  );
}

const TABS = [
  { key: "experience", label: "Experience", Icon: Briefcase },
  { key: "education", label: "Education", Icon: GraduationCap },
] as const;

/** The indicator slides on a quick spring with a little give. */
const INDICATOR: Transition = { type: "spring", stiffness: 520, damping: 38, mass: 0.9 };

/** A panel leaves quickly toward the side it was left from; the next arrives from the other side on a spring. */
const PANEL: Variants = {
  enter: (direction: number) => ({ opacity: 0, x: direction * 22 }),
  center: {
    opacity: 1,
    x: 0,
    transition: { x: { type: "spring", stiffness: 380, damping: 34 }, opacity: { duration: 0.22 } },
  },
  exit: (direction: number) => ({
    opacity: 0,
    x: direction * -22,
    transition: { duration: 0.14, ease: [0.7, 0, 0.84, 0] },
  }),
};

/**
 * Experience and education as two tabs over one timeline. A segmented
 * control rather than two stacked lists, so both fit beside the photo without
 * the sidebar turning into a CV. Arrow keys move between the tabs, per the
 * WAI-ARIA tabs pattern. The selection is one shared element that slides
 * from tab to tab, and the panel leaves toward one side as the next arrives
 * from the other, its entries revealing in order.
 */
function CareerTabs({
  experience,
  education,
  certifications,
  variant,
}: {
  experience: TimelineEntry[];
  education: TimelineEntry[];
  certifications: CertificationEntry[];
  variant: "sidebar" | "sheet";
}) {
  const [active, setActive] = useState(0);
  const [direction, setDirection] = useState(1);
  const [switched, setSwitched] = useState(false);
  const first = useRef<HTMLButtonElement>(null);
  const second = useRef<HTMLButtonElement>(null);
  const id = useId();
  const entries = active === 0 ? experience : education;
  const current = TABS[active] ?? TABS[0];

  // Until the first switch the timeline is part of the panel's entrance;
  // after it, each panel reveals as soon as it arrives.
  const phase = switched ? styles.reveal : variant === "sidebar" ? styles.enter : styles.reveal;
  const start = TIMELINE_START[switched ? "switched" : variant];

  const select = (index: number): void => {
    if (index === active) return;
    setDirection(index > active ? 1 : -1);
    setActive(index);
    setSwitched(true);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const next = active === 0 ? 1 : 0;
    select(next);
    (next === 0 ? first : second).current?.focus();
  };

  return (
    <section aria-label="Career" className={styles.step} style={step(ORDER.career)}>
      {/* A layout group per instance: the sidebar and the sheet can both be
        * mounted, and their indicators must not trade places. */}
      <LayoutGroup id={id}>
        <div
          role="tablist"
          aria-label="Career history"
          onKeyDown={onKeyDown}
          className="bg-sunken hairline relative grid grid-cols-2 rounded-full border p-1"
        >
          {TABS.map((tab, index) => (
            <button
              key={tab.key}
              ref={index === 0 ? first : second}
              role="tab"
              type="button"
              id={`${id}-${tab.key}-tab`}
              aria-selected={active === index}
              aria-controls={`${id}-panel`}
              tabIndex={active === index ? 0 : -1}
              onClick={() => {
                select(index);
              }}
              className={css(
                styles.tab,
                "touch-target z-10 flex min-h-10 items-center justify-center gap-2 rounded-full text-label font-medium transition-colors duration-200",
                active === index ? "text-ink" : "text-ink-muted hover:text-ink",
              )}
            >
              {active === index && (
                <motion.span
                  aria-hidden
                  layoutId="career-indicator"
                  transition={INDICATOR}
                  className="glass-inset absolute inset-0 -z-10 rounded-full"
                />
              )}
              <tab.Icon aria-hidden className={css(styles.tabIcon, "size-4")} />
              {tab.label}
            </button>
          ))}
        </div>
      </LayoutGroup>

      <AnimatePresence mode="wait" initial={false} custom={direction}>
        <motion.div
          key={current.key}
          role="tabpanel"
          id={`${id}-panel`}
          aria-labelledby={`${id}-${current.key}-tab`}
          custom={direction}
          variants={PANEL}
          initial="enter"
          animate="center"
          exit="exit"
          className={phase}
          style={vars({ "--start": `${String(start)}ms` })}
        >
          <Timeline entries={entries} />
          {active === 1 && <Certifications items={certifications} after={entries.length} />}
        </motion.div>
      </AnimatePresence>
    </section>
  );
}

/**
 * Under education: each certificate with a link to its public verification
 * page, so a recruiter can check it in one click rather than take it on trust.
 * They reveal after the timeline above them, continuing its count.
 */
function Certifications({ items, after }: { items: CertificationEntry[]; after: number }) {
  if (items.length === 0) return null;

  return (
    <section aria-label="Certifications" className="mt-5">
      <h3
        className={css(styles.item, "text-ink-muted px-2 text-micro font-medium")}
        style={vars({ "--i": after })}
      >
        Certifications
      </h3>
      <ul className="mt-2 space-y-1">
        {items.map((item, index) => (
          <li
            key={item.id}
            className={css(styles.item, "hover:bg-sunken flex gap-3 rounded-2xl p-2 transition-colors")}
            style={vars({ "--i": after + index + 1 })}
          >
            <span
              aria-hidden
              className={css(
                styles.node,
                "glass-inset text-evidence mt-0.5 grid size-[23px] shrink-0 place-items-center rounded-full",
              )}
            >
              <BadgeCheck className="size-3.5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-ink text-label leading-snug font-semibold">{item.name}</p>
              <p className="text-ink-muted text-label">{item.issuer}</p>
              <p className="text-ink-muted mt-1 flex flex-wrap items-center gap-3 font-mono text-micro tabular-nums">
                {item.date}
                {item.url !== undefined && (
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={css(
                      styles.verify,
                      "text-evidence inline-flex items-center gap-0.5 font-sans font-medium underline-offset-2 hover:underline",
                    )}
                  >
                    Verify
                    <ArrowUpRight aria-hidden className="size-3" />
                    <span className="sr-only"> {item.name} (opens in a new tab)</span>
                  </a>
                )}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Each entry carries an "Ask" button that sends a question about it to the
 * assistant. The question flies from the entry into the conversation, which
 * is what ties the static CV to the thing that can actually explain it.
 *
 * The line draws down first, then each entry rises in turn as its node pops
 * onto the line, and its tools follow it in.
 */
function Timeline({ entries }: { entries: TimelineEntry[] }) {
  const { ask, busy } = useChatContext();
  const closeSheet = useSheetClose();
  const list = useRef<HTMLOListElement>(null);
  useSpotlight(list);

  return (
    <ol ref={list} className="relative mt-4 space-y-1">
      <span
        aria-hidden
        className={css(
          styles.line,
          "from-brand-a absolute top-4 bottom-4 left-[19px] w-px bg-linear-to-b via-[#3b9eff]/50 to-transparent",
        )}
      />
      <span aria-hidden className={css(styles.comet, "absolute top-4 bottom-4 left-[16px] w-[7px]")} />
      {entries.map((entry, index) => (
        <li
          key={entry.id}
          className={css(
            styles.item,
            "spotlight-card group hover:bg-sunken flex gap-3 rounded-2xl p-2 transition-colors",
          )}
          style={vars({ "--i": index })}
        >
          <span
            aria-hidden
            className={css(
              styles.node,
              "relative z-10 mt-1 grid size-[23px] shrink-0 place-items-center rounded-full",
              entry.current
                ? "from-brand-a to-brand-b bg-linear-to-br shadow-[0_0_0_4px_color-mix(in_srgb,var(--brand-a)_18%,transparent)]"
                : "glass-inset",
            )}
          >
            <span
              className={`size-2 rounded-full ${entry.current ? "pulse-dot bg-white" : "bg-brand-a"}`}
            />
          </span>

          <div className="min-w-0 flex-1 pt-0.5">
            <p className="text-ink text-label leading-snug font-semibold">{entry.title}</p>
            <p className="text-ink-muted text-label">
              {entry.org}
              {entry.location !== undefined && `, ${entry.location}`}
            </p>
            <p className="text-ink-muted mt-1 flex flex-wrap items-center gap-2 font-mono text-micro tabular-nums">
              {entry.period}
              {entry.current && (
                <span className="bg-brand-a/12 text-evidence rounded-full px-2 py-0.5 font-sans font-medium">
                  In progress
                </span>
              )}
            </p>
            {entry.tags.length > 0 && (
              <ul aria-label="Tools" className="mt-2 flex flex-wrap gap-1.5">
                {entry.tags.map((tag, tagIndex) => (
                  <li
                    key={tag}
                    className={css(styles.tag, "glass-inset text-ink-muted rounded-full px-2 py-0.5 text-micro")}
                    style={vars({ "--j": tagIndex })}
                  >
                    {tag}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <button
            type="button"
            disabled={busy}
            onClick={(event) => {
              if (ask(entry.question, event.currentTarget.closest("li"))) closeSheet?.();
            }}
            aria-label={`Ask the assistant: ${entry.question}`}
            className="touch-target hairline text-ink-muted hover:text-white hover:from-brand-a hover:to-brand-b flex h-9 shrink-0 items-center gap-1.5 self-start rounded-full border px-3 text-micro font-medium transition-[color,background-color,border-color,opacity] duration-200 hover:border-transparent hover:bg-linear-to-br disabled:opacity-40 lg:opacity-70 lg:group-hover:opacity-100 lg:focus-visible:opacity-100"
          >
            <MessageCircleQuestion aria-hidden className="size-3.5" />
            Ask
          </button>
        </li>
      ))}
    </ol>
  );
}
