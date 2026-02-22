# eva_architecture_plans Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-22T16:05:57.778Z
**Rows**: 1
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (14 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| plan_key | `character varying(100)` | **NO** | - | - |
| vision_id | `uuid` | **NO** | - | - |
| venture_id | `uuid` | YES | - | - |
| content | `text` | **NO** | - | - |
| extracted_dimensions | `jsonb` | YES | - | - |
| version | `integer(32)` | **NO** | `1` | - |
| status | `character varying(20)` | **NO** | `'draft'::character varying` | - |
| chairman_approved | `boolean` | **NO** | `false` | - |
| chairman_approved_at | `timestamp with time zone` | YES | - | - |
| adr_ids | `jsonb` | YES | - | Intentional soft reference array. No FK enforcement on JSONB array elements. Format: ["uuid1", "uuid2"]. For integrity guarantees, consider eva_architecture_plan_adrs junction table in future. |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |
| created_by | `text` | YES | - | - |

## Constraints

### Primary Key
- `eva_architecture_plans_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `eva_architecture_plans_venture_id_fkey`: venture_id → ventures(id)
- `eva_architecture_plans_vision_id_fkey`: vision_id → eva_vision_documents(id)

### Unique Constraints
- `eva_architecture_plans_plan_key_key`: UNIQUE (plan_key)

### Check Constraints
- `eva_architecture_plans_status_check`: CHECK (((status)::text = ANY ((ARRAY['draft'::character varying, 'active'::character varying, 'superseded'::character varying, 'archived'::character varying])::text[])))

## Indexes

- `eva_architecture_plans_pkey`
  ```sql
  CREATE UNIQUE INDEX eva_architecture_plans_pkey ON public.eva_architecture_plans USING btree (id)
  ```
- `eva_architecture_plans_plan_key_key`
  ```sql
  CREATE UNIQUE INDEX eva_architecture_plans_plan_key_key ON public.eva_architecture_plans USING btree (plan_key)
  ```
- `idx_eva_arch_plans_status`
  ```sql
  CREATE INDEX idx_eva_arch_plans_status ON public.eva_architecture_plans USING btree (status)
  ```
- `idx_eva_arch_plans_venture`
  ```sql
  CREATE INDEX idx_eva_arch_plans_venture ON public.eva_architecture_plans USING btree (venture_id) WHERE (venture_id IS NOT NULL)
  ```
- `idx_eva_arch_plans_vision`
  ```sql
  CREATE INDEX idx_eva_arch_plans_vision ON public.eva_architecture_plans USING btree (vision_id)
  ```

## RLS Policies

### 1. eva_arch_plans_authenticated_select (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. eva_arch_plans_service_role_all (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

## Triggers

### update_eva_architecture_plans_updated_at

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION update_updated_at_column()`

---

[← Back to Schema Overview](../database-schema-overview.md)
