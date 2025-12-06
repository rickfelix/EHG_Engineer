# Legacy 40-Stage Scripts Archive

**SD**: SD-VISION-TRANSITION-001C
**Date**: 2025-12-06
**Purpose**: Document legacy 40-stage references for audit trail

## Background

The EHG Venture Methodology has migrated from a 40-stage model to a 25-stage Venture Vision v2.0 model. This archive documents scripts that contain historical 40-stage references.

## Updated Scripts (Active)

The following scripts have been updated to use the 25-stage model:

1. `scripts/compliance-check.js` - Updated stage loop from 40 to 25
2. `scripts/validate-stages.js` - Updated validation from 40 to 25

## Database Changes

Migration file created: `database/migrations/20251206_venture_vision_v2_stage_constraints.sql`
- Updates CHECK constraints from `BETWEEN 1 AND 40` to `BETWEEN 1 AND 25`
- Updates default total_stages from 40 to 25

## Zod Schema Changes

File: `lib/validation/leo-schemas.ts`
- ComplianceChecksQuery.stage: `.max(40)` → `.max(25)`
- ComplianceViolationsQuery.stage: `.max(40)` → `.max(25)`
- ComplianceRunBody.stages: `.max(40)` → `.max(25)`

## Legacy Scripts (Historical - Not Updated)

The following scripts contain 40-stage references but are one-time-use PRD/SD creation scripts. They are not updated as they document historical decisions:

- `create-prd-sd-047a.js` - Historical PRD
- `create-prd-sd-047a-v2.js` - Historical PRD
- `create-prd-sd-gov-compliance-readiness-orchestrator-001.js` - Historical PRD
- `create-prd-sd-vision-transition-001.js` - Documents the 40→25 migration itself
- `create-sd-vision-transition-001.js` - Documents the 40→25 migration itself
- `insert-sd-*.js` - One-time SD insertion scripts
- `create-tier-user-stories.js` - Historical user story generation
- `generate-workflow-docs.js` - Legacy documentation generator

These scripts are preserved for historical audit purposes but should not be executed in production.

## Migration Notes

- The 25-stage model is documented in `/docs/workflow/stages_v2.yaml` (to be created in Child D)
- Legacy ventures with `tier=null` retain backward compatibility
- The transition is managed by Parent SD: SD-VISION-TRANSITION-001
