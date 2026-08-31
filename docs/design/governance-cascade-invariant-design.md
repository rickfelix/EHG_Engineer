# Governance Cascade — Invariant Half — Phase-0 Design

**SD:** SD-LEO-INFRA-PHASE-DESIGN-GOVERNANCE-001
**Phase:** 0 (design-only — no production code)
**Status:** Design for decomposition into buildable child SDs
**Capability anchor:** Solomon STEP-0 vision-gauge shortlist, tranche 2, ruling 7cdcbd96

> **Path note:** `docs/plans/` is DB-only-blocked by the `pre-tool-enforce` hook
> (SD-LEO-INFRA-ONLY-ENFORCEMENT-STRATEGIC-002); this doc lives at `docs/design/`
> instead, per the same convention `docs/design/competitive-vigilance-observed-baseline-design.md`
> already established.

---

## 0. Why this exists, and the seam that bounds it

Solomon ruling 7cdcbd96 blesses "governance cascade enforced" as a genuinely unbuilt,
high-value capability, and explicitly draws a seam: *"plumbing vs invariant; cite
THREAD-DOWNSTREAM AS DEFERRED."* Two distinct halves exist:

- **Plumbing** — threading a *specific* ratified decision into a *specific* downstream
  producer (e.g. a chairman pricing decision reaching the S7 EVA stage). This is
  `SD-LEO-INFRA-RATIFIED-DECISIONS-THREAD-DOWNSTREAM-001`'s job (§3) — deferred, not
  rebuilt here.
- **Invariant** — a general-purpose check that a *ratified or required* piece of state
  did not silently drift unenforced in *any* downstream layer, independent of which
  specific decision or producer is involved. This design addresses the invariant half.

## 1. Disambiguation — three unrelated "governance cascade" namesakes

Before any design work, this term needs disambiguating: three existing things share the
name and none of them is what this design addresses.

| Namesake | What it actually is | Relationship to this design |
|---|---|---|
| `trigger_gr_governance_cascade` / `enforce_gr_governance_cascade` (`supabase/migrations/20260302_governance_guardrail_triggers.sql:11-28`, from `SD-LEO-GEN-ENFORCE-GOVERNANCE-GUARDRAILS-001`) | A `BEFORE INSERT` trigger checking that an SD row traces to `strategic_objectives` OR has a `parent_sd_id`. Pure SD-to-theme traceability. | Unrelated concern (§2 explains why it is also itself a live specimen of the invariant gap this design targets). |
| `SD-MAN-ORCH-VISION-HEAL-GOVERNANCE-001-02` ("Implement Strategic Governance Cascade Enforcement") | A completed, differently-scoped SD. | Not duplicated by this design. |
| `SD-REFILL-00CSWV6H` ("Governance cascade enforced") | A cancelled auto-refill stub of the same underlying roadmap item this SD descends from. | Superseded; this design supplies the real scoping work that stub never got. |

## 2. The premise, grounded in two live, independently-verified specimens

### 2.1 Specimen A — reasonless roadmap-link exceptions

`strategic_directives_v2` has 5,970 total rows. Of those, 414 SDs carry a
`metadata.roadmap_link_exception` at all; of *that* subset, **106 (25.6%)** have
`reason_supplied: false` — a required justification field, silently absent — live-verified
2026-08-31T21:53Z and independently reproduced by PLAN-phase TESTING at 22:01-22:04Z. This
is the drift specimen Solomon's ruling names directly (cited there as the "98→106" growth
since a prior ratified binding).

### 2.2 Specimen B — the enforcement trigger itself never shipped

PLAN-phase TESTING went further than the migration file text and checked the *live*
database directly: **zero** `enforce_gr_*` functions exist in `pg_proc`, and none of the
57 triggers live on `strategic_directives_v2` is a `trigger_gr_*` trigger. A rollback-wrapped
probe INSERT with both `strategic_objectives` and `parent_sd_id` null **succeeded** — the
guardrail migration file exists in the repo but was never applied to the live database.

