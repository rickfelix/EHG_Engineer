# marketing_channels Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-21T13:23:45.333Z
**Rows**: 0
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (9 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| venture_id | `uuid` | **NO** | - | - |
| platform | `text` | **NO** | - | - |
| integration_type | `text` | **NO** | `'direct'::text` | - |
| credentials | `jsonb` | **NO** | `'{}'::jsonb` | - |
| rate_limits | `jsonb` | **NO** | `'{}'::jsonb` | - |
| status | `text` | **NO** | `'inactive'::text` | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `marketing_channels_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `marketing_channels_venture_id_fkey`: venture_id → ventures(id)

### Unique Constraints
- `marketing_channels_venture_id_platform_key`: UNIQUE (venture_id, platform)

## Indexes

- `idx_marketing_channels_venture`
  ```sql
  CREATE INDEX idx_marketing_channels_venture ON public.marketing_channels USING btree (venture_id)
  ```
- `marketing_channels_pkey`
  ```sql
  CREATE UNIQUE INDEX marketing_channels_pkey ON public.marketing_channels USING btree (id)
  ```
- `marketing_channels_venture_id_platform_key`
  ```sql
  CREATE UNIQUE INDEX marketing_channels_venture_id_platform_key ON public.marketing_channels USING btree (venture_id, platform)
  ```

## RLS Policies

### 1. service_role_all_marketing_channels (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

### 2. venture_read_marketing_channels (SELECT)

- **Roles**: {authenticated}
- **Using**: `(venture_id IN ( SELECT ventures.id
   FROM ventures
  WHERE ((auth.uid())::text = (ventures.created_by)::text)))`

## Triggers

### trg_marketing_channels_updated

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION update_marketing_updated_at()`

---

[← Back to Schema Overview](../database-schema-overview.md)
