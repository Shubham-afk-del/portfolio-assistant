"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Message, MessageContent } from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  type PromptInputMessage,
} from "@/components/ai-elements/prompt-input";
import { Suggestion } from "@/components/ai-elements/suggestion";
import { Source, Sources, SourcesContent, SourcesTrigger } from "@/components/ai-elements/sources";

/**
 * The assistant. Everything visible on this page is this, by design: the
 * portfolio content lives on a separate site, and what is being demonstrated
 * here is the system, not a CV.
 *
 * The suggestions are hardcoded for now. SPEC-v2 §13 wants them generated from
 * the corpus, which needs the corpus summarised at build time; until then each
 * one is a question answerable from a document already in the index, so none
 * of them is a promise the retrieval cannot keep.
 */
const SUGGESTIONS = [
  "What has he actually shipped end to end?",
  "How strong is he on PyTorch, really?",
  "What went wrong with the delivery-time model?",
  "Why did he leave IT support for an MSc?",
  "What did he automate at Capgemini?",
] as const;

/**
 * Measures the two glass overlays and pads the transcript to clear them.
 *
 * The header and the composer float above the scroll area so that content
 * passes under them, which is the only thing that makes the blur visible.
 * That leaves the transcript needing to know their heights, and they are not
 * fixed: the headline rewraps, the suggestion chips wrap to five rows on a
 * phone, and the composer grows as a question is typed. A hardcoded padding
 * was 23px short at the top and 73px at the bottom on the first viewport I
 * measured, which hid the first line of the answer behind the header.
 */
function useChromeInsets(bottomRef: React.RefObject<HTMLDivElement | null>): {
  top: number;
  bottom: number;
} {
  const [insets, setInsets] = useState({ top: 176, bottom: 240 });

  useLayoutEffect(() => {
    const top = document.querySelector<HTMLElement>('[data-chrome="top"]');
    const bottom = bottomRef.current;
    if (top === null || bottom === null) return;

    const measure = (): void => {
      setInsets({
        top: Math.ceil(top.getBoundingClientRect().height),
        bottom: Math.ceil(bottom.getBoundingClientRect().height),
      });
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(top);
    observer.observe(bottom);
    return () => {
      observer.disconnect();
    };
  }, [bottomRef]);

  return insets;
}

export function Assistant() {
  const { messages, sendMessage, status } = useChat();
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const insets = useChromeInsets(bottomRef);
  const busy = status === "submitted" || status === "streaming";
  const empty = messages.length === 0;

  const ask = (text: string): void => {
    if (text.trim() === "" || busy) return;
    void sendMessage({ text });
  };

  return (
    <div className="absolute inset-0">
      <Conversation className="h-full">
        <ConversationContent
          className="mx-auto w-full max-w-3xl px-5 sm:px-8"
          style={{
            paddingTop: `${String(insets.top + 16)}px`,
            paddingBottom: `${String(insets.bottom + 24)}px`,
          }}
        >
          {empty ? (
            <p className="text-ink-muted max-w-[52ch] text-label">
              Ask anything about his engineering work. Answers are retrieved from
              his case studies, decision records and public repositories, and
              every one of them shows the sources it came from.
            </p>
          ) : (
            messages.map((message) => {
              const sources = message.parts.filter(
                (part) => part.type === "source-url",
              );

              return (
                <div key={message.id} className="animate-rise space-y-3">
                  {sources.length > 0 && (
                    <Sources>
                      <SourcesTrigger count={sources.length} />
                      <SourcesContent>
                        {sources.map((source) => (
                          <Source
                            key={source.sourceId}
                            href={source.url}
                            title={source.title ?? source.url}
                          />
                        ))}
                      </SourcesContent>
                    </Sources>
                  )}

                  <Message from={message.role}>
                    <MessageContent>
                      {message.parts.map((part, index) =>
                        part.type === "text" ? (
                          <p
                            key={`${message.id}-${String(index)}`}
                            className="font-prose text-ink text-prose-sm"
                          >
                            {part.text}
                            {busy && message.role === "assistant" && (
                              <span
                                aria-hidden
                                className="bg-evidence animate-caret ml-0.5 inline-block h-[1em] w-[2px] translate-y-[0.12em]"
                              />
                            )}
                          </p>
                        ) : null,
                      )}
                    </MessageContent>
                  </Message>
                </div>
              );
            })
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <div
        ref={bottomRef}
        className="glass glass-divider absolute inset-x-0 bottom-0 z-20 border-x-0 border-b-0 border-t shadow-none"
      >
        <div className="mx-auto w-full max-w-3xl px-5 py-4 sm:px-8">
          {empty && (
            <div
              className="mb-3 flex flex-wrap gap-2"
              aria-label="Suggested questions"
            >
              {SUGGESTIONS.map((suggestion) => (
                <Suggestion
                  key={suggestion}
                  suggestion={suggestion}
                  onClick={ask}
                  className="lift border-rule-on-glass text-ink-muted hover:text-ink hover:border-evidence rounded-none border bg-transparent"
                />
              ))}
            </div>
          )}

          <PromptInput
            onSubmit={(message: PromptInputMessage) => {
              ask(message.text);
            }}
            className="lift border-rule-on-glass divide-rule focus-within:border-evidence rounded-none border bg-transparent shadow-none"
          >
            <PromptInputBody>
              <PromptInputTextarea
                placeholder="Ask a question…"
                className="text-ui"
              />
            </PromptInputBody>
            <PromptInputFooter className="justify-between px-3 py-2">
              <span className="text-ink-muted text-label">
                Retrieval is live. Generation is not wired up yet.
              </span>
              <PromptInputSubmit
                status={status}
                className="rounded-none"
                disabled={busy}
              />
            </PromptInputFooter>
          </PromptInput>

          <p className="text-ink-muted mt-3 text-label">
            An AI assistant, and it may be imprecise. The résumé is the
            authoritative record, and every answer shows the sources behind it.
          </p>
        </div>
      </div>
    </div>
  );
}
