# gate_requirements_templates Table

**Generated**: 2025-10-28T12:15:30.153Z
**Database**: EHG_Engineer (dedlbzhpgkmetvhbkyzq)
**Rows**: 0
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

---

## Columns (7 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| gate_type | `character varying(50)` | **NO** | - | - |
| template_name | `character varying(100)` | **NO** | - | - |
| requirements_template | `jsonb` | **NO** | - | - |
| verification_criteria | `jsonb` | **NO** | - | - |
| is_default | `boolean` | YES | `false` | - |
| created_at | `timestamp with time zone` | YES | `CURRENT_TIMESTAMP` | - |

## Constraints

### Primary Key
- `gate_requirements_templates_pkey`: PRIMARY KEY (id)

### Unique Constraints
- `gate_requirements_templates_gate_type_template_name_key`: UNIQUE (gate_type, template_name)

## Indexes

- `gate_requirements_templates_gate_type_template_name_key`
  ```sql
  CREATE UNIQUE INDEX gate_requirements_templates_gate_type_template_name_key ON public.gate_requirements_templates USING btree (gate_type, template_name)
  ```
- `gate_requirements_templates_pkey`
  ```sql
  CREATE UNIQUE INDEX gate_requirements_templates_pkey ON public.gate_requirements_templates USING btree (id)
  ```

## RLS Policies

### 1. authenticated_read_gate_requirements_templates (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. service_role_all_gate_requirements_templates (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
