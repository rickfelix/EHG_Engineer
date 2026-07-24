# legal_templates Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-07-24T14:39:36.126Z
**Rows**: 2
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (15 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| template_type | `text` | **NO** | - | - |
| version | `integer(32)` | **NO** | `1` | - |
| is_active | `boolean` | **NO** | `true` | - |
| supersedes_id | `uuid` | YES | - | - |
| title | `text` | **NO** | - | - |
| content | `text` | **NO** | - | - |
| markers | `jsonb` | YES | `'[]'::jsonb` | - |
| status | `text` | **NO** | `'draft'::text` | - |
| legal_reviewed_at | `timestamp with time zone` | YES | - | - |
| legal_reviewed_by | `text` | YES | - | - |
| review_notes | `text` | YES | - | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |
| created_by | `text` | YES | - | - |

## Constraints

### Primary Key
- `legal_templates_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `legal_templates_supersedes_id_fkey`: supersedes_id → legal_templates(id)

### Unique Constraints
- `unique_active_template_type`: UNIQUE (template_type, version)

### Check Constraints
- `legal_templates_status_check`: CHECK ((status = ANY (ARRAY['draft'::text, 'review'::text, 'approved'::text, 'active'::text, 'deprecated'::text, 'archived'::text])))
- `legal_templates_template_type_check`: CHECK ((template_type = ANY (ARRAY['terms_of_service'::text, 'privacy_policy'::text, 'data_processing_agreement'::text, 'cookie_policy'::text, 'refund_policy'::text, 'acceptable_use_policy'::text, 'service_level_agreement'::text, 'nda'::text])))

## Indexes

- `idx_legal_templates_active`
  ```sql
  CREATE INDEX idx_legal_templates_active ON public.legal_templates USING btree (is_active) WHERE (is_active = true)
  ```
- `idx_legal_templates_status`
  ```sql
  CREATE INDEX idx_legal_templates_status ON public.legal_templates USING btree (status)
  ```
- `idx_legal_templates_type`
  ```sql
  CREATE INDEX idx_legal_templates_type ON public.legal_templates USING btree (template_type)
  ```
- `legal_templates_pkey`
  ```sql
  CREATE UNIQUE INDEX legal_templates_pkey ON public.legal_templates USING btree (id)
  ```
- `unique_active_template_type`
  ```sql
  CREATE UNIQUE INDEX unique_active_template_type ON public.legal_templates USING btree (template_type, version)
  ```

## RLS Policies

### 1. legal_templates_read (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. legal_templates_write (ALL)

- **Roles**: {authenticated}
- **Using**: `((auth.role() = 'service_role'::text) OR fn_is_chairman())`
- **With Check**: `((auth.role() = 'service_role'::text) OR fn_is_chairman())`

## Triggers

### legal_templates_updated_at

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION update_legal_doc_tables_updated_at()`

---

[← Back to Schema Overview](../database-schema-overview.md)
