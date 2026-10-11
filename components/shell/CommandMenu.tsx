"use client";

import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ComponentType,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
import { Command } from "cmdk";
import { Dialog } from "radix-ui";
import {
  ArrowUpRight,
  Check,
  Copy,
  FileDown,
  MessageCircleQuestionMark,
  Moon,
  Pause,
  Play,
  Search,
  SquarePen,
  Sun,
  X,
} from "lucide-react";
import { useChatContext } from "@/components/chat/ChatProvider";
import { SUGGESTIONS } from "@/components/chat/suggestions";
import { CONTACT_ICONS } from "@/components/profile/icons";
import { GUARDS } from "@/lib/config";
import { isMotionPaused, setMotionPaused, toggleTheme } from "@/lib/theme";
import type { ContactKind, ProfileView } from "@/lib/view";
import styles from "./CommandPalette.module.css";

/**
 * The command menu, loaded on first open by CommandPalette.tsx. Radix
 * supplies the dialog: the focus trap, Escape, the title screen readers
 * announce, and the rest of the page hidden from them while it is open. cmdk
 * supplies the listbox: arrow keys from the search field, the highlighted
 * row, and the combobox semantics that tell a screen reader which row that is.
 *
 * Everything in it is something the page can already do: ask one of the
 * suggested questions or a typed one, reach the résumé and contact details,
 * switch the theme, stop the background motion, start a new chat. It is a
 * faster route for a keyboard, not a second interface.
 */

type IconComponent = ComponentType<{ className?: string }>;

interface Entry {
  /** Unique within the menu, and the row's label. */
  value: string;
  /** Other words a visitor might type to find it. */
  keywords: readonly string[];
  Icon: IconComponent;
}

interface LinkEntry extends Entry {
  href: string;
  detail: string;
  /** The file name to save as, which makes it a download rather than a page. */
  download?: string;
  external: boolean;
}

interface CopyEntry extends Entry {
  text: string;
  detail: string;
  /** What was copied, for the confirmation read out to screen readers. */
  noun: string;
}

interface RunEntry extends Entry {
  id: string;
  run: (row: HTMLElement | null) => void;
}

const COPY_ROWS: readonly { kind: ContactKind; value: string; keywords: readonly string[] }[] = [
  { kind: "email", value: "Copy email", keywords: ["mail", "address", "contact"] },
  { kind: "phone", value: "Copy phone", keywords: ["number", "call", "mobile", "telephone", "contact"] },
];

const LINK_ROWS: readonly { kind: ContactKind; value: string; keywords: readonly string[] }[] = [
  { kind: "linkedin", value: "Open LinkedIn", keywords: ["profile", "social", "network"] },
  { kind: "portfolio", value: "Open portfolio", keywords: ["website", "site", "projects", "work"] },
  { kind: "github", value: "Open GitHub", keywords: ["code", "repositories", "repos", "source"] },
];

/** Lower case, accents folded, split into words: "Résumé (PDF)" becomes ["resume", "pdf"]. */
function words(text: string): string[] {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word !== "");
}

/**
 * Every typed word has to begin some word of the entry. This replaces cmdk's
 * fuzzy scoring on purpose: a question typed in full shares scattered letters
 * with nearly every long suggestion, so fuzzy matching would keep surfacing
 * them and never get as far as offering to ask the visitor's own question.
 */
function matches(entry: Entry, typed: readonly string[]): boolean {
  if (typed.length === 0) return true;
  const own = words([entry.value, ...entry.keywords].join(" "));
  return typed.every((word) => own.some((candidate) => candidate.startsWith(word)));
}

/** The theme and motion attributes on <html>, which the header can change too. */
function subscribeRoot(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme", "data-motion"],
  });
  return () => {
    observer.disconnect();
  };
}

function isDark(): boolean {
  return document.documentElement.dataset["theme"] === "dark";
}

/**
 * On a touch screen the list is the point, and focusing the search field
 * would raise the keyboard over it. Focus goes to the dialog itself instead:
 * a screen reader still lands inside it, and a tap on the field types.
 */
function keepKeyboardDown(event: Event): void {
  if (!window.matchMedia("(pointer: coarse)").matches) return;
  event.preventDefault();
  if (event.target instanceof HTMLElement) event.target.focus();
}

/**
 * cmdk's root is focusable, so pressing anything in the menu that is not a
 * control would take focus out of the search field and stop typing reaching
 * it. Keyboard focus stays in the field; rows still receive the click.
 */
function holdFocus(event: MouseEvent<HTMLDivElement>): void {
  if (event.target instanceof Element && event.target.closest("input, button") === null) {
    event.preventDefault();
  }
}

