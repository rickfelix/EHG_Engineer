# compliance_artifact_templates Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-13T02:06:16.124Z
**Rows**: 7
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (11 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `uuid_generate_v4()` | - |
| template_code | `character varying(50)` | **NO** | - | - |
| name | `character varying(255)` | **NO** | - | - |
| description | `text` | YES | - | - |
| applicable_archetypes | `ARRAY` | **NO** | `ARRAY['B2B_ENTERPRISE'::text, 'B2B_SMB'::text, 'B2C'::text]` | - |
| content_template | `text` | **NO** | - | - |
| output_format | `character varying(20)` | **NO** | `'markdown'::character varying` | - |
| version | `integer(32)` | **NO** | `1` | - |
| is_active | `boolean` | **NO** | `true` | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `compliance_artifact_templates_pkey`: PRIMARY KEY (id)

### Unique Constraints
- `compliance_artifact_templates_template_code_key`: UNIQUE (template_code)

### Check Constraints
- `compliance_artifact_templates_output_format_check`: CHECK (((output_format)::text = ANY ((ARRAY['markdown'::character varying, 'html'::character varying, 'pdf'::character varying])::text[])))

## Indexes

- `compliance_artifact_templates_pkey`
  ```sql
  CREATE UNIQUE INDEX compliance_artifact_templates_pkey ON public.compliance_artifact_templates USING btree (id)
  ```
- `compliance_artifact_templates_template_code_key`
  ```sql
  CREATE UNIQUE INDEX compliance_artifact_templates_template_code_key ON public.compliance_artifact_templates USING btree (template_code)
  ```

## RLS Policies

### 1. Artifact templates are viewable by authenticated users (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

## Triggers

### update_compliance_artifact_templates_updated_at

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION update_updated_at_column()`

---

[← Back to Schema Overview](../database-schema-overview.md)
