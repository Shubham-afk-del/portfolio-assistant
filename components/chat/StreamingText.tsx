import { Fragment, type ReactNode } from "react";

/**
 * The answer, arriving word by word.
 *
 * Each word is a span that animates once, when it mounts: out of focus and in
 * the evidence colour, settling into ink. Spans are keyed by position, so a
 * word already on screen keeps its element as the text grows and never replays
 * its entrance, and a token that splits a word ("experi", then "ence") lands
 * in the span that is already there. Only the newest words are ever moving.
 *
 * It renders the small piece of Markdown the system prompt allows, bullet
 * items, bold and bare links, and nothing else: a full Markdown renderer would rebuild
 * its tree as the text grows and replay every word. Bold is a property of
 * each word rather than a wrapper around several, so a word's element never
 * moves once it exists.
 *
 * Citations ([2], [1, 3]) stay in the text the model writes, where the
 * Phase 3 evals check them, but are not drawn: the owner found the marks
 * cluttered, and the sources under the answer already say where it came
 * from.
 */

/**
 * A citation: numbers, or the lowercase name of a profile section ([skills],
 * [experience]) that a small model sometimes writes despite the prompt.
 * Lowercase only, so bracketed prose like "[Note]" is left alone.
 */
const CITATION = /\[(?:\d+|[a-z][a-z _-]{0,24})(?:\s*,\s*(?:\d+|[a-z][a-z _-]{0,24}))*\]/g;
const BULLET = /^\s*(?:[-*•]|\d+\.)\s+/;
const HEADING = /^\s*#{1,6}\s+/;
/** A citation still being written at the end of the stream: held back until it closes. */
const OPEN_CITATION = /\s*\[[\d\s,a-z]*$/i;

type Token =
  | { kind: "space"; text: string }
  | { kind: "word"; text: string; bold: boolean }
  | { kind: "link"; href: string };

/** A bare web address, as the prompt asks a verification link to be written. */
const URL_TOKEN = /^https?:\/\/\S+$/;
/** Punctuation that ends a sentence after a link rather than belonging to it. */
const TRAILING = /[.,;:!?)]+$/;
/** A Markdown link, unwrapped to "text url" so the address is still a link. */
const MARKDOWN_LINK = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g;

type Block = { kind: "p"; lines: Token[][] } | { kind: "ul"; items: Token[][] };

/** Words and spaces, with "**" toggling bold wherever it sits in a word. */
function pushText(text: string, tokens: Token[], bold: { on: boolean }): void {
  for (const piece of text.split(/(\s+)/)) {
    if (piece === "") continue;
    if (piece.trim() === "") {
      tokens.push({ kind: "space", text: piece });
      continue;
    }
    if (URL_TOKEN.test(piece)) {
      const tail = TRAILING.exec(piece)?.[0] ?? "";
      tokens.push({ kind: "link", href: piece.slice(0, piece.length - tail.length) });
      if (tail !== "") tokens.push({ kind: "word", text: tail, bold: false });
      continue;
    }
    piece.split("**").forEach((part, i) => {
      if (i > 0) bold.on = !bold.on;
      if (part !== "") tokens.push({ kind: "word", text: part, bold: bold.on });
    });
  }
}

function tokenize(line: string): Token[] {
  const tokens: Token[] = [];
  // Per line: an unclosed "**" must not embolden the rest of the answer.
  const bold = { on: false };
  let last = 0;
  for (const match of line.matchAll(CITATION)) {
    pushText(line.slice(last, match.index), tokens, bold);
    // The space before a citation goes with it, so no gap is left before the full stop.
    while (tokens[tokens.length - 1]?.kind === "space") tokens.pop();
    last = match.index + match[0].length;
  }
  pushText(line.slice(last), tokens, bold);
  return tokens;
}

function parse(text: string): Block[] {
  const blocks: Block[] = [];
  for (const paragraph of text.split(/\n{2,}/)) {
    let current: Block | undefined;
    for (const raw of paragraph.split("\n")) {
      if (raw.trim() === "") continue;
      const bullet = BULLET.test(raw);
      const line = tokenize(raw.replace(bullet ? BULLET : HEADING, "").replace(MARKDOWN_LINK, "$1 $2"));
      if (bullet) {
        if (current?.kind !== "ul") blocks.push((current = { kind: "ul", items: [] }));
        current.items.push(line);
      } else {
        if (current?.kind !== "p") blocks.push((current = { kind: "p", lines: [] }));
        current.lines.push(line);
      }
    }
  }
  return blocks;
}

/** The answer as plain text, for copying: no citation marks, no bold markers. */
export function plainText(text: string): string {
  return text.replace(new RegExp(`\\s*${CITATION.source}`, "g"), "").replace(/\*\*/g, "");
}

export function StreamingText({ text, streaming }: { text: string; streaming: boolean }) {
  const blocks = parse(streaming ? text.replace(OPEN_CITATION, "") : text);
  const caret = streaming ? <span aria-hidden className="caret" /> : null;

  const render = (tokens: Token[], last: boolean): ReactNode => (
    <>
      {tokens.map((token, i) => {
        if (token.kind === "space") return token.text;
        if (token.kind === "link") {
          // Shown as its site, which is what a reader needs to judge it; the
          // full address is the link itself.
          let site = token.href;
          try {
            site = new URL(token.href).hostname.replace(/^www\./, "");
          } catch {
            // A link still arriving mid-stream may not parse yet.
          }
          return (
            <a
              key={i}
              href={token.href}
              target="_blank"
              rel="noopener noreferrer"
              className="word text-evidence font-sans text-[0.9em] font-medium break-all underline decoration-current/40 underline-offset-2 hover:decoration-current"
            >
              {site} ↗<span className="sr-only"> (opens in a new tab)</span>
            </a>
          );
        }
        return token.bold ? (
          <strong key={i} className="word font-semibold">
            {token.text}
          </strong>
        ) : (
          <span key={i} className="word">
            {token.text}
          </span>
        );
      })}
      {last && caret}
    </>
  );

  return (
    <div className="font-prose text-ink text-prose-sm space-y-4 text-pretty">
      {blocks.map((block, b) => {
        const lastBlock = b === blocks.length - 1;
        return block.kind === "ul" ? (
          <ul key={`ul${String(b)}`} className="marker:text-ink-muted list-disc space-y-1.5 pl-5">
            {block.items.map((tokens, i) => (
              <li key={i}>{render(tokens, lastBlock && i === block.items.length - 1)}</li>
            ))}
          </ul>
        ) : (
          <p key={`p${String(b)}`}>
            {block.lines.map((tokens, l) => (
              <Fragment key={l}>
                {l > 0 && <br />}
                {render(tokens, lastBlock && l === block.lines.length - 1)}
              </Fragment>
            ))}
          </p>
        );
      })}
      {blocks.length === 0 && caret}
    </div>
  );
}
