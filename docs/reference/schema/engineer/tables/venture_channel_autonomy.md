# venture_channel_autonomy Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-07-24T14:39:36.126Z
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
| channel_type | `text` | **NO** | - | - |
| autonomy_state | `text` | **NO** | `'propose_and_approve'::text` | - |
| clean_streak | `integer(32)` | **NO** | `0` | - |
| graduated_at | `timestamp with time zone` | YES | - | - |
| graduated_by | `text` | YES | - | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `venture_channel_autonomy_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `venture_channel_autonomy_venture_id_fkey`: venture_id → ventures(id)

### Unique Constraints
- `venture_channel_autonomy_venture_id_channel_type_key`: UNIQUE (venture_id, channel_type)

### Check Constraints
- `venture_channel_autonomy_autonomy_state_check`: CHECK ((autonomy_state = ANY (ARRAY['propose_and_approve'::text, 'autonomous'::text])))

## Indexes

- `idx_vca_venture`
  ```sql
  CREATE INDEX idx_vca_venture ON public.venture_channel_autonomy USING btree (venture_id)
  ```
- `venture_channel_autonomy_pkey`
  ```sql
  CREATE UNIQUE INDEX venture_channel_autonomy_pkey ON public.venture_channel_autonomy USING btree (id)
  ```
- `venture_channel_autonomy_venture_id_channel_type_key`
  ```sql
  CREATE UNIQUE INDEX venture_channel_autonomy_venture_id_channel_type_key ON public.venture_channel_autonomy USING btree (venture_id, channel_type)
  ```

## RLS Policies

### 1. vca_service_role (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

### 2. vca_venture_access (SELECT)

- **Roles**: {authenticated}
- **Using**: `(venture_id IN ( SELECT v.id
   FROM ventures v
  WHERE (v.company_id IN ( SELECT user_company_access.company_id
           FROM user_company_access
          WHERE (user_company_access.user_id = auth.uid())))))`

## Triggers

### trg_vca_updated

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION trg_venture_channel_autonomy_updated_at()`

---

[← Back to Schema Overview](../database-schema-overview.md)
