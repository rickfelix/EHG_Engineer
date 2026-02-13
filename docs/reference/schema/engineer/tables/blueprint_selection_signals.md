# blueprint_selection_signals Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-13T02:06:16.124Z
**Rows**: 0
**RLS**: Enabled (3 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (6 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| blueprint_id | `uuid` | YES | - | - |
| user_id | `uuid` | YES | - | - |
| event_type | `character varying(50)` | **NO** | - | - |
| metadata | `jsonb` | YES | `'{}'::jsonb` | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `blueprint_selection_signals_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `blueprint_selection_signals_blueprint_id_fkey`: blueprint_id → opportunity_blueprints(id)
- `blueprint_selection_signals_user_id_fkey`: user_id → users(id)

## Indexes

- `blueprint_selection_signals_pkey`
  ```sql
  CREATE UNIQUE INDEX blueprint_selection_signals_pkey ON public.blueprint_selection_signals USING btree (id)
  ```
- `idx_blueprint_signals_blueprint`
  ```sql
  CREATE INDEX idx_blueprint_signals_blueprint ON public.blueprint_selection_signals USING btree (blueprint_id)
  ```
- `idx_blueprint_signals_created`
  ```sql
  CREATE INDEX idx_blueprint_signals_created ON public.blueprint_selection_signals USING btree (created_at DESC)
  ```
- `idx_blueprint_signals_type`
  ```sql
  CREATE INDEX idx_blueprint_signals_type ON public.blueprint_selection_signals USING btree (event_type)
  ```
- `idx_blueprint_signals_user`
  ```sql
  CREATE INDEX idx_blueprint_signals_user ON public.blueprint_selection_signals USING btree (user_id)
  ```

## RLS Policies

### 1. Service role full access signals (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

### 2. Users can insert own signals (INSERT)

- **Roles**: {public}
- **With Check**: `(auth.uid() = user_id)`

### 3. Users can view own signals (SELECT)

- **Roles**: {public}
- **Using**: `(auth.uid() = user_id)`

---

[← Back to Schema Overview](../database-schema-overview.md)
