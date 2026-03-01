---
category: guide
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-03-01
tags: [guide, auto-generated]
---

## Table of Contents

- [Overview](#overview)
- [Module Identity](#module-identity)
  - [Exports](#exports)
- [Design Principles](#design-principles)
  - [1. Pure and Deterministic](#1-pure-and-deterministic)
  - [2. Dependency-Injected Preferences](#2-dependency-injected-preferences)
  - [3. Conservative Defaults](#3-conservative-defaults)
  - [4. Fixed Evaluation Order](#4-fixed-evaluation-order)
- [Main Function Signature](#main-function-signature)
- [Input Structure](#input-structure)
- [Output Structure](#output-structure)
  - [Trigger Object Shape](#trigger-object-shape)
  - [Recommendation Values](#recommendation-values)
- [Trigger Evaluation Order](#trigger-evaluation-order)
  - [ASCII Decision Tree](#ascii-decision-tree)
- [Trigger Type Details](#trigger-type-details)
  - [1. cost_threshold](#1-cost_threshold)
  - [2. new_tech_vendor](#2-new_tech_vendor)
  - [3. strategic_pivot](#3-strategic_pivot)
  - [4. low_score](#4-low_score)
  - [5. novel_pattern](#5-novel_pattern)
  - [6. constraint_drift](#6-constraint_drift)
- [Preference Key Mapping](#preference-key-mapping)
- [Conservative Defaults](#conservative-defaults)
  - [Missing Preference Side Effect](#missing-preference-side-effect)
- [Auto-Proceed Decision Logic](#auto-proceed-decision-logic)
  - [Severity Hierarchy](#severity-hierarchy)
- [Missing Preference Handling](#missing-preference-handling)
- [Trigger Ordering Guarantee](#trigger-ordering-guarantee)
- [Integration Points](#integration-points)
  - [Eva Orchestrator (Primary Consumer)](#eva-orchestrator-primary-consumer)
  - [Stage Gates Extension (Secondary Consumer)](#stage-gates-extension-secondary-consumer)
  - [Standalone Usage](#standalone-usage)
- [Testing Strategy](#testing-strategy)
  - [Unit Testing Approach](#unit-testing-approach)
  - [No Mocking Required](#no-mocking-required)
  - [Structured Logging](#structured-logging)

---
Category: Architecture
Status: Approved
Version: 1.0.0
Author: DOCMON Sub-Agent
Last Updated: 2026-02-08
Tags: [cli-venture-lifecycle, eva, decision-filter, risk-evaluation]
Related SDs: [SD-LEO-ORCH-CLI-VENTURE-LIFECYCLE-001, SD-LEO-INFRA-FILTER-ENGINE-001]
---

# 03 - Decision Filter Engine

This document provides a complete architectural description of the Decision
Filter Engine: a pure, deterministic risk-threshold evaluator that determines
whether a venture stage can auto-proceed or requires chairman review.

---

## Table of Contents

1. [Overview](#overview)
2. [Module Identity](#module-identity)
3. [Design Principles](#design-principles)
4. [Main Function Signature](#main-function-signature)
5. [Input Structure](#input-structure)
6. [Output Structure](#output-structure)
7. [Trigger Evaluation Order](#trigger-evaluation-order)
8. [Trigger Type Details](#trigger-type-details)
9. [Preference Key Mapping](#preference-key-mapping)
10. [Conservative Defaults](#conservative-defaults)
11. [Auto-Proceed Decision Logic](#auto-proceed-decision-logic)
12. [Missing Preference Handling](#missing-preference-handling)
13. [Trigger Ordering Guarantee](#trigger-ordering-guarantee)
14. [Integration Points](#integration-points)
15. [Testing Strategy](#testing-strategy)

---

## Overview

The Decision Filter Engine answers one question: **"Can this venture stage
advance automatically, or does the chairman need to review it?"**

It is NOT an AI model. It is NOT probabilistic. It is a deterministic
rule-evaluation engine that compares stage outputs against chairman-configured
thresholds and produces a structured decision with full trigger details.

```
                  +---------------------------+
  Stage Output -->| Decision Filter Engine    |--> { auto_proceed, triggers, recommendation }
  Preferences  -->|                           |
                  | Pure function.            |
                  | Same inputs = same output.|
                  +---------------------------+
```

---

## Module Identity

| Property | Value |
|----------|-------|
| Module path | `lib/eva/decision-filter-engine.js` |
| Lines | 261 |
| SD | SD-LEO-INFRA-FILTER-ENGINE-001 |
| Export style | Named exports (ESM) |
| Engine version | 1.0.0 (exported as `ENGINE_VERSION`) |
| Pure function | Yes -- no side effects, no database calls, no state |

### Exports

| Name | Type | Description |
|------|------|-------------|
| `evaluateDecision` | function | Main evaluation function |
| `ENGINE_VERSION` | string | Semver version of the engine |
| `TRIGGER_TYPES` | string[] | Ordered list of trigger type identifiers |
| `PREFERENCE_KEYS` | object | Map of trigger type to preference key |
| `DEFAULTS` | object | Default values for each preference key |

---

## Design Principles

### 1. Pure and Deterministic

The engine is a pure function in the mathematical sense:
- Given the same `input` and `options`, it always returns the same result
- It does not read from any database or external service
- It does not write to any database or external service
- It does not access environment variables or global state
- It does not generate random values

This makes the engine trivially testable and predictable.

### 2. Dependency-Injected Preferences

Preferences are passed as a flat key-value map in `options.preferences`,
not loaded from the database inside the engine. The caller (typically the
Eva Orchestrator or Stage Gates Extension) is responsible for loading
preferences from the ChairmanPreferenceStore before calling the engine.

This separation means:
- The engine has no database dependency
- Different callers can provide different preference sets
- Tests can provide exact preference values without mocking

### 3. Conservative Defaults

When a preference key is missing from the provided map, the engine uses
a hardcoded conservative default. "Conservative" means the default is more
likely to trigger chairman review than to auto-proceed.

### 4. Fixed Evaluation Order

The six trigger types are always evaluated in the same fixed order. This
ensures that the triggers array in the output is deterministically ordered,
making results reproducible and comparable across runs.

---

## Main Function Signature

```
evaluateDecision(input, options) -> { auto_proceed, triggers, recommendation }
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `input` | object | No (defaults to `{}`) | Stage output data to evaluate |
| `options` | object | No (defaults to `{}`) | Configuration options |
| `options.preferences` | object | No | Flat key-value map of chairman preferences |
| `options.logger` | object | No | Logger with info() and debug() methods |

---

## Input Structure

The `input` object represents the output of a venture stage. All fields
are optional -- the engine evaluates only the fields that are present.

| Field | Type | Trigger Type | Description |
|-------|------|-------------|-------------|
| `cost` | number | cost_threshold | Projected cost in USD |
| `technologies` | string[] | new_tech_vendor | Technologies used in this stage |
| `vendors` | string[] | new_tech_vendor | Third-party vendors involved |
| `score` | number | low_score | Quality/confidence score (0-10 scale) |
| `description` | string | strategic_pivot | Free-text stage description |
| `patterns` | string[] | novel_pattern | Patterns detected in this stage |
| `priorPatterns` | string[] | novel_pattern | Patterns from previous stages |
| `constraints` | object | constraint_drift | Current constraint values |
| `approvedConstraints` | object | constraint_drift | Originally approved constraints |
| `stage` | string | (metadata) | Stage identifier for logging |

---

## Output Structure

The engine returns a three-field object:

| Field | Type | Description |
|-------|------|-------------|
| `auto_proceed` | boolean | Whether the stage can advance without chairman review |
| `triggers` | object[] | All triggered rules, in deterministic order |
| `recommendation` | string | Human-readable recommendation string |

### Trigger Object Shape

Each trigger in the `triggers` array has:

| Field | Type | Description |
|-------|------|-------------|
| `type` | string | One of the 6 trigger type identifiers |
| `severity` | string | HIGH, MEDIUM, or INFO |
| `message` | string | Human-readable description of the trigger |
| `details` | object | Trigger-specific details (thresholds, values, etc.) |

### Recommendation Values

| Value | When Used |
|-------|-----------|
| `AUTO_PROCEED` | No business triggers fired, or only INFO triggers with informational allowed |
| `PRESENT_TO_CHAIRMAN` | HIGH-severity triggers detected |
| `PRESENT_TO_CHAIRMAN_WITH_MITIGATIONS` | Only MEDIUM-severity triggers (no HIGH) |

---

## Trigger Evaluation Order

The engine evaluates triggers in a fixed order. This is critical for
deterministic output -- the triggers array is always ordered the same way.

```
 INPUT
   |
   v
+--[1. cost_threshold]--+
|  Cost > max_usd?      |
|  Severity: HIGH        |
+----------+-------------+
           |
           v
+--[2. new_tech_vendor]--+
|  Unapproved tech?     |
|  Unapproved vendor?   |
|  Severity: HIGH        |
+----------+-------------+
           |
           v
+--[3. strategic_pivot]--+
|  Pivot keywords in     |
|  description text?     |
|  Severity: HIGH        |
+----------+-------------+
           |
           v
+--[4. low_score]--------+
|  Score < min_score?    |
|  Severity: MEDIUM      |
+----------+-------------+
           |
           v
+--[5. novel_pattern]----+
|  Patterns not seen     |
|  in prior stages?      |
|  Severity: MEDIUM      |
+----------+-------------+
           |
           v
+--[6. constraint_drift]-+
|  Current constraints   |
|  differ from approved? |
|  Severity: MEDIUM      |
+----------+-------------+
           |
           v
  Combine triggers
  Determine auto_proceed
  Return result
```

### ASCII Decision Tree

```
evaluateDecision(input, preferences)
    |
    +--- input.cost provided?
    |    YES: cost > filter.cost_max_usd?
    |         YES -> trigger: cost_threshold (HIGH)
    |
    +--- input.technologies provided?
    |    YES: any tech NOT in filter.approved_tech_list?
    |         YES -> trigger: new_tech_vendor (HIGH)
    |
    +--- input.vendors provided?
    |    YES: any vendor NOT in filter.approved_vendor_list?
    |         YES -> trigger: new_tech_vendor (HIGH)
    |
    +--- input.description provided?
    |    YES: contains filter.pivot_keywords?
    |         YES -> trigger: strategic_pivot (HIGH)
    |
    +--- input.score provided?
    |    YES: score < filter.min_score?
    |         YES -> trigger: low_score (MEDIUM)
    |
    +--- input.patterns AND input.priorPatterns provided?
    |    YES: any pattern not in priorPatterns?
    |         YES -> trigger: novel_pattern (MEDIUM)
    |
    +--- input.constraints AND input.approvedConstraints provided?
    |    YES: any constraint value differs from approved?
    |         YES -> trigger: constraint_drift (MEDIUM)
    |
    +--- Count business triggers (excluding "missing preference" warnings)
         |
         +-- 0 triggers        -> auto_proceed = true,  "AUTO_PROCEED"
         +-- Only INFO triggers -> auto_proceed = true   (if allow_informational)
         +-- Any HIGH trigger   -> auto_proceed = false, "PRESENT_TO_CHAIRMAN"
         +-- Only MEDIUM        -> auto_proceed = false, "PRESENT_TO_CHAIRMAN_WITH_MITIGATIONS"
```

---

## Trigger Type Details

### 1. cost_threshold

**Severity**: HIGH
**Checks**: Whether `input.cost` exceeds the configured maximum cost
**Preference key**: `filter.cost_max_usd`
**Default**: $10,000
**Trigger message**: "Cost $X exceeds threshold $Y"

When triggered, the details include:
- `cost` -- The actual cost value
- `threshold` -- The configured maximum
- `thresholdSource` -- "preference" or "default"

### 2. new_tech_vendor

**Severity**: HIGH
**Checks**: Whether any technology or vendor is NOT in the approved lists
**Preference keys**: `filter.approved_tech_list`, `filter.approved_vendor_list`
**Defaults**: Empty lists (all tech/vendors trigger review)
**Trigger messages**: "Unapproved technology: X" / "Unapproved vendor: X"

This trigger can fire twice (once for technologies, once for vendors) if
both contain unapproved items. Comparison is case-insensitive.

When the approved lists are empty (default), ANY technology or vendor
triggers a review. This is the conservative default -- the chairman must
explicitly approve technologies and vendors.

### 3. strategic_pivot

**Severity**: HIGH
**Checks**: Whether `input.description` contains any pivot keywords
**Preference key**: `filter.pivot_keywords`
**Default**: ["pivot", "rebrand", "abandon", "restart", "scrap"]
**Trigger message**: "Strategic pivot detected: X, Y"

The keyword search is case-insensitive and uses substring matching.
The chairman can customize the keyword list to match their venture's
terminology.

### 4. low_score

**Severity**: MEDIUM
**Checks**: Whether `input.score` is below the minimum threshold
**Preference key**: `filter.min_score`
**Default**: 7 (out of 10)
**Trigger message**: "Score X/10 below threshold Y/10"

### 5. novel_pattern

**Severity**: MEDIUM
**Checks**: Whether any pattern in `input.patterns` was not seen in
`input.priorPatterns`
**Preference key**: None (pattern comparison is inherent)
**Trigger message**: "Novel patterns detected: X, Y"

Pattern comparison is case-insensitive. This trigger helps the chairman
understand when a stage introduces fundamentally new approaches that
differ from the venture's established trajectory.

### 6. constraint_drift

**Severity**: MEDIUM
**Checks**: Whether any key in `input.constraints` has a different value
than the corresponding key in `input.approvedConstraints`
**Preference key**: None (constraint comparison is inherent)
**Trigger message**: "Constraint drift in N parameter(s): key1, key2"

Comparison uses `JSON.stringify()` for deep equality. This detects both
value changes and structural changes in constraint objects.

---

## Preference Key Mapping

| Trigger Type | Preference Key | Value Type |
|-------------|---------------|------------|
| cost_threshold | `filter.cost_max_usd` | number |
| low_score | `filter.min_score` | number |
| new_tech_vendor (tech) | `filter.approved_tech_list` | string[] |
| new_tech_vendor (vendors) | `filter.approved_vendor_list` | string[] |
| strategic_pivot | `filter.pivot_keywords` | string[] |
| (global setting) | `filter.allow_informational_triggers` | boolean |

All preference keys are namespaced under `filter.` to distinguish them
from other chairman preferences (e.g., `risk.*`, `budget.*`, `tech.*`).

---

## Conservative Defaults

When a preference key is not found in the provided preferences map, the
engine uses these defaults:

| Preference Key | Default Value | Rationale |
|---------------|---------------|-----------|
| `filter.cost_max_usd` | 10,000 | Low threshold forces review of significant costs |
| `filter.min_score` | 7 | Requires above-average quality to auto-proceed |
| `filter.approved_tech_list` | [] (empty) | No pre-approved tech; all tech triggers review |
| `filter.approved_vendor_list` | [] (empty) | No pre-approved vendors; all vendors trigger review |
| `filter.pivot_keywords` | ["pivot", "rebrand", "abandon", "restart", "scrap"] | Common pivot indicators |
| `filter.allow_informational_triggers` | false | INFO triggers still require review by default |

The design philosophy is: **when in doubt, ask the chairman**. A missing
preference should never cause a risky decision to auto-proceed.

### Missing Preference Side Effect

When a preference is missing and the default is used, the engine generates
an additional `constraint_drift` trigger with severity MEDIUM. This trigger
is classified as a "missing preference warning" (identified by
`details.missingKey`) and is separated from business triggers when
determining `auto_proceed`.

This means:
- Missing preferences are logged and visible in the output
- Missing preferences alone do NOT prevent auto-proceed
- Business triggers (cost, tech, pivot, score, patterns, drift) DO affect auto-proceed

---

## Auto-Proceed Decision Logic

The final `auto_proceed` determination follows this logic:

```
Separate triggers into:
  - businessTriggers (actual risk signals)
  - missingPrefTriggers (just "missing preference" warnings)

IF businessTriggers is empty:
    auto_proceed = true
    recommendation = "AUTO_PROCEED"

ELSE IF allow_informational_triggers AND all business triggers are INFO:
    auto_proceed = true
    recommendation = "AUTO_PROCEED"

ELSE IF any business trigger has severity HIGH:
    auto_proceed = false
    recommendation = "PRESENT_TO_CHAIRMAN"

ELSE IF any business trigger has severity MEDIUM:
    auto_proceed = false
    recommendation = "PRESENT_TO_CHAIRMAN_WITH_MITIGATIONS"

ELSE:
    auto_proceed = false
    recommendation = "PRESENT_TO_CHAIRMAN"
```

### Severity Hierarchy

```
HIGH -----> Always blocks auto-proceed
            Triggers: cost_threshold, new_tech_vendor, strategic_pivot

MEDIUM ---> Blocks auto-proceed (unless all are INFO with flag)
            Triggers: low_score, novel_pattern, constraint_drift

INFO -----> Can be configured to allow auto-proceed
            (via filter.allow_informational_triggers preference)
```

---

## Missing Preference Handling

When the engine calls `getPref(key)` and the key is not in the preferences
map, two things happen:

1. A `constraint_drift` trigger is added with `severity: MEDIUM` and
   `details.missingKey` set to the key name
2. The default value is used for the actual threshold evaluation

These "missing preference" triggers are tracked separately from business
triggers when determining `auto_proceed`. They appear in the output for
visibility but do not affect the auto-proceed decision.

This is a deliberate design choice: the engine should not block ventures
just because preferences have not been configured yet. The conservative
defaults provide reasonable protection, and the missing-preference warnings
alert the chairman that explicit thresholds should be set.

---

## Trigger Ordering Guarantee

The output `triggers` array is always ordered by trigger type, following
the fixed `TRIGGER_TYPES` sequence:

1. All `cost_threshold` triggers
2. All `new_tech_vendor` triggers
3. All `strategic_pivot` triggers
4. All `low_score` triggers
5. All `novel_pattern` triggers
6. All `constraint_drift` triggers (including missing-preference warnings)

Within a trigger type, triggers appear in the order they were generated
(e.g., technology triggers before vendor triggers for `new_tech_vendor`).

This ordering is enforced by iterating through `TRIGGER_TYPES` and filtering
the triggers array for each type. It guarantees that two identical inputs
always produce triggers in the same order.

---

## Integration Points

### Eva Orchestrator (Primary Consumer)

The Eva Orchestrator calls `evaluateDecision()` in step 6 of `processStage()`:

1. Merges artifact outputs into a flat stage output
2. Builds the filter input from the merged output
3. Loads chairman preferences via ChairmanPreferenceStore
4. Calls `evaluateDecision(filterInput, { preferences, logger })`
5. Maps the result to the action enum (AUTO_PROCEED / REQUIRE_REVIEW / STOP)

### Stage Gates Extension (Secondary Consumer)

Both kill gates and promotion gates use the engine for threshold evaluation:

1. `resolveGateContext()` loads preferences and builds stage input
2. `evaluateDecision()` is called with the stage input
3. The trigger results determine the gate status:
   - Kill gates: `auto_proceed = true` -> PASS; `false` -> REQUIRES_CHAIRMAN_DECISION
   - Promotion gates: HIGH triggers -> FAIL; otherwise -> REQUIRES_CHAIRMAN_APPROVAL

### Standalone Usage

The engine can be called directly for "what if" analysis without any
database interaction:

```
// No database needed -- pure function
const result = evaluateDecision(
  { cost: 50000, score: 4, technologies: ["blockchain"] },
  { preferences: { "filter.cost_max_usd": 25000, "filter.min_score": 6 } }
);
// result.auto_proceed = false (cost exceeds threshold)
```

---

## Testing Strategy

Because the engine is a pure function, testing is straightforward:

### Unit Testing Approach

1. **Each trigger type in isolation**: Provide only the relevant input
   field and verify the correct trigger fires
2. **Trigger combinations**: Verify that multiple triggers can fire
   simultaneously and are ordered correctly
3. **Default fallback**: Verify that missing preferences use defaults
4. **Auto-proceed logic**: Verify all branches of the decision tree
5. **Edge cases**: Null/undefined inputs, empty arrays, boundary values

### No Mocking Required

Unlike other components that require database mocks, the Decision Filter
Engine requires no mocking at all. Test inputs are plain objects, and
test outputs are plain objects. This is a direct benefit of the pure
function design.

### Structured Logging

The engine logs two structured events via the injected logger:

1. `decision_filter_evaluated` -- Summary with stage, auto_proceed,
   recommendation, and trigger types
2. `decision_filter_trigger_details` -- Detailed trigger information
   (only when triggers are present)

Both are JSON-formatted for structured log parsing.
