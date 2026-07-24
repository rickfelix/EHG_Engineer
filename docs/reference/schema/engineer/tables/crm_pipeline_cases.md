# crm_pipeline_cases Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-07-24T14:39:36.126Z
**Rows**: 2,556
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (9 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| contact_id | `uuid` | **NO** | - | - |
| venture_id | `uuid` | **NO** | - | - |
| case_type | `text` | **NO** | - | - |
| current_stage | `text` | **NO** | - | - |
| deal_value_cents | `bigint(64)` | YES | - | - |
| deal_currency | `text` | **NO** | `'USD'::text` | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `crm_pipeline_cases_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `crm_pipeline_cases_contact_id_fkey`: contact_id → crm_contacts(id)
- `crm_pipeline_cases_current_stage_case_type_fkey`: case_type → crm_pipeline_stage_defs(stage_key)
- `crm_pipeline_cases_venture_id_fkey`: venture_id → ventures(id)

### Check Constraints
- `crm_pipeline_cases_case_type_check`: CHECK ((case_type = ANY (ARRAY['pipeline'::text, 'support'::text])))
- `crm_pipeline_cases_deal_currency_check`: CHECK ((deal_currency = 'USD'::text))
- `crm_pipeline_cases_deal_value_cents_check`: CHECK (((deal_value_cents IS NULL) OR (deal_value_cents >= 0)))

## Indexes

- `crm_pipeline_cases_pkey`
  ```sql
  CREATE UNIQUE INDEX crm_pipeline_cases_pkey ON public.crm_pipeline_cases USING btree (id)
  ```
- `idx_crm_pipeline_cases_venture_id`
  ```sql
  CREATE INDEX idx_crm_pipeline_cases_venture_id ON public.crm_pipeline_cases USING btree (venture_id)
  ```

## RLS Policies

### 1. service_role_all (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

## Triggers

### trg_crm_enforce_pipeline_case_venture_access

- **Timing**: BEFORE INSERT
- **Action**: `EXECUTE FUNCTION crm_enforce_pipeline_case_venture_access()`

---

[← Back to Schema Overview](../database-schema-overview.md)
