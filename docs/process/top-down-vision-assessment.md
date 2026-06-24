# Top-Down Vision Assessment

**Purpose.** Answer one question with evidence: *is EHG actually designed and built to perform its envisioned arc end-to-end — or is it lipstick (UI shells, mock data, partial scaffolds that look like the capability but cannot do it)?* It is a **top-down** instrument: derive the complete intended vision first, then audit reality against it and walk **backwards** from the goal (realized income / exit) to find where the chain actually breaks. This catches whole-capability structural gaps that a bottom-up, file-by-file review misses.

**When to run.**
- After a batch of capability gaps is closed (the next layer of gaps becomes visible — that is the point of keeping a diff-able baseline).
- When deciding where product effort should go (it ranks gaps by north-star-loop impact, not by what's easy).
- Periodically as a health check that the system still performs the arc on real data.

**Owner.** Adam (advisory/analysis lane — DIAGNOSES, propose-only per CONST-002). The assessment produces candidate gaps for the coordinator to dispatch and decisions for the chairman; Adam does not build the fixes.

---

## The two disciplines that make it trustworthy

These are not optional. The first run (2026-06-24, v1) ignored #1 and nearly produced a dozen redundant "rebuild it" SDs for capabilities that were already built.

### 1. CROSS-REPO is load-bearing
EHG is **two repos sharing one database**, and the split is deliberate:

| Layer | Where | Role |
|---|---|---|
| Operator UI | `rickfelix/ehg` (`/src`) | thin UI / read-layer — renders what the engine produced |
| Lifecycle engine | `rickfelix/EHG_Engineer` (`lib/eva/**`, `scripts/**`) | the LEO/EVA venture-lifecycle compute (stage producers, idea-gen worker, exit engine, gate RPCs) |
| Contract | shared Supabase project `dedlbzhpgkmetvhbkyzq` | the rows the engine writes and the app reads |

**A capability absent from `ehg/src` is NOT "missing" if the harness produces it and the DB holds real rows.** Auditing the app alone systematically mis-reads built capabilities as `SHELL`/`MISSING`. Every `MISSING`/`SHELL` verdict must cite three things: an `app_evidence` (UI), an `engine_evidence` (harness producer — checked *before* concluding hollow), and a `db_evidence` (real rows, or proven absence). Both repos point at the same Supabase project `dedlbzhpgkmetvhbkyzq` (the shared-DB contract).

### 2. VERIFY-PREMISE is the backstop
Audits over-count gaps. Every candidate gap is re-checked by an independent skeptic that **defaults to refuting** and re-reads BOTH repos + the DB. The single most common false positive is "the harness builds this and the app-only audit missed it." On the v1 run, the skeptic + ground-truth checks reversed **4 of 4** scariest claims (per-stage producer, idea-generation, kill-gates, exit backend — all real).

---

## The method (5 phases)

Implemented as a re-runnable workflow: `.claude/workflows/ehg-top-down-vision-assessment.mjs` (invoke by name — see *Running it*).

1. **Derive** — three parallel lenses construct the *complete intended vision* from independent sources: (a) the vision documents + documentation, (b) the codified workflow as built (both repos' stage configs/producers), (c) the AI engine + the lifecycle *edges* (ideation generation, marketing/distribution, compounding/self-improvement, sale/exit). Output: what EHG is *supposed* to do, cited.
2. **Canonize** — reconcile the three derivations into ONE ordered, complete lifecycle spec (ideation → validation → build → operations → marketing-distribution → compounding-self-improvement → sale-exit, plus cross-cutting: cockpit, EVA command-bus, north-star). Include stages even where they look absent in code, so the audit verifies them rather than skipping.
3. **Audit** — one agent per capability grades it `BUILT / PARTIAL / SHELL / MOCK / MISSING`, **cross-repo**, in mandatory order: read the app → read the harness → query the DB for proof-of-run. `lipstick=true` only survives if it cannot perform after checking both repos.
4. **Backtrace** — walk **backwards** from "sell a venture / realize income" to ideation. At each step ask: given what's actually built, can the chain reach here? Find the first load-bearing break on the critical path. Emit ranked `structural_gaps` (candidate SDs) with priority, dependencies, `buildable_now`, and a `dedup_note`.
5. **Verify** — skeptic re-checks each gap cross-repo; only `confirmed` gaps (real, un-built in *both* repos) survive into the sourcing batch.

**Output:** the intended-vision lifecycle, a cross-repo build scorecard (with app/engine/DB evidence per capability), the backwards-trace narrative, `chain_breaks`, `healthy_capabilities`, `confirmed_structural_gaps`, and `rejected_gaps` (with why each was thrown out — this is where false alarms are recorded).

---

## Running it

```
# Before running: refresh the EXCLUDE list (already-sourced/shipped SD-EHG-* keys+titles)
#   so the backtrace does not re-surface closed gaps. Pass via args.exclude.
Workflow({ name: "ehg-top-down-vision-assessment",
           args: { exclude: "ALREADY SOURCED: <refreshed list of shipped/in-flight SD-EHG-* titles>" } })
```

It runs ~25–30 min, ~28 agents. It returns the structured result; **write the findings to `docs/reports/ehg-top-down-vision-assessment-<YYYY-MM-DD>.md`** and **diff against the prior baseline** — the value compounds across runs as each layer of gaps is closed and the next is exposed.

> Paths in the workflow are absolute to this machine's `_EHG/ehg` and `_EHG/EHG_Engineer` checkouts; update the `EHG_ROOT`/`ENGINEER_ROOT` consts if the layout changes.

## Interpreting results — do NOT auto-source
- `BUILT`/`PARTIAL` with real DB rows → the capability performs; leave it.
- `confirmed_structural_gaps` that are `buildable_now` and not gated → candidate SDs (re-verify cross-repo once more before filing — the audit over-counts).
- gaps with `buildable_now=false` / `needs-chairman-input` → a chairman product decision, NOT a fire-and-file SD (e.g. v1's EVA command-bus runtime-scope decision).
- `rejected_gaps` → record them; they are the false-alarm ledger that keeps future runs honest.

## History
- **v1 — 2026-06-24** (`docs/reports/ehg-top-down-vision-assessment-2026-06-24.md`): the baseline run. Audited the app in isolation, returned a false "0 BUILT / 11 SHELL"; verify-premise + ground-truth reversed it to "engine substantively built in the harness; gaps are narrow wiring + the unwired EVA command-bus." This document's cross-repo discipline and the workflow's cross-repo audit phase are the lessons that run encoded.
