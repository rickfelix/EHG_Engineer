# venture_compliance_progress Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-03-02T01:18:17.458Z
**Rows**: 0
**RLS**: Enabled (4 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (12 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `uuid_generate_v4()` | - |
| venture_id | `uuid` | **NO** | - | - |
| checklist_item_id | `uuid` | **NO** | - | - |
| status | `character varying(20)` | **NO** | `'NOT_STARTED'::character varying` | - |
| owner_user_id | `uuid` | YES | - | - |
| notes | `text` | YES | - | - |
| evidence_attachments | `jsonb` | YES | `'[]'::jsonb` | - |
| started_at | `timestamp with time zone` | YES | - | - |
| completed_at | `timestamp with time zone` | YES | - | - |
| updated_by | `uuid` | YES | - | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `venture_compliance_progress_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `venture_compliance_progress_checklist_item_id_fkey`: checklist_item_id → compliance_checklist_items(id)
- `venture_compliance_progress_owner_user_id_fkey`: owner_user_id → users(id)
- `venture_compliance_progress_updated_by_fkey`: updated_by → users(id)
- `venture_compliance_progress_venture_id_fkey`: venture_id → ventures(id)

### Unique Constraints
- `venture_compliance_progress_venture_id_checklist_item_id_key`: UNIQUE (venture_id, checklist_item_id)

### Check Constraints
- `venture_compliance_progress_status_check`: CHECK (((status)::text = ANY ((ARRAY['NOT_STARTED'::character varying, 'IN_PROGRESS'::character varying, 'COMPLETE'::character varying])::text[])))

## Indexes

- `idx_venture_compliance_status`
  ```sql
  CREATE INDEX idx_venture_compliance_status ON public.venture_compliance_progress USING btree (venture_id, status)
  ```
- `idx_venture_compliance_venture`
  ```sql
  CREATE INDEX idx_venture_compliance_venture ON public.venture_compliance_progress USING btree (venture_id)
  ```
- `venture_compliance_progress_pkey`
  ```sql
  CREATE UNIQUE INDEX venture_compliance_progress_pkey ON public.venture_compliance_progress USING btree (id)
  ```
- `venture_compliance_progress_venture_id_checklist_item_id_key`
  ```sql
  CREATE UNIQUE INDEX venture_compliance_progress_venture_id_checklist_item_id_key ON public.venture_compliance_progress USING btree (venture_id, checklist_item_id)
  ```

## RLS Policies

### 1. Venture compliance progress deletable by venture owner (DELETE)

- **Roles**: {authenticated}
- **Using**: `(EXISTS ( SELECT 1
   FROM ventures v
  WHERE ((v.id = venture_compliance_progress.venture_id) AND (v.created_by = auth.uid()))))`

### 2. Venture compliance progress editable by venture owner (INSERT)

- **Roles**: {authenticated}
- **With Check**: `(EXISTS ( SELECT 1
   FROM ventures v
  WHERE ((v.id = venture_compliance_progress.venture_id) AND (v.created_by = auth.uid()))))`

### 3. Venture compliance progress updatable by venture owner (UPDATE)

- **Roles**: {authenticated}
- **Using**: `(EXISTS ( SELECT 1
   FROM ventures v
  WHERE ((v.id = venture_compliance_progress.venture_id) AND (v.created_by = auth.uid()))))`
- **With Check**: `(EXISTS ( SELECT 1
   FROM ventures v
  WHERE ((v.id = venture_compliance_progress.venture_id) AND (v.created_by = auth.uid()))))`

### 4. Venture compliance progress viewable by venture owner (SELECT)

- **Roles**: {authenticated}
- **Using**: `(EXISTS ( SELECT 1
   FROM ventures v
  WHERE ((v.id = venture_compliance_progress.venture_id) AND (v.created_by = auth.uid()))))`

## Triggers

### update_venture_compliance_progress_updated_at

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION update_updated_at_column()`

---

[← Back to Schema Overview](../database-schema-overview.md)
