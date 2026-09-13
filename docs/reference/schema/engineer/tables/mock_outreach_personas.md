# mock_outreach_personas Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-09-13T06:31:02.341Z
**Rows**: 0
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (7 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| mock_run_id | `uuid` | **NO** | - | Correlates to venture_channel_publish_ledger.mock_run_id for the same declared mock run. |
| venture_id | `uuid` | YES | - | - |
| persona_template | `text` | **NO** | - | Which persona template generated this synthetic persona (provenance). |
| display_name | `text` | **NO** | - | - |
| attributes | `jsonb` | **NO** | `'{}'::jsonb` | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `mock_outreach_personas_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `mock_outreach_personas_venture_id_fkey`: venture_id → ventures(id)

## Indexes

- `idx_mock_outreach_personas_run`
  ```sql
  CREATE INDEX idx_mock_outreach_personas_run ON public.mock_outreach_personas USING btree (mock_run_id)
  ```
- `idx_mock_outreach_personas_venture`
  ```sql
  CREATE INDEX idx_mock_outreach_personas_venture ON public.mock_outreach_personas USING btree (venture_id)
  ```
- `mock_outreach_personas_pkey`
  ```sql
  CREATE UNIQUE INDEX mock_outreach_personas_pkey ON public.mock_outreach_personas USING btree (id)
  ```

## RLS Policies

### 1. mop_service_role (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

### 2. mop_venture_access (SELECT)

- **Roles**: {authenticated}
- **Using**: `(venture_id IN ( SELECT v.id
   FROM ventures v
  WHERE (v.company_id IN ( SELECT user_company_access.company_id
           FROM user_company_access
          WHERE (user_company_access.user_id = auth.uid())))))`

---

[← Back to Schema Overview](../database-schema-overview.md)
