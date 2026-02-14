# leo_prioritization_config Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-14T18:28:22.998Z
**Rows**: 0
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (8 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| created_by | `uuid` | **NO** | - | - |
| version | `integer(32)` | **NO** | - | - |
| status | `text` | **NO** | `'draft'::text` | - |
| weights | `jsonb` | **NO** | - | - |
| constraints | `jsonb` | **NO** | - | - |
| description | `text` | YES | - | - |

## Constraints

### Primary Key
- `leo_prioritization_config_pkey`: PRIMARY KEY (id)

### Unique Constraints
- `uq_leo_prioritization_config_version`: UNIQUE (version)

### Check Constraints
- `leo_prioritization_config_status_check`: CHECK ((status = ANY (ARRAY['draft'::text, 'active'::text, 'deprecated'::text])))

## Indexes

- `leo_prioritization_config_pkey`
  ```sql
  CREATE UNIQUE INDEX leo_prioritization_config_pkey ON public.leo_prioritization_config USING btree (id)
  ```
- `uq_leo_prioritization_config_version`
  ```sql
  CREATE UNIQUE INDEX uq_leo_prioritization_config_version ON public.leo_prioritization_config USING btree (version)
  ```

## RLS Policies

### 1. Anon can read active configs (SELECT)

- **Roles**: {public}
- **Using**: `(status = 'active'::text)`

### 2. Service role full access to leo_prioritization_config (ALL)

- **Roles**: {public}
- **Using**: `(auth.role() = 'service_role'::text)`
- **With Check**: `(auth.role() = 'service_role'::text)`

---

[← Back to Schema Overview](../database-schema-overview.md)
