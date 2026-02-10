# sd_contract_violations Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-10T13:31:44.352Z
**Rows**: 0
**RLS**: Enabled (4 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (13 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| sd_id | `character varying(50)` | **NO** | - | - |
| contract_id | `uuid` | **NO** | - | - |
| contract_type | `character varying(20)` | **NO** | - | - |
| violation_type | `character varying(50)` | **NO** | - | - |
| severity | `character varying(20)` | **NO** | - | - |
| message | `text` | **NO** | - | - |
| context | `jsonb` | YES | - | - |
| overridden | `boolean` | **NO** | `false` | - |
| override_justification | `text` | YES | - | - |
| overridden_by | `character varying(100)` | YES | - | - |
| overridden_at | `timestamp with time zone` | YES | - | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `sd_contract_violations_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `sd_contract_violations_sd_id_fkey`: sd_id → strategic_directives_v2(id)

### Check Constraints
- `sd_contract_violations_contract_type_check`: CHECK (((contract_type)::text = ANY ((ARRAY['data'::character varying, 'ux'::character varying])::text[])))
- `sd_contract_violations_severity_check`: CHECK (((severity)::text = ANY ((ARRAY['BLOCKER'::character varying, 'WARNING'::character varying])::text[])))

## Indexes

- `idx_violations_contract`
  ```sql
  CREATE INDEX idx_violations_contract ON public.sd_contract_violations USING btree (contract_id)
  ```
- `idx_violations_sd_id`
  ```sql
  CREATE INDEX idx_violations_sd_id ON public.sd_contract_violations USING btree (sd_id)
  ```
- `idx_violations_unresolved`
  ```sql
  CREATE INDEX idx_violations_unresolved ON public.sd_contract_violations USING btree (sd_id, severity) WHERE (overridden = false)
  ```
- `sd_contract_violations_pkey`
  ```sql
  CREATE UNIQUE INDEX sd_contract_violations_pkey ON public.sd_contract_violations USING btree (id)
  ```

## RLS Policies

### 1. sd_contract_violations_delete (DELETE)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. sd_contract_violations_insert (INSERT)

- **Roles**: {authenticated}
- **With Check**: `true`

### 3. sd_contract_violations_select (SELECT)

- **Roles**: {public}
- **Using**: `true`

### 4. sd_contract_violations_update (UPDATE)

- **Roles**: {authenticated}
- **Using**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
