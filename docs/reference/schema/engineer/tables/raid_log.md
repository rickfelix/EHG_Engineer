# raid_log Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-03-29T01:12:07.428Z
**Rows**: 0
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (19 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| type | `character varying(20)` | **NO** | - | RAID item type: Risk, Assumption, Issue, Dependency, Action, or Decision |
| title | `character varying(500)` | **NO** | - | - |
| description | `text` | YES | - | - |
| severity_index | `integer(32)` | YES | - | Severity score 1-10 (10 = highest impact/criticality) |
| status | `character varying(30)` | **NO** | `'ACTIVE'::character varying` | Current status: ACTIVE, MONITORING, MITIGATED, RESOLVED, ACCEPTED, CLOSED, ESCALATED |
| mitigation_strategy | `text` | YES | - | - |
| validation_approach | `text` | YES | - | - |
| resolution_details | `text` | YES | - | - |
| dependency_sd | `character varying(100)` | YES | - | - |
| dependency_status | `character varying(30)` | YES | - | - |
| category | `character varying(50)` | YES | - | - |
| owner | `character varying(100)` | **NO** | - | - |
| venture_id | `uuid` | YES | - | - |
| sd_id | `character varying(100)` | YES | - | Reference to strategic_directives_v2.id |
| prd_id | `character varying(100)` | YES | - | Reference to product_requirements_v2.id |
| metadata | `jsonb` | YES | `'{}'::jsonb` | Additional context: implementation_file, impact, probability, monitoring_metric, etc. |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `raid_log_pkey`: PRIMARY KEY (id)

### Check Constraints
- `raid_log_severity_index_check`: CHECK (((severity_index >= 1) AND (severity_index <= 10)))
- `raid_log_status_check`: CHECK (((status)::text = ANY ((ARRAY['ACTIVE'::character varying, 'MONITORING'::character varying, 'MITIGATED'::character varying, 'RESOLVED'::character varying, 'ACCEPTED'::character varying, 'CLOSED'::character varying, 'ESCALATED'::character varying])::text[])))
- `raid_log_type_check`: CHECK (((type)::text = ANY ((ARRAY['Risk'::character varying, 'Assumption'::character varying, 'Issue'::character varying, 'Dependency'::character varying, 'Action'::character varying, 'Decision'::character varying])::text[])))

## Indexes

- `idx_raid_log_category`
  ```sql
  CREATE INDEX idx_raid_log_category ON public.raid_log USING btree (category)
  ```
- `idx_raid_log_created`
  ```sql
  CREATE INDEX idx_raid_log_created ON public.raid_log USING btree (created_at DESC)
  ```
- `idx_raid_log_owner`
  ```sql
  CREATE INDEX idx_raid_log_owner ON public.raid_log USING btree (owner)
  ```
- `idx_raid_log_prd`
  ```sql
  CREATE INDEX idx_raid_log_prd ON public.raid_log USING btree (prd_id) WHERE (prd_id IS NOT NULL)
  ```
- `idx_raid_log_sd`
  ```sql
  CREATE INDEX idx_raid_log_sd ON public.raid_log USING btree (sd_id) WHERE (sd_id IS NOT NULL)
  ```
- `idx_raid_log_severity`
  ```sql
  CREATE INDEX idx_raid_log_severity ON public.raid_log USING btree (severity_index DESC NULLS LAST)
  ```
- `idx_raid_log_status`
  ```sql
  CREATE INDEX idx_raid_log_status ON public.raid_log USING btree (status)
  ```
- `idx_raid_log_type`
  ```sql
  CREATE INDEX idx_raid_log_type ON public.raid_log USING btree (type)
  ```
- `idx_raid_log_venture`
  ```sql
  CREATE INDEX idx_raid_log_venture ON public.raid_log USING btree (venture_id) WHERE (venture_id IS NOT NULL)
  ```
- `raid_log_pkey`
  ```sql
  CREATE UNIQUE INDEX raid_log_pkey ON public.raid_log USING btree (id)
  ```

## RLS Policies

### 1. service_role_insert_raid_log (INSERT)

- **Roles**: {service_role}
- **With Check**: `true`

### 2. service_role_select_raid_log (SELECT)

- **Roles**: {service_role}
- **Using**: `true`

## Triggers

### trigger_raid_log_updated_at

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION update_raid_log_timestamp()`

---

[← Back to Schema Overview](../database-schema-overview.md)
