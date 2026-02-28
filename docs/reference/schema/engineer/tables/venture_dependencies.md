# venture_dependencies Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-28T03:49:53.877Z
**Rows**: 0
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (8 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| dependent_venture_id | `uuid` | **NO** | - | Venture that depends on another (the one being blocked) |
| provider_venture_id | `uuid` | **NO** | - | Venture that provides the dependency (must reach required_stage) |
| required_stage | `integer(32)` | **NO** | - | Stage the provider must reach before dependent can proceed |
| dependency_type | `text` | **NO** | `'hard'::text` | hard = blocks transition, soft = warning only |
| status | `text` | **NO** | `'pending'::text` | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| resolved_at | `timestamp with time zone` | YES | - | - |

## Constraints

### Primary Key
- `venture_dependencies_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `venture_dependencies_dependent_venture_id_fkey`: dependent_venture_id → ventures(id)
- `venture_dependencies_provider_venture_id_fkey`: provider_venture_id → ventures(id)

### Unique Constraints
- `uq_venture_dependency`: UNIQUE (dependent_venture_id, provider_venture_id, required_stage)

### Check Constraints
- `no_self_dependency`: CHECK ((dependent_venture_id <> provider_venture_id))
- `venture_dependencies_dependency_type_check`: CHECK ((dependency_type = ANY (ARRAY['hard'::text, 'soft'::text])))
- `venture_dependencies_required_stage_check`: CHECK (((required_stage >= 1) AND (required_stage <= 25)))
- `venture_dependencies_status_check`: CHECK ((status = ANY (ARRAY['pending'::text, 'resolved'::text, 'blocked'::text])))

## Indexes

- `idx_venture_deps_dependent`
  ```sql
  CREATE INDEX idx_venture_deps_dependent ON public.venture_dependencies USING btree (dependent_venture_id)
  ```
- `idx_venture_deps_provider`
  ```sql
  CREATE INDEX idx_venture_deps_provider ON public.venture_dependencies USING btree (provider_venture_id)
  ```
- `idx_venture_deps_status`
  ```sql
  CREATE INDEX idx_venture_deps_status ON public.venture_dependencies USING btree (status) WHERE (status = 'pending'::text)
  ```
- `uq_venture_dependency`
  ```sql
  CREATE UNIQUE INDEX uq_venture_dependency ON public.venture_dependencies USING btree (dependent_venture_id, provider_venture_id, required_stage)
  ```
- `venture_dependencies_pkey`
  ```sql
  CREATE UNIQUE INDEX venture_dependencies_pkey ON public.venture_dependencies USING btree (id)
  ```

## RLS Policies

### 1. authenticated_read (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. service_role_full_access (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
