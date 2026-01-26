<!-- ARCHIVED: 2026-01-26T16:26:50.884Z
     Reason: Duplicate of canonical file
     Original location: docs\workflow\dossiers\stage-01\08_configurability-matrix.md
     See: docs/fixes/duplicate-consolidation-manifest.json for details
-->

# Stage 1: Configurability Matrix


## Metadata
- **Category**: Guide
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-21
- **Tags**: database, migration, schema, supabase

## Configuration Surfaces

| Parameter | Type | Default | Range/Options | Impact | Source |
|-----------|------|---------|---------------|--------|--------|
| `title_min_length` | Integer | 3 | 1-50 | Entry gate strictness | EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:21 |
| `title_max_length` | Integer | 120 | 50-200 | UX constraint | EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:21 |
| `description_min_length` | Integer | 20 | 10-100 | Quality threshold | EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:22 |
| `description_max_length` | Integer | 2000 | 500-5000 | Detail depth | EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:22 |

**Evidence**: Character limits extracted from exit gates "Title validated (3-120 chars)" and "Description validated (20-2000 chars)"

## Automation Settings

| Setting | Current Value | Options | Source |
|---------|---------------|---------|--------|
| Progression Mode | Manual → Assisted → Auto | Manual / Assisted / Auto | EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:42 |

**Evidence**: `notes.progression_mode: "Manual → Assisted → Auto (suggested)"`

## Database Schema Configurability

**Table**: `ventures` (EHG app database)

**Relevant Columns**:
- `current_workflow_stage` (INTEGER, constraint 1-40)
- `status` (ENUM: active, in_progress, etc.)
- `name` (VARCHAR 255) — Maps to "title"
- `description` (TEXT) — Maps to "description"

**Evidence**: EHG@0d80dac:supabase/migrations/20250828094259_*.sql

**Flexibility**: JSONB column `metadata` allows dynamic field storage without schema migration

---

## Sources Table

| Source | Repo | Commit | Path | Lines |
|--------|------|--------|------|-------|
| Exit gates | EHG_Engineer | 6ef8cf4 | docs/workflow/stages.yaml | 20-23 |
| Progression mode | EHG_Engineer | 6ef8cf4 | docs/workflow/stages.yaml | 42 |
| DB schema | EHG | 0d80dac | supabase/migrations/20250828094259_*.sql | N/A |
