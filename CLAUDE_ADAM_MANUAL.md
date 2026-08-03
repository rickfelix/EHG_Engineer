<!-- file_content_hash: c0ef00343b7d36a4 -->
<!-- GENERATED FILE - DO NOT EDIT DIRECTLY. Source of truth: leo_protocol_sections (DB). Regenerate: node scripts/generate-claude-md-from-db.js. Drift check: node scripts/check-claude-md-drift.cjs -->
# CLAUDE_ADAM_MANUAL.md — Adam Manual (how-to companion)

**Generated**: 2026-08-03 9:53:35 AM
**Protocol**: LEO 4.4.1
**Purpose**: How-to procedures lifted out of the role contract — SD creation field shapes, migration ceremony steps, gauge inputs
**Load when**: At the MOMENT OF DOING the procedure — not at session start

> This companion carries PROCEDURE. The RULES that govern these procedures stay in CLAUDE_ADAM.md and are in force whether or not this file is read.

---

## Adam Manual — how-to procedures (companion)

# CLAUDE_ADAM_MANUAL.md — Adam Operating Manual

**Purpose**: The HOW. Field shapes, step sequences, and duty procedures that operationalize the
duties named in `CLAUDE_ADAM.md`.
**Load when**: At the MOMENT OF DOING the thing — not at session start.

> This file is a COMPANION, not the contract. Every OBLIGATION lives in `CLAUDE_ADAM.md` and is in
> force whether or not this manual is read. If you find a rule here that is not stated in the
> contract, that is a DEFECT in the split — the rule belongs in the contract. Four such rules were
> lifted back into the contract (section 5r) when this manual was extracted, including the
> chairman-directed DECOMPOSE-WEAKEST-LAYER classify-before-sourcing rule.
>
> **PRECEDENCE.** Where this manual RESTATES a rule for narrative context, the contract's wording
> GOVERNS and this restatement is context only. Restating a rule in two files creates a drift
> surface — the same defect class as copying the shared partnership row instead of including it:
> identical on landing day, divergent the first time one side is edited. If the two ever disagree,
> the contract is right and this file is stale.

---
This section OPERATIONALIZES the duties NAMED in the Adam Role Contract above — it teaches the HOW so a freshly-engaged Adam can act with zero trial-and-error. Per the chairman keystone (2026-06-13): a LEO role is reliable because its required-reading contract CONTAINS the how-to, not merely names the duty. The canonical scripts cited below are AUTHORITATIVE — if they change, re-verify this section against them rather than letting it drift.

### A. SD creation — the canonical HOW-TO

Every SD Adam sources is created through ONE canonical path. NEVER hand-insert into `strategic_directives_v2`, and NEVER call `scripts/leo-create-sd.js` directly — the `ENF-SD-CREATE-SKILL` hook blocks direct calls.

**Create path:** the `/sd-create` skill (it sets `SD_CREATE_VIA_SKILL=1` and delegates to `scripts/leo-create-sd.js`). Pick the mode that matches the signal so provenance is wired for you:
- *interactive* — `/sd-create` runs the vision-readiness rubric (Step 0), then prompts.
- `--from-plan <path>` — materialize an EVA/architecture plan (vision-rubric EXEMPT; an explicit `## Type` header in the plan overrides type inference).
- `--from-proposal <path|glob>` — materialize sourced proposal rows verbatim (uses the proposed_sd_key).
- `--from-feedback <id>` / `--from-uat <test-id>` / `--from-learn <pattern-id>` / `--from-qf <id>` — convert a feedback / UAT / learning / quick-fix signal (all vision-rubric EXEMPT; `--from-feedback` links `feedback.strategic_directive_id`, `--from-qf` escalates the quick-fix).
- `--child <parent-key> <index>` — a decomposition child (inherits category + strategic_objectives + key_principles; NOT success_metrics — each child owns its targets).

**Required (NOT-NULL) fields** `createSD()` writes: `sdKey` (generated via sd-key-generator.js — never hand-craft it), `title`, `description`, `type` (a canonical sd_type), `priority` (default `medium`). Gate-relevant arrays get safe defaults if omitted, but supply REAL ones.

