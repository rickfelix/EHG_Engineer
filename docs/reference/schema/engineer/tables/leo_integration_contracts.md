# leo_integration_contracts Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-28T03:49:53.877Z
**Rows**: 10
**RLS**: Enabled (3 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (19 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| contract_key | `text` | **NO** | - | Unique identifier for contract (e.g., sub-agent-design-visual-polish) |
| description | `text` | **NO** | - | - |
| trigger_type | `USER-DEFINED` | **NO** | - | Type of integration: workflow, sub_agent, prd_hook, handoff, event, api_route, command |
| trigger_id | `text` | **NO** | - | Specific trigger identifier (e.g., DESIGN, leo-create, add-prd-to-database) |
| entry_point_file | `text` | **NO** | - | - |
| entry_point_function | `text` | **NO** | - | - |
| export_type | `text` | YES | `'named'::text` | - |
| import_chain | `jsonb` | YES | `'[]'::jsonb` | Array of import steps to verify for L2: [{"from": "file", "line": N}, ...] |
| expected_params | `jsonb` | YES | `'[]'::jsonb` | - |
| checkpoint_level | `USER-DEFINED` | **NO** | `'L3_EXPORT_EXISTS'::oiv_checkpoint_level` | Maximum verification depth: L1 (file) to L5 (args) |
| verification_mode | `USER-DEFINED` | **NO** | `'static'::oiv_verification_mode` | - |
| sd_type_scope | `ARRAY` | YES | `ARRAY['feature'::text, 'security'::text]` | Which SD types this contract applies to. NULL/empty = all types. |
| gate_name | `text` | YES | - | - |
| weight | `numeric(4,3)` | YES | `0.100` | - |
| is_active | `boolean` | YES | `true` | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |
| created_by | `text` | YES | `'SYSTEM'::text` | - |

## Constraints

### Primary Key
- `leo_integration_contracts_pkey`: PRIMARY KEY (id)

### Unique Constraints
- `leo_integration_contracts_contract_key_key`: UNIQUE (contract_key)

### Check Constraints
- `leo_integration_contracts_export_type_check`: CHECK ((export_type = ANY (ARRAY['named'::text, 'default'::text, 'cjs'::text])))
- `leo_integration_contracts_weight_check`: CHECK (((weight >= (0)::numeric) AND (weight <= (1)::numeric)))

## Indexes

- `idx_oiv_contracts_gate_name`
  ```sql
  CREATE INDEX idx_oiv_contracts_gate_name ON public.leo_integration_contracts USING btree (gate_name)
  ```
- `idx_oiv_contracts_is_active`
  ```sql
  CREATE INDEX idx_oiv_contracts_is_active ON public.leo_integration_contracts USING btree (is_active)
  ```
- `idx_oiv_contracts_sd_type_scope`
  ```sql
  CREATE INDEX idx_oiv_contracts_sd_type_scope ON public.leo_integration_contracts USING gin (sd_type_scope)
  ```
- `idx_oiv_contracts_trigger_id`
  ```sql
  CREATE INDEX idx_oiv_contracts_trigger_id ON public.leo_integration_contracts USING btree (trigger_id)
  ```
- `idx_oiv_contracts_trigger_type`
  ```sql
  CREATE INDEX idx_oiv_contracts_trigger_type ON public.leo_integration_contracts USING btree (trigger_type)
  ```
- `leo_integration_contracts_contract_key_key`
  ```sql
  CREATE UNIQUE INDEX leo_integration_contracts_contract_key_key ON public.leo_integration_contracts USING btree (contract_key)
  ```
- `leo_integration_contracts_pkey`
  ```sql
  CREATE UNIQUE INDEX leo_integration_contracts_pkey ON public.leo_integration_contracts USING btree (id)
  ```

## RLS Policies

### 1. Anon can read contracts (SELECT)

- **Roles**: {anon}
- **Using**: `true`

### 2. Authenticated users can read contracts (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 3. Service role full access on leo_integration_contracts (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

## Triggers

### trigger_update_oiv_contracts_timestamp

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION update_oiv_contracts_timestamp()`

---

[← Back to Schema Overview](../database-schema-overview.md)
