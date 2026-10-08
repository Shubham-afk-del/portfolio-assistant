---
doc_type: decision
title: Keep a human approval step between the language model and Active Directory
date: 2025-06
status: accepted
company: Capgemini
tech: [Python, Active Directory, LLM]
visibility: public
---

## Context

Access requests arrived as prose in ServiceNow tickets: create this account, add
this person to that group, revoke this permission. Reading the ticket and working
out which concrete directory change it was asking for took most of the time. The
change itself took seconds.

A language model is good at exactly that translation step, and I had an internal
one available. The question was how much authority to give it.

## Decision

The model proposes, I approve, the script applies. The model never touched the
directory directly.

## Alternatives considered

**Unattended end to end.** The script reads the ticket, decides, and makes the
change. This saves the most time and I rejected it. Directory writes are
destructive and audited, and a wrong group removal locks someone out of their job
with no clean undo. I would also have had no answer if it had gone wrong once.

**Rules and regular expressions, no model.** Fails on the actual problem. People
describe access requests in wildly inconsistent prose, and a rule set broad enough
to cover that variation becomes a worse language model.

## Consequences

It saved 2 to 5 hours a week of my own time, which was the interpretation step
rather than the approval step. I stayed accountable for every change, which was
the point.

What I did not see at the time: the approval step was a free labelled dataset. I
saw every proposal next to what I actually applied, every day, and logged none of
it. With that log I could have reported an acceptance rate, found which request
types it misread, and answered "could this run unattended?" with evidence instead
of instinct. I was shipping a model with no eval set, before I knew that was the
name for the mistake.
