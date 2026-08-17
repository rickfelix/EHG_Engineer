---
category: Protocol
status: Approved
version: 1.1.0
author: Bravo (FABLE-MAX) — SD-LEO-INFRA-TIERED-ORCHESTRATION-FABLE-001; extended by SD-LEO-INFRA-OPERATIONALIZE-FABLE-USE-001
last_updated: 2026-07-07
tags: [tiered-orchestration, door-routing, dispatch, economics, model-tier, fable-use-doctrine]
---

# Tiered Orchestration — One-Way/Two-Way Door Routing

> **RETIRED 2026-08-16 (SD-LEO-INFRA-DOOR-ROUTING-INERT-DECIDE-001).** The `door_class`
> classifier/stamper/dispatch-gate/ledger subsystem described in "Components" 1-4, "The
> same-evidence invariant", "Cutover & rollback", and "Deferred" below was never activated
> (`DOOR_ROUTING_ENABLED` was never true in any real environment, and `door-classifier.mjs`/
> `door-stamper.mjs` had no wired, ongoing production caller in the committed codebase --
> git history shows exactly 2 commits ever touching either file, both from the original
> build, no third commit ever adding a caller. **Correction, SECURITY review finding SEC-C1:**
> 5 completed SDs (the `SD-ARCH-HOTSPOT-*` family) do carry `metadata.door_class`, stamped
> in a single ~1-second window on 2026-07-09 by `stamped_by:'coordinator-cutover-2026-07-09'`
> -- output byte-shaped exactly like `stampDoorClass()`'s return value, almost certainly a
> one-time ad-hoc/manual invocation (a backfill tied to introducing the `door_class` concept)
> rather than evidence of a live, ongoing dispatch-time invocation path. "Zero production
> callers ever" overstated this; the accurate claim is zero wired/automated callers, one
> historical manual exception, zero non-terminal carriers today. The chairman decided RETIRE (SMS
> dc87e7a0, decision row 9ce56d34); `lib/fleet/door-constants.cjs`, `door-classifier.mjs`,
> `door-stamper.mjs`, `door-routing-ledger.cjs`, and the `fable-allocation-report` reporting
> script (formerly under `scripts/`) are all deleted, along with
> `assertDoorRoutingAllowed` in `lib/coordinator/dispatch.cjs`. Sections below
> describing them are kept as historical record, not as current architecture. The separate
> "content-tier (Fable-use doctrine)" section further down **remains live** — `door_class` and
> `model_recommendation` were always two different, independent axes (see the comparison table
> in that section), and only the former was retired.

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

## A third, orthogonal axis: content-tier (Fable-use doctrine)

SD-LEO-INFRA-OPERATIONALIZE-FABLE-USE-001 operationalizes a separate chairman
doctrine (`docs/design/fable-use-case-doctrine.md`) that answers a different
question than `door_class` does. **Do not conflate the two axes:**

| Axis | Question it answers | Classifier | Fail bias |
|---|---|---|---|
| `door_class` (above, **retired**) | *Who is authorized to execute this?* (reversibility/execution-authority) | ~~`lib/fleet/door-classifier.mjs`~~ deleted | failed **closed** toward `one_way` |
| `model_recommendation` (this section, **live**) | *Does this work item's content warrant Fable's judgment at all?* (R1-R5 doctrine) | `lib/fleet/model-recommendation.cjs` | fails **open** toward `sonnet` |

### Components

1. **Classifier** — `lib/fleet/model-recommendation.cjs` `recommendModelTier(item)`
   → `{tier, criterion, reason}`. Pure, no I/O. Scores title/description/scope/
   key_changes text against 5 keyword-list rules (R1 compounding-constraint/
   architecture, R2 negative-space/pre-mortem, R3 taste/UX-judgment, R4
   cross-subsystem coupling ≥3, R5 reversal-stakes keyword match). Defaults to
   `sonnet` when nothing matches — the doctrine's own standing rule ("Default:
   Sonnet. Escalate to Fable IFF R1-R5"). **(2026-08-16, SD-LEO-INFRA-DOOR-ROUTING-
   INERT-DECIDE-001)** previously also carried a `door_class.door === 'one_way'`
   → automatic-R5 shortcut, composing with the now-retired `door_class` axis;
   removed alongside that axis's retirement — R5 is reached only via its
   keyword match now.
2. **Stamper** — `stampModelRecommendation` in `lib/coordinator/dispatch.cjs`,
   wired into `insertCoordinationRow` immediately after the existing
   `stampEffortRecommendation` call (the same single dispatch choke point as
   `door_class`). Stamps `model_recommendation` / `_criterion` / `_reason` onto
   every `WORK_ASSIGNMENT` row; skips quick-fixes (`QF-*`) and any dispatch that
   already carries a caller-preset value.
3. **Evidence-first enforcement** — when the recommendation is `fable`, the
   stamper checks for `payload.evidence_packet` or a `sub_agent_execution_results`
   row for the SD within the last 24h; absent both, it stamps
   `model_recommendation_evidence_missing=true` rather than acting on an
   unsubstantiated Fable escalation. Fails open on a lookup fault (advisory,
   never blocks dispatch).
4. **Audit trail** — a fire-and-forget, FIFO-capped-at-20 append to
   `strategic_directives_v2.metadata.model_tier_decisions[]` on every dispatch.
5. **Economics (retired 2026-08-16, SD-LEO-INFRA-DOOR-ROUTING-INERT-DECIDE-001)** —
   this doctrine previously piggybacked on the `door_routing_ledger` table (two
   additive columns, `r_criterion`/`funnel_position`, added by
   `database/migrations/20260707_door_routing_ledger_fable_criterion_funnel.sql`)
   via `lib/fleet/door-routing-ledger.cjs` and a `fable-allocation-report` reporting
   script formerly under `scripts/`.
   Because that piggyback only ever fired when the target SD already carried a
   classified `door_class.door` (the ledger's `door` column is `NOT NULL`) — and
   `door_class` was never populated in production — this economics leg never
   wrote a single row. It was deleted alongside `door_class`'s retirement; the
   `door_routing_ledger` table itself (2 already-applied, immutable migrations,
   0 rows) is left in place as a separate, deferred decision, not dropped by
   that SD. The doctrine's own observed-bias question ("do we over-allocate
   Fable to detailing, under-allocate to selection/pre-mortems?") remains
   unmeasured pending a replacement instrumentation path.

The dispatch stamp (items 1-4 above) is unconditional and always fires —
independent of `door_class`, which was never a dependency of this axis.
