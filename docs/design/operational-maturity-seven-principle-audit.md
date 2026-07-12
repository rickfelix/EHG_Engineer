# Seven-Principle Operational-Maturity Audit — Solomon verdicts

**Status:** Solomon-authored (Fable 5 / high, 2026-07-11), propose-only (CONST-002). Chairman-commissioned via Adam (consult `c2961297`); companion to the plan-gap audit (consult `f5d4a41a` / advisory `cd261597`). Evidence gathered by 7 parallel read-only agents, adjudicated cold; all live-table counts re-verified directly against the DB on 2026-07-11.
**Provenance note:** the shared-tree original was destroyed in the 2026-07-11 evening untracked-file loss and recovered byte-exact via PR #5958 (this copy). A verbatim re-emission from the authoring Solomon session (branch `quick-fix/QF-20260711-736`) was reconciled against this copy on 2026-07-11 — the recovered original is preferred; the re-emission differed only in the P4 row-4 done-stamp wording and trailing whitespace. Post-authoring in-tree stamps applied after ~15:30Z may have been lost with the original.

**Verdict key:** EXISTS = standing, automated, live. PARTIAL = real machinery, but a named leg is dead/dormant/unsurfaced. MISSING = no standing regime.

**The cross-cutting finding first (one systemic fix > N patches):** five of the seven principles fail the same way — the machinery is *built* but nothing *durably invokes or surfaces* it. P4's collectors have 0 rows and no scheduler; P5's APA children are pure libraries with no entrypoint or cron; P6's liveness watcher shipped with no invoker (documented in its own header); P2's disposition evaluator is manual/dry-run with no cron; P3's bottleneck computations land in queues nothing chairman-facing reads. This is the **dormant-machinery class** (same class as the registered-verifier-never-dispatched incidents). The highest-leverage single closure is P6's: a **universal process registry with owner + escalation, and activation-evidence enforcement at ship time** — it structurally prevents the other four recurring.

---

## P1 — Automated post-mortems: **PARTIAL** (SD level EXISTS; venture/stage level MISSING)

**Exists (SD level, genuinely closed-loop):** RETRO required on PLAN→LEAD (`scripts/modules/handoff/required-subagents.js:28`); rejection→retro-agent mappings (`rejection-subagent-mapping.js:511,564,580`); completion guardian auto-creates/enhances retros (`orchestrator-completion-guardian.js:377-395`); Stop-hook witness (`post-completion-validator.js:69-216`); `/learn` → `issue_patterns` (1,530 rows live) → **auto-SD sourcing** at thresholds (`scripts/pattern-alert-sd-creator.js:5-13`, occurrence ≥5&critical etc.), with `assigned_sd_id` closing the linkage.

**Missing (venture/stage level):** no reflection runs on stage completion or traversal completion. The only venture post-mortem artifact is failure-triggered — `create_postmortem_on_venture_failure()` fires solely on `status='failed'` (`database/migrations/20260102_postmortems.sql:60-95`); `venture_postmortems` has **0 rows**. Stage workers emit transition audit events only (`lib/eva/stage-execution-worker.js:2900-2969`). Eight search modalities negative.

**Gap shape (one fix):** a traversal-reflection writer at the existing terminal seam `lib/eva/post-lifecycle-decisions.js:61-96` (fires at "Stage 26 completed") + optionally per-stage at the `stage_completed` transition — feeding the SAME `issue_patterns`/learning pipeline, not a new one. The factory that just ran ApexNiche end-to-end captured zero lessons mechanically; with fresh-start ventures coming (07-08 pivot), each traversal is exactly the learning event the mission's "learning speed is the moat" clause says to harvest.

## P2 — Dynamic idea/skill backlog: **PARTIAL** (ingestion EXISTS; autonomous evaluation/disposition is the dead leg)

**Exists:** rich ingestion (`log-harness-bug.js:112-133` → feedback; `conversion_ledger`; `sd_backlog_map`; sourcing-engine staging `lib/sourcing-engine/proactive-populator.js:220-275`; gauge-gap-miner + deferred-watcher crons hardcoded ON in their yml). The closed-loop plumbing EXISTS: hourly refill cron promotes staged items to draft SDs with dedup + stale-premise re-verify (`refill-cron.mjs:72-91`, `refill-auto-promote.js:175-242`).

**Dead leg (verified):** promotion is **fail-closed on the distilled-only gate** (`refill-auto-promote.js:32-40`): only BUILD-dispositioned items promote, and the dispositioner (`distill-backlog-dispositions.mjs`) is **manual, dry-run by default, on no cron**. Live disposition rate: **13/244 = 5.3%** (verified). Net autonomous throughput ≈ zero — the loop starves at evaluation exactly as Adam suspected. Flag reality is mixed, not "mostly OFF": miner/watcher crons hardcode ON; auto-refill enable + `ADAM_GOVERNANCE_HEARTBEAT_V1` default OFF; plus a live env-var/repo-var name-mismatch defect (`AUTO_REFILL_CRON_LIVE` vs `SOURCING_AUTO_REFILL_V1`).

