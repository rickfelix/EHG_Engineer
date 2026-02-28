# validation_gate_registry Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-28T03:30:25.261Z
**Rows**: 72
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (8 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| gate_key | `character varying(100)` | **NO** | - | Identifier of the validation gate (e.g., GATE_PRD_EXISTS, GATE1_DESIGN_DATABASE) |
| sd_type | `character varying(50)` | YES | - | SD type this policy applies to (NULL = any type, use with validation_profile for specificity) |
| validation_profile | `character varying(50)` | YES | - | Validation profile this policy applies to (NULL = any profile) |
| applicability | `USER-DEFINED` | **NO** | `'REQUIRED'::gate_applicability` | Whether the gate is REQUIRED, OPTIONAL, or DISABLED for this scope |
| reason | `text` | **NO** | - | Audit trail: why this policy exists (references SD/issue/decision) |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `validation_gate_registry_pkey`: PRIMARY KEY (id)

### Check Constraints
- `chk_gate_registry_scope`: CHECK (((sd_type IS NOT NULL) OR (validation_profile IS NOT NULL)))

## Indexes

- `idx_gate_registry_gate_key`
  ```sql
  CREATE INDEX idx_gate_registry_gate_key ON public.validation_gate_registry USING btree (gate_key)
  ```
- `idx_gate_registry_sd_type`
  ```sql
  CREATE INDEX idx_gate_registry_sd_type ON public.validation_gate_registry USING btree (sd_type) WHERE (sd_type IS NOT NULL)
  ```
- `idx_gate_registry_unique_scope`
  ```sql
  CREATE UNIQUE INDEX idx_gate_registry_unique_scope ON public.validation_gate_registry USING btree (gate_key, COALESCE(sd_type, '*'::character varying), COALESCE(validation_profile, '*'::character varying))
  ```
- `validation_gate_registry_pkey`
  ```sql
  CREATE UNIQUE INDEX validation_gate_registry_pkey ON public.validation_gate_registry USING btree (id)
  ```

## RLS Policies

### 1. authenticated_read_gate_registry (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. service_role_full_access_gate_registry (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

## Triggers

### trg_gate_registry_updated_at

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION update_gate_registry_updated_at()`

---

[← Back to Schema Overview](../database-schema-overview.md)
