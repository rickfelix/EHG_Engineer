# venture_screen_dispositions Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-09-15T16:18:27.599Z
**Rows**: 0
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (9 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| venture_id | `uuid` | **NO** | - | - |
| screen_id | `text` | **NO** | - | - |
| disposition_class | `text` | **NO** | - | D2_RETIRE: screen intentionally retired with a written reason (present-tense, always COMPLETE). D2_BUILD_THIRD_PARTY: screen handled by a third-party surface per a chairman ruling (OPEN until the third-party surface is independently evidenced, then COMPLETE). ENTRY_POINT: screen is genuinely built but unreferenced by any journey step because it is the journey's own entry node (COMPLETE once its backing artifact is cited via evidence_ref). |
| disposition_status | `text` | **NO** | `'OPEN'::text` | - |
| reason | `text` | **NO** | - | - |
| evidence_ref | `text` | YES | - | Citation backing the disposition: a chairman_decisions.id for D2 classes, or a venture_artifacts artifact_type/id for ENTRY_POINT. |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `venture_screen_dispositions_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `venture_screen_dispositions_venture_id_fkey`: venture_id → ventures(id)

### Unique Constraints
- `venture_screen_dispositions_venture_id_screen_id_key`: UNIQUE (venture_id, screen_id)

### Check Constraints
- `venture_screen_dispositions_disposition_class_check`: CHECK ((disposition_class = ANY (ARRAY['D2_RETIRE'::text, 'D2_BUILD_THIRD_PARTY'::text, 'ENTRY_POINT'::text])))
- `venture_screen_dispositions_disposition_status_check`: CHECK ((disposition_status = ANY (ARRAY['COMPLETE'::text, 'OPEN'::text])))

## Indexes

- `idx_venture_screen_dispositions_venture`
  ```sql
  CREATE INDEX idx_venture_screen_dispositions_venture ON public.venture_screen_dispositions USING btree (venture_id)
  ```
- `venture_screen_dispositions_pkey`
  ```sql
  CREATE UNIQUE INDEX venture_screen_dispositions_pkey ON public.venture_screen_dispositions USING btree (id)
  ```
- `venture_screen_dispositions_venture_id_screen_id_key`
  ```sql
  CREATE UNIQUE INDEX venture_screen_dispositions_venture_id_screen_id_key ON public.venture_screen_dispositions USING btree (venture_id, screen_id)
  ```

## RLS Policies

### 1. vsd_service_role (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

### 2. vsd_venture_access (SELECT)

- **Roles**: {authenticated}
- **Using**: `(venture_id IN ( SELECT v.id
   FROM ventures v
  WHERE (v.company_id IN ( SELECT user_company_access.company_id
           FROM user_company_access
          WHERE (user_company_access.user_id = auth.uid())))))`

---

[← Back to Schema Overview](../database-schema-overview.md)
