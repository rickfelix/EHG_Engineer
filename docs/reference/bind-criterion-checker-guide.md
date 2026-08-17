# Observe-Only Exit Gate Bind-Criterion Checker

**Category**: Reference
**Status**: Approved
**Version**: 1.0.0
**Author**: SD-LEO-INFRA-BIND-OBSERVE-ONLY-001
**Last Updated**: 2026-08-17
**Tags**: exit-gates, observe-only, venture-stack, eva-lifecycle

## What it is

A read-only report tool that tells a LEAD reviewer whether any of the 5 observe-only
exit-gate strings — or the symmetric `VENTURE_STACK` compliance check — has accumulated
enough clean observation data to be safely flipped to binding (enforcing). It **flips
nothing itself**: the actual bind (moving a string from
`venture_stages.metadata.gates.exit_observe` to `gates.exit`, or adding
`missing.length===0` to `lib/eva/bridge/venture-stack-agent.js`'s `compliant`
computation) is a separate, later, human-authored change.

## Running it

```bash
node scripts/eva/check-bind-criteria.mjs           # human-readable table
node scripts/eva/check-bind-criteria.mjs --json    # machine-readable JSON
```

No setup, no env vars beyond the repo's existing Supabase credentials, no deployment —
it's an on-demand CLI, not a running service.

## The bind criterion

For each `(stage_number, gate_string)` pair, querying `system_events` where
`event_type='EXIT_GATE_OBSERVE_ONLY'`:

- **>=25 evaluation rows** for that exact pair
- **>=48 hours** between the first and most recent row
- **Zero rows** where `would_satisfy=false` for a MarketLens venture ID (the
  "flagship veto" — a single false-reject against the flagship blocks that string's
  bind indefinitely, regardless of row count or span)

The `VENTURE_STACK` check (`event_type='VENTURE_STACK_OBSERVE_ONLY'`) applies the same
row-count/span thresholds and additionally reports a false-positive-rate proxy (leaf SDs
where `missing.length>0` despite `compliant` currently being `true`) — that rate is
**advisory, not verdict-gating**: the SD gives no numeric threshold for "acceptably low,"
only a human-judgment instruction, so the tool reports the number rather than picking a
threshold on the reviewer's behalf.

## Known scope gap: "venture-2 cohort"

The bind criterion as originally described also names a "venture-2 cohort" alongside
MarketLens. That cohort has **no resolvable data mapping anywhere in the current schema**
(no `cohort` column on `ventures`, no `venture_cohorts`/`cohorts`/`venture_groups` table —
verified 2026-08-17). The checker's flagship-veto check is therefore scoped to
MarketLens-by-venture-id only; the CLI prints an explicit disclaimer to this effect on
every run rather than silently guessing at a cohort definition.

## Reading the output

| Field | Meaning |
|-------|---------|
| `verdict` | `MEETS_CRITERION` or `NOT_MET` |
| `reason` | Only present on `NOT_MET`: `insufficient_rows`, `insufficient_span`, or `flagship_veto` |
| `marketlens_status` | `CLEAN` (evaluated, zero false-rejects), `UNTESTED` (never evaluated against a MarketLens venture ID — distinct from `CLEAN`), or `FALSE_REJECT` |
| `false_positive_proxy_rate` | VENTURE_STACK only; `null` when zero rows observed |

## Source

- `lib/eva/lifecycle/bind-criterion-checker.js` — pure evaluator functions + paginated query layer
- `scripts/eva/check-bind-criteria.mjs` — CLI report renderer
- Tests: `tests/unit/eva/bind-criterion-checker.test.js`, `tests/unit/eva/check-bind-criteria-cli.test.js`, `tests/integration/bind-criterion-checker.db.test.js`
