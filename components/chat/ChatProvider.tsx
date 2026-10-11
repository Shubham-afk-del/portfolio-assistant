"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useChat } from "@ai-sdk/react";
import type { ChatStatus } from "ai";
import { GUARDS } from "@/lib/config";
import type { AssistantMessage } from "./types";

/**
 * One conversation, shared by everything on the page that can start one: the
 * composer, the suggested questions, and the "ask" buttons on the experience
 * and education timeline in the profile panel. They are siblings in the tree,
 * so the chat state lives above both rather than inside the console.
 */

/**
 * Where a question set off from. The bubble that lands in the transcript
 * claims this once and flies in from that spot, so a question asked from the
 * timeline visibly travels from the timeline into the conversation.
 */
interface Launch {
  rect: DOMRect;
  at: number;
  /** The message that took it, so StrictMode's second effect run in dev can take it again. */
  claimedBy?: string;
}

/** A launch older than this belongs to some earlier question. */
const LAUNCH_TTL_MS = 1200;

interface ChatContextValue {
  messages: AssistantMessage[];
  status: ChatStatus;
  error: Error | undefined;
  busy: boolean;
  /** Sends a question. Returns false when it was refused, so callers can stay put. */
  ask: (text: string, origin?: Element | null) => boolean;
  stop: () => void;
  retry: () => void;
  reset: () => void;
  /** The launch point for a just-sent question, or null if it has none or it was taken. */
  claimLaunch: (messageId: string) => DOMRect | null;
  /** The same launch point without taking it, for the comet that flies to the reply. */
  peekLaunch: () => DOMRect | null;
}

/**
 * Composer activity, kept apart from the chat state on purpose. The orb
 * reacts to every keystroke, and routing that through the chat context would
 * re-render the whole transcript on each key. `typing` changes only when
 * typing starts or stops; keystrokes go to subscribers without a render.
 */
interface ActivityContextValue {
  typing: boolean;
  setTyping: (typing: boolean) => void;
  keystroke: () => void;
  onKeystroke: (listener: () => void) => () => void;
}

const ChatContext = createContext<ChatContextValue | null>(null);
const ActivityContext = createContext<ActivityContextValue | null>(null);

export function ChatProvider({ children }: { children: ReactNode }) {
  const { messages, sendMessage, status, error, stop, regenerate, setMessages, clearError } =
    useChat<AssistantMessage>();
  const launch = useRef<Launch | null>(null);
  const busy = status === "submitted" || status === "streaming";

  const ask = useCallback(
    (text: string, origin?: Element | null): boolean => {
      const question = text.trim();
      if (question === "" || question.length > GUARDS.maxInputChars || busy) return false;
      launch.current =
        origin === undefined || origin === null
          ? null
          : { rect: origin.getBoundingClientRect(), at: performance.now() };
      void sendMessage({ text: question });
      return true;
    },
    [busy, sendMessage],
  );

  const retry = useCallback(() => {
    clearError();
    void regenerate();
  }, [clearError, regenerate]);

  const claimLaunch = useCallback((messageId: string): DOMRect | null => {
    const origin = launch.current;
    if (origin === null || performance.now() - origin.at > LAUNCH_TTL_MS) return null;
    if (origin.claimedBy !== undefined && origin.claimedBy !== messageId) return null;
    launch.current = { ...origin, claimedBy: messageId };
    return origin.rect;
  }, []);

  const peekLaunch = useCallback((): DOMRect | null => {
    const origin = launch.current;
    if (origin === null || performance.now() - origin.at > LAUNCH_TTL_MS) return null;
    return origin.rect;
  }, []);

  const reset = useCallback(() => {
    void stop();
    clearError();
    setMessages([]);
  }, [stop, clearError, setMessages]);

  const chat = useMemo<ChatContextValue>(
    () => ({
      messages,
      status,
      error,
      busy,
      ask,
      stop: () => void stop(),
      retry,
      reset,
      claimLaunch,
      peekLaunch,
    }),
    [messages, status, error, busy, ask, stop, retry, reset, claimLaunch, peekLaunch],
  );

  const [typing, setTyping] = useState(false);
  const listeners = useRef(new Set<() => void>());

  const keystroke = useCallback(() => {
    for (const listener of listeners.current) listener();
  }, []);

  const onKeystroke = useCallback((listener: () => void) => {
    listeners.current.add(listener);
    return () => {
      listeners.current.delete(listener);
    };
  }, []);

  const activity = useMemo<ActivityContextValue>(
    () => ({ typing, setTyping, keystroke, onKeystroke }),
    [typing, keystroke, onKeystroke],
  );

  return (
    <ChatContext.Provider value={chat}>
      <ActivityContext.Provider value={activity}>{children}</ActivityContext.Provider>
    </ChatContext.Provider>
  );
}

export function useChatContext(): ChatContextValue {
  const value = useContext(ChatContext);
  if (value === null) throw new Error("useChatContext needs a <ChatProvider> above it");
  return value;
}

export function useActivity(): ActivityContextValue {
  const value = useContext(ActivityContext);
  if (value === null) throw new Error("useActivity needs a <ChatProvider> above it");
  return value;
}
