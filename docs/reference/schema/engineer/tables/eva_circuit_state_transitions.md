# eva_circuit_state_transitions Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-06T18:05:55.206Z
**Rows**: 0
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (9 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| circuit_id | `uuid` | **NO** | - | - |
| venture_id | `text` | **NO** | - | - |
| from_state | `text` | **NO** | - | - |
| to_state | `text` | **NO** | - | - |
| trigger_reason | `text` | **NO** | - | - |
| failure_details | `jsonb` | YES | - | - |
| triggered_by | `text` | YES | `'SYSTEM'::text` | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `eva_circuit_state_transitions_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `eva_circuit_state_transitions_circuit_id_fkey`: circuit_id → eva_circuit_breaker(id)

## Indexes

- `eva_circuit_state_transitions_pkey`
  ```sql
  CREATE UNIQUE INDEX eva_circuit_state_transitions_pkey ON public.eva_circuit_state_transitions USING btree (id)
  ```
- `idx_eva_circuit_transitions_circuit`
  ```sql
  CREATE INDEX idx_eva_circuit_transitions_circuit ON public.eva_circuit_state_transitions USING btree (circuit_id)
  ```
- `idx_eva_circuit_transitions_created`
  ```sql
  CREATE INDEX idx_eva_circuit_transitions_created ON public.eva_circuit_state_transitions USING btree (created_at DESC)
  ```

## RLS Policies

### 1. Authenticated users can view eva_circuit_state_transitions (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. Service role has full access to eva_circuit_state_transitions (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
