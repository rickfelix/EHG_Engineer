---
category: reference
status: approved
version: 1.0.0
author: Claude (SD-LEO-INFRA-PORTFOLIO-STRATEGY-FIRST-001-A)
last_updated: 2026-07-17
tags: [reference, eva-vision, governance]
---

# GOVERNED_VISION_KEYS — Chairman-Ratified Vision Documents

**Source**: SD-LEO-INFRA-PORTFOLIO-STRATEGY-FIRST-001-A
**Mechanism**: `lib/eva/vision-upsert.js` (`GOVERNED_VISION_KEYS`, `PORTFOLIO_STRATEGY_VISION_KEY`)

## Why this exists

`upsertVision()`'s `approved` option defaults to `true` (`approved = true`, `isApproved = approved !== false`) — a "FORCE-APPROVE" default kept for backward-compat with programmatic callers that always pass it explicitly. For most `eva_vision_documents` rows this is fine: every existing caller (`stage-17-doc-generation.js`, `vision-repair-loop.js`, `scripts/eva/vision-command.mjs`'s CLI) already passes `approved` explicitly, so nothing relies on the default.

Some vision documents are different: they are **chairman-governed, holdco-tier artifacts** where an unratified revision must never silently activate. The first of these is `VISION-PORTFOLIO-STRATEGY-001` (the holdco portfolio strategy). For these, `approved` is ignored entirely — activation requires an explicit `chairmanRatified: true`.

## How it works

```js
// lib/eva/vision-upsert.js
export const GOVERNED_VISION_KEYS = new Set(['VISION-PORTFOLIO-STRATEGY-001']);

// inside upsertVision():
const isApproved = GOVERNED_VISION_KEYS.has(visionKey)
  ? chairmanRatified === true
  : approved !== false;
```

A call to `upsertVision({ visionKey: 'VISION-PORTFOLIO-STRATEGY-001', ..., approved: true })` **without** `chairmanRatified: true` still writes `status: 'draft'`, `chairman_approved: false`. Only `chairmanRatified: true` activates it.

### CLI usage

```bash
# Author/revise as draft (never activates, regardless of --approved)
node scripts/eva/vision-command.mjs upsert --vision-key VISION-PORTFOLIO-STRATEGY-001 --level L1 --draft --content @strategy.md

# Ratify — the ONLY way to activate a governed key
node scripts/eva/vision-command.mjs upsert --vision-key VISION-PORTFOLIO-STRATEGY-001 --level L1 --approved --chairman-ratified --content @strategy.md
```

`--chairman-ratified` is a bare flag — passing it a value (e.g. `--chairman-ratified false`) is rejected with an error rather than silently coerced, since the CLI's arg parser would otherwise treat the string `'false'` as truthy.

## Every write path to a governed row must respect the gate

A single scoped fix is not enough — **any** direct write to `eva_vision_documents` touching a governed key must go through this gate, or check it independently. Three such paths existed at the time this mechanism shipped (found across 3 rounds of adversarial review on PR #6138):

| Path | File | How it's kept safe |
|------|------|---------------------|
| Primary upsert | `lib/eva/vision-upsert.js` `upsertVision()` | The gate itself |
| CLI addendum | `scripts/eva/vision-command.mjs` `cmdAddendum` | Routes through `buildAddendumUpdatePayload()`, which demotes a governed row back to `draft` on any addendum (each revision needs its own ratification) |
| Brainstorm pipeline | `scripts/eva/brainstorm-to-vision.mjs` | Its "most recent active L1 vision" resolution excludes governed keys via `selectFirstNonGoverned()`, so it can never target a governed document at all |

If you add a new direct-write path to `eva_vision_documents`, or a new entry to `GOVERNED_VISION_KEYS`, grep for `.from('eva_vision_documents')` repo-wide and verify each write path either imports `GOVERNED_VISION_KEYS` (or one of the pure helpers above) or is provably scoped away from governed keys (e.g. filtered by `venture_id`, which governed L1 keys never have).

## Adding a new governed key

1. Add the `vision_key` string to `GOVERNED_VISION_KEYS` in `lib/eva/vision-upsert.js`.
2. Confirm no existing caller passes `approved: true` for that exact key expecting silent activation (grep `upsertVision(` call sites).
3. If the new key can also be reached via `brainstorm-to-vision.mjs`'s L1 resolution, the existing `selectFirstNonGoverned()` exclusion covers it automatically (it checks the whole set, not a single key).

## Tests

- `lib/eva/__tests__/vision-upsert.test.js` — the `governed-tier vision_key`, `buildAddendumUpdatePayload`, `rejectStringFlagValue`, and `selectFirstNonGoverned` describe blocks.
- `lib/eva/stage-zero/__tests__/strategic-context-loader.test.js` — the additive `loadPortfolioStrategy()` sub-loader that reads a governed key once it is active.
