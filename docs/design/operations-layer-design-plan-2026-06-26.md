# EHG Operations Layer — Design Plan (v3 — post quadruple-review)

**Status:** v3, FINAL draft. Authored after the deeper-dive workflow (`wf_2dd4faa5`, 5 agents), then hardened by a 4-reviewer adversarial pass (freeze-skeptic / verify-the-dive / operating-model-fit / chairman-attention) + ground-truth DB checks. Coordinator adversarial challenge requested (advisory `9dde3563`) — **still outstanding; will be folded when it lands.** **Chairman-directed 2026-06-26.** Adam is propose-only (CONST-002): output = ONE chairman decision + decide-and-inform items + a launch-gated deferral register. Grounded in both ops audits + verified live DB.

---

## 0. The headline (read this first)
The deeper dive confirms the operations layer is **largely unbuilt** — but the quadruple-review changed the conclusion in two decisive ways:

1. **Source ZERO SDs now.** The v2 plan recommended one small "kill-safety guard." Ground truth refutes it: live DB shows **0 venture-scoped `agent_registry` rows and 0 `service_tasks`**, and `kill_venture` **already cancels** a killed venture's non-terminal SDs (migration `20260528113000`). The guard would operate on empty sets — a no-op, and sourcing it would repeat the exact verify-before-source error that just withdrew item B (the gauge). The honest pre-launch sourcing count is **zero**.

2. **The single highest-leverage move is a DECISION, not a build: un-defer the compounding loop's *capture-forward* half.** It is the only machine-improving item in the entire dive (the agentic-capital multiplier exists precisely to let it jump the queue), and venture-1's first-run signal is **perishable — permanently lost every stage it passes without extraction.** Freeze-then-calibrate forbids building speculative *machinery*; it does **not** forbid *collecting signal* — capture is the substrate calibration will later need. This is a ratified-deviation (compounding is currently chairman-deferred to first-revenue), so it is the **one** thing that goes to the chairman.

Everything else is launch-gated and deferred with explicit triggers. Net: **0 SDs sourced now, 1 chairman decision, 2 decide-and-inform FYIs, 1 deferral register.**

> This plan deliberately applies freeze-then-calibrate to the *decisions* as well as the *builds* — parking/deferring under standing authorization, escalating only the genuine reserved-class item.

---

## 1. Strategic frame
The operations layer is **"the operating system around the AI" for the RUN phase** — the chairman's named moat. The build pipeline (S0→S26) *makes* ventures; the operations layer *runs*, *kills*, and *compounds* them. The dive shows the RUN-phase OS is mostly specified/scaffolded but not wired to execute. That is acceptable **iff** each piece is built just-in-time against a real launch, not speculatively — with one exception: **signal capture, which must not wait** (it's perishable and is the raw material freeze-then-calibrate calibrates against).

Two scopes: **RUN-THE-VENTURE** (per live venture: monitoring, incident, support, growth, kill/wind-down) and **RUN-THE-COMPANY** (cockpit [already built — B withdrawn], financial-ops, portfolio concurrency, the compounding loop, the command-bus, token accounting).

---

## 2. What the dive found (5 systems) — corrected by the verification ledger

