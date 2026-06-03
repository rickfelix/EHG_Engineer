# eva_cascade_errors Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-06-03T20:43:46.054Z
**Rows**: 0
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (12 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| vision_id | `uuid` | **NO** | - | - |
| archplan_key | `text` | YES | - | TEXT not FK: stage=vision_to_archplan refusals occur before the archplan exists. Soft-join to eva_architecture_plans.plan_key. |
| stage | `text` | **NO** | - | vision_to_archplan | archplan_to_orchestrator |
| error_code | `text` | **NO** | - | - |
| error_message | `text` | **NO** | - | - |
| remediation_command | `text` | YES | - | Suggested operator action, e.g. "node scripts/archplan-command.mjs --vision VISION-FOO-L2-001" |
| metadata | `jsonb` | **NO** | `'{}'::jsonb` | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |
| resolved_at | `timestamp with time zone` | YES | - | - |
| resolved_by | `text` | YES | - | - |

## Constraints

### Primary Key
- `eva_cascade_errors_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `eva_cascade_errors_vision_id_fkey`: vision_id → eva_vision_documents(id)

### Check Constraints
- `eva_cascade_errors_error_code_nonempty_chk`: CHECK ((length(btrim(error_code)) > 0))
- `eva_cascade_errors_error_message_nonempty_chk`: CHECK ((length(btrim(error_message)) > 0))
- `eva_cascade_errors_resolved_pair_chk`: CHECK ((((resolved_at IS NULL) AND (resolved_by IS NULL)) OR ((resolved_at IS NOT NULL) AND (resolved_by IS NOT NULL))))
- `eva_cascade_errors_stage_chk`: CHECK ((stage = ANY (ARRAY['vision_to_archplan'::text, 'archplan_to_orchestrator'::text])))

## Indexes

- `eva_cascade_errors_open_uniq`
  ```sql
  CREATE UNIQUE INDEX eva_cascade_errors_open_uniq ON public.eva_cascade_errors USING btree (vision_id, stage, error_code) WHERE (resolved_at IS NULL)
  ```
- `eva_cascade_errors_pkey`
  ```sql
  CREATE UNIQUE INDEX eva_cascade_errors_pkey ON public.eva_cascade_errors USING btree (id)
  ```
- `eva_cascade_errors_stage_open_idx`
  ```sql
  CREATE INDEX eva_cascade_errors_stage_open_idx ON public.eva_cascade_errors USING btree (stage, created_at DESC) WHERE (resolved_at IS NULL)
  ```
- `eva_cascade_errors_vision_created_idx`
  ```sql
  CREATE INDEX eva_cascade_errors_vision_created_idx ON public.eva_cascade_errors USING btree (vision_id, created_at DESC)
  ```

## RLS Policies

### 1. eva_cascade_errors_authenticated_select (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. eva_cascade_errors_service_role_all (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

## Triggers

### trg_eva_cascade_errors_updated_at

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION update_updated_at_column()`

---

[← Back to Schema Overview](../database-schema-overview.md)
