# sd_state_transitions Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-13T10:51:37.586Z
**Rows**: 9
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (5 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| from_state | `USER-DEFINED` | **NO** | - | - |
| to_state | `USER-DEFINED` | **NO** | - | - |
| role_required | `character varying(50)` | YES | - | - |
| conditions | `jsonb` | YES | `'{}'::jsonb` | - |

## Constraints

### Primary Key
- `sd_state_transitions_pkey`: PRIMARY KEY (id)

### Unique Constraints
- `sd_state_transitions_from_state_to_state_key`: UNIQUE (from_state, to_state)

## Indexes

- `sd_state_transitions_from_state_to_state_key`
  ```sql
  CREATE UNIQUE INDEX sd_state_transitions_from_state_to_state_key ON public.sd_state_transitions USING btree (from_state, to_state)
  ```
- `sd_state_transitions_pkey`
  ```sql
  CREATE UNIQUE INDEX sd_state_transitions_pkey ON public.sd_state_transitions USING btree (id)
  ```

## RLS Policies

### 1. authenticated_read_sd_state_transitions (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. service_role_all_sd_state_transitions (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
