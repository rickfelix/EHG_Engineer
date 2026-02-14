# leo_gate_reviews Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-14T18:28:22.998Z
**Rows**: 438
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (7 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| prd_id | `text` | **NO** | - | - |
| gate | `text` | **NO** | - | - |
| score | `numeric(5,2)` | **NO** | - | - |
| evidence | `jsonb` | **NO** | `'{}'::jsonb` | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| created_by | `text` | YES | `'system'::text` | - |

## Constraints

### Primary Key
- `leo_gate_reviews_pkey`: PRIMARY KEY (id)

### Check Constraints
- `leo_gate_reviews_gate_check`: CHECK ((gate = ANY (ARRAY['0'::text, '1'::text, 'Q'::text, '2A'::text, '2B'::text, '2C'::text, '2D'::text, '3'::text])))
- `leo_gate_reviews_score_check`: CHECK (((score >= (0)::numeric) AND (score <= (100)::numeric)))

## Indexes

- `leo_gate_reviews_pkey`
  ```sql
  CREATE UNIQUE INDEX leo_gate_reviews_pkey ON public.leo_gate_reviews USING btree (id)
  ```

## RLS Policies

### 1. authenticated_read_leo_gate_reviews (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. service_role_all_leo_gate_reviews (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
