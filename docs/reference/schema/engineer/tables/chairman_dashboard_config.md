# chairman_dashboard_config Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-06-04T23:57:47.825Z
**Rows**: 1
**RLS**: Enabled (4 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (11 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| company_id | `uuid` | **NO** | - | Company this configuration belongs to. |
| config_key | `text` | **NO** | `'default'::text` | Configuration profile key. "default" is the primary configuration. |
| stage_overrides | `jsonb` | **NO** | `'{}'::jsonb` | Per-stage auto-proceed overrides. Keys are stage numbers (as strings), values are {auto_proceed, set_by, set_at} objects. |
| global_auto_proceed | `boolean` | **NO** | `true` | Global auto-proceed toggle. Individual stage_overrides take precedence over this setting. |
| metadata | `jsonb` | YES | `'{}'::jsonb` | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |
| created_by | `uuid` | YES | - | - |
| hard_gate_stages | `ARRAY` | **NO** | `ARRAY[20]` | @deprecated since SD-LEO-REFAC-GATE-AUTO-ADVANCE-001 (2026-05-12). Source of truth is now stage_config.gate_type, read via the can_auto_advance(stage_number) RPC. Column preserved for backward compatibility (8+ active read sites in EHG UI + 4 worker sites). Removal scheduled in a follow-up SD after bake-in period. |
| taste_gate_config | `jsonb` | YES | `'{}'::jsonb` | - |

## Constraints

### Primary Key
- `chairman_dashboard_config_pkey`: PRIMARY KEY (id)

### Unique Constraints
- `uq_chairman_dashboard_config_company_key`: UNIQUE (company_id, config_key)

## Indexes

- `chairman_dashboard_config_pkey`
  ```sql
  CREATE UNIQUE INDEX chairman_dashboard_config_pkey ON public.chairman_dashboard_config USING btree (id)
  ```
- `idx_chairman_dashboard_config_stage_overrides`
  ```sql
  CREATE INDEX idx_chairman_dashboard_config_stage_overrides ON public.chairman_dashboard_config USING gin (stage_overrides)
  ```
- `uq_chairman_dashboard_config_company_key`
  ```sql
  CREATE UNIQUE INDEX uq_chairman_dashboard_config_company_key ON public.chairman_dashboard_config USING btree (company_id, config_key)
  ```

## RLS Policies

### 1. delete_chairman_dashboard_config_policy (DELETE)

- **Roles**: {service_role}
- **Using**: `true`

### 2. insert_chairman_dashboard_config_policy (INSERT)

- **Roles**: {service_role}
- **With Check**: `true`

### 3. select_chairman_dashboard_config_policy (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 4. update_chairman_dashboard_config_policy (UPDATE)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

## Triggers

### trg_chairman_dashboard_config_governance_audit

- **Timing**: AFTER INSERT
- **Action**: `EXECUTE FUNCTION fn_chairman_dashboard_config_governance_audit()`

### trg_chairman_dashboard_config_governance_audit

- **Timing**: AFTER DELETE
- **Action**: `EXECUTE FUNCTION fn_chairman_dashboard_config_governance_audit()`

### trg_chairman_dashboard_config_governance_audit

- **Timing**: AFTER UPDATE
- **Action**: `EXECUTE FUNCTION fn_chairman_dashboard_config_governance_audit()`

### trg_chairman_dashboard_config_updated_at

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION update_chairman_dashboard_config_updated_at()`

---

[← Back to Schema Overview](../database-schema-overview.md)
