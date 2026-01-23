# sd_data_contracts Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-01-23T16:35:26.549Z
**Rows**: 0
**RLS**: Enabled (4 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (13 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| parent_sd_id | `character varying(50)` | **NO** | - | - |
| contract_version | `integer(32)` | **NO** | `1` | - |
| allowed_tables | `ARRAY` | **NO** | - | - |
| allowed_columns | `jsonb` | **NO** | `'{}'::jsonb` | - |
| forbidden_operations | `ARRAY` | **NO** | `ARRAY['DROP TABLE'::text, 'TRUNCATE'::text, 'DROP SCHEMA'::text]` | - |
| jsonb_schemas | `jsonb` | YES | - | - |
| column_types | `jsonb` | YES | - | - |
| description | `text` | YES | - | - |
| rationale | `text` | YES | - | - |
| created_by | `character varying(100)` | YES | `'system'::character varying` | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `sd_data_contracts_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `sd_data_contracts_parent_sd_id_fkey`: parent_sd_id → strategic_directives_v2(id)

### Unique Constraints
- `unique_data_contract_version`: UNIQUE (parent_sd_id, contract_version)

## Indexes

- `idx_data_contracts_parent_sd`
  ```sql
  CREATE INDEX idx_data_contracts_parent_sd ON public.sd_data_contracts USING btree (parent_sd_id)
  ```
- `sd_data_contracts_pkey`
  ```sql
  CREATE UNIQUE INDEX sd_data_contracts_pkey ON public.sd_data_contracts USING btree (id)
  ```
- `unique_data_contract_version`
  ```sql
  CREATE UNIQUE INDEX unique_data_contract_version ON public.sd_data_contracts USING btree (parent_sd_id, contract_version)
  ```

## RLS Policies

### 1. sd_data_contracts_delete (DELETE)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. sd_data_contracts_insert (INSERT)

- **Roles**: {authenticated}
- **With Check**: `true`

### 3. sd_data_contracts_select (SELECT)

- **Roles**: {public}
- **Using**: `true`

### 4. sd_data_contracts_update (UPDATE)

- **Roles**: {authenticated}
- **Using**: `true`

## Triggers

### update_sd_data_contracts_updated_at

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION update_updated_at_column()`

---

[← Back to Schema Overview](../database-schema-overview.md)
