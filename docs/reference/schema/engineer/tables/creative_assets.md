# creative_assets Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-08-01T20:27:50.592Z
**Rows**: 0
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (10 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| venture_id | `uuid` | **NO** | - | - |
| capability | `text` | **NO** | - | - |
| generator | `text` | **NO** | - | - |
| prompt | `text` | YES | - | - |
| brand_source_refs | `jsonb` | **NO** | `'[]'::jsonb` | Refs into S17 design-system artifacts used as brand source (array of artifact ids/keys). |
| cost | `numeric` | YES | - | - |
| provenance | `jsonb` | **NO** | `'{}'::jsonb` | - |
| consumed_at | `timestamp with time zone` | YES | - | When a channel action referenced this asset (reach). NULL past the plan window => artifact-theater finding (reference != reach). |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `creative_assets_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `creative_assets_venture_id_fkey`: venture_id → ventures(id)

### Check Constraints
- `creative_assets_capability_check`: CHECK ((capability = ANY (ARRAY['image'::text, 'video'::text])))

## Indexes

- `creative_assets_pkey`
  ```sql
  CREATE UNIQUE INDEX creative_assets_pkey ON public.creative_assets USING btree (id)
  ```
- `creative_assets_unconsumed_idx`
  ```sql
  CREATE INDEX creative_assets_unconsumed_idx ON public.creative_assets USING btree (venture_id, created_at) WHERE (consumed_at IS NULL)
  ```
- `creative_assets_venture_idx`
  ```sql
  CREATE INDEX creative_assets_venture_idx ON public.creative_assets USING btree (venture_id)
  ```

## RLS Policies

### 1. creative_assets_service_role (ALL)

- **Roles**: {service_role}
- **Using**: `true`

### 2. creative_assets_venture_access (ALL)

- **Roles**: {authenticated}
- **Using**: `(venture_id IN ( SELECT v.id
   FROM ventures v
  WHERE (v.company_id IN ( SELECT user_company_access.company_id
           FROM user_company_access
          WHERE (user_company_access.user_id = auth.uid())))))`

---

[← Back to Schema Overview](../database-schema-overview.md)
