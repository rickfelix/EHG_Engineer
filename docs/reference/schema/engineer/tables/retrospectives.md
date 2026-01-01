# retrospectives Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: /mnt/c/_EHG/EHG_Engineer/
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-01-01T13:00:37.176Z
**Rows**: 287
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in /mnt/c/_EHG/EHG_Engineer/

---

## Columns (64 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| sd_id | `text` | YES | - | - |
| sprint_number | `integer(32)` | YES | - | - |
| project_name | `text` | YES | - | - |
| retro_type | `text` | **NO** | - | - |
| title | `text` | **NO** | - | - |
| description | `text` | YES | - | - |
| period_start | `timestamp with time zone` | YES | - | - |
| period_end | `timestamp with time zone` | YES | - | - |
| conducted_date | `timestamp with time zone` | YES | `now()` | - |
| agents_involved | `ARRAY` | YES | `'{}'::text[]` | - |
| sub_agents_involved | `ARRAY` | YES | `'{}'::text[]` | - |
| human_participants | `ARRAY` | YES | `'{}'::text[]` | - |
| what_went_well | `jsonb` | YES | `'[]'::jsonb` | - |
| what_needs_improvement | `jsonb` | YES | `'[]'::jsonb` | - |
| action_items | `jsonb` | YES | `'[]'::jsonb` | - |
| key_learnings | `jsonb` | YES | `'[]'::jsonb` | - |
| velocity_achieved | `integer(32)` | YES | - | - |
| quality_score | `integer(32)` | **NO** | - | Quality score (70-100). Must be >= 70 for completed SDs. Never 0.
Constraint added to prevent SD-KNOWLEDGE-001 Issue #4. |
| team_satisfaction | `integer(32)` | YES | - | - |
| business_value_delivered | `text` | YES | - | - |
| customer_impact | `text` | YES | - | - |
| technical_debt_addressed | `boolean` | YES | `false` | - |
| technical_debt_created | `boolean` | YES | `false` | - |
| bugs_found | `integer(32)` | YES | `0` | - |
| bugs_resolved | `integer(32)` | YES | `0` | - |
| tests_added | `integer(32)` | YES | `0` | - |
| code_coverage_delta | `numeric` | YES | - | - |
| performance_impact | `text` | YES | - | - |
| objectives_met | `boolean` | YES | - | - |
| on_schedule | `boolean` | YES | - | - |
| within_scope | `boolean` | YES | - | - |
| success_patterns | `ARRAY` | YES | `'{}'::text[]` | - |
| failure_patterns | `ARRAY` | YES | `'{}'::text[]` | - |
| improvement_areas | `ARRAY` | YES | `'{}'::text[]` | - |
| generated_by | `text` | YES | - | - |
| trigger_event | `text` | YES | - | - |
| status | `text` | YES | `'DRAFT'::text` | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |
| quality_issues | `jsonb` | YES | `'[]'::jsonb` | Array of quality issues found during validation |
| auto_generated | `boolean` | YES | `false` | True if retrospective was auto-generated without human review |
| quality_validated_at | `timestamp with time zone` | YES | - | - |
| quality_validated_by | `character varying(100)` | YES | - | - |
| risk_accuracy_score | `smallint(16)` | YES | - | BMAD Enhancement: How accurate was initial risk assessment vs actual issues (0-100) |
| checkpoint_effectiveness | `smallint(16)` | YES | - | BMAD Enhancement: How effective were checkpoints in catching issues early (0-100, null if no checkpoints used) |
| context_efficiency_rating | `smallint(16)` | YES | - | BMAD Enhancement: How well did context engineering reduce EXEC confusion (0-100) |
| bmad_insights | `jsonb` | YES | `'{}'::jsonb` | BMAD Enhancement: Structured insights: { risk_lessons: [], checkpoint_lessons: [], context_lessons: [] } |
| target_application | `text` | **NO** | - | Target application context: EHG_engineer (management dashboard), EHG (customer app), or venture_* (venture-specific apps) |
| learning_category | `text` | **NO** | - | Type of learning: APPLICATION_ISSUE, PROCESS_IMPROVEMENT, TESTING_STRATEGY, DATABASE_SCHEMA, DEPLOYMENT_ISSUE, PERFORMANCE_OPTIMIZATION, USER_EXPERIENCE, SECURITY_VULNERABILITY, DOCUMENTATION |
| applies_to_all_apps | `boolean` | YES | `false` | Auto-populated: TRUE for PROCESS_IMPROVEMENT category, FALSE otherwise |
| related_files | `ARRAY` | YES | `'{}'::text[]` | Array of file paths related to this retrospective (e.g., ["src/components/Auth.tsx", "scripts/migrate.js"]) |
| related_commits | `ARRAY` | YES | `'{}'::text[]` | Array of git commit SHAs related to this retrospective (e.g., ["abc123f", "def456g"]) |
| related_prs | `ARRAY` | YES | `'{}'::text[]` | Array of PR URLs or numbers related to this retrospective (e.g., ["#123", "https://github.com/org/repo/pull/456"]) |
| affected_components | `ARRAY` | YES | `'{}'::text[]` | Array of component names affected by this retrospective (e.g., ["Authentication", "Database", "API"]) |
| tags | `ARRAY` | YES | `'{}'::text[]` | Array of categorization tags (e.g., ["supabase", "react", "performance", "critical"]) |
| content_embedding | `USER-DEFINED` | YES | - | OpenAI text-embedding-3-small vector (1536 dimensions) for semantic search. Generated from title + key_learnings + action_items. |
| unnecessary_work_identified | `jsonb` | YES | `'[]'::jsonb` | Array of items that could have been deleted but were not. Used to improve future Q8 decisions. |
| protocol_improvements | `jsonb` | YES | `'[]'::jsonb` | Array of LEO Protocol improvement suggestions. Each object: { category: string, improvement: string, evidence: string, impact: string, affected_phase: LEAD|PLAN|EXEC|null } |
| retrospective_type | `text` | YES | `'SD_COMPLETION'::text` | Type of retrospective: LEAD_TO_PLAN (approval phase), PLAN_TO_EXEC (validation phase), SD_COMPLETION (full SD retrospective) |
| audit_id | `uuid` | YES | - | - |
| triangulation_divergence_insights | `jsonb` | YES | - | - |
| verbatim_citations | `jsonb` | YES | - | - |
| coverage_analysis | `jsonb` | YES | - | - |

