# eva_todoist_intake Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-04-19T01:03:29.258Z
**Rows**: 304
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (35 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| todoist_task_id | `text` | **NO** | - | - |
| todoist_project_id | `text` | YES | - | - |
| todoist_project_name | `text` | YES | - | - |
| title | `text` | **NO** | - | - |
| description | `text` | YES | - | - |
| todoist_labels | `ARRAY` | YES | `'{}'::text[]` | - |
| todoist_priority | `integer(32)` | YES | - | - |
| todoist_url | `text` | YES | - | - |
| todoist_due_date | `timestamp with time zone` | YES | - | - |
| venture_tag | `text` | YES | - | - |
| business_function | `text` | YES | - | - |
| confidence_score | `numeric(3,2)` | YES | - | - |
| status | `text` | **NO** | `'pending'::text` | - |
| feedback_id | `uuid` | YES | - | - |
| evaluation_outcome | `jsonb` | YES | - | - |
| processed_at | `timestamp with time zone` | YES | - | - |
| raw_data | `jsonb` | YES | `'{}'::jsonb` | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |
| todoist_parent_id | `text` | YES | - | - |
| todoist_section_id | `text` | YES | - | - |
| todoist_child_order | `integer(32)` | YES | `0` | - |
| extracted_youtube_id | `text` | YES | - | - |
| extracted_youtube_url | `text` | YES | - | - |
| youtube_intake_id | `uuid` | YES | - | - |
| target_application | `text` | YES | - | Classification dimension 1: Which application this item targets (ehg_engineer, ehg_app, new_venture) |
| target_aspects | `jsonb` | YES | `'[]'::jsonb` | Classification dimension 2: JSON array of aspect tags, context-sensitive per application |
| chairman_intent | `text` | YES | - | Classification dimension 3: Why the Chairman captured this item (idea, insight, reference, question, value) |
| chairman_notes | `text` | YES | - | Free-text notes the Chairman adds during classification for context preservation |
| classification_confidence | `numeric(3,2)` | YES | - | AI confidence score (0.00-1.00) for the recommended classification |
| classified_at | `timestamp with time zone` | YES | - | Timestamp when classification was completed (serves as checkpoint for session resume) |
| enrichment_status | `character varying(20)` | YES | `'pending'::character varying` | - |
| enrichment_summary | `text` | YES | - | - |
| chairman_reviewed_at | `timestamp with time zone` | YES | - | - |

## Constraints

### Primary Key
- `eva_todoist_intake_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `eva_todoist_intake_youtube_intake_id_fkey`: youtube_intake_id → eva_youtube_intake(id)

### Unique Constraints
- `eva_todoist_intake_todoist_task_id_key`: UNIQUE (todoist_task_id)

### Check Constraints
- `chk_todoist_enrichment_status`: CHECK (((enrichment_status)::text = ANY ((ARRAY['pending'::character varying, 'enriched'::character varying, 'failed'::character varying])::text[])))
- `eva_todoist_intake_chairman_intent_check`: CHECK ((chairman_intent = ANY (ARRAY['idea'::text, 'insight'::text, 'reference'::text, 'question'::text, 'value'::text])))
- `eva_todoist_intake_confidence_score_check`: CHECK (((confidence_score >= (0)::numeric) AND (confidence_score <= (1)::numeric)))
- `eva_todoist_intake_status_check`: CHECK ((status = ANY (ARRAY['pending'::text, 'evaluating'::text, 'approved'::text, 'rejected'::text, 'needs_revision'::text, 'processed'::text, 'error'::text])))
- `eva_todoist_intake_target_application_check`: CHECK ((target_application = ANY (ARRAY['ehg_engineer'::text, 'ehg_app'::text, 'new_venture'::text])))
- `eva_todoist_intake_todoist_priority_check`: CHECK (((todoist_priority >= 1) AND (todoist_priority <= 4)))

## Indexes

- `eva_todoist_intake_pkey`
  ```sql
  CREATE UNIQUE INDEX eva_todoist_intake_pkey ON public.eva_todoist_intake USING btree (id)
  ```
- `eva_todoist_intake_todoist_task_id_key`
  ```sql
  CREATE UNIQUE INDEX eva_todoist_intake_todoist_task_id_key ON public.eva_todoist_intake USING btree (todoist_task_id)
  ```
- `idx_eva_todoist_intake_parent`
  ```sql
  CREATE INDEX idx_eva_todoist_intake_parent ON public.eva_todoist_intake USING btree (todoist_parent_id) WHERE (todoist_parent_id IS NOT NULL)
  ```
- `idx_eva_todoist_intake_pending`
  ```sql
  CREATE INDEX idx_eva_todoist_intake_pending ON public.eva_todoist_intake USING btree (status) WHERE (status = 'pending'::text)
  ```
- `idx_eva_todoist_intake_project`
  ```sql
  CREATE INDEX idx_eva_todoist_intake_project ON public.eva_todoist_intake USING btree (todoist_project_name)
  ```
- `idx_eva_todoist_intake_section`
  ```sql
  CREATE INDEX idx_eva_todoist_intake_section ON public.eva_todoist_intake USING btree (todoist_section_id) WHERE (todoist_section_id IS NOT NULL)
  ```
- `idx_eva_todoist_intake_status`
  ```sql
  CREATE INDEX idx_eva_todoist_intake_status ON public.eva_todoist_intake USING btree (status)
  ```
- `idx_eva_todoist_intake_venture`
  ```sql
  CREATE INDEX idx_eva_todoist_intake_venture ON public.eva_todoist_intake USING btree (venture_tag)
  ```
- `idx_eva_todoist_intake_youtube_id`
  ```sql
  CREATE INDEX idx_eva_todoist_intake_youtube_id ON public.eva_todoist_intake USING btree (extracted_youtube_id) WHERE (extracted_youtube_id IS NOT NULL)
  ```
- `idx_todoist_enrichment_pending`
  ```sql
  CREATE INDEX idx_todoist_enrichment_pending ON public.eva_todoist_intake USING btree (enrichment_status) WHERE ((enrichment_status)::text = 'pending'::text)
  ```
- `idx_todoist_intake_classified`
  ```sql
  CREATE INDEX idx_todoist_intake_classified ON public.eva_todoist_intake USING btree (target_application, classified_at DESC) WHERE (target_application IS NOT NULL)
  ```
- `idx_todoist_intake_unclassified`
  ```sql
  CREATE INDEX idx_todoist_intake_unclassified ON public.eva_todoist_intake USING btree (created_at) WHERE ((target_application IS NULL) AND (status <> 'error'::text))
  ```
- `idx_todoist_unreviewed`
  ```sql
  CREATE INDEX idx_todoist_unreviewed ON public.eva_todoist_intake USING btree (chairman_reviewed_at) WHERE (chairman_reviewed_at IS NULL)
  ```

## RLS Policies

### 1. manage_eva_todoist_intake (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

### 2. select_eva_todoist_intake (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

## Triggers

### trg_eva_todoist_intake_updated

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION update_eva_intake_updated_at()`

---

[← Back to Schema Overview](../database-schema-overview.md)
