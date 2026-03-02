# okr_vision_alignment_records Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-03-02T01:18:17.458Z
**Rows**: 0
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (9 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| objective_id | `uuid` | YES | - | - |
| key_result_id | `uuid` | YES | - | - |
| vision_document_id | `uuid` | **NO** | - | - |
| alignment_score | `numeric(3,2)` | YES | - | - |
| alignment_notes | `text` | YES | - | - |
| scored_by | `text` | YES | - | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `okr_vision_alignment_records_pkey`: PRIMARY KEY (id)

### Check Constraints
- `at_least_one_target`: CHECK (((objective_id IS NOT NULL) OR (key_result_id IS NOT NULL)))
- `okr_vision_alignment_records_alignment_score_check`: CHECK (((alignment_score >= (0)::numeric) AND (alignment_score <= (1)::numeric)))

## Indexes

- `idx_okr_vision_alignment_obj`
  ```sql
  CREATE INDEX idx_okr_vision_alignment_obj ON public.okr_vision_alignment_records USING btree (objective_id) WHERE (objective_id IS NOT NULL)
  ```
- `okr_vision_alignment_records_pkey`
  ```sql
  CREATE UNIQUE INDEX okr_vision_alignment_records_pkey ON public.okr_vision_alignment_records USING btree (id)
  ```

## RLS Policies

### 1. authenticated_read_okr_alignment (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. service_role_all_okr_alignment (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

## Triggers

### trg_okr_alignment_updated_at

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION fn_update_okr_alignment_timestamp()`

---

[← Back to Schema Overview](../database-schema-overview.md)
