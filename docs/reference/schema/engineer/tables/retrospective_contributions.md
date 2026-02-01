# retrospective_contributions Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-01T16:44:51.224Z
**Rows**: 1
**RLS**: Enabled (4 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (13 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| retro_id | `uuid` | YES | - | - |
| contributor_type | `character varying(30)` | **NO** | - | - |
| contributor_name | `character varying(50)` | **NO** | - | - |
| observations | `jsonb` | YES | - | - |
| risks | `jsonb` | YES | - | - |
| recommendations | `jsonb` | YES | - | - |
| evidence_refs | `jsonb` | YES | - | - |
| confidence | `integer(32)` | YES | - | - |
| scope | `character varying(50)` | YES | - | - |
| time_spent_minutes | `integer(32)` | YES | - | - |
| raw_text | `text` | YES | - | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `retrospective_contributions_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `retrospective_contributions_retro_id_fkey`: retro_id → retrospectives(id)

### Check Constraints
- `retrospective_contributions_confidence_check`: CHECK (((confidence >= 0) AND (confidence <= 100)))
- `retrospective_contributions_contributor_type_check`: CHECK (((contributor_type)::text = ANY ((ARRAY['triangulation_partner'::character varying, 'sub_agent'::character varying, 'chairman'::character varying, 'system'::character varying])::text[])))

## Indexes

- `retrospective_contributions_pkey`
  ```sql
  CREATE UNIQUE INDEX retrospective_contributions_pkey ON public.retrospective_contributions USING btree (id)
  ```

## RLS Policies

### 1. Allow delete for authenticated (DELETE)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. Allow update for authenticated (UPDATE)

- **Roles**: {authenticated}
- **Using**: `true`
- **With Check**: `true`

### 3. retrospective_contributions_insert (INSERT)

- **Roles**: {public}
- **With Check**: `true`

### 4. retrospective_contributions_select (SELECT)

- **Roles**: {public}
- **Using**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
