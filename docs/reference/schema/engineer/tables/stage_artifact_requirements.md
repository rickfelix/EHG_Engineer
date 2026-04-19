# stage_artifact_requirements Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-04-19T01:03:29.258Z
**Rows**: 26
**RLS**: Disabled

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (8 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `integer(32)` | **NO** | `nextval('stage_artifact_requirements_id_seq'::regclass)` | - |
| stage_number | `integer(32)` | **NO** | - | Venture lifecycle stage (1-26) |
| artifact_type | `text` | **NO** | - | Required artifact type from venture_artifacts |
| required_status | `text` | **NO** | `'completed'::text` | Status the artifact must have (default: completed) |
| is_blocking | `boolean` | **NO** | `true` | If true, missing artifact blocks advancement |
| timeout_hours | `integer(32)` | YES | - | Optional timeout for escalation (future use) |
| description | `text` | YES | - | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `stage_artifact_requirements_pkey`: PRIMARY KEY (id)

### Unique Constraints
- `stage_artifact_requirements_stage_number_artifact_type_key`: UNIQUE (stage_number, artifact_type)

### Check Constraints
- `stage_artifact_requirements_stage_number_check`: CHECK (((stage_number >= 1) AND (stage_number <= 26)))

## Indexes

- `stage_artifact_requirements_pkey`
  ```sql
  CREATE UNIQUE INDEX stage_artifact_requirements_pkey ON public.stage_artifact_requirements USING btree (id)
  ```
- `stage_artifact_requirements_stage_number_artifact_type_key`
  ```sql
  CREATE UNIQUE INDEX stage_artifact_requirements_stage_number_artifact_type_key ON public.stage_artifact_requirements USING btree (stage_number, artifact_type)
  ```

---

[← Back to Schema Overview](../database-schema-overview.md)
