# Migration Summary: 20260210_stage_of_death_predictions.sql

**Executed**: 2026-02-10
**Status**: ✅ SUCCESS
**Part of**: SD-LEO-ORCH-EVA-STAGE-CONFIGURABLE-001-J

## Changes Applied

### Table Created
- **stage_of_death_predictions** - Stores predicted death stage per venture × profile × archetype

### Schema Details
- **13 columns** including:
  - Primary key: `id` (UUID)
  - Unique constraint: `(venture_id, profile_id)`
  - Foreign key: `profile_id → evaluation_profiles(id)`
  - Death stage range: 1-25 (CHECK constraint)
  - Probability range: 0-1 (CHECK constraint)
  - JSONB fields: `death_factors`, `mortality_curve`

### Indexes Created (5)
1. `idx_sod_predictions_venture` - On venture_id
2. `idx_sod_predictions_archetype` - On archetype_key
3. `idx_sod_predictions_profile` - On profile_id
4. `idx_sod_predictions_stage` - On predicted_death_stage
5. `stage_of_death_predictions_venture_id_profile_id_key` - UNIQUE constraint index

### Security
- **RLS Enabled**: YES
- **Policy**: `service_role_full_access_sod_predictions` (FOR ALL to service_role)

### Triggers
- **trg_update_sod_predictions_timestamp** - Auto-updates `updated_at` on UPDATE

## Execution Method
- Used `SUPABASE_POOLER_URL` (password-less connection)
- Direct `pg.Client` execution via Node.js

## Verification
All components verified:
- ✅ Table structure matches spec
- ✅ All indexes created
- ✅ RLS policy active
- ✅ Trigger function registered

## Purpose
Enables stage-of-death prediction storage for EVA's portfolio analysis:
- Predicts at which funding stage a venture is most likely to fail
- Tracks prediction accuracy against actual outcomes
- Stores mortality curves and death factors per archetype
- Supports profile-specific predictions for sensitivity analysis
