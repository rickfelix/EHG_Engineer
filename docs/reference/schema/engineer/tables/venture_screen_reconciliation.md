# venture_screen_reconciliation Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-09-15T16:18:27.599Z
**Rows**: 0
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (10 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| venture_id | `uuid` | **NO** | - | - |
| screen_id | `text` | **NO** | - | - |
| screen_name | `text` | YES | - | - |
| built_surface_artifact_type | `text` | YES | - | - |
| journey_ids | `jsonb` | **NO** | `'[]'::jsonb` | - |
| walked_step_evidence | `jsonb` | YES | - | - |
| reconciliation_status | `text` | **NO** | - | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `venture_screen_reconciliation_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `venture_screen_reconciliation_venture_id_fkey`: venture_id → ventures(id)

### Unique Constraints
- `venture_screen_reconciliation_venture_id_screen_id_key`: UNIQUE (venture_id, screen_id)

### Check Constraints
- `venture_screen_reconciliation_reconciliation_status_check`: CHECK ((reconciliation_status = ANY (ARRAY['built_and_walked'::text, 'built_not_walked'::text, 'not_built'::text, 'unreachable'::text])))

## Indexes

- `idx_venture_screen_reconciliation_venture`
  ```sql
  CREATE INDEX idx_venture_screen_reconciliation_venture ON public.venture_screen_reconciliation USING btree (venture_id)
  ```
- `venture_screen_reconciliation_pkey`
  ```sql
  CREATE UNIQUE INDEX venture_screen_reconciliation_pkey ON public.venture_screen_reconciliation USING btree (id)
  ```
- `venture_screen_reconciliation_venture_id_screen_id_key`
  ```sql
  CREATE UNIQUE INDEX venture_screen_reconciliation_venture_id_screen_id_key ON public.venture_screen_reconciliation USING btree (venture_id, screen_id)
  ```

## RLS Policies

### 1. vsr_service_role (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

### 2. vsr_venture_access (SELECT)

- **Roles**: {authenticated}
- **Using**: `(venture_id IN ( SELECT v.id
   FROM ventures v
  WHERE (v.company_id IN ( SELECT user_company_access.company_id
           FROM user_company_access
          WHERE (user_company_access.user_id = auth.uid())))))`

---

[← Back to Schema Overview](../database-schema-overview.md)
