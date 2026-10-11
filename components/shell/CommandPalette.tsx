"use client";

import dynamic from "next/dynamic";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { Search } from "lucide-react";
import type { ProfileView } from "@/lib/view";

/**
 * The command menu's always-loaded half: the shortcuts, the open state and
 * the button. Every visitor downloads this file, and most will never open the
 * menu, so the menu itself and cmdk wait in their own chunk until the first
 * time it is asked for.
 *
 * Usage, inside <ChatProvider>, since the menu asks questions:
 *
 *   <CommandPalette profile={profile}>{the page}</CommandPalette>
 *
 * with <CommandPaletteButton /> anywhere beneath it, or useCommandPalette()
 * to open it from somewhere else.
 *
 * Shortcuts: ⌘K on Apple platforms and Ctrl+K elsewhere, which also close it
 * again; and "/" from anywhere that is not a text field, as on GitHub.
 */

const CommandMenu = dynamic(() => import("./CommandMenu").then((module) => module.CommandMenu), {
  ssr: false,
});

/** Starts fetching the menu on the first sign of intent, so the first open is instant. */
function preload(): void {
  void import("./CommandMenu");
}

interface CommandPaletteContextValue {
  open: boolean;
  /** Opens the menu. Focus goes back to `returnTo` when it closes, or else to whatever had it before. */
  show: (returnTo?: HTMLElement | null) => void;
}

const CommandPaletteContext = createContext<CommandPaletteContextValue | null>(null);

export function useCommandPalette(): CommandPaletteContextValue {
  const value = useContext(CommandPaletteContext);
  if (value === null) throw new Error("useCommandPalette needs a <CommandPalette> above it");
  return value;
}

/** ⌘ on Macs, iPads and iPhones; Ctrl everywhere else, where ⌘ does not exist. */
function isApple(): boolean {
  return /Mac|iPhone|iPad|iPod/.test(navigator.platform);
}

function never(): () => void {
  return () => undefined;
}

/** A slash typed into a field belongs to the field. */
function typingIn(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || target.matches("input, textarea, select"))
  );
}

export function CommandPalette({ profile, children }: { profile: ProfileView; children?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [wanted, setWanted] = useState(false);
  const returnTo = useRef<HTMLElement | null>(null);

  const show = useCallback((origin?: HTMLElement | null) => {
    const active = document.activeElement;
    returnTo.current = origin ?? (active instanceof HTMLElement ? active : null);
    setWanted(true);
    setOpen(true);
  }, []);

  useEffect(() => {
    const apple = isApple();
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.defaultPrevented || event.isComposing || event.repeat) return;
      const modifier = apple ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;
      if (modifier && !event.altKey && !event.shiftKey && event.key.toLowerCase() === "k") {
        // The browser's own Ctrl+K focuses its search bar.
        event.preventDefault();
        if (open) setOpen(false);
        else show();
      } else if (
        event.key === "/" &&
        !open &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        !typingIn(event.target)
      ) {
        // Without this the slash would be typed into the search field the
        // moment it takes focus, and Firefox would open its quick find.
        event.preventDefault();
        show();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, show]);

  // Radix returns focus to a Dialog.Trigger, and a shortcut has none, so
  // focus goes back by hand to wherever the visitor was.
  const restoreFocus = useCallback((event: Event) => {
    event.preventDefault();
    const target = returnTo.current;
    returnTo.current = null;
    if (target?.isConnected === true) target.focus({ preventScroll: true });
  }, []);

  const value = useMemo<CommandPaletteContextValue>(() => ({ open, show }), [open, show]);

  return (
    <CommandPaletteContext.Provider value={value}>
      {children}
      {wanted && (
        <CommandMenu profile={profile} open={open} onOpenChange={setOpen} onCloseAutoFocus={restoreFocus} />
      )}
    </CommandPaletteContext.Provider>
  );
}

/**
 * A compact glass button for the header. The shortcut hint is only shown to
 * a mouse and keyboard; on a touch screen it is a plain search button.
 */
export function CommandPaletteButton({ className = "" }: { className?: string }) {
  const { open, show } = useCommandPalette();
  // Unknown until hydration. The hint keeps its space meanwhile, so the
  // header does not shift when it appears.
  const apple = useSyncExternalStore(never, isApple, () => null);

  return (
    <button
      type="button"
      onClick={(event) => {
        show(event.currentTarget);
      }}
      onPointerEnter={preload}
      onFocus={preload}
      aria-label="Open command menu"
      aria-haspopup="dialog"
      aria-expanded={open}
      aria-keyshortcuts={apple === null ? undefined : apple ? "Meta+K /" : "Control+K /"}
      className={`touch-target glass-inset text-ink-muted hover:text-ink flex h-9 items-center gap-2 rounded-full pr-1.5 pl-3 transition-[color,border-color,scale] duration-200 hover:border-[color-mix(in_srgb,var(--brand-a)_45%,transparent)] active:scale-[0.96] pointer-coarse:size-10 pointer-coarse:justify-center pointer-coarse:p-0 ${className}`}
    >
      <Search aria-hidden className="size-4" />
      <kbd
        aria-hidden
        className={`bg-sunken hairline rounded-md border px-1.5 font-sans text-micro font-medium pointer-coarse:hidden ${apple === null ? "invisible" : ""}`}
      >
        {apple === false ? "Ctrl K" : "⌘K"}
      </kbd>
    </button>
  );
}
