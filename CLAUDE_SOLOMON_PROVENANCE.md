<!-- file_content_hash: f4870483e0a6dd32 -->
<!-- GENERATED FILE - DO NOT EDIT DIRECTLY. Source of truth: leo_protocol_sections (DB). Regenerate: node scripts/generate-claude-md-from-db.js. Drift check: node scripts/check-claude-md-drift.cjs -->
# CLAUDE_SOLOMON_PROVENANCE.md — Solomon Provenance (dated rationale)

**Generated**: 2026-09-03 9:14:48 AM
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

## Triangulation Audit — origin (2026-08-30)

The recurring self-analytics process was commissioned by the chairman after the 2026-08-30 worker-efficiency triangulation (in his words: "this self-analytics is super powerful for self-improvement, and I would love to see more of it"). Solomon's design (advisory 611d2338) was adopted verbatim "adopt" (~16:51Z, ratification captured by the Adam scribe seat) with the chairman's amendment — four mandatory outputs, added after he had to ask for recommendations that the first pass ended without ("a cycle that ends at findings reads as unfinished"). Area G (Adam board & roadmap discipline) plus the dual monitor/audit architecture were ratified separately, verbatim "I agree, let's do both" — `chairman_ratifications` ac70b897-9de3-44ab-a543-32e222d1215c (17:02:28Z, scribe solomon).

**Why both mechanisms, not one**: the 6h probe is the fast monitor (hours-latency, near-zero cost); area G is the deep measure whose triangulated instruments also audit the monitor itself. A probe that decays into reading a name instead of the thing is precisely what a same-instrument check cannot catch — 2026-08-30 alone produced four instances of gauges measuring something other than what their names claimed (claimableWithVerify, last_state, Solomon's WARN line, the self-adherence rubric's 904/1000 state-as-verdict rows).

**Founding specimens** the rules encode: the resolver ruling against himself (Adam's A5 token-denominator claim vs the empty `context_usage_log` schema — QF-20260830-792); the unmeasurable-discrepancy rule (the missing per-seat token denominator becoming its own action item); the correlation-disclosure rule (the coordinator disclosing he saw Solomon's S3 framing before answering, which preserved rather than voided the audit); the shared-premise lesson (message-wake-works-regardless-of-band, priced into A9 by two seats, contradicted by two directives failing to wake a 3600s-parked seat).

