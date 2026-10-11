"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";
import { toggleTheme } from "@/lib/theme";

type Theme = "light" | "dark";

function readTheme(): Theme | null {
  const value = document.documentElement.dataset["theme"];
  return value === "light" || value === "dark" ? value : null;
}

function subscribe(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => {
    observer.disconnect();
  };
}

function stored(): string | null {
  try {
    return localStorage.getItem("theme");
  } catch {
    return null;
  }
}

/**
 * Light and dark, following the system until the visitor chooses. The head
 * script in app/layout.tsx applies the choice before first paint; this only
 * changes it. Which icon shows is decided by CSS from data-theme, so there
 * is no flash of the wrong one while React hydrates.
 *
 * The switch itself, a circle of the new theme growing out of the button, is
 * lib/theme.ts, shared with the command menu.
 */
export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, readTheme, () => null);
  const button = useRef<HTMLButtonElement>(null);

  // Keep following the system for as long as no choice has been stored.
  useEffect(() => {
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const follow = (): void => {
      if (stored() === null) document.documentElement.dataset["theme"] = query.matches ? "dark" : "light";
    };
    query.addEventListener("change", follow);
    return () => {
      query.removeEventListener("change", follow);
    };
  }, []);

  const toggle = (): void => {
    const box = button.current?.getBoundingClientRect();
    toggleTheme(box === undefined ? undefined : { x: box.left + box.width / 2, y: box.top + box.height / 2 });
  };

  return (
    <button
      ref={button}
      type="button"
      onClick={toggle}
      aria-label={
        theme === "dark" ? "Switch to light theme" : theme === "light" ? "Switch to dark theme" : "Switch theme"
      }
      className="touch-target text-ink-muted hover:text-ink hover:bg-sunken grid size-10 place-items-center rounded-full transition-colors"
    >
      <Sun aria-hidden className="theme-sun absolute size-[18px]" />
      <Moon aria-hidden className="theme-moon absolute size-[18px]" />
    </button>
  );
}
