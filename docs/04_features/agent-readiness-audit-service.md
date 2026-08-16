---
category: feature
status: approved
version: 1.0.0
author: LEO Fleet (Alpha)
last_updated: 2026-08-16
tags: [feature, agent-readiness, llm-txt, buyer-intent, audit]
---

# Agent Readiness Audit Service

**SD**: SD-LEO-FEAT-AGENT-READINESS-SERVICE-001 (status: completed) · **PR**: [#7113](https://github.com/rickfelix/EHG_Engineer/pull/7113)

## Overview

Measures how AI agents/LLMs represent a venture when asked buyer-intent questions
("is `<business>` a good choice for X?"), generates an `llm.txt` (and later an MCP
surface) intended to improve that representation, then re-measures to produce a
before/after delta. Built as a dogfood-first capability — validated internally on
AltifyAI/ApexNiche before being offered as a paid service.

## Architecture

Code lives under `lib/agent-readiness/`:

| Module | Responsibility |
|---|---|
| `audit-runner.js` | Orchestrates one audit run: fans out prompts × models × replicates, calls provider adapters directly (no fallback, no cache), classifies responses, persists samples |
| `budget-guard.js` | Pre-flight + mid-run cost cap, reusing `lib/research/deep-research-budget.js`'s enforcement under a dedicated `agent-readiness-audit` provider key |
| `entitlement.js` | Paid-access check via Stripe Checkout session history (`hasEntitlement`), paginated |
| `run-registry.js` | Registers/reads `agent_readiness_audit_run` rows |
| `sample-writer.js` | Persists individual `agent_readiness_audit_sample` rows |
| `diff-harness.js` | Computes before/after deltas across two audit runs |
| `llm-txt-version-store.js` | Versions generated `llm.txt` content |

**Integrity guarantees** (see `_internal.classifyResponse`/`familyModel` in
`audit-runner.js`):
- **No fallback** — each sample is requested from `getProviderAdapter(family, { fallbackEnabled: false })`; a failing sample writes nothing rather than substituting a different model's answer.
- **No cache** — the provider-adapter call path used here has no caching layer; `cache_hit` is always written `false` truthfully, not because a flag disabled it.
- **Cost measured per model family** — `estimateCost(cell.family, ...)`, not a single flat rate, so multi-provider fan-outs (anthropic/openai/google) are budgeted accurately.

## Database

Schema is **staged, not yet applied**: `database/chairman-gated/20260816_agent_readiness_audit_schema.sql`
(+ matching `_DOWN.sql` revert and `_acceptance.mjs` post-apply verification script).
Tables: `agent_readiness_audit_run`, `agent_readiness_audit_sample`, `llm_txt_version`;
view `v_agent_readiness_audit_run_integrity`; function `canonical_model_set()` for
order-insensitive prompt×model×replicate pairing. Per this repo's chairman-gated
convention, the migration carries no `@approved-by` attestation — the builder stages
it, the chairman applies it.

`llm_txt_version` intentionally has **no retention policy entry** in
`lib/retention/policies.js` — age-based deletion would delete live-serving published
content. This is covered by a dated `operator_contract_waiver` on the SD
(`metadata.operator_contract_waiver`, expiry 2026-11-14), not a retention policy.

## Budget & entitlement guardrails

- `preflightBudgetCheck()` runs **before** any fan-out and refuses the run if the
  estimated cost exceeds the daily cap (`AUDIT_BUDGET_CAP_USD`, default $5).
- `midRunAlertCheck()` can be polled between batches; alerts at 90% of cap.
- `hasEntitlement(ventureUrl)` checks for a paid Stripe Checkout session tagged with
  the venture URL before an external customer's audit is allowed to run.

## Status

- EXEC implementation complete and merged (PR #7113).
- Test suite: 53/53 passing across 7 files in `tests/agent-readiness/`.
- Went through two rounds of adversarial code review pre-merge; all CRITICAL/WARNING
  findings fixed (retention-policy danger on `llm_txt_version`, per-family budget
  cost estimation, `familyOf`/`familyModel` contract alignment, entitlement
  pagination test coverage).
- **Not yet live**: the DB migration is staged but not applied. The service cannot
  run against a real database until the chairman applies the migration per the
  chairman-gated convention.
