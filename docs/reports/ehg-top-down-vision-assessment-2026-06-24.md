# EHG Top-Down Vision Assessment — Baseline (2026-06-24)

**Run:** workflow `wf_3d684a78-d91`, 28 agents, ~29 min, 2.75M tokens. Method: [`docs/process/top-down-vision-assessment.md`](../process/top-down-vision-assessment.md).
**Headline verdict:** **EHG is substantively BUILT to perform its envisioned arc — it is NOT lipstick.** The alarming raw audit was a measurement artifact of judging the `ehg` UI app in isolation; the venture-lifecycle engine lives in the `EHG_Engineer` harness + shared DB.

> ⚠️ **Methodology caveat for anyone reading the raw numbers below.** This v1 run's *audit* phase read `ehg/src` alone and returned `0 BUILT / 7 PARTIAL / 11 SHELL`. That scorecard is **wrong** — kept here only as the record of the trap. The *verify* phase + manual ground-truth checks corrected it (below). The canonical workflow now audits cross-repo so future baselines won't carry this distortion.

---

## 1. The intended vision (the spine assessed against)

A single 26-stage SSOT venture pipeline (6 phases: THE_TRUTH → THE_ENGINE → THE_IDENTITY → THE_BLUEPRINT → THE_BUILD → THE_LAUNCH), driven by EVA (a natural-language directive command-bus + conversational assistant + proactive briefing) so **one operator + AI runs a portfolio end-to-end**:

> ideas are **generated** at the top of funnel (opportunity blueprints, competitor-clone, discovery modes) → red-teamed and viability/financial **kill-gated** (S1–9) → branded / GTM-planned / blueprint-reviewed, chairman-signed (S10–17) → **built** via handoff to the LEO/Claude-Code harness with a code-quality + launch-readiness gate (S18–23) → **marketed/distributed** inline (S12/18/21/22/24) → **operated** as a live venture with a decision stack + growth playbook (S25–26 + operating layer) → **compounded** across ventures (recursion, chairman-override learning, capability reuse) → and ultimately **sold** (exit-oriented design from S9, exit-readiness, data-room, value realization).

**North-star thread:** the chairman cockpit's top tiles are the literal encoding of the north star — a queryable single objective, **distance-to-broke** (runway), and **distance-to-quit** (net income vs the $18k/mo quit-threshold) — so the chain is designed to drive *idea → revenue → realized income/exit*.

---

## 2. Built-vs-envisioned — the CORRECTED scorecard

The four scariest "missing/shell" verdicts were each **refuted by ground truth** (file + DB evidence). This table is the durable record:

| Capability | Raw audit (app-only) | Ground truth (cross-repo) | Verdict |
|---|---|---|---|
| Per-stage advisory producer (the claimed "master break") | MISSING — "assembly line with no machines" | `EHG_Engineer/lib/eva/stage-execution-worker.js` `_syncStageWork` + producers `lib/eva/stage-templates/analysis-steps/stage-00…17-*.js`. DB: **87 advisory rows, 16 mid-spine (S2–17) stages populated** | **already-built** |
| Idea generation | SHELL — "funnel has no source" | `EHG_Engineer/scripts/stage-zero-queue-processor.js` (live daemon) + `lib/eva/stage-zero/paths/discovery-mode.js` (LLM, 5 strategies). DB: **5 ventures generated → advanced to stages 19/21/26**; 8 opportunity_blueprints | **already-built** |
| Kill-gate enforcement (S3/5) | SHELL — "gates cosmetic, no terminal state" | `advance_venture_stage` RPC gates kill/promotion stages on an approved `chairman_decisions` row; `reject_chairman_decision` → `workflow_status='killed'` (audit checked the wrong column) | **overstated** — teeth exist |
| Sale/Exit backend | SHELL/CRITICAL — "entire backend absent, tables 404" | `lib/eva/exit/{data-room-generator,separation-rehearsal}.js`, `lib/eva/lifecycle/exit-gate-enforcer.js`; tables `exit_playbooks`, `venture_exit_profiles`, `venture_exit_readiness`, `venture_data_room_artifacts`; full ehg exit UI | **already-built** |

**Genuinely BUILT (verified):** chairman cockpit override loop (approve/reject/park → real RPCs reset orchestrator state; 48 decisions in prod); decision queue (`get_pending_chairman_items`, 56 decisions); 26-stage SSOT config + honest config-driven rendering; `useStageDisplayData` read pipeline (93 stage_work rows, 287 artifacts); north-star target encoding ($18k/mo chairman_ratified, read honestly); the **honesty contract** (surfaces show "—" not fabricated numbers); EVA conversational chat (real LLM path); manual idea capture (3 entry methods); Stage-20 build console mirror.

---

## 3. Genuine residual gaps (what survived skeptical, cross-repo verification)

Ranked; even these warrant one more cross-repo re-check before any SD (the audit over-counts).

1. **EVA operator command-bus is unwired** — *HIGH, needs chairman decision.* The "one human commands a portfolio" lever: the directive API persists a row and returns a canned acknowledgment instead of routing to the (already-built) parse→validate→route engine + a runtime. **Decision required: execution-runtime scope** — real in-app agent execution vs. handoff to the LEO harness (as build already does). Not a fire-and-file SD. *(Re-verify the harness doesn't already consume directive rows.)*
2. **Operating-layer telemetry has no writer** — *MEDIUM, buildable but premature.* Triage signals (dwell/attention/gate-retries/velocity) + post-launch-vs-projection metrics are unpopulated, so the cockpit can't flag a venture needing the operator. Downstream — **0 ventures are in operations yet**, so there is nothing to instrument.
3. **Cockpit input feeds** — *surgical wiring.* Distance-to-broke cash feed (**shipped this session** — `SD-EHG-PRODUCT-OPERATOR-CASH-ATTEST-DTB-LIVE-001`); a possible `netProfit=null` at the briefing layer (`BriefingDashboard.tsx:110`) worth a wiring check despite the shipped distance-to-quit SD.

**Not V1 sourcing candidates now:** sale/exit (built, but V2/V3 — no venture near sale); compounding/self-improvement (recursion/override engines exist but lightly wired — revisit when multiple ventures run); validation research crew (external service integration — architectural, chairman call).

---

## 4. Meta-lesson (the most valuable output)
The deep pass's greatest value was **disproving its own alarming premise**. Assess EHG **cross-repo** — app = UI, harness = engine, shared DB — never app-alone. An app-only lens turns a substantively-built system into a phantom dozen-SD rebuild backlog. This is now encoded in the workflow's audit phase and in the `reference-assess-ehg-cross-repo-not-app-alone` memory.

**Diff target:** re-run after the gaps in §3 close; expect the next layer (operating-loop instrumentation once a venture is live; compounding once multiple ventures run; exit once one approaches revenue) to surface.
