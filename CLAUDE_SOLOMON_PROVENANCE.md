<!-- file_content_hash: a46ec5fcade91deb -->
<!-- GENERATED FILE - DO NOT EDIT DIRECTLY. Source of truth: leo_protocol_sections (DB). Regenerate: node scripts/generate-claude-md-from-db.js. Drift check: node scripts/check-claude-md-drift.cjs -->
# CLAUDE_SOLOMON_PROVENANCE.md — Solomon Provenance (dated rationale)

**Generated**: 2026-08-23 8:34:07 AM
**Protocol**: LEO 4.4.1
**Purpose**: Why each clause exists — originating-incident narratives, measurement citations, dated rationale moved out of the gated contract per FR-6
**Load when**: When you need to know WHY a rule exists, or before proposing to change one

> Every rule in CLAUDE_SOLOMON.md is IN FORCE regardless of whether its history is read here. This file explains; it does not govern.

---

## Solomon Provenance — dated rationale and originating incidents (companion)

Historical detail, measurement citations, and full incident narratives for CLAUDE_SOLOMON.md, relocated here per SD-LEO-INFRA-SOLOMON-ROLE-CONTRACT-001 FR-6 to keep the gated contract file under its single-read byte budget. **Nothing here is operative** — every duty/rule/precondition/silence-rule stays in CLAUDE_SOLOMON.md; this file only carries the WHY and the supporting measurement behind those rules. Follows the pattern established by `CLAUDE_ADAM_PROVENANCE.md`.

## Mode C — evidence basis for the third admission path

Mode C (chairman-ratified 2026-07-12) was added because ~70% of the 2026-07-12 Fable-window spend — the endgame increments, the venture-2 packet, the alt-text demand-test design — ran outside the two-mode (reactive/proactive) model. The two-mode framing did not have anywhere to put chairman/Adam-commissioned deliverables, so they were being force-fit into Mode B sweeps or left unaccounted for.

## P1a — RUNG 4 PARKED: full measurement basis

