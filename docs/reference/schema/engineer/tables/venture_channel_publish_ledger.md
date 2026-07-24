# venture_channel_publish_ledger Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-07-24T14:39:36.126Z
**Rows**: 3
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (12 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| venture_id | `uuid` | **NO** | - | - |
| channel_type | `text` | **NO** | - | - |
| content_ref | `text` | YES | - | - |
| correlation_id | `text` | **NO** | - | - |
| decision | `text` | **NO** | `'pending'::text` | - |
| decision_by | `text` | YES | - | - |
| decision_at | `timestamp with time zone` | YES | - | - |
| outcome | `text` | **NO** | `'unknown'::text` | - |
| outcome_ref | `text` | YES | - | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `venture_channel_publish_ledger_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `venture_channel_publish_ledger_venture_id_fkey`: venture_id → ventures(id)

### Unique Constraints
- `venture_channel_publish_ledger_correlation_id_key`: UNIQUE (correlation_id)

### Check Constraints
- `venture_channel_publish_ledger_decision_check`: CHECK ((decision = ANY (ARRAY['pending'::text, 'accepted'::text, 'rejected'::text, 'partial'::text])))
- `venture_channel_publish_ledger_outcome_check`: CHECK ((outcome = ANY (ARRAY['unknown'::text, 'shipped_clean'::text, 'reverted'::text, 'caused_rework'::text])))

## Indexes

- `idx_vcpl_created`
  ```sql
  CREATE INDEX idx_vcpl_created ON public.venture_channel_publish_ledger USING btree (created_at DESC)
  ```
- `idx_vcpl_venture_channel`
  ```sql
  CREATE INDEX idx_vcpl_venture_channel ON public.venture_channel_publish_ledger USING btree (venture_id, channel_type)
  ```
- `venture_channel_publish_ledger_correlation_id_key`
  ```sql
  CREATE UNIQUE INDEX venture_channel_publish_ledger_correlation_id_key ON public.venture_channel_publish_ledger USING btree (correlation_id)
  ```
- `venture_channel_publish_ledger_pkey`
  ```sql
  CREATE UNIQUE INDEX venture_channel_publish_ledger_pkey ON public.venture_channel_publish_ledger USING btree (id)
  ```

## RLS Policies

### 1. vcpl_service_role (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

### 2. vcpl_venture_access (SELECT)

- **Roles**: {authenticated}
- **Using**: `(venture_id IN ( SELECT v.id
   FROM ventures v
  WHERE (v.company_id IN ( SELECT user_company_access.company_id
           FROM user_company_access
          WHERE (user_company_access.user_id = auth.uid())))))`

## Triggers

### trg_vcpl_updated

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION trg_venture_channel_autonomy_updated_at()`

---

[← Back to Schema Overview](../database-schema-overview.md)
