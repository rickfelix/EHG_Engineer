# leo_protocol_sections Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: /mnt/c/_EHG/EHG_Engineer/
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2025-10-28T12:24:22.172Z
**Rows**: 0
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in /mnt/c/_EHG/EHG_Engineer/

---

## Columns (9 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `integer(32)` | **NO** | `nextval('leo_protocol_sections_id_seq'::regclass)` | - |
| protocol_id | `character varying(50)` | **NO** | - | - |
| section_type | `character varying(50)` | **NO** | - | - |
| title | `character varying(500)` | **NO** | - | - |
| content | `text` | **NO** | - | - |
| order_index | `integer(32)` | **NO** | - | - |
| metadata | `jsonb` | YES | `'{}'::jsonb` | - |
| context_tier | `text` | YES | - | - |
| target_file | `text` | YES | - | - |

## Constraints

### Primary Key
- `leo_protocol_sections_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `leo_protocol_sections_protocol_id_fkey`: protocol_id → leo_protocols(id)

### Unique Constraints
- `leo_protocol_sections_protocol_id_section_type_order_index_key`: UNIQUE (protocol_id, section_type, order_index)

### Check Constraints
- `leo_protocol_sections_context_tier_check`: CHECK ((context_tier = ANY (ARRAY['ROUTER'::text, 'CORE'::text, 'PHASE_LEAD'::text, 'PHASE_PLAN'::text, 'PHASE_EXEC'::text, 'REFERENCE'::text])))

## Indexes

- `idx_leo_protocol_sections_protocol`
  ```sql
  CREATE INDEX idx_leo_protocol_sections_protocol ON public.leo_protocol_sections USING btree (protocol_id)
  ```
- `idx_leo_protocol_sections_type`
  ```sql
  CREATE INDEX idx_leo_protocol_sections_type ON public.leo_protocol_sections USING btree (section_type)
  ```
- `leo_protocol_sections_pkey`
  ```sql
  CREATE UNIQUE INDEX leo_protocol_sections_pkey ON public.leo_protocol_sections USING btree (id)
  ```
- `leo_protocol_sections_protocol_id_section_type_order_index_key`
  ```sql
  CREATE UNIQUE INDEX leo_protocol_sections_protocol_id_section_type_order_index_key ON public.leo_protocol_sections USING btree (protocol_id, section_type, order_index)
  ```

## RLS Policies

### 1. authenticated_read_leo_protocol_sections (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. service_role_all_leo_protocol_sections (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
