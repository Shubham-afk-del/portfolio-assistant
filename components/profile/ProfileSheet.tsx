"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { Dialog } from "radix-ui";
import { X } from "lucide-react";

/**
 * The profile panel on screens too narrow for the sidebar: a bottom sheet,
 * which is where a thumb already is. Radix supplies the dialog semantics,
 * the focus trap, Escape to close and focus return to the trigger.
 *
 * Asking about a timeline entry from inside the sheet closes it, so the
 * question can be seen landing in the conversation underneath.
 */

const SheetClose = createContext<(() => void) | null>(null);

/** Closes the enclosing sheet, or null outside one. */
export function useSheetClose(): (() => void) | null {
  return useContext(SheetClose);
}

export function ProfileSheet({
  trigger,
  title,
  children,
}: {
  trigger: ReactNode;
  title: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => {
    setOpen(false);
  }, []);

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="scrim fixed inset-0 z-50 bg-black/35 backdrop-blur-[3px]" />
        {/* The header sits above the scroll area rather than over it, so the
          * sheet needs one frosted layer, never one inside another. */}
        <Dialog.Content
          aria-describedby={undefined}
          className="sheet glass-panel fixed inset-x-0 -bottom-10 z-50 flex max-h-[calc(92dvh+2.5rem)] flex-col overflow-hidden rounded-t-[1.75rem] outline-none"
        >
          <div aria-hidden className="glass-fill" />
          <div className="hairline relative z-[1] flex shrink-0 items-center justify-between border-b px-5 py-3">
            <Dialog.Title className="text-ink text-ui font-semibold">{title}</Dialog.Title>
            <Dialog.Close className="text-ink-muted hover:text-ink hover:bg-sunken -mr-2 grid size-11 place-items-center rounded-full transition-colors">
              <X aria-hidden className="size-5" />
              <span className="sr-only">Close</span>
            </Dialog.Close>
          </div>
          <div className="scroll-thin relative z-[1] min-h-0 flex-1 overflow-y-auto pb-[calc(2.5rem+env(safe-area-inset-bottom))]">
            <SheetClose.Provider value={close}>{children}</SheetClose.Provider>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
