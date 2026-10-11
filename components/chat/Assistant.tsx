"use client";

import Image from "next/image";
import { useLayoutEffect, useMemo, useRef, useState, type Ref, type RefObject } from "react";
import { ArrowDown, ChevronDown, RotateCcw, SquarePen, TriangleAlert } from "lucide-react";
import { useStickToBottomContext } from "use-stick-to-bottom";
import headshot from "@/public/photos/shubham-square.jpg";
import { Conversation, ConversationContent } from "@/components/ai-elements/conversation";
import { ProfilePanel } from "@/components/profile/ProfilePanel";
import { ProfileSheet } from "@/components/profile/ProfileSheet";
import { CommandPaletteButton } from "@/components/shell/CommandPalette";
import { LiquidGlass } from "@/components/shell/LiquidGlass";
import { ThemeToggle } from "@/components/shell/ThemeToggle";
import type { CorpusMap } from "@/lib/corpus-map";
import type { ProfileView } from "@/lib/view";
import { useActivity, useChatContext } from "./ChatProvider";
import { Composer } from "./Composer";
import styles from "./Assistant.module.css";
import { Exchange, followUpsFor } from "./Messages";
import { Orb, type OrbState } from "./Orb";
import { ShaderOrb } from "./ShaderOrb";
import { StatusIsland, useWidthMorph } from "./StatusIsland";
import type { AssistantMessage } from "./types";
import { Welcome } from "./Welcome";

/**
 * The console. Its chrome floats: a status island at the top, a cluster of
 * round controls in the corner, and the composer near the bottom, each a
 * small piece of glass over the transcript rather than a full-width bar. The
 * transcript fades out as it nears them (a mask on the scroller), so text
 * never collides with the chrome and what passes under the glass is soft.
 *
 * On page load the chrome docks piece by piece, each from its own edge
 * (Assistant.module.css). The root is marked data-console so the page's
 * panel entrance knows not to fade it: a fade there would cut every piece of
 * glass off from what it frosts until the fade ended.
 */
export function Assistant({ profile, corpus }: { profile: ProfileView; corpus: CorpusMap }) {
  const { messages, status, error, busy, retry } = useChatContext();
  const header = useRef<HTMLElement>(null);
  const dock = useRef<HTMLDivElement>(null);
  const composerRow = useRef<HTMLDivElement>(null);
  const insets = useChromeInsets(header, dock, composerRow);
  const exchanges = useMemo(() => toExchanges(messages), [messages]);
  const followUps = useMemo(() => followUpsFor(messages), [messages]);
  const pad = {
    paddingTop: `${String(insets.top + 20)}px`,
    paddingBottom: `${String(insets.bottom + 28)}px`,
  };
  // Fully visible from just below the island to just above the composer, and
  // gone before it reaches either. At the top the text is fully transparent
  // for the upper half of the island's band, so nothing reads beside the
  // island. At the bottom the fade starts where the composer starts, so the
  // jump-to-latest pill above it is never faded, and finishes behind the
  // composer's glass: the band under the composer has no glass of its own,
  // and a fade still running there showed transcript text through it.
  const fadeTopStart = Math.round(insets.top * 0.5);
  const fadeTopEnd = Math.round(insets.top + 12);
  const fadeBottomStart = Math.round(insets.bottom * 0.9);
  const fadeBottomEnd = insets.below + 6;
  const mask = `linear-gradient(to bottom, transparent 0, transparent ${String(fadeTopStart)}px, #000 ${String(fadeTopEnd)}px, #000 calc(100% - ${String(fadeBottomStart)}px), transparent calc(100% - ${String(fadeBottomEnd)}px), transparent 100%)`;
  const fade = { WebkitMaskImage: mask, maskImage: mask };

  return (
    <div data-console="" className="absolute inset-0">
      <ConsoleHeader ref={header} profile={profile} />

      {messages.length === 0 ? (
        // The welcome reads top down, so it gets a plain scroller; the
        // transcript below sticks to the newest message instead.
        <div className={`${styles.content} scroll-thin h-full overflow-y-auto`} style={fade}>
          {/* Wider than the transcript: the welcome is a bento, not prose. */}
          <div className="mx-auto w-full max-w-[60rem] px-4 sm:px-8" style={pad}>
            <Welcome profile={profile} corpus={corpus} />
          </div>
        </div>
      ) : (
        <Conversation className="h-full" aria-label="Conversation" style={fade}>
          <ConversationContent className="mx-auto w-full max-w-[46rem] gap-10 px-4 sm:px-8" style={pad}>
            {exchanges.map((exchange, index) => {
              const last = index === exchanges.length - 1;
              return (
                <Exchange
                  key={exchange.key}
                  user={exchange.user}
                  reply={exchange.reply}
                  live={last && busy}
                  followUps={last && status === "ready" ? followUps : []}
                  corpus={corpus}
                />
              );
            })}

            {error !== undefined && <ErrorNotice error={error} onRetry={retry} />}
          </ConversationContent>

          <JumpToLatest bottom={insets.bottom} />
        </Conversation>
      )}

      <div
        ref={dock}
        className="pointer-events-none absolute inset-x-0 bottom-0 z-20 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
      >
        <div ref={composerRow} className="pointer-events-auto mx-auto w-full max-w-[46rem] px-3 pt-2 sm:px-8">
          <Composer />
        </div>
      </div>
    </div>
  );
}

