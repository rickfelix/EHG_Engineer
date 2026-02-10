# archetype_profile_interactions Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-10T06:14:49.681Z
**Rows**: 18
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (8 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| archetype_key | `text` | **NO** | - | Archetype identifier: democratizer, automator, capability_productizer, first_principles_rebuilder, vertical_specialist, portfolio_connector |
| profile_id | `uuid` | **NO** | - | - |
| weight_adjustments | `jsonb` | **NO** | `'{}'::jsonb` | JSONB of component_name → multiplier (0.5-2.0) adjustments for this archetype-profile pair |
| execution_guidance | `ARRAY` | **NO** | `'{}'::text[]` | Array of execution strategy hints for this archetype under this profile |
| compatibility_score | `numeric(3,2)` | **NO** | `0.50` | How well this profile suits this archetype (0.0-1.0) |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `archetype_profile_interactions_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `archetype_profile_interactions_profile_id_fkey`: profile_id → evaluation_profiles(id)

### Unique Constraints
- `archetype_profile_interactions_archetype_key_profile_id_key`: UNIQUE (archetype_key, profile_id)

### Check Constraints
- `archetype_profile_interactions_compatibility_score_check`: CHECK (((compatibility_score >= (0)::numeric) AND (compatibility_score <= (1)::numeric)))

## Indexes

- `archetype_profile_interactions_archetype_key_profile_id_key`
  ```sql
  CREATE UNIQUE INDEX archetype_profile_interactions_archetype_key_profile_id_key ON public.archetype_profile_interactions USING btree (archetype_key, profile_id)
  ```
- `archetype_profile_interactions_pkey`
  ```sql
  CREATE UNIQUE INDEX archetype_profile_interactions_pkey ON public.archetype_profile_interactions USING btree (id)
  ```
- `idx_api_archetype`
  ```sql
  CREATE INDEX idx_api_archetype ON public.archetype_profile_interactions USING btree (archetype_key)
  ```
- `idx_api_profile`
  ```sql
  CREATE INDEX idx_api_profile ON public.archetype_profile_interactions USING btree (profile_id)
  ```

## RLS Policies

### 1. api_read_all (SELECT)

- **Roles**: {public}
- **Using**: `true`

### 2. api_write_service (ALL)

- **Roles**: {public}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
