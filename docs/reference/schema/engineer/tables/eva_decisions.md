# eva_decisions Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-01-30T14:44:38.214Z
**Rows**: 0
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (17 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| eva_venture_id | `uuid` | YES | - | - |
| decision_class | `text` | **NO** | - | - |
| title | `text` | **NO** | - | - |
| description | `text` | YES | - | - |
| stake_level | `text` | YES | - | - |
| options | `jsonb` | YES | `'[]'::jsonb` | - |
| recommended_option | `text` | YES | - | - |
| status | `text` | YES | `'pending'::text` | - |
| decision_made | `text` | YES | - | - |
| decided_by | `text` | YES | - | - |
| decided_at | `timestamp with time zone` | YES | - | - |
| auto_decidable | `boolean` | YES | `false` | - |
| auto_decision_rule | `text` | YES | - | - |
| due_date | `timestamp with time zone` | YES | - | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `eva_decisions_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `eva_decisions_eva_venture_id_fkey`: eva_venture_id → eva_ventures(id)

### Check Constraints
- `eva_decisions_decision_class_check`: CHECK ((decision_class = ANY (ARRAY['A'::text, 'B'::text, 'C'::text])))
- `eva_decisions_stake_level_check`: CHECK ((stake_level = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text, 'critical'::text])))
- `eva_decisions_status_check`: CHECK ((status = ANY (ARRAY['pending'::text, 'decided'::text, 'auto_decided'::text, 'expired'::text])))

## Indexes

- `eva_decisions_pkey`
  ```sql
  CREATE UNIQUE INDEX eva_decisions_pkey ON public.eva_decisions USING btree (id)
  ```
- `idx_eva_decisions_class`
  ```sql
  CREATE INDEX idx_eva_decisions_class ON public.eva_decisions USING btree (decision_class)
  ```
- `idx_eva_decisions_pending`
  ```sql
  CREATE INDEX idx_eva_decisions_pending ON public.eva_decisions USING btree (status) WHERE (status = 'pending'::text)
  ```
- `idx_eva_decisions_venture`
  ```sql
  CREATE INDEX idx_eva_decisions_venture ON public.eva_decisions USING btree (eva_venture_id)
  ```

## RLS Policies

### 1. eva_decisions_admin_access (ALL)

- **Roles**: {public}
- **Using**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
