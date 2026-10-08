"use client";

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
import { Suggestion, Suggestions } from "@/components/ai-elements/suggestion";
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

export function Assistant() {
  const { messages, sendMessage, status } = useChat();
  const busy = status === "submitted" || status === "streaming";
  const empty = messages.length === 0;

  const ask = (text: string): void => {
    if (text.trim() === "" || busy) return;
    void sendMessage({ text });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Conversation className="min-h-0 flex-1">
        <ConversationContent className="mx-auto w-full max-w-3xl px-5 pt-2 pb-6 sm:px-8">
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
                <div key={message.id} className="space-y-3">
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

      <div className="border-rule bg-paper border-t">
        <div className="mx-auto w-full max-w-3xl px-5 py-4 sm:px-8">
          {empty && (
            <Suggestions className="mb-3">
              {SUGGESTIONS.map((suggestion) => (
                <Suggestion
                  key={suggestion}
                  suggestion={suggestion}
                  onClick={ask}
                  className="border-rule text-ink-muted hover:bg-sunken hover:text-ink rounded-none border"
                />
              ))}
            </Suggestions>
          )}

          <PromptInput
            onSubmit={(message: PromptInputMessage) => {
              ask(message.text);
            }}
            className="border-rule-strong divide-rule rounded-none border shadow-none"
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
        </div>
      </div>
    </div>
  );
}
