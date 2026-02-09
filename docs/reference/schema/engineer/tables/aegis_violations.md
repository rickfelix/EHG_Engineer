# aegis_violations Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-09T01:19:49.111Z
**Rows**: 31
**RLS**: Enabled (4 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (26 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| rule_id | `uuid` | **NO** | - | - |
| constitution_id | `uuid` | **NO** | - | - |
| violation_type | `character varying(50)` | **NO** | - | Type of violation (e.g., FIELD_MISSING, THRESHOLD_EXCEEDED) |
| severity | `character varying(20)` | **NO** | - | - |
| message | `text` | **NO** | - | - |
| actor_role | `character varying(50)` | YES | - | Role of the actor (e.g., AGENT, HUMAN, SYSTEM) |
| actor_id | `character varying(100)` | YES | - | Identifier of the actor (agent ID, user ID, etc.) |
| operation_type | `character varying(50)` | YES | - | Type of operation that triggered violation |
| target_table | `character varying(100)` | YES | - | Database table being affected |
| sd_id | `uuid` | YES | - | - |
| sd_key | `character varying(100)` | YES | - | - |
| prd_id | `uuid` | YES | - | - |
| venture_id | `uuid` | YES | - | - |
| payload | `jsonb` | YES | `'{}'::jsonb` | - |
| stack_trace | `text` | YES | - | - |
| status | `character varying(30)` | **NO** | `'open'::character varying` | - |
| override_justification | `text` | YES | - | Required justification when overriding a violation |
| overridden_by | `character varying(100)` | YES | - | - |
| overridden_at | `timestamp with time zone` | YES | - | - |
| remediation_sd_id | `uuid` | YES | - | SD created to remediate this violation |
| remediation_sd_key | `character varying(100)` | YES | - | - |
| acknowledged_by | `character varying(100)` | YES | - | - |
| acknowledged_at | `timestamp with time zone` | YES | - | - |
| metadata | `jsonb` | YES | `'{}'::jsonb` | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `aegis_violations_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `aegis_violations_constitution_id_fkey`: constitution_id → aegis_constitutions(id)
- `aegis_violations_rule_id_fkey`: rule_id → aegis_rules(id)

### Check Constraints
- `aegis_violations_severity_check`: CHECK (((severity)::text = ANY ((ARRAY['CRITICAL'::character varying, 'HIGH'::character varying, 'MEDIUM'::character varying, 'LOW'::character varying, 'ADVISORY'::character varying])::text[])))
- `aegis_violations_status_check`: CHECK (((status)::text = ANY ((ARRAY['open'::character varying, 'acknowledged'::character varying, 'overridden'::character varying, 'remediated'::character varying, 'false_positive'::character varying])::text[])))

## Indexes

- `aegis_violations_pkey`
  ```sql
  CREATE UNIQUE INDEX aegis_violations_pkey ON public.aegis_violations USING btree (id)
  ```
- `idx_aegis_violations_actor`
  ```sql
  CREATE INDEX idx_aegis_violations_actor ON public.aegis_violations USING btree (actor_role, actor_id)
  ```
- `idx_aegis_violations_constitution_id`
  ```sql
  CREATE INDEX idx_aegis_violations_constitution_id ON public.aegis_violations USING btree (constitution_id)
  ```
- `idx_aegis_violations_created_at`
  ```sql
  CREATE INDEX idx_aegis_violations_created_at ON public.aegis_violations USING btree (created_at DESC)
  ```
- `idx_aegis_violations_rule_id`
  ```sql
  CREATE INDEX idx_aegis_violations_rule_id ON public.aegis_violations USING btree (rule_id)
  ```
- `idx_aegis_violations_sd_id`
  ```sql
  CREATE INDEX idx_aegis_violations_sd_id ON public.aegis_violations USING btree (sd_id)
  ```
- `idx_aegis_violations_sd_key`
  ```sql
  CREATE INDEX idx_aegis_violations_sd_key ON public.aegis_violations USING btree (sd_key)
  ```
- `idx_aegis_violations_severity`
  ```sql
  CREATE INDEX idx_aegis_violations_severity ON public.aegis_violations USING btree (severity)
  ```
- `idx_aegis_violations_status`
  ```sql
  CREATE INDEX idx_aegis_violations_status ON public.aegis_violations USING btree (status)
  ```

## RLS Policies

### 1. insert_aegis_violations (INSERT)

- **Roles**: {public}
- **With Check**: `true`

### 2. limited_update_aegis_violations (UPDATE)

- **Roles**: {public}
- **Using**: `true`
- **With Check**: `true`

### 3. no_delete_aegis_violations (DELETE)

- **Roles**: {public}
- **Using**: `false`

### 4. select_aegis_violations (SELECT)

- **Roles**: {public}
- **Using**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
