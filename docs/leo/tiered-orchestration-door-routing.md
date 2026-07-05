---
category: Protocol
status: Approved
version: 1.0.0
author: Bravo (FABLE-MAX) — SD-LEO-INFRA-TIERED-ORCHESTRATION-FABLE-001
last_updated: 2026-07-05
tags: [tiered-orchestration, door-routing, dispatch, economics]
---

# Tiered Orchestration — One-Way/Two-Way Door Routing

**Operating model (chairman sprint item 5 + 2026-07-05 2:35 PM amendment):** after
the Tuesday pricing cutover, Fable 5 runs as the high-level orchestrator on API
pricing. **ONE-WAY doors** (irreversible work) stay Fable-exclusive; **TWO-WAY
doors** (reversible work) delegate to **Opus/Sonnet** Claude Code sessions on the
chairman-retained Max plan. The routing workflow is AI-generated and AI-maintained:
the pure classifier **is** the mapping — there are no hand-kept workflow tables.

## The two model axes (never conflate them)

| Axis | Where it lives | What this SD does with it |
|---|---|---|
| **Fleet-session axis** | worker `metadata.model/effort` → `tier_rank` via `lib/fleet/tier-ladder.cjs` | **This is the delegation axis.** `delegate_model` names which Max-plan session tier builds a two-way item. |
| **LLM-client axis** | `lib/llm/client-factory.js` (in-process API calls; registered ollama seam) | Untouched. Its ollama seam is the natural hook when the deferred **local third tier** returns — extend `DELEGATE_TIERS` in `lib/fleet/door-constants.cjs`; no rubric or gate change. |

## Components

1. **Classifier** — `lib/fleet/door-classifier.mjs` `classifyDoor(item)` →
   `{door, reasons[], gates}`. Pure, closed verdict set, every verdict carries
   named reasons. Keyword lists come from `scripts/classify-quick-fix.js`
   through the **same import bridge `lib/fleet/sd-tier-rank.mjs` uses** — no
   third list (canary-tested). `two_way` is reachable only via a **closed
   allowlist** (copy/content, UI-only, flag-gated, docs-only, test-only) and
   only when zero one-way markers fired. **Ambiguous → `one_way`** — the
   reversibility-uncertain posture inherited from
   `lib/adam/execute-vs-escalate.js`.
2. **Stamper** — `lib/fleet/door-stamper.mjs` writes `metadata.door_class`
   beside `min_tier_rank`; a `one_way` stamp **raises `min_tier_rank` to the
   ladder top in the same atomic write** (compose-never-diverge — the door
   gauge and the rank SSOT cannot disagree).
3. **Dispatch gate** — `assertDoorRoutingAllowed` in
   `lib/coordinator/dispatch.cjs`, sibling of `assertWorkerTierAllowed` at the
   single dispatch choke point: `one_way` → below-top-rank target throws
   `DISPATCH_ONE_WAY_DOOR` (fail-closed on a confirmed violation, fail-open on
   read faults); `two_way` → stamps `payload.delegate_model` (validated against
   `DELEGATE_TIERS`) beside `effort_recommendation`.
4. **Economics** — `lib/fleet/door-routing-ledger.cjs` (fire-and-forget; never
   blocks a dispatch) writes `door_routing_ledger` rows
   (`database/migrations/20260705_add_door_routing_ledger.sql`, **apply at
   cutover**). Chairman rollup query lives in the table COMMENT. v1 measures the
   routing surface; full delegate token attribution follows once delegate
   sessions report usage.

## The same-evidence invariant

Tier changes **who builds, never what evidence ships**. No gate, witness, CI
check, review lane, or handoff branches on `delegate_model` — asserted by the
TS-3 fixtures (the dispatched row differs only in payload stamps). A delegate's
PR passes the identical pipeline a Fable PR does.

## Cutover & rollback

- Everything is inert until `DOOR_ROUTING_ENABLED=true` (TS-5 pins byte-identical
  dispatch behavior when off). Cutover = apply the ledger migration + flip the
  flag. Rollback = flip it off; no deploy, no data loss (stamps are inert data).
- `DELEGATE_DEFAULT_MODEL` (default `sonnet`) covers targets without a declared
  delegate-tier model.

## Deferred (by amendment)

The local/ollama rung: add its label to `DELEGATE_TIERS`, register the session
tier in the ladder, and (optionally) wire the client-factory seam for in-process
calls. The rubric, stamps, gate, and ledger admit it unchanged.
