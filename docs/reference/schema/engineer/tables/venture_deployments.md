# venture_deployments Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-07-24T14:39:36.126Z
**Rows**: 2
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (10 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| venture_id | `uuid` | **NO** | - | - |
| sha | `text` | **NO** | - | - |
| revision | `text` | YES | - | - |
| url | `text` | YES | - | - |
| actor | `text` | **NO** | - | - |
| status | `text` | **NO** | `'planned'::text` | - |
| error | `text` | YES | - | - |
| metadata | `jsonb` | **NO** | `'{}'::jsonb` | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `venture_deployments_pkey`: PRIMARY KEY (id)

### Check Constraints
- `venture_deployments_status_check`: CHECK ((status = ANY (ARRAY['planned'::text, 'deployed_no_traffic'::text, 'routed'::text, 'failed'::text, 'rolled_back'::text])))

## Indexes

- `idx_venture_deployments_venture_created`
  ```sql
  CREATE INDEX idx_venture_deployments_venture_created ON public.venture_deployments USING btree (venture_id, created_at DESC)
  ```
- `venture_deployments_pkey`
  ```sql
  CREATE UNIQUE INDEX venture_deployments_pkey ON public.venture_deployments USING btree (id)
  ```

## RLS Policies

### 1. service_role_all (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
