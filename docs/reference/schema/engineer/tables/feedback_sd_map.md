# feedback_sd_map Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-13T15:49:11.388Z
**Rows**: 0
**RLS**: Enabled (4 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (4 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| feedback_id | `uuid` | **NO** | - | - |
| sd_id | `character varying(100)` | **NO** | - | - |
| relationship_type | `character varying(20)` | YES | `'addresses'::character varying` | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `feedback_sd_map_pkey`: PRIMARY KEY (feedback_id, sd_id)

### Foreign Keys
- `feedback_sd_map_feedback_id_fkey`: feedback_id → feedback(id)
- `feedback_sd_map_sd_id_fkey`: sd_id → strategic_directives_v2(id)

### Check Constraints
- `feedback_sd_map_relationship_type_check`: CHECK (((relationship_type)::text = ANY ((ARRAY['addresses'::character varying, 'partially_addresses'::character varying, 'related'::character varying])::text[])))

## Indexes

- `feedback_sd_map_pkey`
  ```sql
  CREATE UNIQUE INDEX feedback_sd_map_pkey ON public.feedback_sd_map USING btree (feedback_id, sd_id)
  ```

## RLS Policies

### 1. delete_feedback_sd_map_policy (DELETE)

- **Roles**: {service_role}
- **Using**: `true`

### 2. insert_feedback_sd_map_policy (INSERT)

- **Roles**: {service_role}
- **With Check**: `true`

### 3. select_feedback_sd_map_policy (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 4. update_feedback_sd_map_policy (UPDATE)

- **Roles**: {service_role}
- **Using**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
