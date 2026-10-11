"use client";

import Image from "next/image";
import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowUpRight, ChevronDown, FileDown } from "lucide-react";
import headshot from "@/public/photos/shubham-square.jpg";
import { ScrambleText } from "@/components/motion/ScrambleText";
import { useTilt } from "@/components/motion/useTilt";
import { CONTACT_ICONS } from "@/components/profile/icons";
import type { CorpusMap } from "@/lib/corpus-map";
import { reducedMotion } from "@/lib/motion";
import { useSpotlight } from "@/lib/spotlight";
import { vars } from "@/lib/utils";
import type { ProfileView } from "@/lib/view";
import { useActivity, useChatContext } from "./ChatProvider";
import { KnowledgeGalaxy } from "./KnowledgeGalaxy";
import { ShaderOrb } from "./ShaderOrb";
import { SUGGESTIONS } from "./suggestions";
import styles from "./Welcome.module.css";

/** Phones show this many suggestions until the visitor asks for the rest. */
const PHONE_FIRST = 4;

/**
 * The empty state, laid out as a small bento: what to ask on one side, and
 * on the other everything the assistant can draw on, as the knowledge map.
 * Below them, his own words and three measured figures. On a phone, where the
 * profile is a sheet away, availability and one-tap contact come first so
 * that what a recruiter came for is above the fold.
 *
 * The headline is set in the interface face with one italic serif word, the
 * only flourish on the screen. Every question here, including a click on a
 * dot of the map, launches from where it was asked: the comet flies from
 * that spot to the assistant.
 *
 * The motion takes its vocabulary from the portfolio site, redrawn in this
 * page's glass: a spec line that decodes like tokens, a headline whose words
 * rise out of their own masks, cards that lean toward the pointer and run a
 * lap of light round their border, and his words inking in when they are
 * reached. All of it is entrance or response; nothing loops on its own.
 */
export function Welcome({ profile, corpus }: { profile: ProfileView; corpus: CorpusMap }) {
  const { ask } = useChatContext();
  const { typing } = useActivity();
  const [expanded, setExpanded] = useState(false);
  const questions = useRef<HTMLUListElement>(null);
  useSpotlight(questions);
  useTilt(questions);

  return (
    <div className="flex flex-col pt-1 sm:pt-3">
      <div className="flex items-center gap-4">
        {/* The orb floats over its own soft shadow, and is where the particle
          * field sends each keystroke: the question being heard. */}
        <span className={styles.orb} data-particle-target="orb">
          <ShaderOrb size={56} state={typing ? "listening" : "idle"} listen className="animate-pop" />
        </span>
        <p className="text-ink-muted font-mono text-micro tracking-[0.1em] uppercase">
          <ScrambleText
            // Non-breaking spaces keep each count on the line with its noun.
            text={`Retrieval-augmented · ${String(corpus.documents.length)}\u00a0documents · ${String(corpus.points.length)}\u00a0passages`}
            delay={350}
            duration={1000}
          />
        </p>
      </div>

      <h2
        className={`text-ink ${styles.headline} mt-5 text-[2rem] leading-[2.4rem] font-semibold tracking-[-0.03em] text-balance sm:text-[2.75rem] sm:leading-[3.1rem]`}
      >
        <Word index={0}>Ask</Word> <Word index={1}>me</Word>{" "}
        <span className="relative inline-block">
          <Word index={2} className="display-accent">
            anything
          </Word>
          <svg aria-hidden viewBox="0 0 200 14" preserveAspectRatio="none" className={styles.underline}>
            <path pathLength={1} d="M3 9.5C46 4.2 104 2.8 197 7.2" />
          </svg>
        </span>{" "}
        <Word index={3}>about</Word> <Word index={4}>{profile.firstName}.</Word>
      </h2>

      <p
        className="text-ink-muted animate-rise mt-3 max-w-[56ch] text-ui text-pretty"
        style={vars({ "--i": 5 })}
      >
        I&apos;m an AI assistant. I answer from his case studies, decision records and
        public code, and every answer shows the sources it came from.
      </p>

      {/* Phones only: the sidebar's essentials, one tap each. */}
      <div className="animate-rise mt-5 space-y-3 lg:hidden" style={vars({ "--i": 6 })}>
        {profile.availability !== undefined && (
          <p className="glass-inset text-ink flex items-start gap-3 rounded-2xl px-3.5 py-3 text-label">
            <span aria-hidden className="bg-online pulse-dot mt-1.5 size-2 shrink-0 rounded-full" />
            <span>
              <span className="sr-only">Availability: </span>
              {profile.availability}
            </span>
          </p>
        )}
        <QuickContacts profile={profile} />
      </div>

      {/* grid-cols-1 below xl for the same reason as the sources grid under an
        * answer: an implicit column would grow to its widest unwrapped content. */}
      <div className="mt-7 grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] xl:items-start">
        <section aria-labelledby="try-asking">
          <h3 id="try-asking" className="text-ink-muted mb-3 text-label font-medium">
            Try asking
          </h3>
          <ul ref={questions} className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-1">
            {SUGGESTIONS.map((suggestion, index) => (
              <li
                key={suggestion.question}
                className={`${styles.deal} ${!expanded && index >= PHONE_FIRST ? "max-sm:hidden" : ""}`}
                // Cards a phone reveals later start their own count, not the
                // first ones', so they do not arrive half a second late.
                style={vars({ "--i": expanded && index >= PHONE_FIRST ? index - PHONE_FIRST : index })}
              >
                <button
                  type="button"
                  data-tilt
                  onClick={(event) => {
                    ask(suggestion.question, event.currentTarget);
                  }}
                  className={`${styles.card} spotlight-card glass-inset group relative flex h-full w-full items-start gap-3 rounded-2xl p-3.5 text-left`}
                >
                  <span aria-hidden className={styles.shade} />
                  <span aria-hidden className={styles.beam} />
                  <span className="bg-brand-a/10 text-evidence grid size-8 shrink-0 place-items-center rounded-xl">
                    <suggestion.Icon aria-hidden className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1 pr-5">
                    <span className="text-ink-muted block text-micro font-medium">{suggestion.topic}</span>
                    <span className="text-ink mt-0.5 block text-ui leading-snug">{suggestion.question}</span>
                  </span>
                  <ArrowUpRight
                    aria-hidden
                    className="text-evidence absolute top-3.5 right-3.5 size-4 -translate-x-1 translate-y-1 opacity-0 transition-[opacity,translate] duration-300 group-hover:translate-0 group-hover:opacity-100 group-focus-visible:translate-0 group-focus-visible:opacity-100"
                  />
                  <span aria-hidden className={styles.glare} />
                </button>
              </li>
            ))}
          </ul>
          {!expanded && SUGGESTIONS.length > PHONE_FIRST && (
            <button
              type="button"
              onClick={() => {
                setExpanded(true);
              }}
              className="text-evidence hover:bg-sunken mt-2 inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-label font-medium transition-colors sm:hidden"
            >
              {SUGGESTIONS.length - PHONE_FIRST} more questions
              <ChevronDown aria-hidden className="size-4" />
            </button>
          )}
        </section>

        <div className={`animate-rise ${styles.spill}`} style={vars({ "--i": 9 })}>
          <KnowledgeGalaxy
            map={corpus}
            onAsk={(question, origin) => {
              ask(question, origin);
            }}
          />
        </div>
      </div>

      {profile.headline !== undefined && (
        <figure className="animate-rise glass-inset mt-5 rounded-3xl p-4 sm:p-5" style={vars({ "--i": 11 })}>
          <InkQuote text={profile.headline} />
          <figcaption className="mt-3 flex items-center gap-2.5">
            <Image
              src={headshot}
              alt=""
              width={32}
              height={32}
              className="ring-glass-border size-8 rounded-full object-cover ring-2"
            />
            <span className="text-label">
              <span className="text-ink font-medium">{profile.name}</span>
              <span className="text-ink-muted">, in his own words</span>
            </span>
          </figcaption>
        </figure>
      )}
    </div>
  );
}

