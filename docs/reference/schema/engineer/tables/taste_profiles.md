# taste_profiles Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-04-27T02:34:49.236Z
**Rows**: 0
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (9 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| chairman_id | `text` | **NO** | `'default'::text` | - |
| venture_id | `uuid` | YES | - | NULL = global default profile. Non-null = venture-specific override. |
| gate_type | `text` | **NO** | - | - |
| preferences | `jsonb` | **NO** | `'{}'::jsonb` | - |
| trust_level | `text` | **NO** | `'manual'::text` | manual = always block. recommend = show recommendation. auto = auto-proceed when confident. |
| confidence_threshold | `numeric(3,2)` | **NO** | `0.70` | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `taste_profiles_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `taste_profiles_venture_id_fkey`: venture_id → ventures(id)

### Unique Constraints
- `taste_profiles_chairman_id_venture_id_gate_type_key`: UNIQUE (chairman_id, venture_id, gate_type)

### Check Constraints
- `taste_profiles_gate_type_check`: CHECK ((gate_type = ANY (ARRAY['design'::text, 'scope'::text, 'architecture'::text])))
- `taste_profiles_trust_level_check`: CHECK ((trust_level = ANY (ARRAY['manual'::text, 'recommend'::text, 'auto'::text])))

## Indexes

- `taste_profiles_chairman_id_venture_id_gate_type_key`
  ```sql
  CREATE UNIQUE INDEX taste_profiles_chairman_id_venture_id_gate_type_key ON public.taste_profiles USING btree (chairman_id, venture_id, gate_type)
  ```
- `taste_profiles_pkey`
  ```sql
  CREATE UNIQUE INDEX taste_profiles_pkey ON public.taste_profiles USING btree (id)
  ```

## RLS Policies

### 1. taste_profiles_service_all (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
