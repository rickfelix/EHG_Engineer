---
category: reference
status: approved
version: 1.0.0
author: rickfelix
last_updated: 2026-08-16
tags: [reference]
---

# Pre-PLAN Adversarial Critique Gate

**SD**: `SD-LEO-INFRA-PRE-PLAN-CRITIQUE-PRD-TRUNCATION-001` (truncation signaling + override binding); originating gate from `SD-LEO-INFRA-SYSTEMATIZE-COMPLETENESS-CRITIC-001`
**Phase**: LEAD-TO-PLAN
**Gate**: `PRE_PLAN_ADVERSARIAL_CRITIQUE` (`scripts/modules/handoff/executors/lead-to-plan/gates/pre-plan-critique.js`)
**Critic**: `critiquePlanProposal()` (`lib/eva/devils-advocate.js`) — a distinct code path from the venture-lifecycle kill/promotion-gate Devil's Advocate (`getDevilsAdvocateReview()`, documented separately at `docs/guides/workflow/cli-venture-lifecycle/07-devils-advocate.md`); the two share a file but not a prompt, a budget constant, or a call path.

## What it does

At LEAD-TO-PLAN, an LLM adversarial critic reviews the PRD (`product_requirements_v2`: `executive_summary`, `functional_requirements`, `acceptance_criteria`, `test_scenarios`, `risks`) plus the SD's architecture plan (`eva_architecture_plans.content`, when `metadata.arch_key` is set) and returns `overall_severity` (`pass` | `note` | `block` | `could_not_check`) with a `findings[]` list. A `block` verdict fails the handoff unless a matching override is on file (see below).

## Truncation & budgeting (FR-1/FR-2/FR-3)

The PRD is section-budgeted before it's sent to the critic, via `buildBudgetedPrdText()`:

- Fast path: if the raw concatenated PRD text already fits under `MAX_CRITIQUE_ANALYSIS_CHARS` (64,000 chars), it is sent whole — no per-section budgeting.
- Fallback path: when it doesn't fit, `SECTION_BUDGETS` allocates a fixed char budget per section (`executive_summary`, `acceptance_criteria`, `test_scenarios`, `risks`), and the critique's `findings[]` gets a loud, structured truncation marker (never a silent cut) naming which sections were shortened and by how much.

This closes the original defect: a growing PRD used to be silently cut at a flat ~8,000-char cap, so `FR-X truncated / not present` BLOCK findings fired against content the critic never saw, and moved earlier every time the PRD grew.

## Override binding (FR-4/FR-5, TR-2)

A human-recorded override on a `block` verdict binds via `content_hash` — SHA-256 of the **full, pre-truncation** PRD + arch text (not the truncated text actually sent to the LLM) plus the requested model (`adapter.defaultModel`), `archLoadStatus`, and the `MAX_CRITIQUE_ANALYSIS_CHARS`/`SECTION_BUDGETS` constants. It replaced an earlier `findingsFingerprint` predicate that could never re-bind, because the LLM's finding composition is non-deterministic even on unchanged input — content identity is what has to match, not a specific run's findings.

Record an override with the canonical CLI (never hand-write `plan_critiques.override_reason`/`override_by`):

```bash
node scripts/critique-override.js <SD-KEY> --by "<who>" --reason "<why>"
```

It binds to the **most recent blocking critique row** for the SD, is honored for up to 14 days (`OVERRIDE_LOOKBACK_DAYS`), and excuses *any* finding this exact PRD/arch content produces — not only the findings shown at override time. A later critique over materially different content (a different `content_hash`) re-blocks and needs a fresh override.

## Cache-hit optimization (FR-4/FR-5)

Within a 15-minute TTL (`CACHE_TTL_MS`), a repeat run with an identical `content_hash` reuses the prior LLM call instead of re-invoking it, reading the raw pre-merge result from `metadata.llm_result` (never the row's own top-level `findings`/`overall_severity`, which are already gate-merged). A `could_not_check` row is never treated as a cache hit, so a transient LLM failure doesn't become sticky for the TTL window.

## Schema-missing handling (FR-6) — currently active

`plan_critiques.metadata` and `.content_hash` are **staged, not yet live**: `database/chairman-gated/20260816_plan_critiques_add_metadata_and_content_hash.sql`, pending a chairman-gated ceremony apply. Until then, every write/read against those columns returns `42703`/`PGRST204`. Three call sites give this a loud, named branch rather than silently reading it as "nothing found" — `persistCritique`, `findActiveOverride` (`pre-plan-critique.js`), and `scripts/critique-override.js` — each states explicitly that a schema-missing error is not evidence of "no override exists."

## Bypass

Standard path (CONST-015):

```bash
node scripts/handoff.js execute LEAD-TO-PLAN <SD-ID> \
  --bypass-validation \
  --bypass-reason "<ticket reference + why>"
```

Prefer `scripts/critique-override.js` over a bare bypass when the block is a specific, reviewed finding on an otherwise-sound PRD — the override is scoped to that exact content and leaves an audited, re-verifiable trail; a bypass skips the gate entirely.

## Related

| File | Role |
|---|---|
| `lib/eva/devils-advocate.js` | `critiquePlanProposal`, `computeContentHash`, `buildBudgetedPrdText`, `lookupCacheHit` |
| `scripts/modules/handoff/executors/lead-to-plan/gates/pre-plan-critique.js` | Gate wiring, `findActiveOverride`, `persistCritique` |
| `scripts/critique-override.js` | Canonical override-recording CLI |
| `database/chairman-gated/20260816_plan_critiques_add_metadata_and_content_hash.sql` | Staged migration (metadata + content_hash columns) |
| `docs/reference/schema/engineer/tables/plan_critiques.md` | Auto-generated schema reference — regenerates from `database/schema-reference-snapshot.json` once the migration above is applied (TR-6) |