**The JSONB field shapes (get these right; the LEAD gates score them):**
- `success_criteria`: array of `{criterion, measure}` — what must be true + how it is measured. *(Shape enforced by `scripts/modules/sd-quality-scoring.js` STRUCTURAL_RULES.)*
- `key_changes`: array of `{change, impact}` — the change + its effect. It is `{change, impact}` — NOT `{change, type}`. *(Shape enforced by STRUCTURAL_RULES.)*
- `success_metrics`: array of `{metric, target}` — supply **3+** (the `buildDefaultSuccessMetrics` convention in leo-create-sd.js; STRUCTURAL_RULES does NOT shape-check this field).
- `strategic_objectives`: array of `{objective, metric}` — supply **2+** (the `sd-objectives-validator` handoff gate scores 2+ as full marks, 1 as a warning, 0 as an issue; the create-time defaults may emit plain strings, while the `--from-plan` parser emits `{objective, metric}`).
- `smoke_test_steps`: array of `{instruction, expected_outcome}` (+ `step_number`) — concrete and OBSERVABLE; never the generic auto-placeholder (the LEAD-TO-PLAN `SMOKE_TEST_SPECIFICATION` gate rejects placeholders).

PROVENANCE (so a verifier checking this section finds the right source): ONLY `success_criteria` and `key_changes` are shape-checked by `sd-quality-scoring.js` STRUCTURAL_RULES. The other field shapes/counts come from the leo-create-sd.js default builders + specific handoff gate validators (`sd-objectives-validator`, the `SMOKE_TEST_SPECIFICATION` gate). `isPopulated` in sd-quality-scoring.js only checks a non-empty array — it does not enforce the 3+/2+ counts.

**Type selection + the type-inference HAZARD:** if you let the title infer the type, `scripts/modules/plan-parser.js` `inferSDType()` matches keywords IN ORDER and the standalone-word `/\\bfix\\b/` matches BEFORE `infrastructure` — so a title like "infrastructure fix …" mis-infers as **bugfix** (a lower-rigor tier). CORRECT it by setting the type explicitly: an explicit `## Type` header in a plan (`extractExplicitType` overrides inference) or by passing the type to the skill. The DB-type mapping is `mapToDbType` (leo-create-sd.js): `infra`->`infrastructure`, `doc`->`documentation`, `docs`->`docs` (already canonical — passes through, NOT `documentation`), `qa`/`testing`->`infrastructure`, `feat`->`feature`, `fix`->`bugfix`, `orch`->`orchestrator`; an unknown type FAILS LOUD via `assertValidSdType` (never a silent default). (Note: a separate `normalizeTypeForVentureCheck` maps `docs`->`documentation`, but that is ONLY for the venture-prefix membership check — it does NOT set the stored sd_type.) The canonical enum is `lib/sd-type-enum.js`.

**Division of labor with CLAUDE_LEAD.md (no drift):** the SD-creation FIELDS + shapes live HERE; the gate THRESHOLDS and phase semantics (what LEAD-TO-PLAN validates, the per-type quality bar, the handoff pipeline) are CLAUDE_LEAD.md's domain — defer to it rather than restating, so the two never diverge.

### B. The CONVERSION duty (signal -> well-formed DRAFT SD)

`D1_proactive_sourcing` (above) is not "have ideas" — it is CONVERT a sourced signal into a claimable, correctly-shaped DRAFT SD. Procedure, per item:

> **Route the SSOT FIRST (order of operations).** Before converting, follow **SOURCING SSOT — order of operations** (the subsection above / CLAUDE_ADAM.md): Roadmap-as-SSOT → Wave-0 distillation → check+propose engine-flag activation → hand-mining the VDR gauge only as LAST-RESORT. The live state of each layer prints every `/adam` startup (SOURCING SSOT STATE probe). D1 credit is for routing the SSOT, not for substituting yourself for a dormant engine. (SD-LEO-INFRA-ADAM-SOURCE-FROM-SSOT-CONTRACT-001 FR-3)
1. **Pass THE SOURCING BAR** (the two ordered questions in the contract above — *Is it real?* (live-evidence-verified premise) first, then the alignment/worth question). Verify the premise against LIVE evidence (DB / code / status) — never assert causation off a stale read.
2. **Choose the source MODE (§A)** that matches the signal — a feedback row -> `--from-feedback`, a plan -> `--from-plan`, a decomposition -> `--child`. The mode wires the provenance; do not hand-recreate it.
3. **Set the type correctly** (§A hazard) and let the skill generate the `sdKey`.
4. **Supply real `success_criteria` / `key_changes` / `success_metrics`** in the shapes above — the defaults are a floor, not a substitute.
5. **Dedup before filing** — the belt must stay deduped (a D1 signal). If it is a variant of an existing draft, note the variant rather than duplicate.
The result is a DRAFT SD that enters the belt correctly-typed, correctly-keyed, and provenance-wired — ready for LEAD without rework.

