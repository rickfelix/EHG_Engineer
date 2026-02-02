# leo_workflow_phases Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-02T11:20:40.032Z
**Rows**: 0
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (9 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `integer(32)` | **NO** | `nextval('leo_workflow_phases_id_seq'::regclass)` | - |
| protocol_id | `character varying(50)` | YES | - | - |
| phase_name | `character varying(100)` | **NO** | - | - |
| phase_order | `integer(32)` | **NO** | - | - |
| responsible_agent | `character varying(10)` | YES | - | - |
| percentage_weight | `integer(32)` | YES | - | - |
| required_inputs | `jsonb` | YES | `'[]'::jsonb` | - |
| required_outputs | `jsonb` | YES | `'[]'::jsonb` | - |
| validation_gates | `jsonb` | YES | `'[]'::jsonb` | - |

## Constraints

### Primary Key
- `leo_workflow_phases_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `leo_workflow_phases_protocol_id_fkey`: protocol_id → leo_protocols(id)
- `leo_workflow_phases_responsible_agent_fkey`: responsible_agent → leo_agents(agent_code)

### Unique Constraints
- `leo_workflow_phases_protocol_id_phase_order_key`: UNIQUE (protocol_id, phase_order)

## Indexes

- `leo_workflow_phases_pkey`
  ```sql
  CREATE UNIQUE INDEX leo_workflow_phases_pkey ON public.leo_workflow_phases USING btree (id)
  ```
- `leo_workflow_phases_protocol_id_phase_order_key`
  ```sql
  CREATE UNIQUE INDEX leo_workflow_phases_protocol_id_phase_order_key ON public.leo_workflow_phases USING btree (protocol_id, phase_order)
  ```

## RLS Policies

### 1. authenticated_read_leo_workflow_phases (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. service_role_all_leo_workflow_phases (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
