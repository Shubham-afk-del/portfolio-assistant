---
doc_type: case-study
title: What 490,000 New York taxi trips say about when drivers actually earn
project: EDA_Optimising_NYC_Taxis
date: 2025-05-06
tech: [Python, Pandas, NumPy, Matplotlib, Seaborn, GeoPandas]
source_url: https://github.com/Shubham-afk-del/EDA_Optimising_NYC_Taxis_Shubham_Kumar_Singh
visibility: public
---

## Problem

Work out when and where New York taxi demand actually is, from the city's own 2023 yellow cab
trip records, and turn that into something a dispatcher could act on. A single month of those
records is 3,014,248 trips across 22 columns, so the first problem is that the data does not
fit comfortably in memory on a laptop.

## Constraints

A graded assignment on the IIIT Bangalore programme, with a stated target of keeping the
working set near 250,000 to 300,000 rows. Local machine, no cluster. That forced the sampling
decision up front rather than letting me defer it.

## What I did

I sampled across all twelve months of 2023 rather than taking one month whole, which keeps
seasonal variation in the data, and landed at 489,542 trips. Then the cleaning, which took
longer than the analysis:

- Dropped `vendorid` and `store_and_fwd_flag` as unusable for the questions I had.
- Investigated negative fares before removing them, broken down by rate code, because a
  negative fare is usually a refund rather than an error and I wanted to know which.
- Filtered zero and negative values across fare, tip, total and distance.
- Bounded trip duration to between 1 and 180 minutes, distance to under 50 miles, and
  passenger count to 1 to 6. Each of those cut a tail that would otherwise have dominated the
  averages.
- Joined the trips to the city's taxi zone shapefile through `LocationID` so pickups and
  dropoffs became places rather than integers.

## What I found

**Tipping is about when and how, not how far.** Tip percentages are highest between 10pm and
2am, and card payments tip substantially more than cash. That is the finding I would lead
with, because it points at driver earnings rather than company revenue, and the action it
implies costs nothing: a driver choosing between a late shift and an early one has a reason to
pick the late one.

Demand moves through the day in a shape a dispatcher can use. Mornings load from the outer
residential zones into Midtown and the Financial District; evenings reverse it; late Friday and
Saturday nights concentrate in the nightlife zones; the 3am to 6am window is airport traffic
and shift workers. The top ten pickup and dropoff zones, the pickup-to-dropoff ratio per zone,
and night-hour pickup concentration are all computed directly from the trip records.

Fare per mile is not flat. Comparing vendors across three distance tiers, under 2 miles, 2 to 5,
and over 5, short trips earn far more per mile than long ones, which is what you would expect
from a fixed base fare and why long airport runs are less attractive than they look.

## What I would do differently

**Three figures in my submitted notebook are plotted from random numbers.** The starter template
seeded the zone trip counts with `np.random.randint(0, 100, len(zones))` and the route speeds
with `np.random.uniform(20, 60, ...)` as scaffolding to demonstrate the plotting calls, and I
never replaced them with real counts. A later cell then divides those random numbers by the
sampling fraction to "scale up to the full population", which scales up noise. So the trips-per-
zone choropleth and the slowest-routes analysis carry no information, and the congestion
recommendation that depended on them is withdrawn. The zone findings above come from the
value-count work, which is real. I found this on review, months after submitting, and it is the
most useful thing this project taught me: a figure that renders is not a figure that is right.

My two conclusion cells also contradict each other on peak hours, one saying 1pm to 9pm and the
other 7am to 9am and 5pm to 7pm. I did not reconcile them at the time, which means at least one
was written from impression rather than from the plot.

The conclusions themselves sit inside triple-quoted strings in code cells, so they do not render
as text. The best part of the work is nearly invisible to anyone reading the notebook.

And the recommendations need numbers. "Raise peak fares 10 to 15%" is an opinion until it comes
with an estimated revenue effect, and the data could have supported that estimate. A
recommendation without a number is not an analysis result.

Finally, I would test whether the filtering shaped the findings. Removing trips over 180 minutes
and over 50 miles is defensible, but those are exactly the trips that matter most to a driver
deciding whether to take an airport run. I should have run the headline findings once with the
bounds and once without and reported whether they held.