**DECOMPOSE-WEAKEST-LAYER — parallelize sourcing across the whole weak layer, sized to idle capacity (chairman directive 2026-06-16).** When the VDR build-% gauge's **weakest LAYER** holds N weak (unbuilt/partial) capabilities — e.g. the application/cockpit layer with ~7 — do **not** source one monolithic SD for the belt-low cycle. Instead source up to **N parallel** design/spec SDs, **one per capability**, each a distinct **conflict-free write-surface**, right-sized (a Phase-0 design/spec pass, not a build) — and cap the count at the coordinator's stated **live idle-worker capacity** (the SOURCE-TO-CAPACITY handshake in the coordinator contract). This keeps the whole weak layer moving in parallel, one-capability-per-worker, instead of serializing it behind a single SD.

**CLASSIFY each weak capability BEFORE sourcing it (Adam board-of-directors verdict 2026-06-16) — do NOT blindly source 1 design SD per capability.** A live-grounded board pass found the naive "one tile per capability" framing can yield ZERO valid SDs. For EACH weak capability, classify it FIRST: (a) **genuine leaf** → a Phase-0 design/spec SD (the default above); (b) **foundation / data-contract** — an upstream target-of-record that build SDs depend on (e.g. an ord-11 north-star contract) → **sequence it AHEAD of the builds it gates**, not as a parallel tile; (c) **already-built but reading low ONLY from a STALE/manual KR** (e.g. an ord-7 capability whose breakage-catch is live but the gauge reads ~0% off a manual KR) → a governed **KR RE-MEASURE / repoint-to-live-derivation**, NOT a new build SD; (d) **mis-bucketed** (wrong layer / registry entry) → a **registry fix**. Only (a) becomes a parallel design SD; (b)/(c)/(d) are different work — and the coordinator must VERIFY the per-capability gauge gap is REAL (not a stale-KR artifact) before dispatching.

### C. The BUILD-% GAUGE duty (THE VISIBLE GAUGE, above)

Adam's exec summaries carry numbers Adam must be able to RECONSTRUCT, not merely echo:
- **META-TO-PRODUCT RATIO** = harness/meta items (`SD-LEO-INFRA-*` / `SD-LEARN-FIX-*` / `SD-MAN-INFRA-*` / `QF-*`) filed+shipped vs product/venture items, over the window. Per THE TAPER RULE (above) it must DECLINE as the solo-operator stability bar approaches — a ratio rising near launch-readiness is the cue to taper meta-sourcing.
- **VISION BUILD-%** = the auto-computed, auditable gauge from the Vision Denominator Registry (`lib/vision/vdr-registry.js` + `vdr-probes.js`): it parses the EHG-VISION.md capability/gap table into typed probes and reports a 4-state, **unknowns-EXCLUDED** percentage. It DEFAULTS TO HONEST — could-not-measure != zero, presence != realized, a tracking-row != built — so read it as "what we can prove is built", never a vanity number.
- **DISTANCE-TO-QUIT** = current monthly venture net vs the chairman quit-threshold (read from `SD-LEO-ORCH-ADAM-PLAN-KEEPER-001` `metadata.chairman_amendment_2026_06_11_income_replacement`).
The exec-summary tooling computes these; Adam's duty is to know the INPUTS so a wrong number is caught, not echoed.

### D. ESCALATION (the grade -> action -> verify loop, above)

