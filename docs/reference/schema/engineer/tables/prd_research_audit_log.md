# prd_research_audit_log Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: /mnt/c/_EHG/EHG_Engineer/
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2025-10-28T12:24:22.172Z
**Rows**: 6
**RLS**: Enabled (4 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in /mnt/c/_EHG/EHG_Engineer/

---

## Columns (9 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| sd_id | `character varying(50)` | **NO** | - | - |
| query_type | `character varying(20)` | **NO** | - | Type: retrospective (local only), context7 (MCP only), hybrid (both) |
| tokens_consumed | `integer(32)` | **NO** | - | Total tokens consumed in this query |
| results_count | `integer(32)` | **NO** | - | - |
| confidence_score | `numeric(3,2)` | YES | - | - |
| circuit_breaker_state | `character varying(20)` | YES | - | Circuit breaker state snapshot at query time |
| execution_time_ms | `integer(32)` | **NO** | - | Query execution time in milliseconds |
| created_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `prd_research_audit_log_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `prd_research_audit_log_sd_id_fkey`: sd_id → strategic_directives_v2(id)

### Check Constraints
- `prd_research_audit_log_circuit_breaker_state_check`: CHECK (((circuit_breaker_state)::text = ANY ((ARRAY['open'::character varying, 'half-open'::character varying, 'closed'::character varying])::text[])))
- `prd_research_audit_log_query_type_check`: CHECK (((query_type)::text = ANY ((ARRAY['retrospective'::character varying, 'context7'::character varying, 'hybrid'::character varying])::text[])))

## Indexes

- `idx_prd_research_audit_created`
  ```sql
  CREATE INDEX idx_prd_research_audit_created ON public.prd_research_audit_log USING btree (created_at DESC)
  ```
- `idx_prd_research_audit_query_type`
  ```sql
  CREATE INDEX idx_prd_research_audit_query_type ON public.prd_research_audit_log USING btree (query_type)
  ```
- `idx_prd_research_audit_sd`
  ```sql
  CREATE INDEX idx_prd_research_audit_sd ON public.prd_research_audit_log USING btree (sd_id)
  ```
- `prd_research_audit_log_pkey`
  ```sql
  CREATE UNIQUE INDEX prd_research_audit_log_pkey ON public.prd_research_audit_log USING btree (id)
  ```

## RLS Policies

### 1. Allow anon users to insert prd_research_audit_log (INSERT)

- **Roles**: {anon}
- **With Check**: `true`

### 2. Allow anon users to select prd_research_audit_log (SELECT)

- **Roles**: {anon}
- **Using**: `true`

### 3. Allow authenticated users to read prd_research_audit_log (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 4. insert_prd_research_audit_log_policy (INSERT)

- **Roles**: {public}
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
