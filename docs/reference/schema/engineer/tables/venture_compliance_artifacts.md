# venture_compliance_artifacts Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-06T01:21:49.751Z
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
| template_id | `uuid` | **NO** | - | - |
| checklist_item_id | `uuid` | YES | - | - |
| title | `character varying(255)` | **NO** | - | - |
| content | `text` | **NO** | - | - |
| version | `integer(32)` | **NO** | `1` | - |
| status | `character varying(20)` | **NO** | `'draft'::character varying` | - |
| file_url | `text` | YES | - | - |
| created_by | `uuid` | YES | - | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `venture_compliance_artifacts_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `venture_compliance_artifacts_checklist_item_id_fkey`: checklist_item_id → compliance_checklist_items(id)
- `venture_compliance_artifacts_created_by_fkey`: created_by → users(id)
- `venture_compliance_artifacts_template_id_fkey`: template_id → compliance_artifact_templates(id)
- `venture_compliance_artifacts_venture_id_fkey`: venture_id → ventures(id)

### Check Constraints
- `venture_compliance_artifacts_status_check`: CHECK (((status)::text = ANY ((ARRAY['draft'::character varying, 'final'::character varying, 'archived'::character varying])::text[])))

## Indexes

- `idx_venture_compliance_artifacts_venture`
  ```sql
  CREATE INDEX idx_venture_compliance_artifacts_venture ON public.venture_compliance_artifacts USING btree (venture_id)
  ```
- `venture_compliance_artifacts_pkey`
  ```sql
  CREATE UNIQUE INDEX venture_compliance_artifacts_pkey ON public.venture_compliance_artifacts USING btree (id)
  ```

## RLS Policies

### 1. Venture compliance artifacts deletable by venture owner (DELETE)

- **Roles**: {authenticated}
- **Using**: `(EXISTS ( SELECT 1
   FROM ventures v
  WHERE ((v.id = venture_compliance_artifacts.venture_id) AND (v.created_by = auth.uid()))))`

### 2. Venture compliance artifacts insertable by venture owner (INSERT)

- **Roles**: {authenticated}
- **With Check**: `(EXISTS ( SELECT 1
   FROM ventures v
  WHERE ((v.id = venture_compliance_artifacts.venture_id) AND (v.created_by = auth.uid()))))`

### 3. Venture compliance artifacts updatable by venture owner (UPDATE)

- **Roles**: {authenticated}
- **Using**: `(EXISTS ( SELECT 1
   FROM ventures v
  WHERE ((v.id = venture_compliance_artifacts.venture_id) AND (v.created_by = auth.uid()))))`
- **With Check**: `(EXISTS ( SELECT 1
   FROM ventures v
  WHERE ((v.id = venture_compliance_artifacts.venture_id) AND (v.created_by = auth.uid()))))`

### 4. Venture compliance artifacts viewable by venture owner (SELECT)

- **Roles**: {authenticated}
- **Using**: `(EXISTS ( SELECT 1
   FROM ventures v
  WHERE ((v.id = venture_compliance_artifacts.venture_id) AND (v.created_by = auth.uid()))))`

## Triggers

### update_venture_compliance_artifacts_updated_at

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION update_updated_at_column()`

---

[← Back to Schema Overview](../database-schema-overview.md)