function ConsoleHeader({ ref, profile }: { ref: Ref<HTMLElement>; profile: ProfileView }) {
  const { messages, status, error, reset } = useChatContext();
  const { typing } = useActivity();
  const controls = useRef<HTMLDivElement>(null);
  const row = useRef<HTMLSpanElement>(null);
  const chatting = messages.length > 0;
  // "New chat" joins the corner controls once there is a conversation, and
  // the glass springs wider to take it in rather than jumping.
  useWidthMorph(controls, row, String(chatting), { clip: true });

  const state: OrbState =
    status === "submitted"
      ? "thinking"
      : status === "streaming"
        ? "writing"
        : typing
          ? "listening"
          : "idle";

  const line =
    error !== undefined && state === "idle"
      ? "Something went wrong"
      : {
          idle: "Online, and every answer cites its sources",
          listening: "Listening…",
          thinking: "Searching his work…",
          writing: "Answering…",
        }[state];

  return (
    <header
      ref={ref}
      className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start gap-2 p-3 sm:p-4"
    >
      {/* Phones and tablets: his photo and name open the profile sheet. */}
      <ProfileSheet
        title="Profile"
        trigger={
          <LiquidGlass
            as="button"
            aria-label={`View ${profile.name}'s profile`}
            radius={999}
            bezel={12}
            scale={26}
            aberration
            className={`${styles.pill} pointer-events-auto flex min-w-0 items-center gap-3 py-1.5 pr-4 pl-1.5 text-left lg:hidden`}
          >
            <span className="relative shrink-0" data-particle-target="island">
              <Image
                src={headshot}
                alt=""
                width={40}
                height={40}
                className="ring-glass-border size-10 rounded-full object-cover ring-2"
              />
              <Orb size={18} state={state} listen className="absolute -right-1 -bottom-1" />
            </span>
            <span className="min-w-0">
              <span className="text-ink flex items-center gap-1 text-ui font-semibold">
                <span className="truncate">{profile.name}</span>
                <ChevronDown aria-hidden className="text-ink-muted size-4 shrink-0" />
              </span>
              <Status state={state} line={state === "idle" && error === undefined ? "AI assistant" : line} />
            </span>
          </LiquidGlass>
        }
      >
        <ProfilePanel profile={profile} variant="sheet" />
      </ProfileSheet>

      {/* Wide screens: the photo is in the sidebar, so the island is the
        * assistant's. Its wrapper has no filter, opacity or backdrop of its
        * own, which the island's refraction needs (see LiquidGlass). */}
      <div className="pointer-events-none absolute inset-x-0 top-3 hidden justify-center sm:top-4 lg:flex">
        <StatusIsland
          leading={<ShaderOrb size={34} state={state} listen />}
          title={`Ask about ${profile.firstName}`}
          status={line}
          busy={state === "thinking" || state === "writing"}
          entrance
          className="pointer-events-auto"
        />
      </div>

      <LiquidGlass
        ref={controls}
        radius={999}
        bezel={10}
        scale={24}
        aberration
        className={`${styles.controls} pointer-events-auto ml-auto flex shrink-0 items-center justify-end p-1`}
      >
        <span ref={row} className={styles.row}>
          {chatting && (
            <button
              type="button"
              onClick={reset}
              className={`${styles.newChat} touch-target text-ink-muted hover:text-ink hover:bg-sunken flex h-10 items-center gap-2 rounded-full px-3 text-label font-medium transition-colors`}
            >
              <SquarePen aria-hidden className="size-4" />
              <span className="max-sm:sr-only">New chat</span>
            </button>
          )}
          <CommandPaletteButton />
          <ThemeToggle />
        </span>
      </LiquidGlass>
    </header>
  );
}