**Gap shape (one fix):** automate the DISPOSITION step — a governed, quota'd disposition sweep (LLM-assisted BUILD/REFERENCE/DROP with confidence floor, chairman-gated only for risk classes) on a cron, leaving the existing fail-closed promote gate as the safety. Do NOT add new ingestion lanes.

## P3 — Automated chairman reporting w/ top-bottleneck: **PARTIAL** (reporting EXISTS; bottleneck computed in 4 disconnected pockets, none chairman-surfaced)

**Exists:** hourly exec email (`adam-exec-summary.mjs` — workers, rung %, meta ratio, done-last-hour, actions); heartbeat + decision emails; console; gauges.

**The refinement of Adam's prior:** "nothing computes bottlenecks" is too strong. Four computations exist: (1) ranked latency-regression bottlenecks → `protocol_improvement_queue` + sd:next CLI (`lib/telemetry/bottleneck-analyzer.js:108-351`, ~weekly staleness gate); (2) `bottleneck_gate`/`bottleneck_agent` in `pages/api/leo/metrics.ts:355-371` — **computed but consumed by nothing** (grep negative); (3) worst-track in `sd-burnrate.js:332-343` (manual console); (4) the capacity forecaster's SURPLUS/DEFICIT verdict (`coordinator-capacity-forecast.mjs:205-479`, → Adam only). None unifies agent-pipeline + compute; none reaches a chairman surface.

