---
doc_type: decision
title: Build the eval harness before the chat interface
date: 2026-09
status: accepted
project: This assistant
tech: [RAG, evaluation, retrieval]
visibility: public
---

## Context

This assistant is a retrieval system with a chat box on the front. The chat box
is the part anyone can see and the part I most wanted to build. The retrieval
quality is the part that decides whether anything it says is true.

The phase order I am following puts corpus and ingestion first, then a retrieval
pipeline where every option is a config flag, then the eval harness, then an
ablation study across those flags, and only then the chat interface. Chat is
phase five of ten.

## Decision

No chat interface until the golden set, the retrieval metrics and the
faithfulness judge exist and produce numbers.

## Alternatives considered

**Chat first, evaluate later.** The natural order, and the one I wanted. It fails
for a specific reason rather than a moral one: once a chat UI exists, retrieval
gets tuned by asking it questions and seeing whether the answers feel right.
Feeling right is not a measurement, it does not survive a change to the chunking
strategy, and it cannot tell me whether reranking earns its latency. By the time
I built the eval harness afterwards I would be fitting it to the configuration I
had already chosen.

**Evaluate informally.** Keep a list of twenty questions and check them by hand
after changes. This is what I would actually have done, and it degrades the first
week something urgent comes up.

## Consequences

The visible part of the project is the last part finished, so for several weeks
the site has a chat box that cannot answer anything. I have written that on the
page rather than faking it, which is its own small test of the principle.

What it buys: when the ablation table is finished, every row is a real run on the
same golden set, and the shipping configuration is chosen on evidence. I will be
able to say what hybrid retrieval bought over pure vector search on my own data,
whether the reranker justified its latency, and where the relevance threshold
came from. Those are the questions an AI engineering interview actually asks, and
the answer "it felt better" fails all of them.

The risk I am carrying is that the measurement work is slower and less motivating
than the interface work, and an unfinished eval harness with no chat box is worth
nothing at all. The mitigation is the phase gate: one phase per session, reviewed
and committed, so the thing is always in a state I could show.
