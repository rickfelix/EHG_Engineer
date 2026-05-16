# stage_prop_contracts Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-05-16T13:15:49.353Z
**Rows**: 34
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (11 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| stage_number | `integer(32)` | **NO** | - | - |
| variant | `text` | YES | - | NULL when stage has one component; otherwise the suffix after Stage{N} (e.g. BuildReadiness, MarketingCopy). |
| component_path | `text` | **NO** | - | - |
| expected_stage_data_shape | `jsonb` | **NO** | - | JSONB describing fields the component reads from stageData. Keys are dotted access paths (e.g. advisoryData.checklist), values are {type: "string"|"number"|"array"|"object"|"unknown", optional: boolean}. |
| expected_gate_banner_shape | `jsonb` | YES | - | NULL when component does not render GateBanner; otherwise the shape passed as the gate prop (must match GateConfig from GateDecision.ts). |
| expected_advisory_shape | `jsonb` | YES | - | - |
| invariants | `ARRAY` | **NO** | `'{}'::text[]` | Free-text invariants the static analyzer cannot express in expected_*_shape (e.g. "GateBanner gate prop must satisfy GateConfig type"). |
| is_active | `boolean` | **NO** | `true` | - |
| registered_at | `timestamp with time zone` | **NO** | `now()` | - |
| last_validated_at | `timestamp with time zone` | YES | - | - |

## Constraints

### Primary Key
- `stage_prop_contracts_pkey`: PRIMARY KEY (id)

### Unique Constraints
- `stage_prop_contracts_component_path_unique`: UNIQUE (component_path)

### Check Constraints
- `stage_prop_contracts_stage_number_check`: CHECK (((stage_number >= 1) AND (stage_number <= 26)))

## Indexes

- `idx_stage_prop_contracts_active`
  ```sql
  CREATE INDEX idx_stage_prop_contracts_active ON public.stage_prop_contracts USING btree (stage_number) WHERE (is_active = true)
  ```
- `idx_stage_prop_contracts_stage_number`
  ```sql
  CREATE INDEX idx_stage_prop_contracts_stage_number ON public.stage_prop_contracts USING btree (stage_number)
  ```
- `stage_prop_contracts_component_path_unique`
  ```sql
  CREATE UNIQUE INDEX stage_prop_contracts_component_path_unique ON public.stage_prop_contracts USING btree (component_path)
  ```
- `stage_prop_contracts_pkey`
  ```sql
  CREATE UNIQUE INDEX stage_prop_contracts_pkey ON public.stage_prop_contracts USING btree (id)
  ```

## RLS Policies

### 1. stage_prop_contracts_read_all (SELECT)

- **Roles**: {public}
- **Using**: `true`

### 2. stage_prop_contracts_write_service_role (ALL)

- **Roles**: {public}
- **Using**: `(auth.role() = 'service_role'::text)`
- **With Check**: `(auth.role() = 'service_role'::text)`

---

[← Back to Schema Overview](../database-schema-overview.md)
