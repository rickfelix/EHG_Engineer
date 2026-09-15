# venture_capability_overrides Table

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

## Columns (6 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| venture_id | `uuid` | **NO** | - | - |
| capability_id | `text` | **NO** | - | - |
| override_reason | `text` | **NO** | - | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `venture_capability_overrides_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `venture_capability_overrides_venture_id_fkey`: venture_id → ventures(id)

### Unique Constraints
- `venture_capability_overrides_venture_id_capability_id_key`: UNIQUE (venture_id, capability_id)

## Indexes

- `idx_venture_capability_overrides_venture`
  ```sql
  CREATE INDEX idx_venture_capability_overrides_venture ON public.venture_capability_overrides USING btree (venture_id)
  ```
- `venture_capability_overrides_pkey`
  ```sql
  CREATE UNIQUE INDEX venture_capability_overrides_pkey ON public.venture_capability_overrides USING btree (id)
  ```
- `venture_capability_overrides_venture_id_capability_id_key`
  ```sql
  CREATE UNIQUE INDEX venture_capability_overrides_venture_id_capability_id_key ON public.venture_capability_overrides USING btree (venture_id, capability_id)
  ```

## RLS Policies

### 1. vco_service_role (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

### 2. vco_venture_access (SELECT)

- **Roles**: {authenticated}
- **Using**: `(venture_id IN ( SELECT v.id
   FROM ventures v
  WHERE (v.company_id IN ( SELECT user_company_access.company_id
           FROM user_company_access
          WHERE (user_company_access.user_id = auth.uid())))))`

---

[← Back to Schema Overview](../database-schema-overview.md)