/**
 * One word of the headline, rising out of its own mask with a little blur and
 * a turn, on the portfolio site's curve. The masks are plain inline spans, so
 * the heading reads as one sentence to a screen reader.
 */
function Word({ index, className, children }: { index: number; className?: string; children: ReactNode }) {
  return (
    <span className={styles.mask}>
      <span className={`${styles.word} ${className ?? ""}`} style={vars({ "--i": index })}>
        {children}
      </span>
    </span>
  );
}

/**
 * His own words, inking in a word at a time the first time they are reached.
 * Armed from script, so without it, or under reduced motion, the quote is
 * simply there.
 */
function InkQuote({ text }: { text: string }) {
  const quote = useRef<HTMLQuoteElement>(null);

  useEffect(() => {
    const element = quote.current;
    if (element === null || reducedMotion()) return;
    element.dataset["armed"] = "";
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting !== true) return;
        observer.disconnect();
        element.dataset["in"] = "";
      },
      { threshold: 0.4 },
    );
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, []);

  const words = text.split(/\s+/);
  return (
    <blockquote ref={quote} className={`font-prose text-ink text-prose-sm text-pretty ${styles.quote}`}>
      &ldquo;
      {words.map((word, index) => (
        <Fragment key={index}>
          <span className={styles.ink} style={vars({ "--i": index })}>
            {word}
          </span>
          {index < words.length - 1 ? " " : ""}
        </Fragment>
      ))}
      &rdquo;
    </blockquote>
  );
}

/** One-tap contact on phones: the résumé first, then the profile's own links. */
function QuickContacts({ profile }: { profile: ProfileView }) {
  const links = profile.contacts.filter((contact) => contact.kind !== "github");

  return (
    <ul className="grid grid-cols-5 gap-2">
      <li>
        <a
          href={profile.resume.href}
          download={profile.resume.filename}
          className="text-ink flex flex-col items-center gap-1.5 text-micro font-medium"
        >
          <span className="from-brand-a to-brand-b grid size-12 place-items-center rounded-2xl bg-linear-to-br text-white shadow-[0_10px_22px_-12px_var(--brand-glow)]">
            <FileDown aria-hidden className="size-5" />
          </span>
          Résumé
        </a>
      </li>
      {links.map((contact) => {
        const Icon = CONTACT_ICONS[contact.kind];
        return (
          <li key={contact.kind}>
            <a
              href={contact.href}
              {...(contact.external ? { target: "_blank", rel: "me noopener noreferrer" } : {})}
              aria-label={contact.kind === "phone" ? `Call ${contact.display}` : undefined}
              className="text-ink flex flex-col items-center gap-1.5 text-micro font-medium"
            >
              <span className="glass-inset grid size-12 place-items-center rounded-2xl">
                <Icon aria-hidden className="size-5" />
              </span>
              <span className="max-w-full truncate">
                {contact.kind === "phone" ? "Call" : contact.label}
              </span>
            </a>
          </li>
        );
      })}
    </ul>
  );
}
