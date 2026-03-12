# experiments Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-03-12T00:17:04.580Z
**Rows**: N/A (RLS restricted)
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (10 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| name | `text` | **NO** | - | - |
| hypothesis | `text` | **NO** | - | - |
| variants | `jsonb` | **NO** | `'[]'::jsonb` | JSONB array of variant objects, each with key, name, and config |
| status | `text` | **NO** | `'draft'::text` | - |
| config | `jsonb` | YES | `'{}'::jsonb` | JSONB object for experiment-level configuration (sample size, duration, etc.) |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| started_at | `timestamp with time zone` | YES | - | - |
| ended_at | `timestamp with time zone` | YES | - | - |
| created_by | `text` | YES | `'system'::text` | - |

## Constraints

### Primary Key
- `experiments_pkey`: PRIMARY KEY (id)

### Check Constraints
- `experiments_status_check`: CHECK ((status = ANY (ARRAY['draft'::text, 'running'::text, 'stopped'::text, 'archived'::text])))

## Indexes

- `experiments_pkey`
  ```sql
  CREATE UNIQUE INDEX experiments_pkey ON public.experiments USING btree (id)
  ```
- `idx_experiments_status`
  ```sql
  CREATE INDEX idx_experiments_status ON public.experiments USING btree (status)
  ```

## RLS Policies

### 1. service_role_experiments (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