Escalation is the exit valve of the self-assessment loop, not a panic button:
- **Trigger**: a rubric dimension stays BELOW threshold for **N=3 consecutive** self-score cycles DESPITE committed actions, OR a red-flag cluster (a below-threshold dimension + a recurring root cause). A single bad cycle is a learning curve — escalate the TREND, not the blip.
- **Who**: Adam initiates. Adam raises the bar (second opinion, chairman-lens canary); the coordinator stays 100% accountable for the work.
- **What / How**: surface it on the DURABLE channel first (an advisory row / the exec summary), naming the dimension, the 3-cycle evidence, and the specific ask. Reserve the chairman phone-notify (`notifyChairman`, `lib/integrations/todoist/chairman-notify.js`) for genuinely urgent, decision-required items — use it sparingly.

### E. LEAD-FLOW (keep sourced vision work moving through the LEAD gate)

Sourcing is not finished when a candidate clears the bar — it is finished when the work is a **DRAFT SD on the belt** (SD-LEO-INFRA-ADAM-VISION-SD-FLOW-001):
- **Materialize, do not advise**: a bar-clearing candidate is created as a DRAFT SD via the canonical conversion path `node scripts/leo-create-sd.js --from-proposal` (or the DB-direct `--proposal-b64` / `--proposal-stdin` forms), NOT left as an advisory `session_coordination` INFO row the coordinator must hand-convert. The legacy `sd_proposals -> fn_create_sd_from_proposal` bridge is **deprecated** (0 rows, no autonomous caller) — `--from-proposal` is canonical.
- **Advancement**: a DRAFT SD advances through the per-SD LEAD Pre-Approval Gate when **any self-claiming worker** runs `node scripts/handoff.js execute LEAD-TO-PLAN <key>`, ordered by the coordinator's `metadata.dispatch_rank` — there is no dedicated "LEAD-role" worker. Adam-sourced vision-loop drafts (`metadata.source='proposal'` + a `roadmap_phase`) get a dispatch-rank nudge so the gauge-driven / weakest-capability work reaches a worker sooner (`scripts/coordinator-backlog-rank.mjs`).
- **Escalation (the dispatch gap)**: a scored, UNCLAIMED Adam vision draft that ages at `current_phase='LEAD'` past the threshold is surfaced by the coordinator charter-audit **DUTY-9 LEAD-AGING** detector (`lib/coordinator/lead-aging-detector.mjs`) with a re-rank/dispatch remediation — so a sourced draft never parks indefinitely between "Adam sourced it" and "a worker advanced it". It is DISJOINT from DUTY-7 (unscored silent-stall) and DUTY-8 (claimed progress-stall).

### Decision Rubric — Execute vs Escalate (canonical 3-gate)

Before ANY chairman-ask, Adam runs the deterministic 3-gate classifier (canonical impl: `lib/adam/execute-vs-escalate.js` `classifyDecision`; SD-LEO-INFRA-ADAM-EXECUTE-VS-ESCALATE-CLASSIFIER-001):

> **EXECUTE-AND-REPORT iff (reversible AND in-role AND NOT flagship/governance/data-loss); otherwise ESCALATE to the chairman.**

- **Gate 1 — reversible**: the action can be cleanly undone. CONSERVATIVE: if reversibility is UNCERTAIN, treat it as NOT reversible → escalate.
- **Gate 2 — in-role**: the decision is within Adam’s standing authority (CONST-002 propose-only). Uncertain role → escalate.
- **Gate 3 — NOT flagship / governance / data-loss**: not a flagship/irreversible venture op, not new strategy/policy or a reserved kill/major gate or a ratified-decision deviation, and not a destructive/data-loss mutation. Any of these → escalate.

It guards two opposed failure modes, both probed by the self-adherence review (`scripts/adam-self-adherence-review.mjs`, probe `decision_rubric`): **over-ask** (Adam asked when the rubric says execute) and **under-escalate** (Adam executed when the rubric says escalate). The over-ask text-classifier (`classifyDecisionQuestion`) routes its verdict through `classifyDecision` so the 3-gate rubric is the single authority.


---

*Generated from database: 2026-08-03*
*Protocol Version: 4.4.1*
*Source of truth: leo_protocol_sections (section_type=adam_manual). Do not hand-edit — edit the DB section and regenerate.*
