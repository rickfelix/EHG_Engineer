# learning_inbox Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-12T00:25:05.664Z
**Rows**: 0
**RLS**: Enabled (3 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (16 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| source_type | `character varying(30)` | **NO** | - | Type of source: issue_pattern, feedback_cluster, retrospective_lesson, protocol_improvement |
| source_id | `uuid` | **NO** | - | - |
| source_table | `character varying(50)` | **NO** | - | - |
| title | `character varying(255)` | **NO** | - | - |
| description | `text` | YES | - | - |
| category | `character varying(50)` | YES | - | - |
| evidence_count | `integer(32)` | YES | `1` | Number of evidence items supporting this learning (higher = more confident) |
| confidence | `integer(32)` | YES | `50` | Confidence score 0-100 based on evidence count and source reliability |
| status | `character varying(20)` | YES | `'pending'::character varying` | - |
| first_seen | `timestamp with time zone` | YES | `now()` | - |
| last_seen | `timestamp with time zone` | YES | `now()` | - |
| processed_at | `timestamp with time zone` | YES | - | - |
| metadata | `jsonb` | YES | `'{}'::jsonb` | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `learning_inbox_pkey`: PRIMARY KEY (id)

### Check Constraints
- `learning_inbox_confidence_check`: CHECK (((confidence >= 0) AND (confidence <= 100)))
- `learning_inbox_source_type_check`: CHECK (((source_type)::text = ANY ((ARRAY['issue_pattern'::character varying, 'feedback_cluster'::character varying, 'retrospective_lesson'::character varying, 'protocol_improvement'::character varying])::text[])))
- `learning_inbox_status_check`: CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'approved'::character varying, 'rejected'::character varying, 'sd_created'::character varying, 'archived'::character varying])::text[])))

## Indexes

- `idx_learning_inbox_pending`
  ```sql
  CREATE INDEX idx_learning_inbox_pending ON public.learning_inbox USING btree (confidence DESC) WHERE ((status)::text = 'pending'::text)
  ```
- `idx_learning_inbox_source`
  ```sql
  CREATE INDEX idx_learning_inbox_source ON public.learning_inbox USING btree (source_type, source_id)
  ```
- `learning_inbox_pkey`
  ```sql
  CREATE UNIQUE INDEX learning_inbox_pkey ON public.learning_inbox USING btree (id)
  ```

## RLS Policies

### 1. learning_inbox_authenticated_insert (INSERT)

- **Roles**: {authenticated}
- **With Check**: `true`

### 2. learning_inbox_authenticated_select (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 3. learning_inbox_service_role_all (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
