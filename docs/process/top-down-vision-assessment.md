# Top-Down Vision Assessment

**Purpose.** Answer one question with evidence: *is EHG actually designed and built to perform its envisioned arc end-to-end — or is it lipstick (UI shells, mock data, partial scaffolds that look like the capability but cannot do it)?* It is a **top-down** instrument: derive the complete intended vision first, then audit reality against it and walk **backwards** from the goal (realized income / exit) to find where the chain actually breaks. This catches whole-capability structural gaps that a bottom-up, file-by-file review misses.

**When to run.**
- After a batch of capability gaps is closed (the next layer of gaps becomes visible — that is the point of keeping a diff-able baseline).
- When deciding where product effort should go (it ranks gaps by north-star-loop impact, not by what's easy).
- Periodically as a health check that the system still performs the arc on real data.

**Owner.** Adam (advisory/analysis lane — DIAGNOSES, propose-only per CONST-002). The assessment produces candidate gaps for the coordinator to dispatch and decisions for the chairman; Adam does not build the fixes.

---

## The three disciplines that make it trustworthy

These are not optional. v1 (2026-06-24) ignored #1 and nearly produced a dozen redundant "rebuild it" SDs for capabilities that were already built; v2 added #3 after discovering that "built" said nothing about whether a capability had ever run.

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

### 3. BUILT ≠ EXERCISED (the v2 lesson)
A capability can be fully coded and **still never move the North Star** because no real data/customer/dollar ever flowed through it. v2 found this everywhere: separability scored 3,491× on an empty asset registry; the marketing pipeline ran once and posted nothing; exit engines orphaned. So the audit grades **build_state** (is the code there) and **exercised** (has it fired on REAL — non-test, non-baseline, livemode — data) *separately*. A `BUILT` + `NEVER-FIRED/STARVED` capability is the dominant real state and must be surfaced loudly, never scored as healthy. Three quiet failure classes the naive audit misses, each now a required check:
- **Orphaned code** — real modules with zero production callers (test-only / deleted-route) are effectively SHELL.
- **Split-brain wiring** — producer writes one table/id, consumer/UI reads another (e.g. `eva_ventures` vs `ventures`) → the operator sees NULL.
- **Stale-working-tree false negatives** — verify against COMMITTED code (`git ls-files`/`git show`), not this dirty, ~97-commits-behind checkout. Test-mode/baseline rows (`revenue_livemode=false`, 0-asset baselines) are NOT real exercise.

Gaps are classified **FIX-NOT-BUILD** (wire/connect an existing orphaned/split-brain producer — cheap, high-value) vs **NEW-BUILD** vs **NEEDS-DATA** (built but starved until real economics flow — not a build task).

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

## History (the instrument sharpens each run — that is the point)
- **v1 — 2026-06-24** (`…-2026-06-24.md`): app-only audit, false "0 BUILT / 11 SHELL"; verify-premise reversed 4/4. **Lesson → discipline #1 (cross-repo)**, baked into v2's audit phase.
- **v2 — 2026-06-24** (`…-2026-06-24-v2.md`): cross-repo audit, accurate "9 BUILT / 9 PARTIAL / 2 SHELL." Found the real story: the factory is built but **has never earned a dollar** — back-half engines compute on zeros; plus split-brain/orphaned bugs in "built" things. **Lesson → discipline #3 (BUILT ≠ EXERCISED + orphan/split-brain/committed checks)**, baked into v3's audit schema (`exercised`, `production_callers`, `producer_consumer_wired`, real-vs-test `db_evidence`) and backtrace (grade by real-data-flow; classify FIX-NOT-BUILD / NEW-BUILD / NEEDS-DATA).
- **v3 — 2026-06-24**: first run on the sharpened instrument — goal is the per-capability **exercised-vs-built scorecard** (which "BUILT" capabilities are actually starved/orphaned/split-brain) and new gaps beyond v2.
