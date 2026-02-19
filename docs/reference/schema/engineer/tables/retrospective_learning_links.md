# retrospective_learning_links Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-19T23:26:50.288Z
**Rows**: 0
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (8 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| retrospective_id | `uuid` | **NO** | - | - |
| learning_outcome_id | `uuid` | YES | - | - |
| correlation_type | `text` | YES | - | - |
| correlation_strength | `numeric` | YES | - | - |
| learning_summary | `text` | YES | - | - |
| impacts_agent | `text` | YES | - | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `retrospective_learning_links_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `retrospective_learning_links_retrospective_id_fkey`: retrospective_id → retrospectives(id)

### Check Constraints
- `retrospective_learning_links_correlation_strength_check`: CHECK (((correlation_strength >= (0)::numeric) AND (correlation_strength <= (1)::numeric)))
- `retrospective_learning_links_correlation_type_check`: CHECK ((correlation_type = ANY (ARRAY['DIRECT'::text, 'INDIRECT'::text, 'POTENTIAL'::text])))
- `retrospective_learning_links_impacts_agent_check`: CHECK ((impacts_agent = ANY (ARRAY['LEAD'::text, 'PLAN'::text, 'EXEC'::text, 'ALL'::text])))

## Indexes

- `retrospective_learning_links_pkey`
  ```sql
  CREATE UNIQUE INDEX retrospective_learning_links_pkey ON public.retrospective_learning_links USING btree (id)
  ```

## RLS Policies

### 1. authenticated_read_retrospective_learning_links (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. service_role_all_retrospective_learning_links (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
