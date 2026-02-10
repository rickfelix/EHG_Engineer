# Migration Summary: 20260210_seed_evaluation_presets.sql

**Executed**: 2026-02-10
**Status**: SUCCESS
**Part of**: SD-LEO-ORCH-EVA-STAGE-CONFIGURABLE-001-L

## Changes Applied

### Data Inserted
- **6 evaluation presets** added to `evaluation_profiles` table

### Constraint Added
- **evaluation_profiles_name_version_key** UNIQUE constraint on (name, version) for idempotency

### Presets Seeded

| Name | Top Weight | Strategy |
|------|-----------|----------|
| viral_first | virality (0.30) | Growth-at-all-costs, organic growth loops |
| moat_first | moat_architecture (0.30) | Defensibility, competitive moat |
| revenue_first | chairman_constraints (0.25) | Revenue viability, unit economics |
| portfolio_synergy | portfolio_evaluation (0.25) | Portfolio fit, cross-reference |
| speed_to_market | build_cost (0.25) | Rapid execution, first-mover advantage |
| ehg_balanced | chairman_constraints (0.20) | Chairman-tuned balanced (ACTIVE DEFAULT) |

### Idempotency
- Uses `ON CONFLICT (name, version) DO UPDATE SET` for safe reruns
- Updates description, weights, gate_thresholds, created_by on conflict
- Transactional (BEGIN/COMMIT)

### Active Profile
- `ehg_balanced` set as active default via `enforce_single_active_profile` trigger
- Only one profile can be active at a time (radio-button pattern)

## Verification
- 9 total profiles (3 existing + 6 new)
- All 6 presets have created_by='seed_migration'
- Weight vectors validated: all sum to 1.0, contain all 9 components
- Gate thresholds validated: overall_min, component_min, red_flag_max within [0,1]
