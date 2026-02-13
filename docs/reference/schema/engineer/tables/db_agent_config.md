# db_agent_config Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-13T23:20:47.932Z
**Rows**: 4
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (6 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| key | `character varying(100)` | **NO** | - | - |
| value | `jsonb` | **NO** | - | - |
| description | `text` | YES | - | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `db_agent_config_pkey`: PRIMARY KEY (id)

### Unique Constraints
- `db_agent_config_key_key`: UNIQUE (key)

## Indexes

- `db_agent_config_key_key`
  ```sql
  CREATE UNIQUE INDEX db_agent_config_key_key ON public.db_agent_config USING btree (key)
  ```
- `db_agent_config_pkey`
  ```sql
  CREATE UNIQUE INDEX db_agent_config_pkey ON public.db_agent_config USING btree (id)
  ```

## RLS Policies

### 1. service_role_all_db_agent_config (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
