# creative_asset_variant_scores Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-09-06T17:42:38.372Z
**Rows**: 0
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (5 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| creative_asset_id | `uuid` | **NO** | - | - |
| variant_id | `uuid` | **NO** | - | - |
| metadata | `jsonb` | **NO** | `'{}'::jsonb` | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `creative_asset_variant_scores_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `creative_asset_variant_scores_creative_asset_id_fkey`: creative_asset_id → creative_assets(id)
- `creative_asset_variant_scores_variant_id_fkey`: variant_id → marketing_content_variants(id)

### Unique Constraints
- `creative_asset_variant_scores_creative_asset_id_variant_id_key`: UNIQUE (creative_asset_id, variant_id)

## Indexes

- `creative_asset_variant_scores_created_at_idx`
  ```sql
  CREATE INDEX creative_asset_variant_scores_created_at_idx ON public.creative_asset_variant_scores USING btree (created_at)
  ```
- `creative_asset_variant_scores_creative_asset_id_variant_id_key`
  ```sql
  CREATE UNIQUE INDEX creative_asset_variant_scores_creative_asset_id_variant_id_key ON public.creative_asset_variant_scores USING btree (creative_asset_id, variant_id)
  ```
- `creative_asset_variant_scores_pkey`
  ```sql
  CREATE UNIQUE INDEX creative_asset_variant_scores_pkey ON public.creative_asset_variant_scores USING btree (id)
  ```
- `creative_asset_variant_scores_variant_idx`
  ```sql
  CREATE INDEX creative_asset_variant_scores_variant_idx ON public.creative_asset_variant_scores USING btree (variant_id)
  ```

## RLS Policies

### 1. cavs_service_role (ALL)

- **Roles**: {service_role}
- **Using**: `true`

### 2. cavs_venture_access (ALL)

- **Roles**: {authenticated}
- **Using**: `(creative_asset_id IN ( SELECT ca.id
   FROM creative_assets ca
  WHERE (ca.venture_id IN ( SELECT v.id
           FROM ventures v
          WHERE (v.company_id IN ( SELECT user_company_access.company_id
                   FROM user_company_access
                  WHERE (user_company_access.user_id = auth.uid())))))))`

---

[← Back to Schema Overview](../database-schema-overview.md)