/**
 * Enter on a link row clicks the real link, so the browser downloads the
 * résumé or opens the profile in a new tab exactly as a click would. cmdk
 * leaves an Enter alone once it has been handled.
 */
function followLink(event: KeyboardEvent<HTMLDivElement>): void {
  if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
  const row = event.currentTarget.querySelector('[cmdk-item][data-selected="true"]');
  if (!(row instanceof HTMLAnchorElement)) return;
  event.preventDefault();
  row.click();
}

export function CommandMenu({
  profile,
  open,
  onOpenChange,
  onCloseAutoFocus,
}: {
  profile: ProfileView;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Where focus goes on close; the palette knows what had it before. */
  onCloseAutoFocus: (event: Event) => void;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.scrim} />
        <Dialog.Content
          aria-describedby={undefined}
          onOpenAutoFocus={keepKeyboardDown}
          onCloseAutoFocus={onCloseAutoFocus}
          className={`glass-panel ${styles.panel}`}
        >
          <div aria-hidden className={`glass-fill ${styles.fill} ${styles.fade}`} />
          <Dialog.Title className="sr-only">Command menu</Dialog.Title>
          <Menu
            profile={profile}
            close={() => {
              onOpenChange(false);
            }}
          />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/**
 * The menu's contents. They mount with each open and unmount after the
 * close, so every open starts from an empty search at the top of the list.
 */
function Menu({ profile, close }: { profile: ProfileView; close: () => void }) {
  const { ask, busy, messages, reset } = useChatContext();
  const [query, setQuery] = useState("");
  const [copied, setCopied] = useState<CopyEntry | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const dark = useSyncExternalStore(subscribeRoot, isDark, () => false);
  const paused = useSyncExternalStore(subscribeRoot, isMotionPaused, () => false);

  useEffect(
    () => () => {
      clearTimeout(timer.current);
    },
    [],
  );

  const send = (question: string, row: HTMLElement | null): void => {
    // The row is the launch point: the question's bubble flies from it into
    // the conversation, as it does from the suggestion cards.
    if (ask(question, row)) close();
  };

  // Copying keeps the menu open, so the confirmation can be seen where the
  // visitor is looking. If the clipboard refuses, nothing pretends otherwise;
  // the value is written on the row.
  const copy = async (entry: CopyEntry): Promise<void> => {
    try {
      await navigator.clipboard.writeText(entry.text);
    } catch {
      return;
    }
    setCopied(entry);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setCopied(null);
    }, 1600);
  };

  const asks = SUGGESTIONS.map((suggestion) => ({
    value: suggestion.question,
    keywords: [suggestion.topic],
    Icon: suggestion.Icon,
    topic: suggestion.topic,
  }));

  const resume: LinkEntry = {
    value: "Download résumé",
    keywords: ["cv", "pdf"],
    Icon: FileDown,
    href: profile.resume.href,
    download: profile.resume.filename,
    detail: `PDF, ${profile.resume.size}`,
    external: false,
  };

  const copies = COPY_ROWS.flatMap(({ kind, value, keywords }): CopyEntry[] => {
    const contact = profile.contacts.find((item) => item.kind === kind);
    if (contact === undefined) return [];
    return [
      {
        value,
        keywords: [...keywords, contact.display],
        Icon: CONTACT_ICONS[kind],
        text: contact.copy ?? contact.display,
        detail: contact.display,
        noun: contact.label,
      },
    ];
  });

  const links = LINK_ROWS.flatMap(({ kind, value, keywords }): LinkEntry[] => {
    const contact = profile.contacts.find((item) => item.kind === kind);
    if (contact === undefined) return [];
    return [
      {
        value,
        keywords: [...keywords, contact.display],
        Icon: CONTACT_ICONS[kind],
        href: contact.href,
        detail: contact.display,
        external: contact.external,
      },
    ];
  });

  const views: RunEntry[] = [
    {
      id: "theme",
      value: dark ? "Switch to light theme" : "Switch to dark theme",
      keywords: ["theme", "appearance", "mode", "dark", "light", "colour", "color"],
      Icon: dark ? Sun : Moon,
      run: (row) => {
        // The new theme grows out of the row's icon, as it does from the
        // toggle in the header.
        const box = (row?.querySelector("[data-chip]") ?? row)?.getBoundingClientRect();
        close();
        toggleTheme(
          box === undefined ? undefined : { x: box.left + box.width / 2, y: box.top + box.height / 2 },
        );
      },
    },
    {
      id: "motion",
      value: paused ? "Resume background motion" : "Pause background motion",
      keywords: ["motion", "animation", "background", "pause", "resume", "stop", "start", "play"],
      Icon: paused ? Play : Pause,
      run: () => {
        setMotionPaused(!paused);
        close();
      },
    },
  ];

  const chats: RunEntry[] =
    messages.length === 0
      ? []
      : [
          {
            id: "new-chat",
            value: "New chat",
            keywords: ["reset", "clear", "restart", "start", "over", "conversation"],
            Icon: SquarePen,
            run: () => {
              reset();
              close();
            },
          },
        ];

  const typed = words(query);
  const question = query.trim();
  const shownAsks = asks.filter((entry) => matches(entry, typed));
  const shownResume = matches(resume, typed);
  const shownCopies = copies.filter((entry) => matches(entry, typed));
  const shownLinks = links.filter((entry) => matches(entry, typed));
  const shownViews = views.filter((entry) => matches(entry, typed));
  const shownChats = chats.filter((entry) => matches(entry, typed));
  const contactCount = Number(shownResume) + shownCopies.length + shownLinks.length;
  // Only when nothing else fits is the search taken to be a question.
  const offer =
    question !== "" && shownAsks.length + contactCount + shownViews.length + shownChats.length === 0;

  return (
    <Command
      label="Search, or ask a question"
      shouldFilter={false}
      loop
      // Off so Ctrl+K closes the menu on Windows and Linux instead of
      // moving the highlight up.
      vimBindings={false}
      onKeyDown={followLink}
      onMouseDown={holdFocus}
      className={`${styles.fade} relative z-[1] flex min-h-0 flex-col`}
    >
      <div className="hairline flex items-center gap-2 border-b pr-2 pl-4 sm:pl-5">
        <div className="group flex min-w-0 flex-1 items-center gap-3">
          <Search
            aria-hidden
            className="text-ink-muted group-focus-within:text-evidence size-5 shrink-0 transition-colors"
          />
          <Command.Input
            onValueChange={setQuery}
            placeholder={`Search, or ask about ${profile.firstName}…`}
            maxLength={GUARDS.maxInputChars}
            enterKeyHint="go"
            className="text-ink placeholder:text-ink-muted h-14 min-w-0 flex-1 bg-transparent text-prose-sm outline-none sm:text-prose"
          />
        </div>
        <Dialog.Close className="touch-target text-ink-muted hover:text-ink hover:bg-sunken hidden size-10 shrink-0 place-items-center rounded-full transition-colors pointer-coarse:grid">
          <X aria-hidden className="size-5" />
          <span className="sr-only">Close</span>
        </Dialog.Close>
      </div>

      <Command.List label="Results" className={`${styles.list} scroll-thin`}>
        {(offer || shownAsks.length > 0) && (
          <Command.Group
            heading={
              <Heading hint={busy ? "Available when the current answer finishes" : undefined}>
                Ask
              </Heading>
            }
          >
            {offer && (
              <Row
                value="ask-typed"
                Icon={MessageCircleQuestionMark}
                tone="ask"
                disabled={busy}
                onSelect={(row) => {
                  send(question, row);
                }}
              >
                <span className="font-medium">Ask:</span> {question}
              </Row>
            )}
            {shownAsks.map((entry) => (
              <Row
                key={entry.value}
                value={entry.value}
                Icon={entry.Icon}
                tone="ask"
                wrap
                disabled={busy}
                onSelect={(row) => {
                  send(entry.value, row);
                }}
                detail={<span className="text-ink-muted shrink-0 text-label max-sm:hidden">{entry.topic}</span>}
              >
                {entry.value}
              </Row>
            ))}
          </Command.Group>
        )}

        {contactCount > 0 && (
          <Command.Group heading={<Heading>Contact</Heading>}>
            {shownResume && <LinkRow entry={resume} onFollow={close} />}
            {shownCopies.map((entry) => (
              <Row
                key={entry.value}
                value={entry.value}
                Icon={entry.Icon}
                onSelect={() => {
                  void copy(entry);
                }}
                detail={
                  copied?.value === entry.value ? (
                    <span className="text-evidence flex shrink-0 items-center gap-1 text-label font-medium">
                      <Check aria-hidden className="animate-pop size-4" strokeWidth={2.5} />
                      Copied
                    </span>
                  ) : (
                    <>
                      <Detail>{entry.detail}</Detail>
                      <Copy aria-hidden className="text-ink-muted size-4 shrink-0" />
                    </>
                  )
                }
              >
                {entry.value}
              </Row>
            ))}
            {shownLinks.map((entry) => (
              <LinkRow key={entry.value} entry={entry} onFollow={close} />
            ))}
          </Command.Group>
        )}

        {shownViews.length > 0 && (
          <Command.Group heading={<Heading>View</Heading>}>
            {shownViews.map((entry) => (
              <Row key={entry.id} value={entry.value} Icon={entry.Icon} onSelect={entry.run}>
                {entry.value}
              </Row>
            ))}
          </Command.Group>
        )}

        {shownChats.length > 0 && (
          <Command.Group heading={<Heading>Conversation</Heading>}>
            {shownChats.map((entry) => (
              <Row key={entry.id} value={entry.value} Icon={entry.Icon} onSelect={entry.run}>
                {entry.value}
              </Row>
            ))}
          </Command.Group>
        )}
      </Command.List>

      {/* A reminder for sighted keyboard users. The listbox semantics already
        * tell a screen reader how to move, and a touch screen has no keys. */}
      <div
        aria-hidden
        className="hairline text-ink-muted flex items-center gap-4 border-t px-5 py-2.5 text-micro pointer-coarse:hidden"
      >
        <span className="flex items-center gap-1.5">
          <kbd className={styles.kbd}>↑</kbd>
          <kbd className={styles.kbd}>↓</kbd>
          to move
        </span>
        <span className="flex items-center gap-1.5">
          <kbd className={styles.kbd}>↵</kbd>
          to select
        </span>
        <span className="flex items-center gap-1.5">
          <kbd className={styles.kbd}>esc</kbd>
          to close
        </span>
      </div>

      <p aria-live="polite" className="sr-only">
        {copied === null ? "" : `${copied.noun} copied`}
      </p>
    </Command>
  );
}

