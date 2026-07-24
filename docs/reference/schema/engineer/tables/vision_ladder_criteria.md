# vision_ladder_criteria Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-07-24T14:39:36.126Z
**Rows**: 26
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (8 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| rung_id | `uuid` | **NO** | - | - |
| ordinal | `integer(32)` | **NO** | - | - |
| capability | `text` | **NO** | - | - |
| today | `text` | **NO** | `''::text` | - |
| required | `text` | **NO** | `''::text` | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| nature | `text` | YES | - | Deterministic capability classification: buildable (the fleet can ship it) or operational (requires a live venture / KR / chairman signal). NULL = un-backfilled. Source of truth is OPERATIONAL_NATURE in lib/vision/vdr-registry.js. SD-LEO-INFRA-VISION-LADDER-ROADMAP-COHERENCE-001. |

## Constraints

### Primary Key
- `vision_ladder_criteria_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `vision_ladder_criteria_rung_id_fkey`: rung_id → vision_ladder_rungs(id)

### Unique Constraints
- `vision_ladder_criteria_rung_id_capability_key`: UNIQUE (rung_id, capability)

### Check Constraints
- `chk_vision_ladder_criteria_nature`: CHECK (((nature IS NULL) OR (nature = ANY (ARRAY['buildable'::text, 'operational'::text]))))

## Indexes

- `idx_vision_ladder_criteria_rung`
  ```sql
  CREATE INDEX idx_vision_ladder_criteria_rung ON public.vision_ladder_criteria USING btree (rung_id, ordinal)
  ```
- `vision_ladder_criteria_pkey`
  ```sql
  CREATE UNIQUE INDEX vision_ladder_criteria_pkey ON public.vision_ladder_criteria USING btree (id)
  ```
- `vision_ladder_criteria_rung_id_capability_key`
  ```sql
  CREATE UNIQUE INDEX vision_ladder_criteria_rung_id_capability_key ON public.vision_ladder_criteria USING btree (rung_id, capability)
  ```

## RLS Policies

### 1. vision_ladder_criteria_read (SELECT)

- **Roles**: {public}
- **Using**: `((auth.role() = 'authenticated'::text) OR (auth.role() = 'service_role'::text))`

### 2. vision_ladder_criteria_service_write (ALL)

- **Roles**: {public}
- **Using**: `(auth.role() = 'service_role'::text)`
- **With Check**: `(auth.role() = 'service_role'::text)`

---

[← Back to Schema Overview](../database-schema-overview.md)
