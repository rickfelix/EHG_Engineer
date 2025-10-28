# exec_authorizations Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: /mnt/c/_EHG/EHG_Engineer/
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2025-10-28T12:24:22.172Z
**Rows**: 0
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in /mnt/c/_EHG/EHG_Engineer/

---

## Columns (10 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| prd_id | `text` | **NO** | - | - |
| gates_passed | `boolean` | YES | `false` | - |
| gate_2a_score | `numeric(5,2)` | YES | - | - |
| gate_2b_score | `numeric(5,2)` | YES | - | - |
| gate_2c_score | `numeric(5,2)` | YES | - | - |
| gate_2d_score | `numeric(5,2)` | YES | - | - |
| authorized_at | `timestamp with time zone` | YES | - | - |
| authorized_by | `text` | YES | - | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `exec_authorizations_pkey`: PRIMARY KEY (id)

### Unique Constraints
- `exec_authorizations_prd_id_key`: UNIQUE (prd_id)

## Indexes

- `exec_authorizations_pkey`
  ```sql
  CREATE UNIQUE INDEX exec_authorizations_pkey ON public.exec_authorizations USING btree (id)
  ```
- `exec_authorizations_prd_id_key`
  ```sql
  CREATE UNIQUE INDEX exec_authorizations_prd_id_key ON public.exec_authorizations USING btree (prd_id)
  ```
- `idx_exec_auth_prd`
  ```sql
  CREATE INDEX idx_exec_auth_prd ON public.exec_authorizations USING btree (prd_id, gates_passed)
  ```

## RLS Policies

### 1. authenticated_read_exec_authorizations (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. service_role_all_exec_authorizations (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
