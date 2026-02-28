---
category: general
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [general, auto-generated]
---
# EVA E2E Stage Test Report

**Date**: 2026-02-15
**Harness**: `scripts/e2e-stage-runner.mjs`
**Result**: 25/25 stages PASS, 0 findings

## Test Coverage

### Per-Stage Validation
For each of the 25 stages, the harness validates:
1. **Template structure** - `id`, `slug`, `title`, `version`, `schema`, `defaultData`, `validate()`, `computeDerived()`, `analysisStep` all present
2. **Valid data validation** - `validate()` returns `{valid: true}` with well-formed test data
3. **Invalid data validation** - `validate()` returns `{valid: false}` with empty/null data
4. **computeDerived execution** - Runs without error, returns object
5. **Schema/defaultData consistency** - Every top-level schema key exists in defaultData

### Gate Validation
| Gate Type | Stages | Tests | Result |
|-----------|--------|-------|--------|
| Kill Gate (pass path) | 3, 5, 13, 23 | Valid data yields `pass` | PASS |
| Kill Gate (kill path) | 3, 5, 13, 23 | Empty/bad data yields `kill` | PASS |
| Reality Gate (Stage 12) | 12 | Local gate with prerequisites | PASS |
| Promotion Gate (Stage 16) | 16 | Phase 4->5 with stages 13-16 | PASS |
| Promotion Gate (Stage 22) | 22 | Phase 5->6 with stages 17-22 | PASS |
| Decision Filter Engine | N/A | 6 trigger types, boundary scores | PASS |
| Reality Gate Module | 5->6, 9->10 | BOUNDARY_CONFIG boundaries | PASS |

### Phase Summary
| Phase | Stages | Status |
|-------|--------|--------|
| THE TRUTH | 1-5 | All PASS |
| THE ENGINE | 6-9 | All PASS |
| THE IDENTITY | 10-12 | All PASS |
| THE BLUEPRINT | 13-16 | All PASS |
| THE BUILD LOOP | 17-22 | All PASS |
| LAUNCH & LEARN | 23-25 | All PASS |

## Issues Fixed During Testing

During development of the test harness, 5 test data generators needed corrections to match actual stage schemas:

| Stage | Issue | Fix |
|-------|-------|-----|
| 02 | Test data used nested objects for `evidence`; schema expects flat strings | Changed to `{market, customer, competitive, execution}` as strings |
| 04 | Used `positioning`/`threat_level`/`pricing_model`; schema uses `position`/`threat`/`pricingModel` | Updated field names + added `strengths[]`, `weaknesses[]` |
| 06 | Missing `id`, `severity` (int), `owner`, `review_date`; strings too short | Added all required fields, used integer severity 1-5 |
| 12 | Missing `sales_model`, `deal_stages[]`; `funnel_stages` and `customer_journey` had wrong sub-fields | Added `sales_model` enum, `deal_stages[]`, fixed `metric`/`target_value`/`funnel_stage`/`touchpoint` |
| 13 | Used `target_date` (wrong); missing `phases[]`; `timeline_months` is derived not input | Changed to `date` with parseable dates, added `phases[]`, removed `timeline_months` |

**Note**: All issues were in test data generators, not in the stage templates themselves. The templates are correct.

## Deferred Items

None. All 25 stage templates validate correctly with proper test data.

## How to Run

```bash
# All stages
node scripts/e2e-stage-runner.mjs

# Single stage
node scripts/e2e-stage-runner.mjs --stage=13

# JSON output
node scripts/e2e-stage-runner.mjs --json
```
