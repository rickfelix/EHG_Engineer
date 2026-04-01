# cleanup_orchestration_state Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-04-01T11:28:02.645Z
**Rows**: 0
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (12 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| venture_id | `uuid` | YES | - | - |
| venture_name | `text` | YES | - | - |
| credential_id | `integer(32)` | YES | - | - |
| credential_type | `character varying(100)` | YES | - | - |
| provider | `text` | **NO** | - | - |
| phase | `text` | **NO** | `'pending'::text` | - |
| attempt_count | `integer(32)` | YES | `0` | - |
| error_details | `text` | YES | - | - |
| revoked_at | `timestamp with time zone` | YES | - | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `cleanup_orchestration_state_pkey`: PRIMARY KEY (id)

## Indexes

- `cleanup_orchestration_state_pkey`
  ```sql
  CREATE UNIQUE INDEX cleanup_orchestration_state_pkey ON public.cleanup_orchestration_state USING btree (id)
  ```
- `idx_cos_credential`
  ```sql
  CREATE INDEX idx_cos_credential ON public.cleanup_orchestration_state USING btree (credential_id)
  ```
- `idx_cos_venture_phase`
  ```sql
  CREATE INDEX idx_cos_venture_phase ON public.cleanup_orchestration_state USING btree (venture_id, phase)
  ```

## RLS Policies

### 1. manage_cleanup_orchestration_state (ALL)

- **Roles**: {public}
- **Using**: `true`
- **With Check**: `true`

## Triggers

### trg_cleanup_orchestration_state_updated

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION trg_cleanup_orch_state_updated()`

---

[← Back to Schema Overview](../database-schema-overview.md)