function Status({ state, line }: { state: OrbState; line: string }) {
  return (
    <span className="text-ink-muted flex items-center gap-1.5 text-micro">
      <span
        aria-hidden
        className={`size-1.5 shrink-0 rounded-full ${state === "idle" ? "bg-online pulse-dot" : "bg-brand-a animate-pulse"}`}
      />
      <span key={line} className="animate-fade truncate">
        {line}
      </span>
    </span>
  );
}

function ErrorNotice({ error, onRetry }: { error: Error; onRetry: () => void }) {
  const offline = /fetch|network/i.test(error.message);
  const detail = offline
    ? "The assistant could not be reached. Check the connection and try again."
    : error.message !== "" && error.message.length <= 160
      ? error.message
      : "Something went wrong on the way back from the server.";

  return (
    <div
      role="alert"
      className="glass-inset animate-rise border-l-caution flex flex-wrap items-start gap-3 rounded-2xl border-l-2 p-4"
    >
      <TriangleAlert aria-hidden className="text-caution mt-0.5 size-4 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-ink text-label font-medium">That did not go through</p>
        <p className="text-ink-muted text-label">{detail}</p>
      </div>
      <button
        type="button"
        onClick={onRetry}
        className="touch-target hairline text-ink hover:bg-sunken flex h-9 items-center gap-2 rounded-full border px-3 text-label font-medium transition-colors"
      >
        <RotateCcw aria-hidden className="size-3.5" />
        Try again
      </button>
    </div>
  );
}

/** Appears once the visitor has scrolled away from the newest message. */
function JumpToLatest({ bottom }: { bottom: number }) {
  const { isAtBottom, scrollToBottom } = useStickToBottomContext();
  if (isAtBottom) return null;

  return (
    <LiquidGlass
      as="button"
      onClick={() => {
        void scrollToBottom();
      }}
      radius={999}
      bezel={12}
      scale={26}
      aberration
      style={{ bottom: `${String(bottom + 12)}px` }}
      className="text-ink animate-pop absolute left-1/2 z-30 flex h-11 -translate-x-1/2 items-center gap-1.5 px-3.5 text-label font-medium"
    >
      <ArrowDown aria-hidden className="size-4" />
      Latest
    </LiquidGlass>
  );
}

interface Exchange {
  key: string;
  user?: AssistantMessage;
  reply?: AssistantMessage;
}

/**
 * Pairs each question with its reply. The pair is keyed by the question, so
 * the assistant's turn is mounted the moment a question is sent and keeps its
 * identity when the reply message arrives, rather than a placeholder being
 * swapped out for it and replaying its entrance.
 */
function toExchanges(messages: AssistantMessage[]): Exchange[] {
  const exchanges: Exchange[] = [];
  for (const message of messages) {
    if (message.role === "user") {
      exchanges.push({ key: message.id, user: message });
      continue;
    }
    if (message.role !== "assistant") continue;
    const last = exchanges[exchanges.length - 1];
    if (last !== undefined && last.reply === undefined) last.reply = message;
    else exchanges.push({ key: message.id, reply: message });
  }
  return exchanges;
}

/**
 * Measures the two glass overlays and pads the transcript to clear them.
 * Their heights are not fixed: the composer grows as a question is typed and
 * the header changes between breakpoints, so a hardcoded padding would hide
 * the first or last lines behind the glass. `below` is the band from the
 * composer's bottom edge to the panel's, where nothing may show through.
 */
function useChromeInsets(
  header: RefObject<HTMLElement | null>,
  dock: RefObject<HTMLDivElement | null>,
  composerRow: RefObject<HTMLElement | null>,
): { top: number; bottom: number; below: number } {
  const [insets, setInsets] = useState({ top: 72, bottom: 128, below: 12 });

  useLayoutEffect(() => {
    const top = header.current;
    const bottom = dock.current;
    const line = composerRow.current;
    if (top === null || bottom === null || line === null) return;

    const measure = (): void => {
      const dockBox = bottom.getBoundingClientRect();
      setInsets({
        top: Math.ceil(top.getBoundingClientRect().height),
        bottom: Math.ceil(dockBox.height),
        below: Math.ceil(dockBox.bottom - line.getBoundingClientRect().bottom),
      });
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(top);
    observer.observe(bottom);
    observer.observe(line);
    return () => {
      observer.disconnect();
    };
  }, [header, dock, composerRow]);

  return insets;
}
