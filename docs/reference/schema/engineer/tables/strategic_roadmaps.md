# strategic_roadmaps Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-04-16T19:26:31.310Z
**Rows**: 1
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (10 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| vision_key | `text` | YES | - | FK to eva_vision_documents.vision_key. ON DELETE RESTRICT prevents orphaning roadmaps. |
| title | `text` | **NO** | - | - |
| description | `text` | YES | - | - |
| status | `character varying(20)` | **NO** | `'draft'::character varying` | - |
| current_baseline_version | `integer(32)` | **NO** | `0` | Points to the latest approved baseline snapshot version. 0 means no baseline yet. |
| metadata | `jsonb` | YES | `'{}'::jsonb` | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |
| created_by | `text` | YES | - | - |

## Constraints

### Primary Key
- `strategic_roadmaps_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `strategic_roadmaps_vision_key_fkey`: vision_key → eva_vision_documents(vision_key)

### Check Constraints
- `strategic_roadmaps_status_check`: CHECK (((status)::text = ANY ((ARRAY['draft'::character varying, 'active'::character varying, 'archived'::character varying])::text[])))

## Indexes

- `idx_roadmaps_status`
  ```sql
  CREATE INDEX idx_roadmaps_status ON public.strategic_roadmaps USING btree (status)
  ```
- `idx_roadmaps_vision_key`
  ```sql
  CREATE INDEX idx_roadmaps_vision_key ON public.strategic_roadmaps USING btree (vision_key) WHERE (vision_key IS NOT NULL)
  ```
- `strategic_roadmaps_pkey`
  ```sql
  CREATE UNIQUE INDEX strategic_roadmaps_pkey ON public.strategic_roadmaps USING btree (id)
  ```

## RLS Policies

### 1. strategic_roadmaps_authenticated_select (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. strategic_roadmaps_service_role_all (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

## Triggers

### trg_strategic_roadmaps_updated

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION update_strategic_roadmaps_updated_at()`

---

[← Back to Schema Overview](../database-schema-overview.md)
