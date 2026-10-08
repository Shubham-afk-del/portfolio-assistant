---
doc_type: interview-answers
title: The seven questions I get asked, and my actual answers
date: 2026-10-08
visibility: public
---

These are my own answers, written down so that what the assistant says and what I
say in a room are the same thing.

## Why move from IT support to AI and ML engineering?

Two things, and the second one matters more.

I had been studying through the IIIT Bangalore Data Science programme alongside
the Capgemini job, finishing with the NLP specialisation in October 2025, so the
interest was two years old rather than a sudden decision.

The part that actually moved me was what I kept seeing in the queue. Problems
that took days to resolve by hand were problems a system could solve, and I
started wanting to build those systems instead of working around them. The access
request tool I built was the first time I did it, and the work felt completely
different from operating someone else's software. My dissertation is on agentic
AI and LLMs, which is the same instinct with better tools behind it.

## What ML have you actually shipped, end to end?

Nothing in a production role, and I would rather say that first than have you
find it.

What I have shipped end to end: a Python tool at Capgemini that used a language
model to turn prose access requests into concrete directory changes for my
approval, which ran daily and saved me 2 to 5 hours a week. Two analysis projects
on real datasets of 175,777 and 3,014,248 rows, with the metrics published and
the mistakes in them documented. And this assistant, which is a retrieval
pipeline with an eval harness that gates the deploy, built in the open.

That is the honest answer. The system is public, so you can check it rather than
take my word for it.

## Three years of IT support. What does that give you that a CS graduate doesn't?

I have been on the receiving end of bad systems. Fifty incidents a day is a
feedback loop on what actually breaks in production and why, and most people
coming straight out of a degree have never had to support software they did not
write.

The more useful half is what that turns into. Sitting in that queue is where I
started seeing which problems were worth automating: the ones that took days to
fix by hand and should have taken minutes. That is what pushed me toward building
agents rather than scripts, and it is a sense of what is worth building that is
hard to get from coursework.

## Walk me through a model you built and what went wrong with it.

The delivery-time regression. 175,777 orders, predicting delivery duration from
the order and the state of the courier fleet.

The brief pointed at Recursive Feature Elimination as a refinement step, so I ran
it, cut 12 features to 8, and reported the result. All 12 features scored test R²
0.8800. The 8 RFE features scored 0.8191. Feature elimination made it measurably
worse and I did not notice at the time, because I treated RFE as a step you apply
rather than a choice you test.

There is a second layer to it. The scaled run scored 0.8737, and I would once
have said scaling helped. It cannot: ordinary least squares is scale-invariant,
so R² cannot change. The real cause is that RFE selected a different set of eight
features on the scaled matrix, swapping a weekend flag for a second courier-load
count. The lesson I took is that a result needs an explanation before it is a
result, and I had an unexplained six-point gap sitting in my notebook for a year.

## You're mid-MSc. How would you handle a role alongside study?

I did exactly this for two years. The IIIT Bangalore programme ran alongside a
full-time Senior Analyst role at Capgemini and finished in October 2025, while I
was still handling the daily incident queue.

So it is evidence rather than a promise. My visa permits 20 hours a week in term
time and full time during university holidays, and I would rather agree a
schedule that fits inside that than over-commit and miss on both sides.

## Why did Capgemini end in December 2025?

I resigned to move to London and start the MSc. Last working day was 18 December
2025, and the relieving letter says resignation. Clean break, good terms, and I
would work with that team again.

## What are you weakest at right now?

Deep learning frameworks. PyTorch and TensorFlow are marked `familiar` on my own
profile, and that is accurate: coursework and tutorials, no trained model in
production or in a public repository. If you need someone who can pick up an
existing training loop and debug it on day one, that is not me yet.

I am not going to dress that up, partly because the whole premise of this project
is that claims come with evidence, and partly because an inflated answer here
collapses on the first follow-up question. What I would point at instead is that
every level on my profile is set this way, so the rows that say `strong` mean it.

The fix is the obvious one and it is in progress: the stretch work on this system
includes training a scope classifier and a small embedding adapter, which turns
that row into something with a model card behind it rather than a claim.