**Gap shape (one fix):** a composed **TOP-CONSTRAINT line in the existing exec email** — join the four existing computations (+ token-spend from P7's ledgers) into one ranked "#1 constraint now: X, because Y" artifact. Composition, not new analytics.

## P4 — Actuals-vs-goals: **RESOLVED** (SD-LEO-INFRA-VENTURE-OPS-ACTUALS-001, shipped 2026-07-11) — strategy layer EXISTS; per-venture ops layer now activated

**Exists:** `key_results` baseline→target probes (`lib/vision/vdr-probes.js:26-45`), VDR gauge, rung rollup → `roadmap_waves.progress_pct`, governed KR recompute. Per-venture: `venture_token_ledger` **LIVE, 3,530 rows** (per-venture/model/stage `cost_usd` — refutes "cost attribution missing", though it covers platform-side spend on the venture, not the deployed product's runtime); `venture_telemetry` live daily pull (9 rows; **one venture key wired**; self-reported aggregates).

**Closure (SD-LEO-INFRA-VENTURE-OPS-ACTUALS-001, PR #5924):** `ops_product_health` and `ops_revenue_metrics` collectors are now scheduled via `scripts/cron/venture-ops-actuals-sweep.mjs` (`.github/workflows/venture-ops-actuals-cron.yml`, every 6h), each registered in `periodic_process_registry` with a distinct owner-agent. The `service_telemetry` writer/reader field mismatch is fixed (`lib/services/telemetry.js`, `lib/services/branding-service.js` now populate `outcome`/`processing_time_ms`, plus the previously-silent `task_id`/`service_id` NOT-NULL insert failures). An external uptime probe (`lib/ops/venture-uptime-probe.js`) now runs against deployed venture URLs with a 2-consecutive-failure threshold. **Ground-truth correction discovered during implementation**: the probe target named here as `venture_deployments.url` is an empty (0-row) table — the real live URLs (MarketLens, CronGenius) live in `ventures.deployment_url`; the probe seeds `venture_deployments` from that column instead. `infra_cost_usd` remains hard-coded null (out of scope — no data source exists yet). Chairman exec email now carries one actuals-vs-targets line per live venture (`lib/fleet/exec-email-ops-actuals.mjs`).

## P5 — Autonomous customer-experience QA: **MISSING** (as a standing regime; APA is the ancestor and it is dormant)

**Exists (adjacent only):** platform QA all targets the EHG app at `localhost:8080`, gate-time (playwright configs; `lib/testing/testing-sub-agent.js:13`). APA children A–D shipped as **pure/injectable libraries with no entrypoint, no cron, no registry row**: sandbox harness is local-build-only and says so (`lib/apa/sandbox-harness.mjs:4-12`), browser-executor's sole consumer serves a LOCAL MarketLens (`lib/eva/journey-walk-driver.js:33-40`, `@wire-check-exempt` "orchestration entry point has not landed yet"). The weekly canary probes the **stage machinery**, not a live surface, and ships flag-OFF. Telemetry pull is passive self-reported numbers. **Nothing watches live MarketLens.** Email-sequence QA: nothing.

**Gap shape (one fix):** the APA Phase-2 orchestration entrypoint + schedule, pointed at **deployed venture URLs** (synthetic-customer journeys incl. checkout; extend to email sequences). Dedup: this IS the APA cluster completion + un-fence decision already flagged in the plan-gap audit (Wave-1 placement) — do not file a second regime; file the "point it at live surfaces recurringly" increment onto it.

## P6 — Default agent ownership of recurring processes: **PARTIAL, and the systemic root** 

**Exists:** `periodic_process_registry` (21 rows) + liveness watcher (OVERDUE/UNVERIFIED states) + machinery-class ACTIVATED/ARMED/UNWIRED gate + signal-router lone-signal closure + scheduler-watcher (durably wired, revives the scheduler).

**The three holes (verified):** (a) `owner` is a **nullable free-text label with no escalation field**; the watcher copies it into the payload but always targets the coordinator (`periodic-liveness-watcher.mjs:147-156`) — nothing anywhere routes to a named owner. (b) Coverage: ~20 GitHub-Actions crons, 9 `scripts/cron/*.mjs`, and the coordinator's 26-entry `STANDARD_LOOPS` checklist are a **second, un-unified registry invisible to liveness watch** (registry holds 21 rows: 3 role sessions + scheduler rounds + 2 self-stamped watchers). (c) The liveness watcher itself has **no durable invoker** — its own header documents that it shipped as "the meta-watcher meant to catch dead periodic processes was itself a dead periodic process" (QF-20260705-533); the activation-evidence gate defaults to advisory, so dormant machinery still ships.

**Gap shape (THE one systemic fix):** unify the registries (every GHA cron + cron script + standard loop auto-stamps a registry row at creation), make `owner` operative (owner-targeted escalation on OVERDUE, coordinator as fallback), and flip `ACTIVATION_EVIDENCE_MODE=block` for machinery-class SDs. This single closure is what prevents the P2/P4/P5 dormancy class from recurring.

## P7 — Effort-allocation telemetry: **PARTIAL** (meta ratio EXISTS ×2; nature-of-work split MISSING; ingredients live)

**Exists:** meta-to-product ratio computed twice — exec-email line (`lib/fleet/exec-email-alignment.mjs:13-33`) and the chairman-owned recursion-governor gauge with taper band (`lib/governance/recursion-governor.js:17-92`, → `codebase_health_snapshots`). Both key on SD-key **prefix**, not `sd_type`.

**Missing:** any maintenance-vs-fires-vs-new-build bandwidth split (multi-modal grep zero). Ingredients are live: `sd_type` (15-value enum, stamped at creation), `issue_patterns` recurrence (1,530 rows), `model_usage_log` (58,994 rows) + `venture_token_ledger`. **Attribution caveat (verified):** only 25.8% of `model_usage_log` rows carry `sd_id` (15,237/58,994) — a nature-of-work split on 26% attribution misleads.

**Gap shape (one fix, two steps):** first fix `sd_id` attribution coverage at the logging seam; then extend the existing `lib/cost/usage-rollup.js` join one hop to `sd_type` (+ RCA-linked flag) and surface the 3-way split on the existing exec-email ALIGNMENT block. No new tables.

---

## Consolidated closure list (SD-shaped, right-sized, deduped)

| # | Closure | Principle(s) | Size | Dedup note |
|---|---------|--------------|------|------------|
| 1 | **Universal process registry + operative owner/escalation + activation-evidence=block** | P6 (prevents P2/P4/P5 class) | Full SD | The systemic root; supersedes symptom fixes |
| 2 | Venture traversal/stage reflection at `post-lifecycle-decisions.js` seam → existing learning pipeline | P1 | Small SD | Reuses issue_patterns; NOT a new retro system |
| 3 | Automated backlog disposition sweep (governed, fail-closed promote gate unchanged) + flag name-mismatch fix | P2 | Small SD + QF | Engine plumbing already live |
| 4 | ~~Wire ops collectors + fix service_telemetry writer/reader mismatch + external uptime probe on venture URLs~~ **DONE** | P4 | Small SD | SD-LEO-INFRA-VENTURE-OPS-ACTUALS-001, PR #5924, shipped 2026-07-11 |
| 5 | APA Phase-2 entrypoint pointed at live venture surfaces, recurring | P5 | Increment on APA cluster | Cross-ref plan-gap audit W1 placement + un-fence; do NOT double-file |
| 6 | Composed top-constraint line in exec email (join 4 existing computations) | P3 | Small SD | Composition only |
| 7 | sd_id attribution fix, then 3-way effort split on exec email via usage-rollup + sd_type | P7 | Small SD | Extends existing rollup |

**Counterfactual:** if the chairman weights first-revenue over harness maturity right now, only #4 and #5 (Wave-2-serving) need to move soon; #1 is the one that should not slip regardless — every week it slips, more built machinery ships dormant. **Verification plan:** each closure names its witness up front (#1: zero unregistered crons + one induced-failure page reaches its owner; #2: a reflection row per completed traversal; #3: disposition rate trend off 5.3%; #4: nonzero ops rows + probe alerts on an induced 500; #5: a scheduled APA verdict against live MarketLens; #6/#7: the lines render in the next exec email).

*Propose-only. Adam sources; chairman accepts. Evidence packets available in the Solomon session transcript of 2026-07-11.*
