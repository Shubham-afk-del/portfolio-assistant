---
doc_type: case-study
title: Putting a language model in front of Active Directory access requests, with me as the approval step
company: Capgemini
date: 2025-12-18
tech: [Python, Active Directory, ServiceNow]
visibility: public
---

## Problem

I was handling 50 or more incidents a day in ServiceNow as a senior analyst on IT support, and
a steady share of them were access requests: an account to create, a group membership to
change, a permission to revoke. Each one was individually trivial and collectively expensive.
The work was reading a ticket written in prose, deciding what directory change it was actually
asking for, and then making that change correctly.

The slow part was not the change. It was the reading and the translating.

## Constraints

Three that shaped everything:

1. **Directory changes are destructive and auditable.** Removing the wrong group membership
   locks someone out of their job. There is no undo that leaves no trace.
2. **I had no mandate to automate anyone's work but my own.** This was a tool I built for my
   own queue, not a team initiative with a sponsor.
3. **Enterprise environment.** I could use the internal model the company provided, not an
   external API, and what I can say about the internals here is limited by the
   confidentiality terms I am still bound by. So this describes my approach and my results
   rather than their systems.

## Options I considered

**Keep doing it by hand.** The honest baseline. Reliable, and the cost was my attention rather
than any risk.

**Script it with no model.** Parse the ticket with rules and regular expressions. This fails on
the actual problem, which is that people describe access requests in wildly inconsistent prose.
A rule set that handles that variation becomes a worse version of a language model.

**Let it run unattended.** The script reads the ticket, decides, and applies the change with no
human in the loop. Fastest, and I rejected it. An LLM misreading a prose request and then
writing that misreading into a live directory is not a risk worth the minutes it saves, and I
would not have been able to defend the decision if it had gone wrong once.

## What I chose

A Python tool that read the ticket, used the internal model to turn the prose into a concrete
proposed change, and then presented that proposal to me for approval. I checked it and applied
it. The model never touched the directory.

The design principle was that the model does the interpretation, which is what it is good at,
and I do the authorisation, which is what I was accountable for.

## What happened

It saved me roughly 2 to 5 hours a week. That is the interpretation and drafting step, not the
approval, which I still did on every single request.

Two things it did not do. It never gained a second user: I built it for my own queue and never
packaged it for anyone else. And it stopped running when I left the company in December 2025,
because it had exactly one owner and no handover.

## What I would do differently

**It had no owner but me, and that is a design failure, not an accident of the exit.** A tool
that saves a few hours a week is worth documenting and handing over. I never wrote down how it
worked, never sat with a colleague to get them using it, and never asked whether the team
wanted it. So the value ended on my last day, which means the honest accounting of its impact
is two and a half years of my own time and nothing beyond that.

**I did not measure how often it was right.** The approval step means I saw every proposal, so I
had a free labelled dataset sitting in front of me every day: what the model proposed against
what I actually applied. Logging that would have told me the acceptance rate, which kinds of
request it misread, and whether the gap was closing. I would then have had an evidenced answer
to "could this run unattended?" instead of an instinct. That is the same mistake as shipping a
model without an eval set, and I made it before I knew that was the name for it.

That lesson is the direct ancestor of this assistant, which measures its retrieval quality
against a golden set before anything else gets built.
