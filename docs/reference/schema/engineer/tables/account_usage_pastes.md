# account_usage_pastes Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-09-05T10:58:44.446Z
**Rows**: 4
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (11 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `bigint(64)` | **NO** | `nextval('account_usage_pastes_id_seq'::regclass)` | - |
| account_uuid8 | `text` | **NO** | - | - |
| account_org_name | `text` | YES | - | - |
| pasted_at | `timestamp with time zone` | **NO** | - | - |
| session_pct | `numeric(5,2)` | YES | - | - |
| week_all_models_pct | `numeric(5,2)` | YES | - | - |
| week_fable_pct | `numeric(5,2)` | YES | - | - |
| session_reset_at | `timestamp with time zone` | YES | - | - |
| week_reset_at | `timestamp with time zone` | YES | - | - |
| promo_note | `text` | YES | - | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `account_usage_pastes_pkey`: PRIMARY KEY (id)

### Unique Constraints
- `account_usage_pastes_account_uuid8_pasted_at_key`: UNIQUE (account_uuid8, pasted_at)

### Check Constraints
- `account_usage_pastes_promo_note_check`: CHECK ((char_length(promo_note) <= 280))

## Indexes

- `account_usage_pastes_account_uuid8_pasted_at_key`
  ```sql
  CREATE UNIQUE INDEX account_usage_pastes_account_uuid8_pasted_at_key ON public.account_usage_pastes USING btree (account_uuid8, pasted_at)
  ```
- `account_usage_pastes_pkey`
  ```sql
  CREATE UNIQUE INDEX account_usage_pastes_pkey ON public.account_usage_pastes USING btree (id)
  ```
- `idx_account_usage_pastes_account_pasted`
  ```sql
  CREATE INDEX idx_account_usage_pastes_account_pasted ON public.account_usage_pastes USING btree (account_uuid8, pasted_at DESC)
  ```

## RLS Policies

### 1. account_usage_pastes_service_role_all (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
