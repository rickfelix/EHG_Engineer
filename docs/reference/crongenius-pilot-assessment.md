# CronGenius Pilot — Pre-Venture-#2 Assessment & Readiness Scrub

> **Purpose:** we shipped the first venture (CronGenius M1); before onboarding ventures 2..N we scrub everything the pilot taught us and decide **what to fix or decide NOW vs. later.** This is the decision layer on top of the reference docs — it does not restate them.
>
> **Inputs:** [Venture Pipeline Playbook](./venture-pipeline-playbook.md) (F1–F22, §3 fixed / §4 open), [Venture Data Architecture](./venture-data-architecture.md), the pilot journal (P-FAIL-1–6, O1–O6), and the harness backlog (`feedback` rows).
>
> **How to read it:** four buckets — **A** done, **B** fix-before-#2, **C** defer, **D** decide-via-brainstorm — then a recommended sequence.

---

## Bucket A — Already fixed (verified shipped; no action)

| Capability now venture-aware | Shipped SD |
|---|---|
| /heal vision path resolution (F1/F2/F3) | MAKE-HEAL-VISION-001 |
| venture rubric semantics (F1) | VENTURE-RUBRIC-SEMANTIC-001 |
| auto-story boilerplate no longer blocks PLAN-TO-EXEC (F12) | AUTO-STORY-QUALITY-GATE-001 |
| orchestrator-parent EXEC wait-state + WAIT verdict + auto-rollup (F6/F7/F8) | ORCH-PARENT-LIFECYCLE-001 |
| pipeline discoverability + LEAD circuit-breaker + per-child eval (P-FAIL-2/3/4) | VENTURE-LIFECYCLE-PIPELINE-001 |
| CMO + CGO board seats | ADD-CMO-CHIEF-001 |
| retrospectives.target_application registry-aware | VENTURE-REPO-AWARE-001 |

*Two-session-validated (Child B + Child C) as still-working.*

---

## Bucket B — FIX BEFORE venture #2 (recurring; every child paid a manual tax)

These are the gaps that forced a workaround at **every** child this pilot. Shipping them means venture #2 runs the pipeline with far less hand-holding.

| # | Fix | Why now (cost if not) | Findings | Priority |
|---|-----|----------------------|----------|----------|
| **B1** | **DB-repo-aware gates** — make every completion gate resolve the target repo from `applications.local_path` instead of cwd | Retires an entire CLASS of false-positives in ONE SD. Today each one needs its own workaround at each handoff. Highest-impact item in the whole assessment. | F16, F17, F18, F19, F20 | **P0** |
| **B2** | **Sub-agent venture repo resolution** — derive `repo_path` from target_application + add latest-row-per-agent filter to the gate | Every venture child's PLAN-TO-EXEC needs a manual forward-slash path + a row UPDATE today. SD already LEAD-approved, just unshipped. | F10, F11 | **P0/P1** |
| **B3** | **create-orchestrator venture-awareness** — populate child fields from vision/arch (not skeletal), always extract `implementation_phases`, default `target_application` from venture, set per-child `scope_slice`/`inherited_from_parent` | LEAD has to enrich every auto-gen child + author phases + fix target_application + set the scope flag by hand. | F5, F2, F3, F17 (create-side) | **P1** |

> **B1 is the keystone.** It alone removes the F16/F17/F18/F19/F20 workarounds and makes "location" stop being load-bearing — the single most repeated friction across the pilot.

---

## Bucket C — Defer / ride the documented workaround (low-friction or rare)

| Item | Why defer | Workaround |
|------|-----------|-----------|
| F21 GATE2-E2E uniform on backend slices | absorbed by the YELLOW band; only bites if a child also scores low elsewhere | keep other GATE2 dims strong |
| F22 stale resume session-id | process discipline, no code needed | re-derive ambient `$CLAUDE_SESSION_ID` |
| F15 FR-3 heartbeat livelock | process discipline; documented | verify heartbeat + claim-free before re-claim |
| F8c bypass-rubric SEMANTIC_MISMATCH category | ergonomic, not blocking | use TOOLING_BUG wording |
| O1–O4, P3 nits (stale-main warn, chairman_approved-auto, type-change rigidity, vision-scorer timeout) | cosmetic / audit-trail | per-item notes in journal |

---

## Bucket D — OPEN DESIGN QUESTIONS → formal brainstorm (decisions, not fixes)

The venture data integration (Replit operational DB ↔ EHG Supabase portfolio view). **We have settled the architecture shape (two-layer pull; see the data-architecture doc) — but not the CONTENTS or the contract.**

| # | Open question | Status |
|---|---------------|--------|
| **D1** | **What data actually crosses Replit → EHG?** Which KPIs/rollups the portfolio view needs — *explicitly undecided.* | **chairman-goal-driven; prime brainstorm topic** |
| **D2** | The `/v1/metrics` contract — exact fields + versioning, standardized across ventures | open |
| **D3** | Feed mechanism — EHG pulls on schedule (recommended) vs. ventures push | open (lean pull) |
| **D4** | EHG-side storage — how EHG normalizes/stores portfolio KPIs + surfaces them on the chairman dashboard | open |
| **D5** | Read-key issuance/rotation for EHG's per-venture pulls | open |

Plus the two build gaps from the data-architecture doc (these are *implementation* once we decide D1/D2): **Layer 1** = CronGenius `DATABASE_URL` Postgres adapter (today ephemeral); **Layer 2** = EHG-side ingestion job.

> **D1 is the gating decision** — it's goal-first: *what questions does the chairman want to answer across the portfolio?* That drives D2 (the contract), which drives the Layer-1/Layer-2 build. So D1 should anchor the brainstorm.

---

## Recommended sequence before onboarding venture #2

1. **Brainstorm Bucket D** (formal process), anchored on **D1 (what data to bring over)** → produces the `/v1/metrics` contract (D2) + feed/storage decisions (D3/D4/D5).
2. **Ship Bucket B** as a `[MODE: campaign]` sweep — **B1 (DB-repo-aware gates) first** (keystone), then B2, then B3.
3. **Build the data layers** once we decide D1/D2 — Layer 1 (venture Postgres adapter, likely CronGenius M2) + Layer 2 (EHG ingestion).
4. **Then onboard venture #2** using the playbook + the shipped fixes + the agreed data contract — it should run with minimal manual workarounds.

*(B and D are independent and can run in parallel: B is harness engineering, D is product/architecture decision-making.)*

## Decisions this assessment needs from the chairman
- **D1 goal framing:** what portfolio-level questions should the venture telemetry answer? (anchors the whole data feed)
- **Sequencing/appetite:** ship Bucket B before venture #2 (cleaner) vs. accept the documented workarounds for one more venture and prioritize D?
- **Scope of the brainstorm:** Bucket D only (data integration), or widen to "venture onboarding readiness" generally?

---

*Provenance: CronGenius pilot (first venture), assessment authored 2026-05-28. Companions: [venture-pipeline-playbook.md](./venture-pipeline-playbook.md), [venture-data-architecture.md](./venture-data-architecture.md).*
