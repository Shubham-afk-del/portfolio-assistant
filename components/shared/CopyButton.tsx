"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, Copy } from "lucide-react";
import { burst } from "@/components/motion/burst";
import { Sparks } from "@/components/motion/Sparks";

/**
 * Copies a value and confirms it in place: the icon pops to a tick, a small
 * burst of sparks leaves it, and a polite live region says "Copied" for
 * screen readers. If the clipboard is unavailable nothing pretends
 * otherwise; the value is on screen to select by hand.
 *
 * The sparks need a positioned button; both callers' `touch-target` class
 * provides that.
 */
export function CopyButton({
  value,
  label,
  className = "",
  children,
}: {
  value: string;
  /** What is being copied, for the accessible name: "Copy email". */
  label: string;
  className?: string;
  children?: ReactNode;
}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const sparks = useRef<HTMLSpanElement>(null);

  useEffect(
    () => () => {
      clearTimeout(timer.current);
    },
    [],
  );

  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      return;
    }
    setCopied(true);
    burst(sparks.current);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setCopied(false);
    }, 1600);
  };

  return (
    <button
      type="button"
      onClick={() => void copy()}
      aria-label={`Copy ${label}`}
      className={className}
    >
      {copied ? (
        <Check key="done" aria-hidden className="animate-pop size-4 text-evidence" strokeWidth={2.5} />
      ) : (
        <Copy key="idle" aria-hidden className="size-4" />
      )}
      {children}
      <Sparks ref={sparks} />
      <span className="sr-only" aria-live="polite">
        {copied ? "Copied" : ""}
      </span>
    </button>
  );
}
