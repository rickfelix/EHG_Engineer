# account_usage_snapshots Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-08-22T17:33:48.904Z
**Rows**: 2,160
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (10 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `bigint(64)` | **NO** | `nextval('account_usage_snapshots_id_seq'::regclass)` | - |
| account_name | `text` | **NO** | - | - |
| account_uuid8 | `text` | YES | - | - |
| weekly_pct | `numeric(5,2)` | YES | - | - |
| five_hour_pct | `numeric(5,2)` | YES | - | - |
| weekly_resets_at | `timestamp with time zone` | YES | - | - |
| five_hour_resets_at | `timestamp with time zone` | YES | - | - |
| state | `text` | **NO** | - | - |
| fetched_at | `timestamp with time zone` | **NO** | - | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `account_usage_snapshots_pkey`: PRIMARY KEY (id)

### Unique Constraints
- `account_usage_snapshots_account_name_fetched_at_key`: UNIQUE (account_name, fetched_at)

### Check Constraints
- `account_usage_snapshots_state_check`: CHECK ((state = ANY (ARRAY['ok'::text, 'not_configured'::text, 'unauthorized'::text, 'unexpected_shape'::text, 'timeout'::text, 'unreachable'::text, 'exhausted'::text, 'duplicate_identity'::text])))

## Indexes

- `account_usage_snapshots_account_name_fetched_at_key`
  ```sql
  CREATE UNIQUE INDEX account_usage_snapshots_account_name_fetched_at_key ON public.account_usage_snapshots USING btree (account_name, fetched_at)
  ```
- `account_usage_snapshots_pkey`
  ```sql
  CREATE UNIQUE INDEX account_usage_snapshots_pkey ON public.account_usage_snapshots USING btree (id)
  ```
- `idx_account_usage_snapshots_name_fetched`
  ```sql
  CREATE INDEX idx_account_usage_snapshots_name_fetched ON public.account_usage_snapshots USING btree (account_name, fetched_at DESC)
  ```

## RLS Policies

### 1. account_usage_snapshots_service_role_all (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
