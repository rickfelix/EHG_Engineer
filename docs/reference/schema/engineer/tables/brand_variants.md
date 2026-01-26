# brand_variants Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-01-26T04:24:06.742Z
**Rows**: 0
**RLS**: Enabled (6 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (8 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| venture_id | `uuid` | **NO** | - | - |
| variant_name | `text` | **NO** | - | - |
| visual_assets | `jsonb` | YES | - | - |
| tone_of_voice | `text` | YES | - | - |
| messaging_pillars | `jsonb` | YES | - | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `brand_variants_pkey`: PRIMARY KEY (id)

## Indexes

- `brand_variants_pkey`
  ```sql
  CREATE UNIQUE INDEX brand_variants_pkey ON public.brand_variants USING btree (id)
  ```
- `idx_brand_variants_venture_id`
  ```sql
  CREATE INDEX idx_brand_variants_venture_id ON public.brand_variants USING btree (venture_id)
  ```

## RLS Policies

### 1. brand_variants_anon_insert (INSERT)

- **Roles**: {anon}
- **With Check**: `true`

### 2. brand_variants_anon_select (SELECT)

- **Roles**: {anon}
- **Using**: `true`

### 3. brand_variants_delete_policy (DELETE)

- **Roles**: {authenticated}
- **Using**: `true`

### 4. brand_variants_insert_policy (INSERT)

- **Roles**: {authenticated}
- **With Check**: `true`

### 5. brand_variants_select_policy (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 6. brand_variants_update_policy (UPDATE)

- **Roles**: {authenticated}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