## Constraints

### Primary Key
- `retrospectives_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `retrospectives_audit_id_fkey`: audit_id → runtime_audits(id)
- `retrospectives_sd_id_fkey`: sd_id → strategic_directives_v2(id)

### Check Constraints
- `action_items_max_25`: CHECK (((action_items IS NULL) OR (jsonb_typeof(action_items) <> 'array'::text) OR (jsonb_array_length(action_items) <= 25)))
- `check_learning_category`: CHECK ((learning_category = ANY (ARRAY['APPLICATION_ISSUE'::text, 'PROCESS_IMPROVEMENT'::text, 'TESTING_STRATEGY'::text, 'DATABASE_SCHEMA'::text, 'DEPLOYMENT_ISSUE'::text, 'PERFORMANCE_OPTIMIZATION'::text, 'USER_EXPERIENCE'::text, 'SECURITY_VULNERABILITY'::text, 'DOCUMENTATION'::text])))
- `check_protocol_improvements_is_array`: CHECK (((jsonb_typeof(protocol_improvements) = 'array'::text) OR (protocol_improvements IS NULL)))
- `check_target_application`: CHECK ((target_application = ANY (ARRAY['EHG'::text, 'EHG_Engineer'::text])))
- `key_learnings_max_30`: CHECK (((key_learnings IS NULL) OR (jsonb_typeof(key_learnings) <> 'array'::text) OR (jsonb_array_length(key_learnings) <= 30)))
- `protocol_improvements_max_25`: CHECK (((protocol_improvements IS NULL) OR (jsonb_typeof(protocol_improvements) <> 'array'::text) OR (jsonb_array_length(protocol_improvements) <= 25)))
- `retrospectives_checkpoint_effectiveness_check`: CHECK (((checkpoint_effectiveness >= 0) AND (checkpoint_effectiveness <= 100)))
- `retrospectives_context_efficiency_rating_check`: CHECK (((context_efficiency_rating >= 0) AND (context_efficiency_rating <= 100)))
- `retrospectives_generated_by_check`: CHECK ((generated_by = ANY (ARRAY['MANUAL'::text, 'SUB_AGENT'::text, 'TRIGGER'::text, 'SCHEDULED'::text])))
- `retrospectives_quality_score_check`: CHECK (((quality_score IS NULL) OR ((quality_score >= 0) AND (quality_score <= 100))))
- `retrospectives_retro_type_check`: CHECK ((retro_type = ANY (ARRAY['SPRINT'::text, 'SD_COMPLETION'::text, 'INCIDENT'::text, 'MILESTONE'::text, 'WEEKLY'::text, 'MONTHLY'::text, 'ARCHITECTURE_DECISION'::text, 'RELEASE'::text, 'AUDIT'::text])))
- `retrospectives_retrospective_type_check`: CHECK ((retrospective_type = ANY (ARRAY['LEAD_TO_PLAN'::text, 'PLAN_TO_EXEC'::text, 'SD_COMPLETION'::text])))
- `retrospectives_risk_accuracy_score_check`: CHECK (((risk_accuracy_score >= 0) AND (risk_accuracy_score <= 100)))
- `retrospectives_status_check`: CHECK ((status = ANY (ARRAY['DRAFT'::text, 'PUBLISHED'::text, 'ARCHIVED'::text])))
- `retrospectives_team_satisfaction_check`: CHECK (((team_satisfaction >= 1) AND (team_satisfaction <= 10)))
- `what_needs_improvement_max_20`: CHECK (((what_needs_improvement IS NULL) OR (jsonb_typeof(what_needs_improvement) <> 'array'::text) OR (jsonb_array_length(what_needs_improvement) <= 20)))
- `what_went_well_max_25`: CHECK (((what_went_well IS NULL) OR (jsonb_typeof(what_went_well) <> 'array'::text) OR (jsonb_array_length(what_went_well) <= 25)))

## Indexes

- `idx_retrospectives_affected_components_gin`
  ```sql
  CREATE INDEX idx_retrospectives_affected_components_gin ON public.retrospectives USING gin (affected_components)
  ```
- `idx_retrospectives_applies_to_all`
  ```sql
  CREATE INDEX idx_retrospectives_applies_to_all ON public.retrospectives USING btree (applies_to_all_apps) WHERE (applies_to_all_apps = true)
  ```
- `idx_retrospectives_conducted_date`
  ```sql
  CREATE INDEX idx_retrospectives_conducted_date ON public.retrospectives USING btree (conducted_date)
  ```
- `idx_retrospectives_content_embedding_ivfflat`
  ```sql
  CREATE INDEX idx_retrospectives_content_embedding_ivfflat ON public.retrospectives USING ivfflat (content_embedding vector_cosine_ops) WITH (lists='10')
  ```
- `idx_retrospectives_deletion_audit`
  ```sql
  CREATE INDEX idx_retrospectives_deletion_audit ON public.retrospectives USING gin (unnecessary_work_identified)
  ```
- `idx_retrospectives_failure_patterns`
  ```sql
  CREATE INDEX idx_retrospectives_failure_patterns ON public.retrospectives USING gin (failure_patterns)
  ```
- `idx_retrospectives_learning_category`
  ```sql
  CREATE INDEX idx_retrospectives_learning_category ON public.retrospectives USING btree (learning_category)
  ```
- `idx_retrospectives_protocol_improvements_gin`
  ```sql
  CREATE INDEX idx_retrospectives_protocol_improvements_gin ON public.retrospectives USING gin (protocol_improvements)
  ```
- `idx_retrospectives_related_commits_gin`
  ```sql
  CREATE INDEX idx_retrospectives_related_commits_gin ON public.retrospectives USING gin (related_commits)
  ```
- `idx_retrospectives_related_files_gin`
  ```sql
  CREATE INDEX idx_retrospectives_related_files_gin ON public.retrospectives USING gin (related_files)
  ```
- `idx_retrospectives_related_prs_gin`
  ```sql
  CREATE INDEX idx_retrospectives_related_prs_gin ON public.retrospectives USING gin (related_prs)
  ```
- `idx_retrospectives_retro_type`
  ```sql
  CREATE INDEX idx_retrospectives_retro_type ON public.retrospectives USING btree (retro_type)
  ```
- `idx_retrospectives_retrospective_type`
  ```sql
  CREATE INDEX idx_retrospectives_retrospective_type ON public.retrospectives USING btree (retrospective_type)
  ```
- `idx_retrospectives_sd_id`
  ```sql
  CREATE INDEX idx_retrospectives_sd_id ON public.retrospectives USING btree (sd_id)
  ```
- `idx_retrospectives_status`
  ```sql
  CREATE INDEX idx_retrospectives_status ON public.retrospectives USING btree (status)
  ```
- `idx_retrospectives_success_patterns`
  ```sql
  CREATE INDEX idx_retrospectives_success_patterns ON public.retrospectives USING gin (success_patterns)
  ```
- `idx_retrospectives_tags_gin`
  ```sql
  CREATE INDEX idx_retrospectives_tags_gin ON public.retrospectives USING gin (tags)
  ```
- `idx_retrospectives_target_application`
  ```sql
  CREATE INDEX idx_retrospectives_target_application ON public.retrospectives USING btree (target_application)
  ```
- `retrospectives_pkey`
  ```sql
  CREATE UNIQUE INDEX retrospectives_pkey ON public.retrospectives USING btree (id)
  ```

## RLS Policies

### 1. authenticated_read_retrospectives (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. service_role_all_retrospectives (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

## Triggers

### tr_retrospectives_updated

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION update_retrospective_timestamp()`