/**
 * cmdk hides the heading itself from screen readers and names the group with
 * it, so the hint is part of what a screen reader announces on entering the
 * group. The flex gap separates the two by eye only, hence the hidden colon.
 */
function Heading({ children, hint }: { children: ReactNode; hint?: string }) {
  return (
    <span className="text-ink-muted flex items-baseline gap-2 text-micro font-medium">
      {children}
      {hint !== undefined && (
        <span className="font-normal">
          <span className="sr-only">: </span>
          {hint}
        </span>
      )}
    </span>
  );
}

function Glyph({ Icon, tone }: { Icon: IconComponent; tone?: "ask" }) {
  return (
    <span aria-hidden data-chip="" data-tone={tone} className={styles.chip}>
      <Icon className="size-4" />
    </span>
  );
}

function Detail({ children }: { children: ReactNode }) {
  return <span className="text-ink-muted max-w-[45%] min-w-0 shrink-0 truncate text-label">{children}</span>;
}

const ROW = `${styles.item} flex items-center gap-3 rounded-[0.875rem] px-2.5 py-1.5 text-ui text-ink select-none`;

function Row({
  value,
  Icon,
  tone,
  wrap = false,
  disabled = false,
  detail,
  onSelect,
  children,
}: {
  value: string;
  Icon: IconComponent;
  tone?: "ask";
  /** Long questions wrap on a phone rather than lose their endings. */
  wrap?: boolean;
  disabled?: boolean;
  detail?: ReactNode;
  onSelect: (row: HTMLElement | null) => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <Command.Item
      ref={ref}
      value={value}
      disabled={disabled}
      onSelect={() => {
        onSelect(ref.current);
      }}
      className={ROW}
    >
      <Glyph Icon={Icon} tone={tone} />
      <span className={`min-w-0 flex-1 ${wrap ? "sm:truncate" : "truncate"}`}>{children}</span>
      {detail}
    </Command.Item>
  );
}

/**
 * A row that is a real link, so a mouse gets everything a link offers: the
 * address on hover, open in a new tab, save as. Rows are reached with the
 * arrow keys from the search field, so the link stays out of the Tab order.
 */
function LinkRow({ entry, onFollow }: { entry: LinkEntry; onFollow: () => void }) {
  return (
    <Command.Item asChild value={entry.value} className={ROW}>
      <a
        href={entry.href}
        download={entry.download}
        target={entry.external ? "_blank" : undefined}
        rel={entry.external ? "noopener noreferrer" : undefined}
        tabIndex={-1}
        onClick={onFollow}
      >
        <Glyph Icon={entry.Icon} />
        <span className="min-w-0 flex-1 truncate">{entry.value}</span>
        <Detail>{entry.detail}</Detail>
        {entry.external && (
          <>
            <ArrowUpRight aria-hidden className="text-ink-muted size-4 shrink-0" />
            <span className="sr-only">, opens in a new tab</span>
          </>
        )}
      </a>
    </Command.Item>
  );
}