| # | System | Verified state | Genuinely needed by | Verdict |
|---|--------|----------------|---------------------|---------|
| 1 | **EVA Command-Bus / runtime** | VERIFIED unbuilt: `chairman_directives` table exists (0 rows), no parser/dispatcher/executor; SD-recommendation-emitter emits copy-paste `/leo create` strings the chairman runs by hand. NOT a hidden prerequisite for #2/#5 (CEO uses `agent_messages`; exit uses HTTP actions — separate lanes). | Directive automation (build-phase auto-SD-creation; run-phase ops execution) | **Split.** Narrow auto-SD-creation slice = pre-authorized by *automate-not-manual* (decide-and-inform). Broad runtime = defer. |
| 2 | **Venture-CEO / VP / Crew execution** | VERIFIED: fully scaffolded (VentureFactory mints 1 CEO + 4 VPs + 14 crews as DB rows per venture) but `runAgentLoop` is **never invoked** outside a unit test. EVA `processStage()` orchestrates ventures directly (works). | Portfolio scale, *if* CEO-autonomy is a real target | **Decide-and-inform: PARK-AND-RECLAIM** (see §6). The 19-agent human-org-chart shape is itself a generic-SaaS drift to reconsider. |
| 3 | **Compounding / learning moat** | VERIFIED: capture **works** (6,533 retrospectives, 1,450 issue patterns auto-extracted); application **unbuilt** (`venture_templates` 0 rows, extraction gated at stage 26, loop chairman-deferred to first-revenue; intelligence hub orphaned). | Capture: NOW (perishable). Application: venture-2+ | **ESCALATE (the one decision): un-defer capture-forward now; keep application gated.** |
| 4 | **Portfolio-scale concurrency** | VERIFIED: `StageExecutionWorker` is sequential (30s poll, processes ready ventures one-at-a-time); `ConcurrentVentureOrchestrator` (max 20) exists but imported only by tests; portfolio-optimizer detects contention but is advisory-only. | 3+ concurrent *live* ventures (we have 1, pre-launch) | **Defer** (allocation). But token **accounting** is a NOW miss — see §3. |
| 5 | **Live kill / wind-down / exit** | CORRECTED: `kill_venture`/`delete_venture` RPCs work AND `kill_venture` **already cancels non-terminal SDs**. The `execute-exit` 4-round flow is NOT "zero logic" — the orchestration shell (router, separability gate, approval gating, certification, abort guards) is **real**; only the per-round *work* handlers (freeze/export/cutover) are stubs. Genuinely missing: `agent_registry` suspension + `service_tasks`/scheduler cancel on kill (both **empty today**) + in-memory worker abort. | The kill-cleanup slice: when venture-scoped agents/jobs actually exist (Phase 1/3). Full exit: at first real exit/spinout | **Defer** (operates on empty sets today). Re-scope to the 3 genuinely-missing slices when triggered. |

---

## 3. The reframe — launch-gated triggers + the two things that DON'T wait
The dive's severities are *architectural*; operational priority is set by **when a live venture (or the machine) actually needs it.**

- **Nothing in the RUN-phase runtime is needed before venture-1 launches** (it's at S16). Command-bus execution, CEO runtimes, portfolio concurrency, exit machinery, kill-cleanup — all key off *live* ventures/agents that don't exist yet.
- **Two things do NOT wait (both machine-improvement, both signal/measurement, neither a speculative runtime):**
  - **(A) Compounding capture-forward** — venture-1's first-run signal is perishable (the chairman's own "gold hunt" framing). Collect-without-promote now. → the one chairman decision.
  - **(B) Token accounting** — "tokens are capital" is a NOW principle the plan previously operationalized only at Phase 3. The dominant token sink *today* is the harness/fleet + venture-1's build run, none of which are "live ventures." A token-attribution view over the existing `model_usage_log` (rollup by venture / harness / fleet-role) creates the Phase-3 allocation baseline, turns the operating-model SSOT `ai_operations` band from a static ESTIMATE into a DERIVED actual, and is itself machine-improving. Defer *allocation/enforcement*; do *accounting* now. → decide-and-inform candidate.

---

