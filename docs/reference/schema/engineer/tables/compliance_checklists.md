# compliance_checklists Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-13T00:14:08.377Z
**Rows**: 3
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (11 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `uuid_generate_v4()` | - |
| archetype | `character varying(50)` | **NO** | - | - |
| version | `integer(32)` | **NO** | `1` | - |
| name | `character varying(255)` | **NO** | - | - |
| description | `text` | YES | - | - |
| is_active | `boolean` | **NO** | `true` | - |
| effective_from | `timestamp with time zone` | **NO** | `now()` | - |
| effective_to | `timestamp with time zone` | YES | - | - |
| created_by | `uuid` | YES | - | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `compliance_checklists_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `compliance_checklists_created_by_fkey`: created_by → users(id)

### Unique Constraints
- `compliance_checklists_archetype_version_key`: UNIQUE (archetype, version)

### Check Constraints
- `compliance_checklists_archetype_check`: CHECK (((archetype)::text = ANY ((ARRAY['B2B_ENTERPRISE'::character varying, 'B2B_SMB'::character varying, 'B2C'::character varying])::text[])))

## Indexes

- `compliance_checklists_archetype_version_key`
  ```sql
  CREATE UNIQUE INDEX compliance_checklists_archetype_version_key ON public.compliance_checklists USING btree (archetype, version)
  ```
- `compliance_checklists_pkey`
  ```sql
  CREATE UNIQUE INDEX compliance_checklists_pkey ON public.compliance_checklists USING btree (id)
  ```
- `idx_compliance_checklists_archetype_active`
  ```sql
  CREATE INDEX idx_compliance_checklists_archetype_active ON public.compliance_checklists USING btree (archetype) WHERE (is_active = true)
  ```

## RLS Policies

### 1. Compliance checklists are viewable by authenticated users (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

## Triggers

### update_compliance_checklists_updated_at

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION update_updated_at_column()`

---

[← Back to Schema Overview](../database-schema-overview.md)
