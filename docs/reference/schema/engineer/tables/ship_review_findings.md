# ship_review_findings Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-08-22T17:33:48.904Z
**Rows**: 503
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (14 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| pr_number | `integer(32)` | **NO** | - | - |
| review_tier | `text` | **NO** | - | - |
| risk_score | `numeric(4,2)` | YES | - | - |
| finding_count | `integer(32)` | **NO** | `0` | - |
| finding_categories | `jsonb` | YES | `'{}'::jsonb` | - |
| verdict | `text` | **NO** | - | - |
| sd_key | `text` | YES | - | - |
| branch | `text` | YES | - | - |
| multi_agent | `boolean` | YES | `false` | - |
| reviewed_at | `timestamp with time zone` | **NO** | `now()` | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| synthesized_at | `timestamp with time zone` | YES | - | Set when row was inserted by post-hoc reconciliation (e.g., scripts/audit-phantom-completions.js for SD-MAN-INFRA-RECONCILE-S18-S26-001). NULL for real-time-logged rows from /ship Step 5.5. |
| metadata | `jsonb` | YES | - | SD-LEO-INFRA-SHIP-WITNESS-TRIO-001 FR-2: optional actor attribution ({actor_type, actor_role, agent_id}, reusing the system_events vocabulary) so evaluateP2Witness() can evaluate reviewer/author separation instead of permanently reporting not_evaluable. NULL means no attribution captured for this row (backward-compatible default -- P2 stays not_evaluable for it). |

## Constraints

### Primary Key
- `ship_review_findings_pkey`: PRIMARY KEY (id)

### Check Constraints
- `ship_review_findings_review_tier_check`: CHECK ((review_tier = ANY (ARRAY['light'::text, 'standard'::text, 'deep'::text])))
- `ship_review_findings_verdict_check`: CHECK ((verdict = ANY (ARRAY['pass'::text, 'block'::text])))

## Indexes

- `idx_ship_review_findings_pr`
  ```sql
  CREATE INDEX idx_ship_review_findings_pr ON public.ship_review_findings USING btree (pr_number)
  ```
- `idx_ship_review_findings_reviewed_at`
  ```sql
  CREATE INDEX idx_ship_review_findings_reviewed_at ON public.ship_review_findings USING btree (reviewed_at)
  ```
- `ship_review_findings_pkey`
  ```sql
  CREATE UNIQUE INDEX ship_review_findings_pkey ON public.ship_review_findings USING btree (id)
  ```
- `ux_ship_review_findings_sd_pr`
  ```sql
  CREATE UNIQUE INDEX ux_ship_review_findings_sd_pr ON public.ship_review_findings USING btree (sd_key, pr_number) WHERE (sd_key IS NOT NULL)
  ```

## RLS Policies

### 1. service_role_full_access (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
