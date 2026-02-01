# leo_feature_flags Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-01T11:57:53.424Z
**Rows**: 0
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (15 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |
| key | `text` | **NO** | - | - |
| name | `text` | **NO** | - | - |
| description | `text` | YES | - | - |
| status | `text` | **NO** | `'draft'::text` | - |
| owner_user_id | `uuid` | **NO** | - | - |
| owner_team | `text` | **NO** | `'ehg_engineer'::text` | - |
| expires_at | `timestamp with time zone` | YES | - | - |
| conditions | `jsonb` | **NO** | `'{}'::jsonb` | - |
| rollout_percentage | `integer(32)` | **NO** | `0` | - |
| proposal_id | `uuid` | YES | - | - |
| last_changed_by | `uuid` | YES | - | - |
| last_changed_at | `timestamp with time zone` | YES | - | - |

## Constraints

### Primary Key
- `leo_feature_flags_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `leo_feature_flags_proposal_id_fkey`: proposal_id → leo_proposals(id)

### Unique Constraints
- `uq_leo_feature_flags_key`: UNIQUE (key)

### Check Constraints
- `leo_feature_flags_rollout_percentage_check`: CHECK (((rollout_percentage >= 0) AND (rollout_percentage <= 100)))
- `leo_feature_flags_status_check`: CHECK ((status = ANY (ARRAY['draft'::text, 'enabled'::text, 'disabled'::text, 'expired'::text, 'archived'::text])))

## Indexes

- `idx_leo_feature_flags_proposal`
  ```sql
  CREATE INDEX idx_leo_feature_flags_proposal ON public.leo_feature_flags USING btree (proposal_id)
  ```
- `idx_leo_feature_flags_status`
  ```sql
  CREATE INDEX idx_leo_feature_flags_status ON public.leo_feature_flags USING btree (status, updated_at DESC)
  ```
- `leo_feature_flags_pkey`
  ```sql
  CREATE UNIQUE INDEX leo_feature_flags_pkey ON public.leo_feature_flags USING btree (id)
  ```
- `uq_leo_feature_flags_key`
  ```sql
  CREATE UNIQUE INDEX uq_leo_feature_flags_key ON public.leo_feature_flags USING btree (key)
  ```

## RLS Policies

### 1. Anon can read enabled feature flags (SELECT)

- **Roles**: {public}
- **Using**: `(status = 'enabled'::text)`

### 2. Service role full access to leo_feature_flags (ALL)

- **Roles**: {public}
- **Using**: `(auth.role() = 'service_role'::text)`
- **With Check**: `(auth.role() = 'service_role'::text)`

## Triggers

### trg_leo_feature_flags_validate

- **Timing**: BEFORE INSERT
- **Action**: `EXECUTE FUNCTION leo_feature_flags_validate()`

### trg_leo_feature_flags_validate

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION leo_feature_flags_validate()`

---

[← Back to Schema Overview](../database-schema-overview.md)