Both specimens are the *same* underlying gap class: a piece of state the system has
already decided matters (a required exception reason; a required objective-trace) can
silently diverge from what's actually enforced, and nothing surfaces the gap. Specimen B is
the stronger witness precisely because it shows the failure mode compounds — even a
narrowly-scoped, already-written guardrail can sit unenforced with zero visible signal.

## 3. What this design does NOT rebuild

`SD-LEO-INFRA-RATIFIED-DECISIONS-THREAD-DOWNSTREAM-001` (status: `deferred`, phase: `EXEC`)
already owns the propagation-plumbing half: a shared loader for a venture's ratified
chairman decisions, threaded into downstream EVA stage producers (starting with S7
pricing), each producer either honoring the ratified value or emitting a structured
revision flag. This design cites that scope and does not duplicate it — the invariant
mechanism proposed below is deliberately decision-agnostic and producer-agnostic, unlike
THREAD-DOWNSTREAM-001's stage-specific threading.

## 4. Proposed invariant-detection design

The common shape across both specimens: **a required field/enforcement exists in
principle, but nothing periodically checks that it is actually enforced in practice.**
A general invariant-detection mechanism needs three parts:

1. **A registry of invariants** — each entry names a table/column/trigger that is
   supposed to hold, plus a live-checkable predicate (mirroring the shape
   `lib/governance/orphan-writers-registry.js` already uses for a different but
   structurally similar class of drift — see `SD-LEO-INFRA-COMPLETION-GATE-DATA-001-B`,
   shipped earlier today, for a working precedent of registry-entry-plus-live-check).
2. **A periodic live-check pass** — re-verifies each registered invariant against the
   database (not the migration file text), the exact gap that let Specimen B go
   undetected — checking whether the trigger merely *exists in the repo* is not
   sufficient; it must confirm the trigger *fires in the live database*.
3. **A surfaced gap report** — reasonless-exception counts and undeployed-guardrail
   counts both become visible gauges, not buried facts a chairman-facing ruling has to
   rediscover by hand each time.

## 5. Proposed child-SD decomposition

**Child SD 1 — Deploy the missing guardrail migration.** Apply
`20260302_governance_guardrail_triggers.sql` to the live database (or re-author it if it
has drifted since 20260302) and add a live-verification step — a check against `pg_proc`/
`pg_trigger`, not just file presence — to whatever process is supposed to confirm
chairman-gated migrations land. Closes Specimen B directly.

**Child SD 2 — Reasonless roadmap-link-exception remediation and prevention.** Backfill or
resolve the 106 reasonless rows, then add a write-time check (not just a later report)
that blocks a new `roadmap_link_exception` from landing without `reason_supplied: true`.
Closes Specimen A directly.

**Child SD 3 — General invariant registry + live-check pass.** Build the §4 mechanism as
a genuinely reusable capability, not specific to Specimens A/B — a registry entry plus a
live predicate check, following the `orphan-writers-registry.js` precedent's shape. Depends
on Child SD 1/2 landing first, since they are this mechanism's first two real specimens
and should seed the registry rather than the registry being built empty.

---

## Out of scope (this design pass)

- No code change to `20260302_governance_guardrail_triggers.sql`, `strategic_directives_v2`,
  or any application code — deploying the missing trigger is Child SD 1's implementation
  work.
- No remediation of the 106 reasonless rows — Child SD 2's implementation work.
- No build of the invariant-registry mechanism itself — Child SD 3's implementation work.
- No rebuild of `SD-LEO-INFRA-RATIFIED-DECISIONS-THREAD-DOWNSTREAM-001`'s propagation-plumbing
  scope — explicitly deferred per Solomon ruling 7cdcbd96's seam.
- No re-litigation of the plumbing-vs-invariant seam itself — that ruling is already made;
  this design operates strictly within the invariant half.
