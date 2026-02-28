# governance_decisions Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-28T03:30:25.261Z
**Rows**: 0
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (17 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| title | `text` | **NO** | - | - |
| decision_type | `text` | YES | `'standard'::text` | - |
| status | `text` | YES | `'pending'::text` | - |
| decided_by | `text` | YES | - | - |
| decided_at | `timestamp with time zone` | YES | - | - |
| venture_id | `uuid` | YES | - | - |
| sd_id | `uuid` | YES | - | - |
| impact_level | `text` | YES | `'medium'::text` | - |
| rationale | `text` | YES | - | - |
| risk_factors | `jsonb` | YES | `'[]'::jsonb` | - |
| recommendation | `text` | YES | - | - |
| stage | `integer(32)` | YES | - | - |
| venture_name | `text` | YES | - | - |
| park_until | `date` | YES | - | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `governance_decisions_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `governance_decisions_venture_id_fkey`: venture_id → ventures(id)

### Check Constraints
- `governance_decisions_impact_level_check`: CHECK ((impact_level = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text, 'critical'::text])))
- `governance_decisions_status_check`: CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'parked'::text])))

## Indexes

- `governance_decisions_pkey`
  ```sql
  CREATE UNIQUE INDEX governance_decisions_pkey ON public.governance_decisions USING btree (id)
  ```

## RLS Policies

### 1. Allow authenticated read (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. Allow authenticated write (ALL)

- **Roles**: {authenticated}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