## 4. Design principles (invariants)
1. **AI-native by default.** 2. **Automate-not-manual** (every recurring manual chairman step is a factory GAP; implicates the command-bus #1). 3. **Graduated autonomy** (propose-and-approve → autonomous per-role on a proven advice-outcome ledger; never autonomous-first on un-validated agents touching customers/money/kill). 4. **Freeze-then-calibrate / grounded (GOVERNING)** — build machinery just-in-time against real signal; but *collect* signal eagerly (it's the calibration substrate). 5. **Consume the operating-model SSOT** (`lib/eva/standards/operating-model.js`) — and *close the loop*: ops is where `ai_operations` becomes DERIVED. 6. **Tokens-as-capital = accounting NOW, allocation at scale.** 7. **Compounding** — capture now, apply at venture-2+.

---

## 5. Sequencing / phasing — LAUNCH-GATED

**PHASE 0 — NOW (pre-launch). Source 0 SDs. Do exactly this:**
- **Escalate ONE decision** to the chairman: D-COMPOUND (un-defer capture-forward) — §6.
- **Decide-and-inform** (standing authorization, no chairman sign-off): D-CEO = PARK-AND-RECLAIM; D-CMD = defer broad runtime, flag the narrow auto-SD-creation slice; flag the token-accounting view as the top machine-improvement candidate.
- **Hard precondition going forward:** a ground-truth premise-check (does the thing the SD targets actually exist / is the gap real?) is REQUIRED before sourcing ANY ops SD. (This is the B-gauge + kill-safety lesson, now a rule.)

**PHASE 1 — TRIGGER: venture-1 first live customer-facing deploy.**
- Extend the existing health-monitor to venture infra (observability ≠ autonomy — safe). 
- **NB (verified):** there is no venture-level error/latency *alert collection* ready to consume yet (`feedback-classifier` is hard-coded unavailable), so a true incident-response consumer needs the alert pipeline built first — it is **not** a thin consumer. Keep incidents → chairman until a manual-handling advice-outcome ledger exists (principle #3); do not auto-consume on the first live venture.
- **Kill-cleanup guard** (re-scoped from the withdrawn Phase-0 SD): once venture-scoped agents/jobs exist, add `agent_registry` suspension + `service_tasks`/scheduler cancel on `kill_venture` (the SD-cancel half already ships). Small, additive, idempotent — but only once it guards something real.

**PHASE 2 — TRIGGER: venture-1 first revenue (the chairman's existing marker).**
- Financial-ops automation: MRR/churn calculator, annual-not-monthly deduction attestation (absorbs audit Finding 2/3 residuals), handoff-escalation deadlines, vision-drift auto-routing.
- Compounding **application** activation (templates promoted from `unvalidated`→validated once venture-1 resolves; fund intelligence hub).

**PHASE 3 — TRIGGER: 3+ concurrent LIVE ventures.**
- Portfolio concurrency: integrate `ConcurrentVentureOrchestrator`; portfolio-level token *allocation* (built on the Phase-0 accounting baseline); enforce (not advise) contention resolution.
- CEO/VP/Crew runtime — **only if D-CEO is later un-parked**; reconsider the org-chart shape (flatter agent-pool may be agentic-capital-correct).
- Full exit machinery: implement the 4-round `execute-exit` *work* handlers (the shell exists), infra teardown, budget reclaim, sunset day-30 enforcement.

**PHASE 4 — TRIGGER: directive automation greenlit (broad).**
- Command-bus execution engine (CommandParser→Dispatcher→HandlerRegistry, wired to the scheduler), propose-and-approve first. The narrow auto-SD-creation slice may move to Phase 0/1 under automate-not-manual without the broad runtime.

---

## 6. Chairman decisions — ONE escalation, the rest decide-and-inform

**ESCALATE → chairman (the only one): D-COMPOUND — un-defer the compounding loop's capture-forward half?**
- **Adam's resolved recommendation:** YES, un-defer **capture-forward only.** Lower the template-extraction gate (stage 26 → ~15-18) and tag every pre-S26 extraction `unvalidated / pre-outcome` so it is **collected but not promoted** into the application path until venture-1 resolves (revenue or kill). Keep **application** deferred to venture-2+.
- **Why it's the chairman's call:** it deviates from his ratified position (compounding deferred to first-revenue) and is moat-timing = strategy.
- **Why recommend un-defer:** only machine-improving item in the dive (multiplier fires); venture-1 first-run signal is perishable and being lost now; freeze-then-calibrate governs machinery not signal; the `unvalidated` tag neutralizes the data-poisoning risk (a template from a venture later killed at S17 must not teach the machine to replicate failure).
- **Default if you'd rather not touch it:** HOLD (no action; current ratified position stands). The default needs no work — so this collapses to a high-value strategic flag if you prefer hold.

**DECIDE-AND-INFORM (no chairman sign-off; standing authorization):**
- **D-CEO → PARK-AND-RECLAIM.** Standing freeze-then-calibrate makes PARK the default (EVA-direct works; CEO-autonomy only matters at portfolio scale). PARK should also: (i) stop VentureFactory minting 19 dormant agent rows per venture (latent state that misled the dive), (ii) note that the human-org-chart hierarchy is a generic-SaaS drift to reconsider rather than rebuild as-is at Phase 3. Re-surfaces as a real decision at the Phase-3 trigger.
- **D-CMD → defer the broad directive runtime; the narrow auto-SD-creation slice (kill the manual `/leo create` copy-paste) is pre-authorized by the twice-ratified automate-not-manual steer.** Flag it as a near-term automation candidate; don't ask.
- **Token-accounting view** (§3-B) — flagged as the top machine-improvement candidate; small, no reserved content.

---

## 7. Autonomy model (reaffirmed)
Start propose-and-approve for the first live venture's ops agents; graduate to autonomous (escalate-exceptions) per-role once the advice-outcome ledger proves trustworthiness; **reserved (always chairman):** kill a live venture, major spend, strategy/policy, anything irreversible/high-blast-radius.

---

## 8. Sourcing recommendation
- **NOW: source 0 SDs.** Premise-verified empty (0 venture-scoped agents, 0 service_tasks; SD-cancel already shipped). A ground-truth premise-check is now a hard precondition for any ops SD.
- **Pending the chairman's D-COMPOUND call:** if he approves un-defer, the capture-forward change is a small, bounded SD (lower gate + provenance tag) — Adam sources it as DRAFT on his go.
- **Decide-and-inform candidates (Adam may propose to the coordinator):** the token-accounting view + the narrow auto-SD-creation slice — both machine-improving, both small. *Recommend surfacing, not reflexively sourcing*, given the product pivot (machine-work defers unless it clears the bar); the chairman's D-COMPOUND answer will also signal his appetite for machine-improvement spend right now.
- **Withdrawn:** B (gauge — already built). **Routed:** D (S5 opex — folded into upstream-propagation SD).
- **Future (triggered):** Phases 1-4 as an orchestrator with per-component children when their triggers fire; tier-coherent + `fleet_critical` where they gate a live venture; autonomy/thresholds in config (calibration-ready).

---

## 9. Open challenges — resolved by the review
- **C1 (source nothing?)** — RESOLVED: yes, source 0 now (kill-safety is a no-op against ground truth).
- **C2 (command-bus a prerequisite for #2/#5?)** — RESOLVED: no. Verified separate lanes (CEO=`agent_messages`, exit=HTTP actions). Deferring the command-bus doesn't implicitly commit to building it.
- **C3 (dive claims stale?)** — RESOLVED via the verification ledger: #4 overstated (shell real), #5 partial (SD-cancel shipped). Folded into §2.
- **C4 (compounding jump the queue?)** — RESOLVED: yes, the capture-forward half — it's the one machine-improvement lever + perishable. → the escalation.
- **C5 (ops autonomy ladder?)** — ops extend the existing L0-L4 model but need explicit risk classes for kill/money/customer-facing actions (built when Phase-1 roles arrive).
- **C6 (true minimum-safe at fast launch?)** — health-monitor extension only; incidents→chairman until a ledger exists; kill-cleanup once agents exist. Phase-1 incident *consumer* needs the alert pipeline first (verified gap).

---

## 10. What the quadruple-review changed (audit trail)
- Source recommendation **1 → 0** (kill-safety guard withdrawn; premise verified empty + SD-cancel already shipped).
- New headline: **D-COMPOUND capture-forward** promoted to the single chairman decision (perishable machine-improvement signal).
- Chairman decisions **3 → 1** (D-CEO + D-CMD demoted to decide-and-inform; over-ask corrected).
- Added the **token-accounting NOW** miss; added **PARK-AND-RECLAIM**; corrected the **execute-exit** and **kill_venture** claims; added a **ground-truth premise-check** precondition.
- **Still outstanding:** the coordinator's adversarial challenge (advisory `9dde3563`) — to be folded on reply.

---

## 11. D-COMPOUND implementation status (updated 2026-07-04)

Both halves of the capture-forward gate-lowering are now shipped:

- **Gate threshold** — `SD-LEO-INFRA-COMPOUNDING-CAPTURE-FORWARD-001` (completed 2026-06-27) lowered `template-extractor.js`'s `DEFAULT_MIN_EXTRACT_STAGE` from 26 to 15 and added the `unvalidated`/`validated` provenance tag to `venture_templates` rows. This changed the GATE (a config value) but did not wire any per-stage invocation — `venture_templates` remained at 0 rows afterward.
- **Actual per-stage capture** — a second chairman decision (`1c1771d9`, 2026-07-04) authorized `SD-LEO-INFRA-CAPTURE-FORWARD-GATE-001` to build the piece still missing: a NEW `venture_capture_snapshots` table + `lib/eva/venture-capture-forward.js` (reusing `template-extractor.js`'s pure sub-extractors) that actually runs the capture per-stage for venture-1 (MarketLens) — retroactively for its already-completed stages and forward via a hook in `lib/eva/workers/stage-advance-worker.js` — while writing to the new table instead of `venture_templates`, so the collect-without-promote fence (§6) holds. A `venture-capture-completeness` gauge was added to the existing invariant-gauges framework (`lib/governance/gauge-registry.js`) for visibility. `venture_templates` remains 0 rows; application stays deferred to first-revenue exactly as ratified.
