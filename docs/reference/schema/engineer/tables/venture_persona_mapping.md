# venture_persona_mapping Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-03-24T09:44:14.447Z
**Rows**: 0
**RLS**: Enabled (4 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (8 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| venture_id | `uuid` | **NO** | - | - |
| persona_id | `uuid` | **NO** | - | - |
| relevance_score | `numeric(3,2)` | YES | `1.0` | - |
| notes | `text` | YES | - | - |
| created_by | `text` | YES | `'system'::text` | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `venture_persona_mapping_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `venture_persona_mapping_persona_id_fkey`: persona_id → customer_personas(id)
- `venture_persona_mapping_venture_id_fkey`: venture_id → ventures(id)

### Unique Constraints
- `venture_persona_mapping_venture_id_persona_id_key`: UNIQUE (venture_id, persona_id)

## Indexes

- `venture_persona_mapping_pkey`
  ```sql
  CREATE UNIQUE INDEX venture_persona_mapping_pkey ON public.venture_persona_mapping USING btree (id)
  ```
- `venture_persona_mapping_venture_id_persona_id_key`
  ```sql
  CREATE UNIQUE INDEX venture_persona_mapping_venture_id_persona_id_key ON public.venture_persona_mapping USING btree (venture_id, persona_id)
  ```

## RLS Policies

### 1. all_venture_persona_mapping_service_role (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

### 2. insert_venture_persona_mapping_authenticated (INSERT)

- **Roles**: {authenticated}
- **With Check**: `(EXISTS ( SELECT 1
   FROM ventures v
  WHERE ((v.id = venture_persona_mapping.venture_id) AND (v.company_id IN ( SELECT user_company_access.company_id
           FROM user_company_access
          WHERE (user_company_access.user_id = auth.uid()))))))`

### 3. select_venture_persona_mapping_authenticated (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 4. update_venture_persona_mapping_authenticated (UPDATE)

- **Roles**: {authenticated}
- **Using**: `(EXISTS ( SELECT 1
   FROM ventures v
  WHERE ((v.id = venture_persona_mapping.venture_id) AND (v.company_id IN ( SELECT user_company_access.company_id
           FROM user_company_access
          WHERE (user_company_access.user_id = auth.uid()))))))`
- **With Check**: `(EXISTS ( SELECT 1
   FROM ventures v
  WHERE ((v.id = venture_persona_mapping.venture_id) AND (v.company_id IN ( SELECT user_company_access.company_id
           FROM user_company_access
          WHERE (user_company_access.user_id = auth.uid()))))))`

## Triggers

### set_updated_at_venture_persona_mapping

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION trg_set_updated_at()`

---

[← Back to Schema Overview](../database-schema-overview.md)
