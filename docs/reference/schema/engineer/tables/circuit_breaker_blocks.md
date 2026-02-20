# circuit_breaker_blocks Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-20T19:58:57.591Z
**Rows**: 1,272
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (13 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| sd_id | `character varying(100)` | **NO** | - | - |
| handoff_type | `character varying(50)` | **NO** | - | - |
| from_phase | `character varying(20)` | **NO** | - | - |
| to_phase | `character varying(20)` | **NO** | - | - |
| validation_score | `integer(32)` | **NO** | - | - |
| required_threshold | `integer(32)` | YES | `85` | - |
| score_deficit | `integer(32)` | YES | - | - |
| block_reason | `text` | **NO** | - | - |
| attempted_by | `text` | YES | - | - |
| blocked_at | `timestamp with time zone` | **NO** | `now()` | - |
| handoff_metadata | `jsonb` | YES | `'{}'::jsonb` | - |
| remediation_hints | `jsonb` | YES | `'[]'::jsonb` | - |

## Constraints

### Primary Key
- `circuit_breaker_blocks_pkey`: PRIMARY KEY (id)

## Indexes

- `circuit_breaker_blocks_pkey`
  ```sql
  CREATE UNIQUE INDEX circuit_breaker_blocks_pkey ON public.circuit_breaker_blocks USING btree (id)
  ```
- `idx_circuit_blocks_blocked`
  ```sql
  CREATE INDEX idx_circuit_blocks_blocked ON public.circuit_breaker_blocks USING btree (blocked_at DESC)
  ```
- `idx_circuit_blocks_score`
  ```sql
  CREATE INDEX idx_circuit_blocks_score ON public.circuit_breaker_blocks USING btree (validation_score)
  ```
- `idx_circuit_blocks_sd`
  ```sql
  CREATE INDEX idx_circuit_blocks_sd ON public.circuit_breaker_blocks USING btree (sd_id)
  ```

## RLS Policies

### 1. circuit_blocks_authenticated (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. circuit_blocks_service_role (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
