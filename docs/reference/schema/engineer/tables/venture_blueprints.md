# venture_blueprints Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-13T16:26:42.445Z
**Rows**: 0
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (15 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| blueprint_key | `text` | **NO** | - | - |
| name | `text` | **NO** | - | - |
| description | `text` | **NO** | - | - |
| category | `text` | **NO** | - | - |
| template | `jsonb` | **NO** | - | - |
| tags | `ARRAY` | YES | `'{}'::text[]` | - |
| archetype_hint | `text` | YES | - | - |
| times_used | `integer(32)` | YES | `0` | - |
| success_rate | `numeric(3,2)` | YES | - | - |
| version | `integer(32)` | YES | `1` | - |
| is_active | `boolean` | YES | `true` | - |
| created_by | `text` | YES | `'system'::text` | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `venture_blueprints_pkey`: PRIMARY KEY (id)

### Unique Constraints
- `venture_blueprints_blueprint_key_key`: UNIQUE (blueprint_key)

## Indexes

- `idx_venture_blueprints_active`
  ```sql
  CREATE INDEX idx_venture_blueprints_active ON public.venture_blueprints USING btree (is_active) WHERE (is_active = true)
  ```
- `idx_venture_blueprints_category`
  ```sql
  CREATE INDEX idx_venture_blueprints_category ON public.venture_blueprints USING btree (category)
  ```
- `venture_blueprints_blueprint_key_key`
  ```sql
  CREATE UNIQUE INDEX venture_blueprints_blueprint_key_key ON public.venture_blueprints USING btree (blueprint_key)
  ```
- `venture_blueprints_pkey`
  ```sql
  CREATE UNIQUE INDEX venture_blueprints_pkey ON public.venture_blueprints USING btree (id)
  ```

## RLS Policies

### 1. venture_blueprints_service_all (ALL)

- **Roles**: {public}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
