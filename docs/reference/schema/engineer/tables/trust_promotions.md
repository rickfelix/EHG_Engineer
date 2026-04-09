# trust_promotions Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-04-09T19:20:23.701Z
**Rows**: 0
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (8 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| chairman_id | `text` | **NO** | `'default'::text` | - |
| gate_type | `text` | **NO** | - | - |
| old_level | `text` | **NO** | - | - |
| new_level | `text` | **NO** | - | - |
| confidence_at_promotion | `numeric(4,3)` | YES | - | - |
| reason | `text` | YES | - | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `trust_promotions_pkey`: PRIMARY KEY (id)

### Check Constraints
- `trust_promotions_gate_type_check`: CHECK ((gate_type = ANY (ARRAY['design'::text, 'scope'::text, 'architecture'::text])))
- `trust_promotions_new_level_check`: CHECK ((new_level = ANY (ARRAY['manual'::text, 'recommend'::text, 'auto'::text])))
- `trust_promotions_old_level_check`: CHECK ((old_level = ANY (ARRAY['manual'::text, 'recommend'::text, 'auto'::text])))

## Indexes

- `trust_promotions_pkey`
  ```sql
  CREATE UNIQUE INDEX trust_promotions_pkey ON public.trust_promotions USING btree (id)
  ```

## RLS Policies

### 1. trust_promotions_service_all (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
