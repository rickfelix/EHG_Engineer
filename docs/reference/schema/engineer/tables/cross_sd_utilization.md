# cross_sd_utilization Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-01T19:26:07.334Z
**Rows**: 1
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (16 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| requesting_sd_id | `text` | **NO** | - | - |
| requesting_prd_id | `text` | YES | - | - |
| source_sd_id | `text` | **NO** | - | - |
| backlog_id | `text` | **NO** | - | - |
| utilization_type | `text` | **NO** | - | - |
| approval_status | `text` | YES | `'PENDING'::text` | - |
| approved_by | `text` | YES | - | - |
| approved_at | `timestamp without time zone` | YES | - | - |
| denial_reason | `text` | YES | - | - |
| justification | `text` | YES | - | - |
| estimated_benefit | `text` | YES | - | - |
| risk_assessment | `text` | YES | - | - |
| request_metadata | `jsonb` | YES | `'{}'::jsonb` | - |
| requested_at | `timestamp without time zone` | YES | `now()` | - |
| expires_at | `timestamp without time zone` | YES | `(now() + '7 days'::interval)` | - |

## Constraints

### Primary Key
- `cross_sd_utilization_pkey`: PRIMARY KEY (id)

### Unique Constraints
- `unique_utilization_request`: UNIQUE (requesting_sd_id, source_sd_id, backlog_id)

### Check Constraints
- `cross_sd_utilization_approval_status_check`: CHECK ((approval_status = ANY (ARRAY['PENDING'::text, 'AUTO_APPROVED'::text, 'APPROVED'::text, 'DENIED'::text, 'EXPIRED'::text])))
- `cross_sd_utilization_risk_assessment_check`: CHECK ((risk_assessment = ANY (ARRAY['LOW'::text, 'MEDIUM'::text, 'HIGH'::text])))
- `cross_sd_utilization_utilization_type_check`: CHECK ((utilization_type = ANY (ARRAY['REFERENCE'::text, 'IMPLEMENT'::text, 'ENHANCE'::text, 'DUPLICATE'::text, 'MERGE'::text])))

## Indexes

- `cross_sd_utilization_pkey`
  ```sql
  CREATE UNIQUE INDEX cross_sd_utilization_pkey ON public.cross_sd_utilization USING btree (id)
  ```
- `idx_utilization_backlog`
  ```sql
  CREATE INDEX idx_utilization_backlog ON public.cross_sd_utilization USING btree (backlog_id)
  ```
- `idx_utilization_requesting`
  ```sql
  CREATE INDEX idx_utilization_requesting ON public.cross_sd_utilization USING btree (requesting_sd_id)
  ```
- `idx_utilization_source`
  ```sql
  CREATE INDEX idx_utilization_source ON public.cross_sd_utilization USING btree (source_sd_id)
  ```
- `idx_utilization_status`
  ```sql
  CREATE INDEX idx_utilization_status ON public.cross_sd_utilization USING btree (approval_status)
  ```
- `unique_utilization_request`
  ```sql
  CREATE UNIQUE INDEX unique_utilization_request ON public.cross_sd_utilization USING btree (requesting_sd_id, source_sd_id, backlog_id)
  ```

## RLS Policies

### 1. authenticated_read_cross_sd_utilization (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. service_role_all_cross_sd_utilization (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
