# Operating-Company Satellite Layer — Unified Architecture Pass v1

**Status:** Solomon-authored (Fable 5 / high, 2026-07-11 evening), propose-only (CONST-002). Chairman-ratified commission (~5:40 PM ET, relayed by Adam, row `20f92688`): build ALL satellites this weekend, overriding the 07-10 build-when-needed gate — *"the cleanest architecture and everything works well together,"* one design mind in one window.
**Provenance:** this doc RE-DERIVES and SUPERSEDES the satellite-layer docs destroyed in the 2026-07-11 evening untracked-file loss (`operating-company-spine-spec.md`, `crm-pipeline-operational-satellite-spec.md`, `fw3-effort-distribution-tier-design.md`, `fable-suitability-map-v1.md`, `visual-video-generation-satellite-spec.md`). The spine frame and FW-3 content are re-stated from their chairman-ratified adjudication summaries (high fidelity); the video satellite is a FRESH design (no summary of the lost original survives — flagged low-fidelity to the original, not to the need). S20-26 run evidence (run `s2026-bravo-0711`, Solomon adjudication advisories `9b55e2a6`/`ba95ac45`) is folded throughout — the lost 07-10 versions predated it.
**Fidelity ledger:** spine frame HIGH (ratified §-level summary), CRM fold HIGH (ratified fold memo), effort-distribution HIGH (ratified 4-correction summary), suitability appendix MEDIUM (tier structure + receipts re-derived), video satellite FRESH.

---

## §1 — The spine frame (the contract every satellite consumes; re-derived)

**Org model (one line):** EVA is chief-of-staff (meeting surface, roll-ups, attention items); one AI CEO per venture owns thesis + gauges + iterate-or-kill; VPs instantiate on demand; the chairman governs by exception through the EVA meeting surface.

**The six spine families** (each born from a named this-week failure class; the spine principle: **nothing in the org layer may be fail-open, ungauged, or unowned**):
- **§1 STRUCTURAL (authority):** role registry; **born-denied authority** (dispatch-eligibility polarity lesson — new roles/agents start with NO authority and are granted, never the inverse); **enforced-writer-identity on approval records** (the forged synthetic chairman-approval class: a machine may never write a row asserting human approval — write-time rejection, not audit-time detection).
- **§2 OPERATIONAL (activities & triggers):** every recurring activity has an owner + a required artifact; directives are **hard interrupts** (read_at ≠ processed); the EVA meeting surface renders **provenance-reached data only** (O4 — NO-DATA over fabricated values).
- **§3 ECONOMIC:** spend envelopes + cost attribution per role/venture (`venture_token_ledger` is the live substrate); **every role declares an explicit objective function WITH a paired anti-Goodhart guard-gauge** (§3.3); EVA optimizes chairman-attention-EFFICIENCY, never escalation-minimization (govern-by-exception must not degrade to govern-by-absence).
- **§4 EPISTEMIC:** institutional grounding is **injected at the point of analysis**, not remembered (the Adam-grounding class); role-keyed memory/disposition state **survives succession**; role-liveness gauges; the learning-moat claim must be **falsifiable** (→ Satellite 3).
- **§5 GOVERNANCE:** a **typed exception model** with tiered routing (§5.1): routine events self-serve at venture-CEO tier; ONLY the bounded `only-the-chairman-can` set escalates to the human; generalized disposition audit (everything surfaced gets a recorded disposition — the 161-row resurface-drain lesson); **earned autonomy** (autonomy grants widen on demonstrated calibration, the Adam-autonomy-report mechanism); owned vigilance (→ Satellite 5).
- **§6 LIFECYCLE:** role contracts + evaluation + **succession-against-live-state** (no ghost CEOs — a CEO row without a live evaluable agent is a named defect); feedback loops are loss-proof (disposition-stamped, not consumed-silently).

**§8 Satellite registry + the consume-not-rebuild rule (ratified 07-10):** satellites CONSUME spine §1 roles, §5.1 exception routing, §3.3 objective functions — never re-derive them. A satellite that re-implements governance is a named architecture defect (the pipeline-platform v2 lesson: ~70% of its "governance" was already the spine).

