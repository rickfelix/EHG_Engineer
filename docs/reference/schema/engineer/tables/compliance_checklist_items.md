# compliance_checklist_items Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-13T02:26:09.277Z
**Rows**: 39
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (14 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `uuid_generate_v4()` | - |
| checklist_id | `uuid` | **NO** | - | - |
| item_code | `character varying(50)` | **NO** | - | - |
| category | `character varying(100)` | **NO** | - | - |
| title | `character varying(255)` | **NO** | - | - |
| description | `text` | YES | - | - |
| requirement_level | `character varying(20)` | **NO** | - | - |
| evidence_required | `boolean` | **NO** | `false` | - |
| evidence_types | `jsonb` | YES | `'[]'::jsonb` | - |
| sort_order | `integer(32)` | **NO** | `0` | - |
| guidance_text | `text` | YES | - | - |
| template_id | `uuid` | YES | - | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `compliance_checklist_items_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `compliance_checklist_items_checklist_id_fkey`: checklist_id → compliance_checklists(id)

### Unique Constraints
- `compliance_checklist_items_checklist_id_item_code_key`: UNIQUE (checklist_id, item_code)

### Check Constraints
- `compliance_checklist_items_requirement_level_check`: CHECK (((requirement_level)::text = ANY ((ARRAY['REQUIRED'::character varying, 'RECOMMENDED'::character varying])::text[])))

## Indexes

- `compliance_checklist_items_checklist_id_item_code_key`
  ```sql
  CREATE UNIQUE INDEX compliance_checklist_items_checklist_id_item_code_key ON public.compliance_checklist_items USING btree (checklist_id, item_code)
  ```
- `compliance_checklist_items_pkey`
  ```sql
  CREATE UNIQUE INDEX compliance_checklist_items_pkey ON public.compliance_checklist_items USING btree (id)
  ```
- `idx_compliance_items_checklist`
  ```sql
  CREATE INDEX idx_compliance_items_checklist ON public.compliance_checklist_items USING btree (checklist_id)
  ```

## RLS Policies

### 1. Compliance items are viewable by authenticated users (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

## Triggers

### update_compliance_checklist_items_updated_at

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION update_updated_at_column()`

---

[← Back to Schema Overview](../database-schema-overview.md)
