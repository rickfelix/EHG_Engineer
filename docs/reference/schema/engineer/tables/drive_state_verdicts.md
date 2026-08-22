# drive_state_verdicts Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-08-22T17:33:48.904Z
**Rows**: 1,200
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (9 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `bigint(64)` | **NO** | `nextval('drive_state_verdicts_id_seq'::regclass)` | - |
| run_id | `text` | **NO** | - | - |
| axis | `text` | **NO** | - | - |
| state | `text` | **NO** | - | - |
| citation | `text` | **NO** | - | - |
| reason | `text` | YES | - | - |
| action_taken | `text` | **NO** | - | - |
| action_citation | `text` | YES | - | - |
| recorded_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `drive_state_verdicts_pkey`: PRIMARY KEY (id)

### Unique Constraints
- `drive_state_verdicts_one_row_per_run_axis`: UNIQUE (run_id, axis)

### Check Constraints
- `drive_state_verdicts_action_taken_check`: CHECK ((action_taken = ANY (ARRAY['NONE'::text, 'RECORDED'::text, 'UNVERIFIABLE'::text])))
- `drive_state_verdicts_axis_check`: CHECK ((axis = ANY (ARRAY['chairman_decisions'::text, 'coordinator_performance'::text, 'roadmap_motion'::text, 'venture_stage_motion'::text, 'fleet_health'::text, 'learning_conversion'::text])))
- `drive_state_verdicts_recorded_needs_citation`: CHECK (((action_taken <> 'RECORDED'::text) OR ((action_citation IS NOT NULL) AND (btrim(action_citation) <> ''::text))))
- `drive_state_verdicts_state_check`: CHECK ((state = ANY (ARRAY['CLEAR'::text, 'STALLED'::text, 'UNMEASURABLE'::text])))
- `drive_state_verdicts_unmeasurable_needs_reason`: CHECK (((state <> 'UNMEASURABLE'::text) OR ((reason IS NOT NULL) AND (btrim(reason) <> ''::text))))

## Indexes

- `drive_state_verdicts_axis_recorded_idx`
  ```sql
  CREATE INDEX drive_state_verdicts_axis_recorded_idx ON public.drive_state_verdicts USING btree (axis, recorded_at DESC)
  ```
- `drive_state_verdicts_one_row_per_run_axis`
  ```sql
  CREATE UNIQUE INDEX drive_state_verdicts_one_row_per_run_axis ON public.drive_state_verdicts USING btree (run_id, axis)
  ```
- `drive_state_verdicts_pkey`
  ```sql
  CREATE UNIQUE INDEX drive_state_verdicts_pkey ON public.drive_state_verdicts USING btree (id)
  ```
- `drive_state_verdicts_run_idx`
  ```sql
  CREATE INDEX drive_state_verdicts_run_idx ON public.drive_state_verdicts USING btree (run_id)
  ```

## RLS Policies

### 1. drive_state_verdicts_service_role (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