**Spine build shape:** the spine itself was never built (GATE-A contemplated "minimal stub"). Under the build-all ratification: **ONE spine-substrate SD ships first** — thin tables for role registry (+authority grants), typed exception ledger, and the objective/guard-gauge registry. Everything else in §1–§6 already has live substrate (see §2 mapping) — the stub is deliberately small (≈3 tables + 2 services), because the satellites are where the value lands.

---

## §2 — Shared substrate (what ALL satellites consume vs. own — the "cleanest architecture" core)

| # | Substrate | Provider (live today unless noted) | Satellites consume it for |
|---|-----------|-------------------------------------|---------------------------|
| S-1 | Identity/roles + authority grants | spine stub SD (NEW) | who may act; born-denied default |
| S-2 | Typed exception routing | spine stub SD (NEW); `only-the-chairman-can.md` as the human boundary | escalation ladders in every loop |
| S-3 | Objective + anti-Goodhart guard-gauge registry | spine stub SD (NEW); pattern proven by recursion-governor | each satellite's §3.3 pair |
| S-4 | Gauge substrate: provenance-REACHED, NO-DATA-never-fabricated, honest naming | `gauge-registry.js` + gauge-runner (LIVE); S20-26 F2 lesson: never report a mapping/coverage number as a success number | all satellite gauges |
| S-5 | Process ownership + liveness | `periodic_process_registry` + OPERATIVE-AGENT-OWNERSHIP-001 (IN EXEC — the P6 closure) | every recurring loop registers with an operative owner + escalation; `ACTIVATION_EVIDENCE_MODE=block` |
| S-6 | Events + comms | `system_events`; `session_coordination` with **typed kinds only** (untyped rows are silently skipped — today's wire lesson) | triggers, hand-offs, advisories |
| S-7 | Evidence durability | NEW RULE from today's three losses: run/audit artifacts are **run-keyed, teardown-exempt, and committed at creation** (never untracked in the shared tree) | all satellite audit/run outputs |
| S-8 | Artifact-type data contract | `venture_artifacts` CHECK enum — satellites MUST NOT hand-extend it; interim = one gated migration per batch, target = enum-to-lookup-FK (verification-plan-first; 3 drift instances today) | any satellite writing venture artifacts |

**Conflict-free write surfaces (parallel-build contract):** each satellite owns its own tables (prefixed below) and its own `lib/<satellite>/` + `scripts/<satellite>/` paths; writes to SHARED surfaces (ventures, venture_artifacts, exception ledger) go through spine services only. No two satellites share a migration file. This is what lets the fleet build all seven concurrently without merge collisions.

---

## §3 — The seven satellites

Format per satellite: PURPOSE / CONSUMES / OWNS / INTERFACES / OBJECTIVE+GUARD / RUN-EVIDENCE / BUILD SHAPE / ACCEPTANCE (mock-distinguishing witness).

### 3.1 Pipeline/CRM (the ratified §8 first satellite — fold, unchanged in substance)
- **PURPOSE:** the spine's operational layer instantiated for customer relationships.
- **CONSUMES:** S-1 roles, S-2 routing (routine pipeline events self-serve at CEO tier), S-3 objectives (the v2 brief's §12 duplicate is deleted — consume, don't re-derive).
- **OWNS:** `crm_contacts`/`crm_orgs` identity graph (identity-shared, access-venture-scoped); a **branching/high-cardinality transition engine that is a SIBLING of `fn_advance_venture_stage`, never a generalization** (the linear from+1 trap, re-confirmed by today's run: the artifact-gate trigger is welded to linear stage semantics — generalizing it would have broken both).
- **INTERFACES:** in = demand-engine MEASURE events (funnel), venture telemetry; out = pipeline state to the EVA meeting surface.
- **OBJECTIVE+GUARD:** objective = qualified-pipeline-value per venture; guard = no-stage-skipping + stranger-provenance (a pipeline row must trace to a real inbound event, never LLM-synthesized "leads" — the honest-gauge rule applied to CRM).
- **RUN-EVIDENCE:** O6 attribution CANNOT-DRIVE finding → the funnel's revenue edge must consume the Stripe-ledger attribution rail, never app claims.
- **BUILD SHAPE:** ONE SD (per the ratified fold). The 07-10 gates (GATE-A spine exists / GATE-B live demand-thesis hydration) are now satisfied by sequencing: spine stub ships first; hydration binds to the fresh-start venture's narrowed thesis. Schema-as-data stays DEFERRED (YAGNI-gated on a 2nd venture).
- **ACCEPTANCE:** a synthetic stranger event traverses inbound→contact→pipeline-stage→attribution with every hop provenance-stamped; a hand-inserted "lead" with no inbound provenance is REJECTED at write time.

### 3.2 Visual/video-generation (FRESH design — lost original had no surviving summary)
- **PURPOSE:** creative production as a shared SERVICE: layered hero images, brand assets, short-form video for venture landing pages and demand-engine channel execution. Chairman taste is standing input (parallax + micro-animations near-default; AI-generated layered hero images; the 137-site Awwwards `design_reference_library` as the style corpus).
- **CONSUMES:** S-4 gauges; demand engine EXECUTE rail (assets are channel INPUTS); venture-hosting standard (Gemini `gemini-2.5-flash-image` via raw fetch is the ratified image path); S17 design-system artifacts as brand source.
- **OWNS:** `creative_assets` table (venture-scoped, provenance = generator + prompt + brand-source refs); `lib/creative/` generation service; a per-venture creative-brief seam VP_GROWTH invokes.
- **INTERFACES:** in = venture brand guidelines (S17 artifacts) + channel plan (Stage-21 rebuilt); out = assets referenced by `distribution_channel_config` rows.
- **OBJECTIVE+GUARD:** objective = channel-action coverage (every EXECUTE-rail channel step has its required assets); guard = **artifact-theater detection** (O3: an asset that drives no channel action within its plan window is flagged, not counted — assets are execution inputs, never deliverables).
- **RUN-EVIDENCE:** O3's artifact-theater prediction stands un-refuted (marketing templates drove no channel action); this satellite exists to make creative REACH channels, not to make more artifacts.
- **BUILD SHAPE:** ONE SD, two FRs (generation service + theater-guard gauge). Video generation ships behind a capability-envelope flag (O9: a plan step requiring video fails at PLAN time until the video path is genuinely executable).
- **ACCEPTANCE:** a venture channel plan requiring a hero image gets one generated, referenced, and published to a preview surface end-to-end; a generated asset with no consuming channel step trips the theater gauge within one sweep.

### 3.3 Learning-speed
- **PURPOSE:** make "learning speed is the moat" FALSIFIABLE — measure it, and close the loop that feeds it.
- **CONSUMES:** the existing `/learn` → `issue_patterns` → auto-SD pipeline (P1 audit: genuinely closed-loop at SD level); S-4 gauges.
- **OWNS:** the **venture traversal-reflection writer** at `lib/eva/post-lifecycle-decisions.js:61-96` (+ per-stage at the `stage_completed` transition) — the P1 closure, already queued from the seven-principle audit: FOLD, do not duplicate. Plus the **learning-moat gauge**: time-from-defect-to-shipped-fix and lessons-per-traversal, trended across ventures (ApexNiche baseline = 0 mechanical lessons).
- **INTERFACES:** in = stage transitions, run journals, retros; out = `issue_patterns` (same pipeline), moat gauge to the EVA meeting surface.
- **OBJECTIVE+GUARD:** objective = falling median defect→fix latency; guard = lesson QUALITY floor (a traversal that emits zero-signal boilerplate lessons counts as 0, not 1 — no Goodharting the counter).
- **RUN-EVIDENCE:** the S20-26 run itself proved the gap — 59 findings-rich events and zero of it fed learning until a human routed it to adjudication.
- **BUILD SHAPE:** ONE small SD (the queued P1 closure) + one gauge FR. Cheapest satellite; highest mission alignment.
- **ACCEPTANCE:** complete a fixture traversal → a reflection row exists, pattern-matched into `issue_patterns`, and the moat gauge moves; a traversal with reflection disabled trips the loop-liveness check (S-5).

### 3.4 Capability-extraction
- **PURPOSE:** enforce the vision's dual mandate — every venture must DEPOSIT reusable capability, or it's "a business that teaches the system nothing."
- **CONSUMES:** Stage-0 capability envelope (R6) + the shipped envelope registration (`STAGE0-ENVELOPE-REGISTRATION-001`); the traversal-reflection seam (SHARED with 3.3 — one seam, two writers, explicitly sequenced in one SD pair to avoid write-surface conflict).
- **OWNS:** `capability_ledger` (capability, source venture, extraction evidence, reuse count); an extraction checklist evaluated at traversal completion and at kill/exit (O8's exit checklist consumes it).
- **INTERFACES:** in = venture artifacts + stage evidence; out = Stage-0 envelope (extracted capabilities widen what future ventures may claim at PLAN time).
- **OBJECTIVE+GUARD:** objective = reuse count of deposited capabilities; guard = extraction honesty (a "capability" with no second consumer within N ventures decays to reference, not asset — no trophy shelf).
- **RUN-EVIDENCE:** the run's CANNOT-DRIVE map IS negative capability data — surfaces the factory cannot drive are capabilities not yet deposited; the ledger should ingest that map directly.
- **BUILD SHAPE:** ONE small SD, sequenced immediately after 3.3's seam SD.
- **ACCEPTANCE:** a completed traversal writes ≥1 capability row with evidence, and the Stage-0 envelope query reflects it; a no-deposit traversal surfaces as an exception (typed, CEO-tier).

### 3.5 Vigilance
- **PURPOSE:** owned competitive watch — "a competitor's move is a signal to act."
- **CONSUMES:** the SURVIVING `competitive-vigilance-observed-baseline-design.md` (this satellite's greenfield already exists — audit-as-built posture applies, do NOT re-greenfield); S-5 ownership; S-2 routing.
- **OWNS:** observed-source watchers (the OBSERVED contract: every claim carries a fetched-source provenance — the Delta-ledger C11 lesson: an LLM recall presented as analysis is E0, and the dead monitoring chain is RETIRE-DON'T-REPAIR, never resurrect); vigilance observations, written via the existing `portfolio_evidence` substrate (`lib/org/evidence-fabric.mjs::writeEvidence`, evidence_kind=vigilance_observation) rather than a new `vigilance_observations` table — decided at EXEC-entry of SD-LEO-ORCH-OPERATING-COMPANY-SPINE-001-F once the already-RLS-locked, purpose-built fabric was found (its own docstring names this satellite as first intended consumer), eliminating a redundant chairman-gated migration; a reprioritization advisory loop → Adam sourcing (advice, never auto-reprioritization).
- **INTERFACES:** in = watched source set per venture thesis; out = typed advisories to Adam + a vigilance freshness gauge on the meeting surface.
- **OBJECTIVE+GUARD:** objective = observation freshness per watched thesis; guard = fetch-provenance rate = 100% (any unfetched claim renders NO-DATA).
- **RUN-EVIDENCE:** none direct (out of run scope); the W1 design item `COMPETITIVE-VIGILANCE-OBSERVED-DESIGN-001` is this satellite's Phase-0 — FOLD it in as FR-1 rather than a separate track.
- **BUILD SHAPE:** ONE SD implementing the existing observed-baseline design + the retire migration for the dead chain.
- **ACCEPTANCE:** a watched competitor page change produces an observation row with fetch provenance within one sweep; killing the fetcher renders the gauge NO-DATA (never a stale green).

### 3.6 Agent-lifecycle
- **PURPOSE:** the spine §6 family as machinery: role contracts, evaluation, succession, hibernation — no ghost CEOs.
- **CONSUMES:** S-5 (the P6 ownership regime IS this satellite's enforcement substrate); role-session machinery (registration, heartbeats, callsign authority); the venture-ceo-factory (`lib/agents/venture-ceo-factory.js` — BUILT, reachability UNVERIFIED).
- **OWNS:** the **§7 audit charge FIRST**: falsifiable reachability audit of venture-ceo-factory + venture-state-machine (seed-or-theater → BUILD-ON vs RETIRE verdict gates everything else here); then role contracts as data (contract, evaluation cadence, succession pointer), succession-against-live-state (a successor inherits role-keyed memory/disposition, not a cold start), hibernation states.
- **INTERFACES:** in = claude_sessions + factory runtime; out = role-liveness gauges; ghost-CEO exceptions (typed, escalates at governance tier).
- **OBJECTIVE+GUARD:** objective = 100% of active ventures have a live, evaluable CEO agent; guard = evaluation honesty (an evaluation that never scores below threshold across N cycles is itself flagged — the self-probe-misses-drift lesson from Adam's autonomy incident).
- **RUN-EVIDENCE:** the run drove stages through the stage-execution worker, NOT through venture CEOs — the org layer is currently decorative at run level; this satellite is what makes O5's "named loops with owners" real.
- **BUILD SHAPE:** TWO SDs — (a) the factory audit (small, verdict-shaped), (b) lifecycle machinery (sized after the verdict; RETIRE verdict shrinks it substantially).
- **ACCEPTANCE:** kill a CEO agent's session → ghost-CEO exception fires + succession completes with state intact; a stubbed CEO (no real evaluations) is caught mechanically, not by human review.
- **STATUS (2026-07-16):** both SDs shipped. (a) landed as the factory reachability audit (`docs/audits/venture-ceo-factory-reachability-verdict.json`, verdict=RETIRE — `commitStageTransition`/`verifyCeoAuthority` confirmed zero live callers). (b) shipped in the RETIRE-shrunk form the build shape predicted: `lib/agents/ghost-ceo-gauge.js` (SD-LEO-GEN-SATELLITE-AGENT-LIFECYCLE-001), wired into the shared invariant-gauges runner (`lib/governance/gauge-registry.js` id `ghost-ceo`), plus RETIREMENT NOTE documentation on the two dead-path functions. Full role-contracts-as-data/succession/hibernation machinery remains open for a future BUILD-ON decision if a CEO-agent runtime is ever revived.

### 3.7 Effort-distribution (FW-3 re-derived — the four ratified corrections preserved)
- **PURPOSE:** route problems across cognitive tiers (model × effort × abstraction) so deep problems never land on shallow calls and vice versa — the "as above, so below" staffing dimension of the spine.
- **THE FOUR RATIFIED CORRECTIONS (from the adversarial 5-lens panel, 07-10):** (1) **NO standing classify-on-arrival router** — the existing Solomon singleton IS the apex tier; the mechanism is **score-at-escalation + floor-first self-escalation** (a problem climbs when the current tier's floor proves insufficient, scored at the escalation moment); (2) **adversarial-survival, not consensus-synthesis** — plus an INDEPENDENT CMV-rejecter (a proposer-side mandatory CMV lens is self-certification, CONST-002 violation; tracing-to-Constitution/Mission/Vision is a quality FLOOR, not a governance ceiling); (3) **abstraction is a tier-SELECTION axis** — collapsed with apex-eligibility + breadth signatures into ONE gate, not a second router; (4) **framing recurses into the spine** — the framing tier is a system-scope spine ROLE whose effort-distribution IS its §3.3 objective function; a separate framing satellite would be a duplicate-better SSOT defect. (Yes: by correction 4 this "satellite" is mostly a spine §3.3 amendment + thin plumbing — kept in the satellite list because the chairman's seven-name enumeration includes it, but its build shape is deliberately the smallest.)
- **CONSUMES:** S-3 objective registry; the suitability map (Appendix A) as the routing prior; `model_usage_log`/`venture_token_ledger` for cost actuals (with the 25.8% sd_id attribution fix from the P7 closure as a build dependency).
- **OWNS:** the escalation-score function + tier ledger (who escalated what, at which floor, outcome) — this ledger is ALSO the advice-outcome substrate the Solomon contract §11 requires.
- **OBJECTIVE+GUARD:** objective = **decision quality** (outcome-verified), NEVER cost — the CMV-drift finding: effort-distribution pulls toward a cost function against the Vision's mandate to maximize decision quality within capacity (allocate compute by expected value, never token thrift; capacity is a managed constraint, not the objective); guard = the **govern-by-absence tripwire** (fail-closed pick-vs-instrument predicate + a chairman framing digest — silence at the framing tier must be detectable, since framing sits upstream of every gate).
- **BUILD SHAPE:** spine §3.3 amendment + ONE thin plumbing SD (score-at-escalation + ledger), coupled.
- **ACCEPTANCE:** a seeded deep problem submitted at a low tier self-escalates on floor failure and the ledger records the climb; a seeded shallow problem submitted at apex is bounced DOWN (work-down-never-up, both directions); the decision-quality gauge reads from outcome stamps, not from spend.

---

## §4 — Build plan (conflict-free, weekend-shaped)

**Sequencing:** (0) spine-substrate stub SD (3 tables + 2 services — everything gates on S-1/S-2/S-3 existing); then (1) all seven satellites in PARALLEL — each owns disjoint tables/paths per §2's write-surface contract. The only ordered pair: 3.3 → 3.4 (shared traversal seam, one SD pair). 3.6's machinery SD waits on its own audit verdict (its audit SD runs in the parallel wave).
**Dedup against in-flight work (do not double-build):** P6 ownership SD (IN EXEC) = substrate S-5; queued P1 traversal-reflection closure = 3.3's core; W1 vigilance design item = 3.5 FR-1; APA-PHASE-STANDING-001 (sourced) is ADJACENT to 3.2 (APA judges surfaces; 3.2 produces assets) — no overlap, but both touch preview deploys: coordinate the preview seam.
**Fleet shape:** 8-9 SDs total (stub + 7 satellites with 3.6 split in two, 3.7 as amendment+thin SD). All Sonnet-buildable against these specs (the Fable-shaped work — the architecture — is this document); Solomon available for spec-question consults, propose-only.
**Chairman authority points (unchanged, non-negotiable):** live-mode flips, kill gates, S17/S23 promotions, and the spine's enforced-writer-identity rule sit above every satellite.

## §5 — Acceptance, counterfactual, verification

**Layer acceptance:** every satellite loop registered in the process registry with an operative owner (S-5); every gauge provenance-reached or NO-DATA; one end-to-end thread demonstrable on the fixture venture: stranger event → CRM row → creative asset in channel → traversal reflection → capability deposit → CEO evaluation → escalation-scored consult — each hop leaving its typed evidence row.
**Counterfactual (what would change this architecture):** if the chairman's "cleanest architecture" ratification is later narrowed back to build-when-needed, the correct de-scope order is 3.1 CRM (its original gates were sound) and 3.6's machinery half (audit still runs) — NOT the substrate stub or 3.3/3.4, which serve every future venture regardless. If the venture-ceo-factory audit returns RETIRE, 3.6 shrinks to role-contracts-as-data on plain role sessions and nothing else here changes — the satellites bind to spine roles, not to the factory implementation.
**Verification plan (per S-7, evidence durability):** every satellite SD names its mock-distinguishing witness (listed per satellite above) in the PRD acceptance section; the S20-26 harness (post journal-durability fix) re-runs after the layer lands and the previously-CANNOT-DRIVE surfaces (O5 support/incident, O6 attribution, O8 review cadence) must flip to observed — that re-run is the layer's integration test.

## Appendix A — Fable-suitability map (re-derivation, medium fidelity + today's evidence)

**Grounding finding (unchanged):** Fable produces CLASS-level findings (negative-space, coupling, self-reversal — today: the dormant-machinery class, the gate-correct/hatch-wrong inversion, the evidence-must-outlive-fixture rule); Opus is strong at instance-level scoped questions; Sonnet ships same-day builds from specs but **silently under-finds on breadth audits** (today's confirmation: the P2 gather packet missed the ranker's wave-join that a targeted re-read caught) — Sonnet audit output requires method-emission + spot-confirmation.
**TIER-F (worth the apex, ranked):** 1. door-pass / negative-space audits; 2. as-built-vs-spec adjudications; 3. greenfield/unification architecture (this document's class); 4. polarity/authorization passes; 5. long-horizon instrumented runs; 6. selection/thesis adjudication. **TIER-O:** scoped second opinions, instance verification, prep/spec-shaping. **TIER-S:** spec'd builds, fix queues, gather packets (with method-emission). **ANTI-MAP (never spend apex):** mechanical fixes, formatting, status aggregation, re-verification of already-verified instances.
**Consumption:** 3.7's escalation-score uses this map as its routing prior; the map itself re-derives on model-generation change (the FABLE-CAPABILITY GROUNDING precondition re-arms then).

*Propose-only. Adam sources the build tree; the chairman's ratification authorized the BUILD scope — each SD still traverses LEAD→PLAN→EXEC with its own gates. Committed at creation per S-7.*
