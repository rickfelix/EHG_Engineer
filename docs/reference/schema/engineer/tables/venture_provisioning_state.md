# venture_provisioning_state Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-04-07T23:47:56.225Z
**Rows**: 0
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (21 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| venture_id | `uuid` | **NO** | - | - |
| venture_name | `text` | **NO** | - | - |
| status | `text` | **NO** | `'pending'::text` | - |
| state | `text` | YES | - | - |
| current_step | `text` | YES | - | - |
| steps_completed | `ARRAY` | YES | `'{}'::text[]` | - |
| error_details | `text` | YES | - | - |
| retry_count | `integer(32)` | **NO** | `0` | - |
| github_repo_url | `text` | YES | - | - |
| registry_entry_id | `text` | YES | - | - |
| conformance_score | `integer(32)` | YES | - | - |
| conformance_threshold | `integer(32)` | YES | - | - |
| conformance_passed | `boolean` | YES | - | - |
| conformance_checks_total | `integer(32)` | YES | - | - |
| conformance_checks_passing | `integer(32)` | YES | - | - |
| conformance_failed_checks | `jsonb` | YES | - | - |
| conformance_checked_at | `timestamp with time zone` | YES | - | - |
| provisioned_at | `timestamp with time zone` | YES | - | - |
| completed_at | `timestamp with time zone` | YES | - | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `venture_provisioning_state_pkey`: PRIMARY KEY (venture_id)

### Unique Constraints
- `venture_provisioning_state_venture_name_key`: UNIQUE (venture_name)

### Check Constraints
- `venture_provisioning_state_conformance_score_check`: CHECK (((conformance_score IS NULL) OR ((conformance_score >= 0) AND (conformance_score <= 100))))
- `venture_provisioning_state_state_check`: CHECK ((state = ANY (ARRAY['provisioned'::text, 'pending'::text, 'failed'::text])))
- `venture_provisioning_state_status_check`: CHECK ((status = ANY (ARRAY['pending'::text, 'in_progress'::text, 'completed'::text, 'failed'::text])))

## Indexes

- `idx_vps_provisioned_at`
  ```sql
  CREATE INDEX idx_vps_provisioned_at ON public.venture_provisioning_state USING btree (provisioned_at DESC) WHERE (provisioned_at IS NOT NULL)
  ```
- `idx_vps_state`
  ```sql
  CREATE INDEX idx_vps_state ON public.venture_provisioning_state USING btree (state) WHERE (state IS NOT NULL)
  ```
- `idx_vps_status`
  ```sql
  CREATE INDEX idx_vps_status ON public.venture_provisioning_state USING btree (status)
  ```
- `idx_vps_venture_name`
  ```sql
  CREATE INDEX idx_vps_venture_name ON public.venture_provisioning_state USING btree (venture_name)
  ```
- `venture_provisioning_state_pkey`
  ```sql
  CREATE UNIQUE INDEX venture_provisioning_state_pkey ON public.venture_provisioning_state USING btree (venture_id)
  ```
- `venture_provisioning_state_venture_name_key`
  ```sql
  CREATE UNIQUE INDEX venture_provisioning_state_venture_name_key ON public.venture_provisioning_state USING btree (venture_name)
  ```

## RLS Policies

### 1. manage_venture_provisioning_state (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

### 2. select_venture_provisioning_state (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

## Triggers

### trg_venture_provisioning_state_updated

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION trg_vps_updated_at()`

---

[← Back to Schema Overview](../database-schema-overview.md)