### trg_extract_protocol_improvements

- **Timing**: AFTER INSERT
- **Action**: `EXECUTE FUNCTION extract_protocol_improvements_from_retro()`

### trg_extract_protocol_improvements

- **Timing**: AFTER UPDATE
- **Action**: `EXECUTE FUNCTION extract_protocol_improvements_from_retro()`

### trigger_auto_populate_retrospective_fields

- **Timing**: BEFORE INSERT
- **Action**: `EXECUTE FUNCTION auto_populate_retrospective_fields()`

### trigger_auto_populate_retrospective_fields

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION auto_populate_retrospective_fields()`

### validate_protocol_improvements_trigger

- **Timing**: BEFORE INSERT
- **Action**: `EXECUTE FUNCTION validate_protocol_improvements_for_process_category()`

### validate_protocol_improvements_trigger

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION validate_protocol_improvements_for_process_category()`

### validate_retrospective_quality_trigger

- **Timing**: BEFORE INSERT
- **Action**: `EXECUTE FUNCTION auto_validate_retrospective_quality()`

### validate_retrospective_quality_trigger

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION auto_validate_retrospective_quality()`

## Usage Examples

_Common query patterns for this table:_


```javascript
// Get retrospectives for SD
const { data, error } = await supabase
  .from('retrospectives')
  .select('*')
  .eq('sd_id', 'SD-XXX-001')
  .order('created_at', { ascending: false });

// Get high-quality retrospectives (score >= 85)
const { data, error } = await supabase
  .from('retrospectives')
  .select('sd_id, quality_score, key_learnings')
  .gte('quality_score', 85)
  .order('quality_score', { ascending: false });
```
---

[← Back to Schema Overview](../database-schema-overview.md)
