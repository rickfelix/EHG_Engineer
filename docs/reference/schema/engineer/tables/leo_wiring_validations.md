# leo_wiring_validations Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-04-16T20:19:17.442Z
**Rows**: 1
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (11 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| sd_key | `text` | **NO** | - | - |
| check_type | `USER-DEFINED` | **NO** | - | - |
| status | `USER-DEFINED` | **NO** | `'pending'::leo_wiring_check_status` | - |
| signals_detected | `integer(32)` | **NO** | `0` | - |
| evidence | `jsonb` | **NO** | `'{}'::jsonb` | - |
| executed_at | `timestamp with time zone` | **NO** | `now()` | - |
| waived_by | `uuid` | YES | - | - |
| waive_reason | `text` | YES | - | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `leo_wiring_validations_pkey`: PRIMARY KEY (id)

### Unique Constraints
- `leo_wiring_validations_unique`: UNIQUE (sd_key, check_type)

### Check Constraints
- `leo_wiring_validations_signals_detected_check`: CHECK ((signals_detected >= 0))
- `leo_wiring_validations_waiver_consistency`: CHECK ((((waived_by IS NULL) AND (waive_reason IS NULL)) OR ((waived_by IS NOT NULL) AND (waive_reason IS NOT NULL) AND (length(waive_reason) >= 10))))

## Indexes

- `idx_lwv_sd_key`
  ```sql
  CREATE INDEX idx_lwv_sd_key ON public.leo_wiring_validations USING btree (sd_key)
  ```
- `idx_lwv_status_open`
  ```sql
  CREATE INDEX idx_lwv_status_open ON public.leo_wiring_validations USING btree (status) WHERE (status = ANY (ARRAY['failed'::leo_wiring_check_status, 'pending'::leo_wiring_check_status]))
  ```
- `leo_wiring_validations_pkey`
  ```sql
  CREATE UNIQUE INDEX leo_wiring_validations_pkey ON public.leo_wiring_validations USING btree (id)
  ```
- `leo_wiring_validations_unique`
  ```sql
  CREATE UNIQUE INDEX leo_wiring_validations_unique ON public.leo_wiring_validations USING btree (sd_key, check_type)
  ```

## RLS Policies

### 1. lwv_service_all (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

## Triggers

### trg_lwv_set_updated_at

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION lwv_set_updated_at()`

### trg_zz_maintain_wiring_validated

- **Timing**: AFTER INSERT
- **Action**: `EXECUTE FUNCTION trg_zz_maintain_wiring_validated_fn()`

### trg_zz_maintain_wiring_validated

- **Timing**: AFTER UPDATE
- **Action**: `EXECUTE FUNCTION trg_zz_maintain_wiring_validated_fn()`

---

[← Back to Schema Overview](../database-schema-overview.md)