`fable_suitability_map` held exactly one row (created 2026-07-20, `region_key=ehg_engineer/lib/fable-suitability` — the scorer's own implementation directory, the default `--dir` of its dry-run entrypoint `scripts/fable-suitability/dry-run.mjs`); `readModeBCandidates` has zero production callers. Row-count>0 is not the right liveness test — it is satisfied by a single self-referential smoke-test row while supplying zero usable fuel (the **truthy-sentinel-suppresses-fallback** class defect: any such gate must test for **usable** fuel — ≥N regions, none self-referential, scored within M days — never mere existence).

**Supporting evidence, explicitly bounded**: over one Solomon session (857a3ae8, 2026-07-27) — N=10, ONE session, ONE day; five of the nine refutations were already-fixed items, a property of that week's codebase tending, not a proven durable property of Mode-B; RE-MEASURE before citing as a rate — SELF-GENERATED hypotheses landed 1 of 10 vs ROUTED-CONSULT verification at 5 of 5.

## ADAM GROUNDING-COMPLETENESS OVERSIGHT DUTY — originating incident (full narrative)

Adam produced venture-1's S16 financial *assumptions* using GENERIC early-stage-SaaS defaults — a human engineering-team payroll ($8–14.5K/mo "personnel"), generic hosting, generic marketing — that directly contradicted EHG's core founding thesis (a SOLO chairman with all work driven by AI AGENTS, a built-in venture-hosting standard, and a built-in GTM process). The grounding was *available* (mission/vision, the operating model, venture `stage_zero`, ratified decisions) but Adam reasoned generically instead of connecting it; the Chairman had to catch it manually. (Chairman-directed 2026-06-26.)

## ADAM AUTONOMY OVERSIGHT & REPORTING DUTY — originating incident (full narrative)

Adam STOPPED the autonomous overnight run (~2:54 AM, 2026-06-30) to email the Chairman to approve an additive, reversible migration (the `convergence_ledger` telemetry tables — `CREATE TABLE IF NOT EXISTS`, no alter/drop) — anchoring on a DRAFT/"chairman-away" policy doc over the Chairman's standing autonomy grant — costing ~4h of foundation-idle. The Chairman had to correct it by hand ("Remember, I want you to operate autonomously"). (Chairman-directed 2026-06-30.)

## DECISION_REQUESTED DISCIPLINE — restoration history and measurement basis

**Restoration history**: durable, SD-ALTIFYAI-LEO-FIX-SOLOMON-ADVICE-LEDGER-001; restored to the DB section 2026-08-23 by Adam — the originating SD hand-edited only the generated file, so the first regeneration dropped it; nobody ratified a removal. This is the live specimen that motivated SD-LEO-INFRA-SOLOMON-ROLE-CONTRACT-001 FR-5.

**Why the `--informational` flag, not an automatic signal**: two prior candidate signals for distinguishing "decision requested" from "informational" were independently measured against live traffic and found to always collapse to "no decision needed" for effectively all Solomon sends. The ledger cannot tell the two apart without an explicit flag from the sender.

## Self-score cadence — rationale and citation detail

The "Self-score cadence — the operating reality" note in CLAUDE_SOLOMON.md (SD-LEO-INFRA-ROLE-SESSION-SELF-001 FR-5) exists because the contract previously asserted a cadence the runtime did not provide, and a reader had no way to tell the difference.

**On fact 2 (`--force` is the operating path)**: per QF-20260719-825, the chairman-directed cadence outranks the ships-inert default, and a flag-gated no-op is escalated by the agent rather than silently accepted. So "inert" describes the FLAG, not the cadence: scoring is expected every ~6h via `--force`, and the staleness gauge trips at 8h precisely because that expectation is real. A Solomon session that reads "ships inert" as "no score is expected" has misread this.

**On live enablement**: if genuinely wanted, it carries its own blast radius — review noise and feedback-table write saturation across the parallel worker sessions, the coordinator and Adam — and must go through `SD-LEO-INFRA-ENABLE-TRI-PARTY-001` (currently CANCELLED), never as a side effect of an unrelated fix. The three staleness gauges in `lib/governance/gauge-registry.js` ship `enabled:false` deliberately paired with the cadence flags: enabling the writers alone gives scoring with no staleness detection, and enabling the gauges alone gives a permanent false trip — flip both together or neither.

## HIGHER-ORDER EFFORT-DISTRIBUTION TIER DESIGN DUTY — comms/partnership design pointer

The as-above comms/partnership design (diverse-lens consensus panel + the async-ACK Solomon→Adam FRAME→SOURCE hand-down, modeled pattern-by-pattern on the proven Adam↔Coordinator partnership — chairman-directed 2026-06-29) is briefed in the seed brainstorm's § "As-above communication & partnership architecture" (`docs/architecture/solomon-higher-order-effort-fleet-brainstorm.md`). The same panel + hand-down mechanism is also named in CLAUDE_SOLOMON.md §8 Comms, "Higher-order-tier comms".

## HIGHER-ORDER EFFORT-DISTRIBUTION TIER DESIGN DUTY — design mechanics (moved from the duty entry, FR-6 second pass)

**Hibernate & reuse**: the tier hibernates like the workers do (`SD-LEO-INFRA-FLEET-HIBERNATION-MECHANISM-001`) and reuses the existing `session_coordination` lane — no new transport.

**Singleton-vs-fleet resolution**: Adam's lean is a *singleton effort-router* invoking on-demand Fable-effort plus a consensus panel, hibernating hard — this preserves the §2 singleton on cost grounds rather than standing up a Fable fleet. Resolving this tension is Solomon's own design charge (it is both this cluster and an instance of the SELF-IMPROVEMENT-OF-THE-SELF-IMPROVEMENT-LOOP duty pointed at Solomon's own tier).

**Seed brainstorm**: `docs/architecture/solomon-higher-order-effort-fleet-brainstorm.md` (Adam, 2026-06-27) — comms/partnership design briefed there; see also the pointer above and CLAUDE_SOLOMON.md §8 Comms "Higher-order-tier comms" for the same as-above panel + FRAME→SOURCE hand-down.

**Both axes' elaboration**: REASONING-DEPTH routing must never mismatch — no deep problem to a low-effort call, no shallow problem to a high-effort call (the altitude analog of `min_tier_rank` + WORK-DOWN-NEVER-UP). ABSTRACTION routing is the same analog one level up: never a concrete task to the framing tier, never a framing problem to an implementation worker; reconcile the abstraction axis (altitude/concreteness) with the suitability-map's Reasoning-Depth axis (steps-ahead) — related but likely DISTINCT (see brainstorm point 2b). The consensus panel is the Adam↔Coordinator co-author pattern applied at altitude.

## Comms mechanism detail (moved from §8, FR-6 second pass)

**Courtesy-ACK dedup hazard, full mechanism**: the parenthetical alternative the contract bullet used to offer ("re-key dedup on oracle-verdict rows only") was in effect ADOPTED: `alreadyAnswered` (lib/coordinator/reply-class.cjs) filters `payload->>kind` (QF-20260709-800, which excludes `ping_on_silence` rows) and further narrows on the optional `message_kind` and `part_index` sub-discriminators. The hazard is therefore NARROWER than the contract's plain-language statement but NOT gone: an ACK emitted under the `adam_advisory` kind on a consult correlation still blocks the canonical answer.

**Ordered-parts history**: `--part N/M` exists on BOTH `solomon-advisory.cjs` and `adam-advisory.cjs` (SD-LEO-INFRA-CONSULT-CORRELATION-CONVENTIONS-001); before that SD only Solomon had it, so the convention was not expressible on the Adam→Solomon direction at all.

## Chairman-SMS-lane source — measurement basis (FR-6 second pass)

Measured 2026-08-04: BOTH chairman-SMS wrappers route through one gate (`scripts/adam-chairman-sms.mjs:7`, `scripts/adam-chairman-decision.mjs:11`) and NEITHER writes a `chairman_decisions` row — so a decision packet sent by text leaves no trace in any other source either the GROUNDING-COMPLETENESS or AUTONOMY OVERSIGHT duty reads. Omitting this lane means grading on a sample that excludes the consequential matters, which is why both duties read it explicitly.

## DECISION_REQUESTED DISCIPLINE — why getting the flag wrong matters (FR-6 second pass)

This is not a formatting nicety: a real decision marked `--informational` hides it from the ledger, and an FYI marked decision-requiring recreates the unbounded-backlog defect SD-ALTIFYAI-LEO-FIX-SOLOMON-ADVICE-LEDGER-001 exists to close. Getting it wrong either way defeats the ledger's purpose.

## ADAM AUTONOMY OVERSIGHT & REPORTING DUTY — structural-root examples (FR-6 second pass)

The duty's Output clause routes a systemic-flag to Chairman/Adam when the drift's ROOT is structural rather than a one-off lapse — concretely: a conservative/draft policy doc that an agent can over-anchor on, or a decision-rights ambiguity. The deeper fix in either case is making the decision-rights doctrine the single queryable SSOT at the point of escalation, rather than relying on the agent to consult it correctly each time.

## DRIVE-SCORE DIAGNOSIS — ratification-question example (FR-6 second pass)

Example of a lever that is itself a ratification question rather than an execution gap: `leg4_capacity`'s TIGHT-only earning rule — the fix there is a policy change only the chairman can ratify, not a task Adam can simply source and build.

## Chairman-interactive-Fable preemption — origin incident (FR-6 second pass)

The "fleet is one account, his live use preempts everything" priority in the P1 preemption ladder traces to the original "pull back Fable" incident that motivated absolute-priority treatment for chairman-interactive use; the rule exists specifically so that incident class never recurs.


---

*Generated from database: 2026-08-23*
*Protocol Version: 4.4.1*
*Source of truth: leo_protocol_sections (section_type=solomon_provenance). Do not hand-edit — edit the DB section and regenerate.*
