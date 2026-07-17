# Governance-Situation Continuous-Learning Loop

**SD**: SD-LEO-INFRA-GOVERNANCE-SITUATION-CONTINUOUS-001 · Chairman directive 2026-07-16 · Solomon design v2 (corr c3616159)

**The constraint that shaped everything here: COMPOSE, don't greenfield.** Every layer extends a named, shipped mechanism — there is no new ledger table, no second recurrence engine, no second probe runner.

## The loop

capture → adjudicate → harden → GT-verify → watch recurrence

| Layer | Rides | New code |
|---|---|---|
| Situation ledger | `issue_patterns` (`category='governance_situation'`) | `lib/governance/situation-capture.js` — metadata convention only |
| Feeders | chairman corrections (decision/email lane) · near-misses (`lib/adam/should-consult-solomon.js` verdict-delta capture, SD ADAM-PRE-SEND-001) · drift (adherence probes) · retros (`/learn`, retro-agent) | none (fold into capture) |
| Adjudication | the existing Solomon consult lane | none |
| Probe registry | generalizes `lib/adam/adherence-probes.js` + the per-role adherence scripts | `governance_probe_registry` (STAGED DDL) + `lib/governance/probe-runner.mjs` |
| GT-verify | shadow-trial sealed replay (`scripts/governance/shadow-run-proposal.mjs`, `lib/governance/shadow-trial/shadow-run.mjs`) | none |
| Recurrence watch | `issue_patterns` auto-reopen (rca-learning-ingestion semantics) | none (capture helper reuses the semantics) |
| Loop closure | `loop_registry` + the closure verifier | one data row (`GOVERNANCE-SITUATION-LOOP`) |

## The metadata convention (situation ledger)

An `issue_patterns` row with `category='governance_situation'` and:

```json
{
  "class": "chairman_correction | near_miss | adherence_drift | decision_retro",
  "catch_layer": "chairman | solomon | probe",
  "hardening_ref": "<probe_key / rule / SD once adjudicated>",
  "situation_ref": "<provenance: decision id, feedback id, retro id, signal id>"
}
```

Row id = `GOV-<class>-<12-hex fingerprint of normalized summary>`. A re-capture of the same fingerprint increments `occurrence_count`; a re-capture against a **resolved** row auto-reopens it (`status='active'`, `metadata.reopened_at`) — the prior hardening did not hold. Closure goes ONLY through `lib/governance/pattern-closure.js`.

Note: `outcome_signals.pattern_recurrence` (outcome-tracker) is a **separate, intentional** recurrence surface for fix-effectiveness over feedback; this loop does not duplicate it.

## Probes as rows

`governance_probe_registry` (chairman-gated **STAGED** migration `20260717_governance_probe_registry_STAGED.sql` — no `@approved-by` until the explicit apply ceremony). One generic runner (`lib/governance/probe-runner.mjs`) evaluates every active row:

- `adherence_fact` — the pure fail-loud fact style of `adherence-probes.js`; unresolved fact ⇒ `unknown`, never a silent pass.
- `closure_predicate` — delegates to the loop-governance closure engine (`edge_freshness` / `backlog_drained` / `witness_recent`).

**Hardening = INSERT a probe row, never author a script.** Until the chairman applies the migration, the runner reports degraded and exits cleanly.

## GT-verify: a hardening counts only after replay catches its situation

Every probe row carries `gt_case_ref` + `added_from_situation` (the `GOV-*` id). Before a hardening counts, replay it against the originating situation through the shadow-trial sealed mechanism:

```
node scripts/governance/shadow-run-proposal.mjs --loop-key <L>
```

(stage proposal → `shadowRun()` against the sealed corpus → precheck packet — advisory, zero live mutation).

## Guards on the generator itself

- The registry and loop rules are **governed artifacts**: sandbox-prechecked, chairman-ratified, never widened through the loop itself.
- Hardenings that **expand agent authority are never-auto** — chairman-ratified only.
- The loop is registered in `loop_registry` with closure predicate *"a captured situation reaches verified-or-escalated within 14 days"* (`edge_freshness`, `authorized_writer='governance-situation-loop'`), so the existing governor surfaces stalls as OPEN/STARVED.

## The success metric

`node scripts/governance/catch-layer-migration-report.mjs` — catches must migrate DOWN over time (chairman → solomon → probe) at stable-or-falling severity. Fewer chairman-catches and more probe-catches = the loop working.
