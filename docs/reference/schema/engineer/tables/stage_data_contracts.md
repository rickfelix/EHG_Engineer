# stage_data_contracts Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-10T10:56:13.611Z
**Rows**: 2
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (12 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| stage_number | `integer(32)` | **NO** | - | - |
| stage_name | `text` | **NO** | - | - |
| version | `text` | **NO** | `'1.0'::text` | - |
| input_schema | `jsonb` | **NO** | `'{}'::jsonb` | - |
| output_schema | `jsonb` | **NO** | `'{}'::jsonb` | - |
| phase | `text` | **NO** | - | - |
| is_active | `boolean` | **NO** | `true` | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |
| created_by | `uuid` | YES | - | - |
| updated_by | `uuid` | YES | - | - |

## Constraints

### Primary Key
- `stage_data_contracts_pkey`: PRIMARY KEY (id)

### Unique Constraints
- `uq_stage_contract_version`: UNIQUE (stage_number, version)

### Check Constraints
- `stage_data_contracts_phase_check`: CHECK ((phase = ANY (ARRAY['ideation'::text, 'validation'::text, 'execution'::text, 'monitoring'::text])))
- `stage_data_contracts_stage_number_check`: CHECK (((stage_number >= 1) AND (stage_number <= 40)))

## Indexes

- `idx_stage_data_contracts_active`
  ```sql
  CREATE INDEX idx_stage_data_contracts_active ON public.stage_data_contracts USING btree (is_active) WHERE (is_active = true)
  ```
- `idx_stage_data_contracts_stage_number`
  ```sql
  CREATE INDEX idx_stage_data_contracts_stage_number ON public.stage_data_contracts USING btree (stage_number)
  ```
- `stage_data_contracts_pkey`
  ```sql
  CREATE UNIQUE INDEX stage_data_contracts_pkey ON public.stage_data_contracts USING btree (id)
  ```
- `uq_stage_contract_version`
  ```sql
  CREATE UNIQUE INDEX uq_stage_contract_version ON public.stage_data_contracts USING btree (stage_number, version)
  ```

## RLS Policies

### 1. modify_stage_data_contracts_policy (ALL)

- **Roles**: {public}
- **Using**: `((auth.jwt() ->> 'role'::text) = 'admin'::text)`
- **With Check**: `((auth.jwt() ->> 'role'::text) = 'admin'::text)`

### 2. select_stage_data_contracts_policy (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

## Triggers

### update_stage_data_contracts_updated_at

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION update_updated_at_column()`

---

[← Back to Schema Overview](../database-schema-overview.md)
