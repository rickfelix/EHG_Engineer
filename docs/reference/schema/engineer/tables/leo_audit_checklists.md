# leo_audit_checklists Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-01T20:29:31.154Z
**Rows**: 10
**RLS**: Disabled

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (8 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| sd_type | `text` | **NO** | - | SD type (infrastructure, feature, bugfix, etc.) |
| checklist_version | `integer(32)` | **NO** | `1` | Version number for checklist evolution |
| artifact_key | `text` | **NO** | - | Unique identifier for artifact (e.g., "prd", "test_plan") |
| artifact_description | `text` | **NO** | - | Human-readable description of expected artifact |
| required | `boolean` | **NO** | `true` | Whether artifact is mandatory for SD completion |
| detection_method | `text` | **NO** | - | How to verify artifact existence |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `leo_audit_checklists_pkey`: PRIMARY KEY (id)

### Unique Constraints
- `leo_audit_checklists_unique_artifact`: UNIQUE (sd_type, checklist_version, artifact_key)

### Check Constraints
- `leo_audit_checklists_detection_method_check`: CHECK ((detection_method = ANY (ARRAY['file_exists'::text, 'sd_metadata_key_present'::text, 'command_registered'::text, 'db_table_exists'::text, 'manual_review_required'::text])))

## Indexes

- `leo_audit_checklists_pkey`
  ```sql
  CREATE UNIQUE INDEX leo_audit_checklists_pkey ON public.leo_audit_checklists USING btree (id)
  ```
- `leo_audit_checklists_unique_artifact`
  ```sql
  CREATE UNIQUE INDEX leo_audit_checklists_unique_artifact ON public.leo_audit_checklists USING btree (sd_type, checklist_version, artifact_key)
  ```

---

[← Back to Schema Overview](../database-schema-overview.md)
