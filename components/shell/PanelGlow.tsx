"use client";

import { useSyncExternalStore } from "react";
import type { ChatStatus } from "ai";
import { useChatContext } from "@/components/chat/ChatProvider";
import { cn } from "@/lib/utils";
import styles from "./PanelGlow.module.css";

/**
 * The console's edge light while the assistant works, after the glow Apple
 * draws round the screen while Siri listens: an aurora flowing round the
 * inside of the panel's rim, with a soft bloom inside it.
 *
 * Its state is the chat's. Thinking (the question is sent and nothing has
 * come back yet) fades it in and runs it briskly. Streaming calms it to a
 * slow, faint shimmer, because the answer has a glow of its own by then and
 * one thing asking for attention is enough. Ready fades it out, faster than
 * it arrived, and an error flashes the rim coral once.
 *
 * Every frame is compositing, not paint. Each band is a still wrapper whose
 * mask shows only the edge, holding an oversized conic gradient turned by a
 * CSS transform animation: the gradient and the masks are painted once, and
 * the GPU only rotates a texture. Two nested turns set the speed. Thinking
 * runs both; streaming pauses the fast one where it stands, so the colours
 * slow down without jumping. Under reduced motion the global rule stops the
 * turning and a still, softer rim shows instead.
 *
 * It must stay a sibling of the panel's .glass-fill, never its ancestor: a
 * mask or an opacity on an ancestor would stop the fill's backdrop blur.
 */

const STATE: Record<ChatStatus, "thinking" | "streaming" | "error" | "idle"> = {
  submitted: "thinking",
  streaming: "streaming",
  error: "error",
  ready: "idle",
};

function subscribeVisibility(onChange: () => void): () => void {
  document.addEventListener("visibilitychange", onChange);
  return () => {
    document.removeEventListener("visibilitychange", onChange);
  };
}

/** Whether the tab is hidden, so the turning stops while nobody can see it. */
function usePageHidden(): boolean {
  return useSyncExternalStore(
    subscribeVisibility,
    () => document.hidden,
    () => false,
  );
}

export function PanelGlow() {
  const { status } = useChatContext();
  const hidden = usePageHidden();

  return (
    <div
      aria-hidden
      data-panel-glow=""
      data-state={STATE[status]}
      data-paused={hidden ? "" : undefined}
      className={styles.glow}
    >
      <div className={cn(styles.band, styles.bloom, styles.live)}>
        <div className={cn(styles.turn, styles.slow)}>
          <div className={cn(styles.turn, styles.fast)} />
        </div>
      </div>
      <div className={cn(styles.band, styles.rim, styles.live)}>
        <div className={cn(styles.turn, styles.slow)}>
          <div className={cn(styles.turn, styles.fast)} />
        </div>
      </div>
      <div className={cn(styles.band, styles.bloom, styles.flash)} />
      <div className={cn(styles.band, styles.rim, styles.flash)} />
    </div>
  );
}