**Live position at encode time**: cycle 1 = the 2026-08-30 worker-efficiency triangulation (resolved by Adam; first re-measure Monday 2026-09-07, area A — the moved-the-number metric's first real reading). Cycle 2 = area C gauge honesty (chairman-injected 2026-08-30, coordinator resolves). Solomon resolves cycle 3. Board baseline at ratification: 10 items, oldest 12 days, groomed to 2 open + 1 blocked.

---

## Moved verbatim from the Solomon Role Contract (section 611) — split 2026-09-01, Solomon ruling 1dfd49bd, scribe Adam 673db833. Dated rationale, origins and encode bookkeeping. Additive-only; each origin site in the contract carries a pointer to the heading below.

### Failure classes — grounding-completeness, autonomy oversight, ratification-capture

**Failure class (named from the originating incident)**: Adam produced venture-1's S16 financial assumptions using generic early-stage-SaaS defaults that directly contradicted EHG's core founding thesis; the Chairman had to catch it manually. That manual catch is the work this duty makes automatic. *(full incident: provenance)*

**Failure class (named from the originating incident)**: Adam stopped an autonomous overnight run to email the Chairman to approve an additive, reversible migration — costing ~4h of foundation-idle; the Chairman had to correct it by hand. That manual catch is the work this duty makes automatic. The drift is **bi-directional**: **OVER-escalation** (stopping the run / confirm-fishing in chat / surfacing or emailing a decision Adam was empowered to make / anchoring on a conservative-or-draft policy over a standing directive) AND **UNDER-escalation** (acting autonomously on a matter that genuinely IS chairman-only). *(full incident: provenance)*

**Failure class (named from the originating incident)**: the 2026-08-21 UAT-into-stages ratification slipped pre-ledger — nobody captured it, so no staleness gauge ever had a row to go stale on (CANT-OBSERVE class). Chairman's own framing: "I wonder if we can add something in Solomon's review of Adam to look for these kinds of things."

### The September 7 preregistered reading (encoded 2026-08-30, ratification 09f14b64)

Chairman ruling (~21:3xZ 2026-08-30): the candidate decision ACCEPTED with both Solomon modifications and six binding clarifications. Solomon OWNS the reading design. Duties encoded:

- **Preregistration is frozen and countersigned** (Adam, 21:3xZ): M1 per-venture net stage delta with the v2-backing qualification (an advance unbacked by a verified `uat_test_runs` row counts ZERO); M2 genuine stage-24+ arrivals/month, trailing 60d, plus days-since-last; M3 the composition query frozen as EXECUTABLE TEXT at `.artifacts/PREREG-M3-composition-frozen-20260830.mjs` (lower(trim(target_application)); harness set exactly {ehg_engineer}, null/empty → venture; created_at anchor = work-started; item count = attention-events proxy; coordinator = on-request executor pasting output with its own wall clock; registration baseline 934/89.7%/10.3%). No measure or interpretation changes after seeing results; no composite score; conclusions only as far as preregistered evidence supports; inconclusive ⇒ STOP and return to the chairman with evidence/counterevidence/inferences/unknowns — never auto-extend.

- **Five early-return triggers live** (report-and-chairman-review ONLY; evaluate by observable behavior, never inferred motive): (i) evidence fabrication; (ii) one defect class recurring twice after its fix; (iii) the metric gamed (criteria edited so numbers move without outcomes); (iv) a silent-loss channel on any hop carrying CHAIRMAN-originated or chairman-bound content — content class, not hop owner; deliberately no wider (fleet-internal losses stay in the repair lane); (v) composition all-harness for 5+ consecutive non-campaign days — instrument: the M3 tables day-grouped on request; campaign-day classification currently has NO instrument and must be declared in the record when invoked.

- **Boundary clarification, chairman-adopted verbatim**: defects found during normal operations ARE normal operations — repair authority unchanged in both directions; the inquiry constraint forbids machinery created BECAUSE of it, never repairs discovered during it.

### Triangulation Audit — provenance

**Provenance**: adopted by the chairman ("adopt", ~16:51Z 2026-08-30); area G + the dual monitor/audit architecture ratified "I agree, let's do both" — `chairman_ratifications` **ac70b897-9de3-44ab-a543-32e222d1215c**. Rationale, history and live position: CLAUDE_SOLOMON_PROVENANCE.md § "Triangulation Audit — origin". Coordinator twin: section 657.

### Cross-review duty — origin

Origin: Adam measured that ZERO Solomon-to-Adam adherence-review rows had ever existed — every adherence record in the system was a self-review (attestation-grades-itself at the org level, the B1 class). The chairman ratified Solomon's recommendation verbatim ("I agree with your recommendation").

(measured 2026-08-31: it wrote none — the only seat whose self-audit silence was unobservable)

Adam encodes the Adam-reviews-coordinator and coordinator-reviews-Solomon legs.

### R1 registry — cross-refs, encode split

Cross-refs: R2 executing via SD-LEO-FIX-GHA-CRON-LIVENESS-001; registry premise = 2026-08-31's measured writer/reader splits (self-stamped liveness fossil, strip-the-column census: 4 live bridges, level-triggered metrics flood). Encode split per abb993a1: Adam scribed adam+protocol (section 601, commit 605e656cbd7); coordinator encodes his clauses (R3/R6/R8).

### Candidate-decision acceptance (09f14b64) — encode split

Encode split: Solomon share encoded first (this entry); Adam (scribe) + coordinator shares owed under the same ratification. Identity minting, UAT prep, defect repair, and venture operations continue uninterrupted per the ruling's own closing clause.

### Weekly review cadence (a236d122) — lead-in, encode split

Chairman ratified the review-cadence recommendation after Weekly Deep Review #1 ('I like Solomons weekly review'):

Encode split: Solomon share = this entry; Adam share = section 601.

### P1a rung-4 park (QF-20260727-923) — cost narrative

Decided on cost alone: promoting the scorer would spend a scheduled runner, new compute, and a new failure surface on ranking for Mode-B, the self-directed lane — an investment that stands regardless of hit-rate. *(Full measurement basis: provenance.)*

`scripts/fable-suitability/dry-run.mjs` header updated to PARKED, pointing here.

### Board-check cadence (3-hourly) — chairman verbatim

Chairman verbatim: "I think 6 hours is too long. I want to change it to every 3 hours."

### Operating posture — trigger (Fable-on-Max permanent, 2026-07-20)

**Trigger**: Anthropic made Fable-on-Max PERMANENT (50% weekly, effective 2026-07-20). The origin constraint of the episodic/rarely-invoked posture — Fable scarcity — is repealed; what must survive is the signal discipline, which was never about cost.

### SMS-QC probe — adoption trail and encode status

, Solomon-adopted 2026-08-25T00:14:44Z via sms_outbound_obligations b1f24fab, chairman-confirmed 00:16:04Z

(i)/(iii)/(iv)/(v) are in CLAUDE_ADAM.md's SMS channel duty (5g/5i); (ii)/(vi) are chairman-ratified but not yet textually encoded there -- follow-on flagged (SD-LEO-DOC-ENCODE-SMS-FACET-001).

### Daily duty-firing audit (7ec412a7) — rationale

Rationale: send-verification and board predicates cannot see omissions — a duty that silently fails to fire leaves no send to verify (the recite-but-not-perform class, two live specimens 2026-08-31).

### Scope and duties — Fable-backlog origin

Grounded in the **Fable backlog** — fifteen deferred use-cases the Chairman filed under the Todoist parent "Fable Use cases."

## Decision-requested — why no automatic signal suffices

(Moved here from 611 DECISION_REQUESTED DISCIPLINE on 2026-09-03 for single-Read headroom; the clause's pointer to this file stands per FR-6.) Why no automatic signal suffices, and the failure modes of getting this wrong: `CLAUDE_SOLOMON_PROVENANCE.md` per FR-6.

## Root-cause discipline on the oracle seat (ratification ee4930ae, 2026-09-02 13:29Z)

Verbatim: "Solomon, moving forward, if you see any issues, please determine the root cause and don't just simply try to work around the root cause." Context: spoken minutes after the belt-empty RCA (feedback 9d8d34b3) showed three prior fixes that worked around the mint-time root, on a day Solomon routed around four tooling frictions (backpressure parks, reply-to refusals, amend dedup, a hold release blind to eligibility) instead of naming their roots. Sibling of b1055808 (the same order to Adam, 13:03Z); encoded once in one PR per c44cd9d8. Marker in 611: ROOT-CAUSE DISCIPLINE ON THE ORACLE SEAT (chairman standing order 2026-09-02).

### Provenance moved out of the Solomon role contract (2026-09-03 headroom cut)

Moved from section 611 on 2026-09-03 to free single-read headroom, nominated by Solomon (row 03c99caa) as history rather than operative rule. Verbatim, not paraphrased.

- **L1 first frozen-predicate reading** — First frozen-predicate reading (22:1xZ 2026-08-30): open=2, blocked=3, programs=30, mechanical=660 — reconciles with the 17:xxZ groom (open exactly matches; blocked residual 3-vs-1 reported to the binder, not explained away).
- **L2a authority provenance** — (authority: chairman SMS 01:38Z 2026-08-22 + in-session affirmation)
- **L2b sealed debate ref** — (sealed debate 04:3xZ 2026-08-22)
- **L2d1 cadence contrast** — (not the Mode-B sweep cadence the GROUNDING-COMPLETENESS and AUTONOMY OVERSIGHT duties use when reading the Chairman-SMS-lane source clause above)
- **L3 rationale clause** — — the inverse framing is precisely the gauge-honesty failure this resolution exists to prevent.
- **L2e verbatim label-rule quote (replaced in place by its operative line)** — ratified rule: "Any claim relayed to the chairman by any role carries a label, MEASURED with the instrument named, or INHERITED with the originating role and row named. An inherited claim that reaches the chairman unlabelled is a miss, corrected to him in the next line. This extends the first-use shape-probe rule (ratification a236d122) from numbers to claims.


---

*Generated from database: 2026-09-03*
*Protocol Version: 4.4.1*
*Source of truth: leo_protocol_sections (section_type=solomon_provenance). Do not hand-edit — edit the DB section and regenerate.*
