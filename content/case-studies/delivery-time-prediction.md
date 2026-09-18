---
doc_type: case-study
title: Predicting delivery time with linear regression, and what feature elimination cost me
project: LR_Delivery_Time_Prediction
date: 2025-07-04
tech: [Python, Pandas, NumPy, Scikit-learn, Matplotlib, Seaborn]
source_url: https://github.com/Shubham-afk-del/LR_Delivery_Time_Prediction_-Shubham-Kumar-Singh-
visibility: public
---

## Problem

Predict how long a food delivery order will take, from the order itself and the state of the
courier fleet at the moment it was placed. The dataset had 175,777 orders across 15 columns:
market, order protocol, basket composition, item prices, and three fleet-state counts, with a
pickup and a delivery timestamp.

## Constraints

This was a graded assignment on the IIIT Bangalore Data Science programme, and the brief fixed
the model to linear regression. That mattered. It meant I could not answer "is a linear model
right for this?" by trying a non-linear one, so every real decision I made was about the data
and the features rather than the algorithm.

## What I did

The target did not exist in the data. I derived `time_taken` from the gap between the pickup
and delivery timestamps, then pulled `order_hour` and `isWeekend` out of the order timestamp,
and computed a `distance` feature. That gave 12 usable features.

I split 80/20 before any cleaning: 140,621 training rows and 35,156 test rows. Outliers went
next, using boxplots to see them and the interquartile range to remove them, which took the
training set from 140,621 to 139,242 rows. Just under 1%.

Then I fitted the model twice. Once on all 12 features, and once on 8 chosen by Recursive
Feature Elimination, which is the approach the brief pointed at.

## What happened

All numbers below are on the held-out test set.

| Model | Features | MAE (min) | RMSE | R² |
|---|---|---|---|---|
| All features | 12 | 2.33 | 3.24 | 0.8800 |
| RFE, unscaled | 8 | 2.95 | 3.98 | 0.8191 |
| RFE, scaled | 8 | 2.45 | 3.24 | 0.8737 |

**Feature elimination made the model worse.** Dropping four features cost six points of R² and
half a minute of mean absolute error. I had gone in assuming the opposite, which is the useful
part: the assignment framed RFE as a refinement step, and on this data it was a downgrade.

The second row against the third is the part I would want to be asked about. Ordinary least
squares is scale-invariant, so standardising the inputs cannot change R². The two rows differ
because RFE ran on the scaled and unscaled matrices separately and **selected different
features**:

- unscaled: `market_id`, `order_protocol`, `num_distinct_items`, `total_onshift_dashers`,
  `total_outstanding_orders`, `distance`, `order_hour`, `isWeekend`
- scaled: `market_id`, `order_protocol`, `subtotal`, `total_onshift_dashers`,
  `total_busy_dashers`, `total_outstanding_orders`, `distance`, `order_hour`

Swapping `num_distinct_items` and `isWeekend` for `subtotal` and `total_busy_dashers` is what
recovered five of the six lost points. So the honest reading is not "scaling helped." It is
"RFE is unstable on correlated features, and the selection it produced on the scaled matrix
happened to be better." A second courier-load feature beat a weekend flag.

Fleet state carried real signal. Three of the eight surviving features in both runs were
courier counts, which fits the intuition that delivery time is mostly about how busy the fleet
is rather than what was ordered.

## What I would do differently

Fit a gradient-boosted baseline alongside it. Not to submit, but to find out what the linear
assumption cost. Without that number I cannot say whether R² 0.88 is good or whether a tree
model would have reached 0.95 on the same features, and that is the first thing anyone
technical will ask. The brief fixing the model is a reason I did not do it during the
assignment, not a reason it should stay undone.

I would also stop treating RFE as a step you apply. On this data it needed a sweep across
feature counts with the scores plotted, which would have shown the drop immediately instead of
leaving me to find it a year later.

## Correction

The written answers in the submitted notebook describe a different dataset. They name columns
such as `Discount_offered`, `Weight_in_gms` and `Warehouse_block`, which belong to a retail
shipping dataset and do not appear in this data, and one answer still carries a "replace with
the actual column name" placeholder. The code and the metrics are sound. The prose on top of
them was not reviewed, and it is being rewritten against the actual heatmap and coefficient
output.
