# sd_subagent_deliverable_mapping Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: /mnt/c/_EHG/EHG_Engineer/
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-01-02T13:50:10.062Z
**Rows**: 9
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in /mnt/c/_EHG/EHG_Engineer/

---

## Columns (5 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| sub_agent_code | `character varying(50)` | **NO** | - | - |
| deliverable_type | `character varying(50)` | **NO** | - | - |
| priority | `integer(32)` | YES | `100` | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `sd_subagent_deliverable_mapping_pkey`: PRIMARY KEY (id)

### Unique Constraints
- `sd_subagent_deliverable_mappi_sub_agent_code_deliverable_ty_key`: UNIQUE (sub_agent_code, deliverable_type)

## Indexes

- `sd_subagent_deliverable_mappi_sub_agent_code_deliverable_ty_key`
  ```sql
  CREATE UNIQUE INDEX sd_subagent_deliverable_mappi_sub_agent_code_deliverable_ty_key ON public.sd_subagent_deliverable_mapping USING btree (sub_agent_code, deliverable_type)
  ```
- `sd_subagent_deliverable_mapping_pkey`
  ```sql
  CREATE UNIQUE INDEX sd_subagent_deliverable_mapping_pkey ON public.sd_subagent_deliverable_mapping USING btree (id)
  ```

## RLS Policies

### 1. authenticated_read_sd_subagent_mapping (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. service_role_all_sd_subagent_mapping (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
