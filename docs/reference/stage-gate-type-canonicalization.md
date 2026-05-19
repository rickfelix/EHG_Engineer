# Stage Gate Type Canonicalization

**SD reference**: SD-LEO-REFAC-CANONICALIZE-STAGE-CONFIG-001 (shipped 2026-05-19)
**Pattern**: 28th witness of PAT-LEO-INFRA-WRITER-CONSUMER-ASYMMETRY-001

## TL;DR

`lifecycle_stage_config.work_type` is the **canonical source of truth** for stage gating semantics.
Never derive decision classification from `stage_config.gate_type` alone — it is a lossy 3-value mirror that cannot encode `sd_required` stages.

## The bug being prevented

`stage_config.gate_type` has values `{none, kill, promotion}`. `lifecycle_stage_config.work_type` has values `{artifact_only, automated_check, decision_gate, sd_required}`. The 4-way enum cannot be losslessly encoded in 3 values — `sd_required` collapses to `promotion` in `stage_config`.

Empirical witness: 2026-05-18, Cron Canary venture `09b7037e-cf6e-4057-9143-910c25c70788` reached S10 (`work_type=sd_required`); `monitor-venture-run.cjs` auto-approved it via the chairman_decisions RPC, treating it as a standard `promotion` gate. Row `d37843b3` in `chairman_decisions` confirms.

## Canonical rule

```
work_type='sd_required'     → no chairman_decisions row (SD drives the stage)
work_type='decision_gate'   → chairman_decisions row, decision_type='stage_gate'
work_type='artifact_only'   → no chairman_decisions row UNLESS review_mode='review'
work_type='automated_check' → no chairman_decisions row (system-driven)
review_mode='review'        → chairman_decisions row, decision_type='review' (independent of work_type)
```

## Writer checklist

Before writing a new writer that reads stage classification:

1. **Read `lifecycle_stage_config.work_type`**, not `stage_config.gate_type`.
2. **Apply the 5-way switch** (see `scripts/backfill-chairman-decisions-missing-rows.mjs:35` `deriveDecisionType()`).
3. **Excluding sd_required stages?** Use `stage_config.gate_type_canonical` (the trigger-maintained mirror added by this SD's migration), OR JOIN to `lifecycle_stage_config.work_type` directly.
4. **Add a vitest unit test** asserting your writer skips sd_required stages.

## Reference reading

| Source | What it gives you |
|---|---|
| `lib/eva/stage-governance.js` | Canonical sets (`killStages`, `promotionStages`, `reviewStages`) derived from `work_type`. Use this in `lib/eva/*` consumers. |
| `scripts/backfill-chairman-decisions-missing-rows.mjs` | The 5-way `deriveDecisionType()` switch. Reference implementation for new writers. |
| `scripts/monitor-venture-run.cjs` | `SD_REQUIRED_STAGES` guard pattern + drift-detection startup assert. |
| `database/migrations/20260519_canonicalize_stage_config_gate_type.sql` | The schema change + trigger pair + CHECK constraint + INVARIANT seed. |
| `scripts/modules/architectural-prevention/stage-gate-type-canonicalize-invariant.js` | INVARIANT detector (WARNING-then-BLOCKING). |

## INVARIANT — WARNING→BLOCKING graduation

`app_config` row `stage_config_gate_type_canonicalization` holds:

```json
{
  "mode": "WARNING",
  "graduation_date": "2026-06-03",
  "rubric": {
    "writer_adoption_pct_min": 80,
    "fallback_hit_count_14d_max": 0,
    "block_dryrun_violations_max": 0
  },
  "anchor": "pr_merge_timestamp"
}
```

Graduation to `BLOCKING` requires **all three** rubric criteria met **AND** today ≥ graduation_date.

## Out of scope (file follow-up SDs)

- Reconciliation of `lifecycle_stage_config.sd_required` boolean column (S14/S15/S16 have `sd_required=true` but `work_type ∈ {artifact_only, decision_gate}`).
- Dropping `stage_config.gate_type` column (Option A). Not safe — `artifact-persistence-service.js` uses `gate_type` in its UPSERT `onConflict` composite key.
