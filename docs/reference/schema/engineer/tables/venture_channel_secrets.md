# venture_channel_secrets Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-07-24T14:39:36.126Z
**Rows**: 0
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (7 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| venture_id | `uuid` | **NO** | - | - |
| channel_type | `text` | **NO** | - | - |
| provider | `text` | YES | - | - |
| secret_ref | `text` | **NO** | - | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `venture_channel_secrets_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `venture_channel_secrets_venture_id_fkey`: venture_id → ventures(id)

### Unique Constraints
- `venture_channel_secrets_venture_id_channel_type_key`: UNIQUE (venture_id, channel_type)

## Indexes

- `idx_vcs_venture`
  ```sql
  CREATE INDEX idx_vcs_venture ON public.venture_channel_secrets USING btree (venture_id)
  ```
- `venture_channel_secrets_pkey`
  ```sql
  CREATE UNIQUE INDEX venture_channel_secrets_pkey ON public.venture_channel_secrets USING btree (id)
  ```
- `venture_channel_secrets_venture_id_channel_type_key`
  ```sql
  CREATE UNIQUE INDEX venture_channel_secrets_venture_id_channel_type_key ON public.venture_channel_secrets USING btree (venture_id, channel_type)
  ```

## RLS Policies

### 1. vcs_service_role_only (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

## Triggers

### trg_vcs_updated

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION trg_venture_channel_autonomy_updated_at()`

---

[← Back to Schema Overview](../database-schema-overview.md)
