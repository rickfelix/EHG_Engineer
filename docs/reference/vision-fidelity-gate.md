# Vision-Fidelity Gate

**SD**: `SD-LEO-INFRA-VISION-FIDELITY-GATE-001`
**Phase**: PLAN-TO-LEAD
**Gate name**: `VISION_FIDELITY_GATE`
**Sub-agent**: `VISION_FIDELITY` (`lib/sub-agents/vision-fidelity/index.js`)

## What it does

Compares an SD's source vision wireframe (rows in `eva_vision_documents` and `eva_architecture_plans`) against the actual implementation (PRD `acceptance_criteria` + `functional_requirements` + the SD branch's git diff). The output is a tabulation of:

- **delivered_elements** — present in both vision and implementation
- **partial_elements** — present in vision, partially shipped
- **missing_elements** — named in vision, absent from implementation (each carries a `severity: critical | normal`)
- **scope_creep_elements** — present in implementation, not named in vision/arch/PRD

Closes the *"shipped activation, missed UX"* gap surfaced by `SD-ACTIVATE-S18-MARKETING-COPY-ORCH-001` where chairman manual smoke caught 8 wireframe items the existing gate pipeline missed.

## Severity policy by `sd_type`

| sd_type | Mode | Block threshold |
|---|---|---|
| `feature`, `bugfix` | block | `critical_missing > 2` OR (`critical_missing > 1` AND `non_critical_missing > 5`) |
| `database`, `security` | block | `critical_missing > 1` |
| `infrastructure` | warn-only | never blocks; missing elements surface as warnings |
| `documentation`, `refactor` | skip | no LLM call, no DB row, no warnings |
| anything else | block (default) | `critical_missing > 2` |

Defined in `lib/sub-agents/vision-fidelity/severity-policy.js` (`classifyOutcome`). Pure-functional — safe to import from any context.

## Skip and fail-soft paths

| Condition | Verdict | DB row written? | Notes |
|---|---|---|---|
| `sd_type` policy says skip | `PASS` | No | Per FR-3 — documentation/refactor don't produce UI |
| Metadata has no `vision_key` | `PENDING` | Yes (with `details.skipped_reason='no_vision_key'`) | Legacy SDs pre-vision-system |
| `vision_key` not found in `eva_vision_documents` | `PENDING` | Yes (advisory) | Vision doc not yet authored for this SD |
| LLM call exceeds 90 s timeout | `PENDING` | Yes (with `details.timeout=true`) | Advisory-only; never blocks |
| Sub-agent throws | advisory pass at gate level | No | Gate's fail-soft wrapper catches and warns |

## Bypass

Use the standard `--bypass-validation --bypass-reason` path (CONST-015). The bypass-rubric (`scripts/modules/handoff/bypass-rubric.js`) recognizes a new category for vision-fidelity-specific deviation:

```
node scripts/handoff.js execute PLAN-TO-LEAD <SD-ID> \
  --bypass-validation \
  --bypass-reason "Wireframe shows post-backend state but this PR is pre-backend; backend lands in SD-FOLLOWUP-001"
```

The reason matches `VISION_DELIBERATE_DEVIATION` in `LEGITIMATE_REASONS` (FR-4). Audit log row is created automatically.

Other categories already legitimate for vision-fidelity bypass: `TOOLING_BUG` (gate false positive), `DEPENDENCY_BLOCKED` (vision document not yet authored), `INFRA_MIGRATION` (`eva_vision_documents` schema in flux).

## Persistence

Each gate run writes one row to `sub_agent_execution_results` with:

```
sub_agent_code = 'VISION_FIDELITY'
phase          = 'PLAN_VERIFICATION'
verdict        = 'PASS' | 'CONDITIONAL_PASS' | 'WARNING' | 'FAIL' | 'PENDING'
metadata       = {
  vision_key, arch_key, sd_type,
  delivered_count, partial_count, missing_count,
  critical_missing, non_critical_missing,
  scope_creep_count, scope_creep_elements,
  total_elements, vision_coverage_pct,  // delivered / total, 0-1 numeric
  severity_mode                          // 'block' | 'warn' | 'skip'
}
```

`vision_coverage_pct` is the canonical health metric for retrospective dashboards.

## Trend query

`scripts/queries/vision-coverage-trend.sql` returns weekly coverage trend by `sd_type` and verdict over the last 90 days. Run via:

```bash
psql "$SUPABASE_DB_URL" -f scripts/queries/vision-coverage-trend.sql
```

Example output (truncated):

```
   week    | sd_type        | verdict | gate_run_count | avg_coverage_pct | avg_missing | fail_runs | warn_runs | pass_runs
-----------+----------------+---------+----------------+------------------+-------------+-----------+-----------+-----------
2026-04-27 | feature        | PASS    |              4 |             0.94 |         0.5 |         0 |         0 |         4
2026-04-27 | feature        | FAIL    |              1 |             0.20 |         8.0 |         1 |         0 |         0
2026-04-27 | infrastructure | WARNING |              2 |             0.65 |         3.0 |         0 |         2 |         0
```

## Why severity tiering matters

Without per-`sd_type` thresholds, the gate would block infrastructure SDs that legitimately don't ship UI (e.g. handoff-pipeline SDs), generating noise that operators learn to bypass — eroding signal. Per the FR-3 design:

- **block**-mode types are the ones with chairman-facing UX (feature/bugfix) or audit-trail integrity (database/security)
- **warn**-mode types still surface visibility into wireframe coverage, but never block — useful for catching cases where an infra SD accidentally took on UI scope
- **skip**-mode types are documentation-only changes where the gate is pure noise

## Related artifacts

- **PRD**: `b334caaa-a4bc-4213-9872-73e2059fdd0c` (in `product_requirements_v2`)
- **Sub-agent module**: `lib/sub-agents/vision-fidelity/index.js`
- **Severity policy**: `lib/sub-agents/vision-fidelity/severity-policy.js`
- **Gate factory**: `scripts/modules/handoff/executors/plan-to-lead/gates/vision-fidelity.js`
- **Bypass rubric**: `scripts/modules/handoff/bypass-rubric.js` (search `VISION_DELIBERATE_DEVIATION`)
- **Gate registration**: `scripts/modules/handoff/executors/plan-to-lead/gates/index.js`
- **Trend query**: `scripts/queries/vision-coverage-trend.sql`
- **Case-study fixture**: `lib/sub-agents/vision-fidelity/__tests__/s18-case-study.test.js` (TS-2)

## Tests

- `lib/sub-agents/vision-fidelity/__tests__/policy.test.js` — 17 cases covering FR-3 + FR-4 (PR-1)
- `lib/sub-agents/vision-fidelity/__tests__/agent.test.js` — 6 cases covering FR-1 (TS-1, 3, 4, 6, 7, 8) (PR-2)
- `lib/sub-agents/vision-fidelity/__tests__/s18-case-study.test.js` — 1 case covering FR-7 (TS-2) (PR-2)
- `scripts/modules/handoff/executors/plan-to-lead/gates/vision-fidelity.test.js` — 8 cases covering FR-2 (PR-3)
