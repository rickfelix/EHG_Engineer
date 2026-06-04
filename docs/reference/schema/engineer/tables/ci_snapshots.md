# ci_snapshots Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-06-04T16:30:25.045Z
**Rows**: 0
**RLS**: Enabled (5 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (7 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| competitor_intelligence_id | `uuid` | **NO** | - | - |
| captured_at | `timestamp with time zone` | **NO** | `now()` | - |
| snapshot | `jsonb` | **NO** | - | Full point-in-time copy of the competitor_intelligence row at capture time. |
| diff_from_prior | `jsonb` | YES | - | Computed JSON diff vs the immediately prior snapshot. NULL for first snapshot. |
| source | `text` | YES | - | What triggered this snapshot: refresh | seed | enrichment |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `ci_snapshots_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `ci_snapshots_competitor_intelligence_id_fkey`: competitor_intelligence_id → competitor_intelligence(id)

### Check Constraints
- `ci_snapshots_source_check`: CHECK ((source = ANY (ARRAY['refresh'::text, 'seed'::text, 'enrichment'::text])))

## Indexes

- `ci_snapshots_pkey`
  ```sql
  CREATE UNIQUE INDEX ci_snapshots_pkey ON public.ci_snapshots USING btree (id)
  ```
- `idx_ci_snapshots_captured_at`
  ```sql
  CREATE INDEX idx_ci_snapshots_captured_at ON public.ci_snapshots USING btree (captured_at)
  ```
- `idx_ci_snapshots_competitor_intelligence_id`
  ```sql
  CREATE INDEX idx_ci_snapshots_competitor_intelligence_id ON public.ci_snapshots USING btree (competitor_intelligence_id)
  ```

## RLS Policies

### 1. ci_snapshots_delete_own_venture (DELETE)

- **Roles**: {public}
- **Using**: `(competitor_intelligence_id IN ( SELECT ci.id
   FROM (competitor_intelligence ci
     JOIN ventures v ON ((v.id = ci.venture_id)))
  WHERE (v.created_by = auth.uid())))`

### 2. ci_snapshots_insert_own_venture (INSERT)

- **Roles**: {public}
- **With Check**: `(competitor_intelligence_id IN ( SELECT ci.id
   FROM (competitor_intelligence ci
     JOIN ventures v ON ((v.id = ci.venture_id)))
  WHERE (v.created_by = auth.uid())))`

### 3. ci_snapshots_select_own_venture (SELECT)

- **Roles**: {public}
- **Using**: `(competitor_intelligence_id IN ( SELECT ci.id
   FROM (competitor_intelligence ci
     JOIN ventures v ON ((v.id = ci.venture_id)))
  WHERE (v.created_by = auth.uid())))`

### 4. ci_snapshots_service_role_all (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

### 5. ci_snapshots_update_own_venture (UPDATE)

- **Roles**: {public}
- **Using**: `(competitor_intelligence_id IN ( SELECT ci.id
   FROM (competitor_intelligence ci
     JOIN ventures v ON ((v.id = ci.venture_id)))
  WHERE (v.created_by = auth.uid())))`

---

[← Back to Schema Overview](../database-schema-overview.md)
