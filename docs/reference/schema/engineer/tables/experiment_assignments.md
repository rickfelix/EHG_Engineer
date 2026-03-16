# experiment_assignments Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-03-16T10:01:05.770Z
**Rows**: N/A (RLS restricted)
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (6 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| experiment_id | `uuid` | **NO** | - | - |
| venture_id | `uuid` | **NO** | - | - |
| variant_key | `text` | **NO** | - | - |
| assigned_at | `timestamp with time zone` | **NO** | `now()` | - |
| data_origin | `text` | **NO** | `'organic'::text` | - |

## Constraints

### Primary Key
- `experiment_assignments_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `experiment_assignments_experiment_id_fkey`: experiment_id → experiments(id)

### Unique Constraints
- `experiment_assignments_experiment_id_venture_id_key`: UNIQUE (experiment_id, venture_id)

### Check Constraints
- `experiment_assignments_data_origin_check`: CHECK ((data_origin = ANY (ARRAY['organic'::text, 'synthetic'::text, 'imported'::text, 'retrospective'::text])))

## Indexes

- `experiment_assignments_experiment_id_venture_id_key`
  ```sql
  CREATE UNIQUE INDEX experiment_assignments_experiment_id_venture_id_key ON public.experiment_assignments USING btree (experiment_id, venture_id)
  ```
- `experiment_assignments_pkey`
  ```sql
  CREATE UNIQUE INDEX experiment_assignments_pkey ON public.experiment_assignments USING btree (id)
  ```
- `idx_exp_assignments_experiment_id`
  ```sql
  CREATE INDEX idx_exp_assignments_experiment_id ON public.experiment_assignments USING btree (experiment_id)
  ```
- `idx_exp_assignments_venture_id`
  ```sql
  CREATE INDEX idx_exp_assignments_venture_id ON public.experiment_assignments USING btree (venture_id)
  ```

## RLS Policies

### 1. service_role_experiment_assignments (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
