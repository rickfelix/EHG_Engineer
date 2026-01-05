# strategic_directives_v2 Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: /mnt/c/_EHG/EHG_Engineer/
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-01-05T02:24:09.223Z
**Rows**: 372
**RLS**: Enabled (4 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in /mnt/c/_EHG/EHG_Engineer/

---

## Columns (77 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `character varying(50)` | **NO** | - | PRIMARY UNIQUE IDENTIFIER: Human-readable Strategic Directive ID (e.g., SD-UAT-001, SD-EXPORT-001). This is the main identifier used throughout the application, in handoffs, PRDs, and documentation. Format: SD-{CATEGORY}-{NUMBER} |
| legacy_id | `character varying(50)` | YES | - | LEGACY IDENTIFIER: Old ID format from previous system versions. Deprecated - use id field instead. Kept for historical data migration purposes. |
| title | `character varying(500)` | **NO** | - | TITLE: Brief descriptive title of the strategic directive (max 500 chars). Should be concise and summarize the directive's purpose. |
| version | `character varying(20)` | **NO** | `'1.0'::character varying` | VERSION: Semantic version number (e.g., 1.0, 1.1, 2.0). Increments when significant changes are made to the SD. Default: 1.0 |
| status | `character varying(50)` | **NO** | - | STATUS: Current workflow state. Valid values: draft, pending_approval, active, in_progress, completed, archived, deferred. Status "deferred" indicates postponed due to business stage or priority mismatch. |
| category | `character varying(50)` | **NO** | - | CATEGORY: Classification of the directive (e.g., infrastructure, feature, enhancement, fix, documentation). Used for filtering and organization. |
| priority | `character varying(20)` | **NO** | - | PRIORITY: Business priority level. Valid values: CRITICAL (90+), HIGH (70-89), MEDIUM (50-69), LOW (30-49). Determines execution order and resource allocation. |
| description | `text` | **NO** | - | DESCRIPTION: Detailed description of what needs to be accomplished. This is the main body text explaining the directive's requirements and context. |
| strategic_intent | `text` | YES | - | STRATEGIC INTENT: High-level business objective and strategic alignment. Explains WHY this directive matters to the organization's goals. |
| rationale | `text` | **NO** | - | RATIONALE: Justification for this directive. Explains the business case, user need, or technical necessity driving this work. |
| scope | `text` | **NO** | - | SCOPE: Boundaries of what is included/excluded in this directive. Defines deliverables and explicitly states what is out of scope. |
| key_changes | `jsonb` | YES | `'[]'::jsonb` | KEY CHANGES: Array of major changes introduced by this directive. Format: [{ change: "Description", impact: "Impact assessment" }] |
| strategic_objectives | `jsonb` | YES | `'[]'::jsonb` | STRATEGIC OBJECTIVES: Array of specific objectives this directive aims to achieve. Format: [{ objective: "Goal", metric: "Success measure" }] |
| success_criteria | `jsonb` | YES | `'[]'::jsonb` | SUCCESS CRITERIA: Array of measurable criteria that define successful completion. Format: [{ criterion: "What", measure: "How to measure" }] |
| key_principles | `jsonb` | YES | `'[]'::jsonb` | KEY PRINCIPLES: Array of guiding principles for implementation. Format: [{ principle: "Name", description: "Explanation" }] |
| implementation_guidelines | `jsonb` | YES | `'[]'::jsonb` | IMPLEMENTATION GUIDELINES: Array of specific guidelines for EXEC phase. Format: [{ guideline: "Instruction", rationale: "Why" }] |
| dependencies | `jsonb` | YES | `'[]'::jsonb` | DEPENDENCIES: Array of technical or business dependencies. Format: [{ dependency: "What", type: "technical/business", status: "ready/blocked" }] |
| risks | `jsonb` | YES | `'[]'::jsonb` | RISKS: Array of identified risks and mitigation strategies. Format: [{ risk: "Description", severity: "high/medium/low", mitigation: "Strategy" }] |
| success_metrics | `jsonb` | YES | `'[]'::jsonb` | SUCCESS METRICS: Array of quantifiable metrics to measure success. Format: [{ metric: "Name", target: "Target value", actual: "Current value" }] |
| stakeholders | `jsonb` | YES | `'[]'::jsonb` | STAKEHOLDERS: Array of stakeholders and their roles. Format: [{ name: "Person/Team", role: "Role", contact: "Email/Slack" }] |
| approved_by | `character varying(100)` | YES | - | APPROVED BY: Name/ID of person who approved this directive (typically LEAD agent or human reviewer). NULL if not yet approved. |
| approval_date | `timestamp without time zone` | YES | - | APPROVAL DATE: Timestamp when directive was approved and moved to active status. NULL if not yet approved. |
| effective_date | `timestamp without time zone` | YES | - | EFFECTIVE DATE: Date when this directive becomes active/enforceable. Can be future-dated for planned implementations. |
| expiry_date | `timestamp without time zone` | YES | - | EXPIRY DATE: Optional expiration date for time-bound directives. NULL for indefinite directives. |
| review_schedule | `character varying(100)` | YES | - | REVIEW SCHEDULE: Cadence for reviewing this directive (e.g., "quarterly", "annually", "on completion"). NULL if no review needed. |
| created_at | `timestamp without time zone` | YES | `CURRENT_TIMESTAMP` | CREATED AT: Timestamp when this record was first created in the database. Auto-set on INSERT. |
| updated_at | `timestamp without time zone` | YES | `CURRENT_TIMESTAMP` | UPDATED AT: Timestamp of last modification. Auto-updated on any UPDATE. Use this to track recent changes. |
| created_by | `character varying(100)` | YES | - | CREATED BY: User/agent who created this directive (e.g., "LEAD", "human:john@example.com"). NULL if system-generated. |
| updated_by | `character varying(100)` | YES | - | UPDATED BY: User/agent who last modified this directive. NULL if no updates since creation. |
| metadata | `jsonb` | YES | `'{}'::jsonb` | METADATA: Flexible JSONB object for additional custom fields not covered by schema. Use sparingly - prefer structured columns. |
| h_count | `integer(32)` | YES | `0` | HIGH PRIORITY COUNT: Number of HIGH priority backlog items linked to this SD. Computed from sd_backlog_map. |
| m_count | `integer(32)` | YES | `0` | MEDIUM PRIORITY COUNT: Number of MEDIUM priority backlog items linked to this SD. Computed from sd_backlog_map. |
| l_count | `integer(32)` | YES | `0` | LOW PRIORITY COUNT: Number of LOW priority backlog items linked to this SD. Computed from sd_backlog_map. |
| future_count | `integer(32)` | YES | `0` | FUTURE COUNT: Number of FUTURE backlog items linked to this SD (planned but not immediate). Computed from sd_backlog_map. |
| must_have_count | `integer(32)` | YES | `0` | MUST-HAVE COUNT: Number of MUST-HAVE backlog items (critical requirements). Computed from sd_backlog_map. |
| wish_list_count | `integer(32)` | YES | `0` | WISH-LIST COUNT: Number of WISH-LIST backlog items (nice-to-have features). Computed from sd_backlog_map. |
| must_have_pct | `numeric(5,2)` | YES | - | MUST-HAVE PERCENTAGE: Percentage of backlog items marked as MUST-HAVE. Calculation: (must_have_count / total_items) * 100. High percentage indicates critical scope. |
| rolled_triage | `text` | YES | - | ROLLED TRIAGE: Aggregated triage classification from backlog items. Values: "mostly_must_have", "balanced", "mostly_wish_list". |
| readiness | `numeric(10,2)` | YES | - | READINESS SCORE: Calculated readiness score (0-100) based on backlog completion, dependencies, and prerequisites. Higher = more ready for implementation. |
| must_have_density | `numeric(10,2)` | YES | - | MUST-HAVE DENSITY: Ratio of MUST-HAVE items to total scope. High density indicates high-priority, mission-critical work. |
| new_module_pct | `numeric(10,2)` | YES | - | NEW MODULE PERCENTAGE: Percentage of work involving new modules vs. enhancements to existing. High percentage = greenfield work. |
| import_run_id | `uuid` | YES | - | IMPORT RUN ID: UUID of the import batch that created/updated this record. Used for tracking bulk imports from external systems. |
| present_in_latest_import | `boolean` | YES | `false` | PRESENT IN LATEST IMPORT: Boolean flag indicating if this SD was present in the most recent import. FALSE suggests it may be stale or removed upstream. |
| sequence_rank | `integer(32)` | **NO** | - | SEQUENCE RANK: Execution order within dependency chain. Lower numbers = higher priority and earlier execution. Used by LEO Protocol for scheduling. |
| sd_key | `text` | **NO** | - | SD KEY: Human-readable key format used by Vision Alignment Pipeline (e.g., SD-2025-09-22-vision-pipeline). Alternative to id field for workflows. |
| parent_sd_id | `character varying(50)` | YES | - | Parent SD ID for Child SD Pattern. If set, this SD is a child implementation unit of the parent orchestrator SD. Parent SDs coordinate children but do not contain implementation code. |
| is_active | `boolean` | YES | `true` | IS ACTIVE: Boolean flag indicating if this SD is currently active. FALSE = soft-deleted/archived. Default: TRUE. |
| archived_at | `timestamp without time zone` | YES | - | ARCHIVED AT: Timestamp when this directive was archived. NULL if currently active. Set when is_active changes to FALSE. |
| archived_by | `character varying(100)` | YES | - | ARCHIVED BY: User/agent who archived this directive. NULL if not archived. |
| governance_metadata | `jsonb` | YES | `'{}'::jsonb` | GOVERNANCE METADATA: Flexible JSONB object for governance-related data (compliance, approvals, audit trails). Structure varies by org policy. |
| target_application | `character varying(20)` | YES | `'EHG'::character varying` | TARGET APPLICATION: Which application this SD targets. Valid values: "EHG" (customer-facing app) or "EHG_Engineer" (management dashboard). Default: EHG. |
| progress | `integer(32)` | YES | `0` | PROGRESS (LEGACY): Old progress field (0-100 integer). DEPRECATED - use progress_percentage instead. Kept for backward compatibility. |
| completion_date | `timestamp with time zone` | YES | - | COMPLETION DATE: Timestamp when status changed to "completed". NULL if not yet complete. Auto-set by LEAD final approval. |
| current_phase | `text` | YES | `'LEAD_APPROVAL'::text` | CURRENT PHASE: Current LEO Protocol workflow phase. Valid values: LEAD_APPROVAL, PLAN_PRD, EXEC_IMPLEMENTATION, PLAN_VERIFY, LEAD_FINAL. Default: LEAD_APPROVAL. |
| phase_progress | `integer(32)` | YES | `0` | PHASE PROGRESS: Progress within current phase (0-100). Resets to 0 when moving to next phase. Used for granular progress tracking. |
| is_working_on | `boolean` | YES | `false` | IS WORKING ON: Boolean flag indicating if an agent is actively working on this SD. Used to prevent concurrent modifications. Default: FALSE. |
| uuid_id | `uuid` | **NO** | `gen_random_uuid()` | DEPRECATED (2025-12-12): Do not use for FK relationships.
Use the id column instead - it is the canonical identifier. |
| progress_percentage | `integer(32)` | YES | `0` | PROGRESS PERCENTAGE: Current completion percentage (0-100). Calculated from LEO Protocol 5-phase workflow progress. Auto-updated by handoffs. |
| confidence_score | `integer(32)` | YES | - | CONFIDENCE SCORE: Overall quality/confidence score (0-100) from sub-agent verification. Aggregated from TESTING, SECURITY, DATABASE, etc. NULL until verification complete. |
| checkpoint_plan | `jsonb` | YES | - | CHECKPOINT PLAN: BMAD Enhancement - Checkpoint breakdown for large SDs (>8 user stories). Structure: { checkpoints: [{ id: 1, user_stories: ["US-001"], estimated_hours: 3, milestone: "Description" }], total_checkpoints: 3 }. NULL for small SDs. |
| scope_embedding | `USER-DEFINED` | YES | - | - |
| embedding_generated_at | `timestamp with time zone` | YES | - | - |
| embedding_model | `character varying(100)` | YES | `'text-embedding-3-small'::character varying` | - |
| sd_type | `character varying(50)` | **NO** | `'feature'::character varying` | SD type classification: feature (UI/UX), infrastructure (CI/CD, tooling), database (schema), security (auth/RLS), documentation |
| relationship_type | `text` | YES | `'standalone'::text` | SD relationship type: standalone (normal), parent (orchestrator), child_phase (inherits workflow from parent), child_independent (own full workflow) |
| scope_reduction_percentage | `integer(32)` | YES | `0` | Percentage of original scope that was eliminated during LEAD review. Target: >10%. Inspired by Musk Step 2. |
| delivers_capabilities | `jsonb` | YES | `'[]'::jsonb` | Array of capabilities that will be auto-registered when SD completes. Format: [{capability_type, capability_key, name, description, metadata}] |
| modifies_capabilities | `jsonb` | YES | `'[]'::jsonb` | Array of existing capabilities to update when SD completes. Format: [{capability_key, updates: {...}}] |
| deprecates_capabilities | `jsonb` | YES | `'[]'::jsonb` | Array of capability_keys to mark as deprecated when SD completes. Format: [{capability_key, reason}] |
| active_session_id | `text` | YES | - | - |
| complexity_level | `character varying(20)` | YES | `'moderate'::character varying` | SD complexity level for effort policy lookup: simple, moderate, complex, critical |
| dependency_chain | `jsonb` | YES | - | For parent SDs: ordered list of child SD IDs with dependencies. Format: {"children": [{"sd_id": "SD-X", "order": 1, "depends_on": null}]} |
| exploration_summary | `jsonb` | YES | - | EXPLORATION SUMMARY: JSONB object containing exploration phase findings for orchestrator SDs. Structure: {files_explored: [], key_findings: [], patterns_identified: [], gaps_identified: [], exploration_date: "YYYY-MM-DD", explored_by: "Agent name"}. NULL for non-orchestrator SDs or pre-exploration phase. |
| intensity_level | `character varying(20)` | YES | - | Refactoring intensity level. Required for sd_type=refactor. Values:
  - cosmetic: Variable renames, formatting, comment updates (<50 LOC)
  - structural: Extract methods, file reorganization, import changes (50-500 LOC)
  - architectural: Design pattern changes, module restructuring (>500 LOC) |
| smoke_test_steps | `jsonb` | YES | `'[]'::jsonb` | SD-specific smoke test steps. Array of {step_number, instruction, expected_outcome, evidence_url}. Populated from template + SD context. Required for feature SDs. |
| human_verification_status | `text` | YES | `'not_required'::text` | Status of human-verifiable outcome validation: not_required, pending, in_progress, passed, failed |
| llm_ux_score | `integer(32)` | YES | - | LLM UX Oracle average score for this SD (0-100). NULL if not evaluated. |

## Constraints

### Primary Key
- `strategic_directives_v2_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `strategic_directives_v2_parent_sd_id_fkey`: parent_sd_id → strategic_directives_v2(id)

### Unique Constraints
- `strategic_directives_v2_legacy_id_unique`: UNIQUE (legacy_id)
- `strategic_directives_v2_sd_key_key`: UNIQUE (sd_key)
- `strategic_directives_v2_sd_key_unique`: UNIQUE (sd_key)

### Check Constraints
- `check_target_application`: CHECK (((target_application)::text = ANY ((ARRAY['EHG'::character varying, 'EHG_Engineer'::character varying])::text[])))
- `chk_sd_v2_triage`: CHECK (((rolled_triage IS NULL) OR (rolled_triage = ANY (ARRAY['High'::text, 'Medium'::text, 'Low'::text, 'Future'::text]))))
- `sd_type_check`: CHECK (((sd_type IS NULL) OR ((sd_type)::text = ANY ((ARRAY['bugfix'::character varying, 'database'::character varying, 'docs'::character varying, 'documentation'::character varying, 'feature'::character varying, 'infrastructure'::character varying, 'orchestrator'::character varying, 'qa'::character varying, 'refactor'::character varying, 'security'::character varying, 'implementation'::character varying, 'strategic_observation'::character varying, 'architectural_review'::character varying, 'discovery_spike'::character varying, 'ux_debt'::character varying, 'product_decision'::character varying])::text[]))))
- `strategic_directives_v2_complexity_level_check`: CHECK (((complexity_level)::text = ANY ((ARRAY['simple'::character varying, 'moderate'::character varying, 'complex'::character varying, 'critical'::character varying])::text[])))
- `strategic_directives_v2_confidence_score_check`: CHECK (((confidence_score >= 0) AND (confidence_score <= 100)))
- `strategic_directives_v2_intensity_level_check`: CHECK (((intensity_level)::text = ANY ((ARRAY['cosmetic'::character varying, 'structural'::character varying, 'architectural'::character varying])::text[])))
- `strategic_directives_v2_priority_check`: CHECK (((priority)::text = ANY ((ARRAY['critical'::character varying, 'high'::character varying, 'medium'::character varying, 'low'::character varying])::text[])))
- `strategic_directives_v2_progress_check`: CHECK (((progress >= 0) AND (progress <= 100)))
- `strategic_directives_v2_progress_percentage_check`: CHECK (((progress_percentage >= 0) AND (progress_percentage <= 100)))
- `strategic_directives_v2_relationship_type_check`: CHECK ((relationship_type = ANY (ARRAY['standalone'::text, 'parent'::text, 'child'::text])))
- `strategic_directives_v2_scope_reduction_check`: CHECK (((scope_reduction_percentage >= 0) AND (scope_reduction_percentage <= 100)))
- `strategic_directives_v2_status_check`: CHECK (((status)::text = ANY ((ARRAY['draft'::character varying, 'active'::character varying, 'in_progress'::character varying, 'planning'::character varying, 'review'::character varying, 'pending_approval'::character varying, 'completed'::character varying, 'deferred'::character varying, 'cancelled'::character varying])::text[])))
- `valid_human_verification_status`: CHECK ((human_verification_status = ANY (ARRAY['not_required'::text, 'pending'::text, 'in_progress'::text, 'passed'::text, 'failed'::text])))

## Indexes

- `idx_sd_active_session`
  ```sql
  CREATE INDEX idx_sd_active_session ON public.strategic_directives_v2 USING btree (active_session_id) WHERE (active_session_id IS NOT NULL)
  ```
- `idx_sd_archived_at`
  ```sql
  CREATE INDEX idx_sd_archived_at ON public.strategic_directives_v2 USING btree (archived_at)
  ```
- `idx_sd_is_active`
  ```sql
  CREATE INDEX idx_sd_is_active ON public.strategic_directives_v2 USING btree (is_active)
  ```
- `idx_sd_parent`
  ```sql
  CREATE INDEX idx_sd_parent ON public.strategic_directives_v2 USING btree (parent_sd_id)
  ```
- `idx_sd_parent_sd_id`
  ```sql
  CREATE INDEX idx_sd_parent_sd_id ON public.strategic_directives_v2 USING btree (parent_sd_id)
  ```
- `idx_sd_uuid_id`
  ```sql
  CREATE UNIQUE INDEX idx_sd_uuid_id ON public.strategic_directives_v2 USING btree (uuid_id)
  ```
- `idx_sd_v2_complexity`
  ```sql
  CREATE INDEX idx_sd_v2_complexity ON public.strategic_directives_v2 USING btree (complexity_level)
  ```
- `idx_sd_v2_exploration_summary`
  ```sql
  CREATE INDEX idx_sd_v2_exploration_summary ON public.strategic_directives_v2 USING gin (exploration_summary) WHERE (exploration_summary IS NOT NULL)
  ```
- `idx_sd_v2_import_run`
  ```sql
  CREATE INDEX idx_sd_v2_import_run ON public.strategic_directives_v2 USING btree (import_run_id)
  ```
- `idx_sd_v2_intensity_level`
  ```sql
  CREATE INDEX idx_sd_v2_intensity_level ON public.strategic_directives_v2 USING btree (intensity_level) WHERE (intensity_level IS NOT NULL)
  ```
- `idx_sd_v2_latest`
  ```sql
  CREATE INDEX idx_sd_v2_latest ON public.strategic_directives_v2 USING btree (present_in_latest_import)
  ```
- `idx_sd_v2_priority`
  ```sql
  CREATE INDEX idx_sd_v2_priority ON public.strategic_directives_v2 USING btree (must_have_pct DESC, sequence_rank)
  ```
- `idx_sd_v2_seq`
  ```sql
  CREATE INDEX idx_sd_v2_seq ON public.strategic_directives_v2 USING btree (sequence_rank)
  ```
- `idx_sd_v2_triage`
  ```sql
  CREATE INDEX idx_sd_v2_triage ON public.strategic_directives_v2 USING btree (rolled_triage)
  ```
- `idx_sd_version`
  ```sql
  CREATE INDEX idx_sd_version ON public.strategic_directives_v2 USING btree (version)
  ```
- `idx_sd_working_on`
  ```sql
  CREATE INDEX idx_sd_working_on ON public.strategic_directives_v2 USING btree (is_working_on) WHERE (is_working_on = true)
  ```
- `idx_strategic_directives_current_phase`
  ```sql
  CREATE INDEX idx_strategic_directives_current_phase ON public.strategic_directives_v2 USING btree (current_phase)
  ```
- `idx_strategic_directives_progress`
  ```sql
  CREATE INDEX idx_strategic_directives_progress ON public.strategic_directives_v2 USING btree (progress)
  ```
- `idx_strategic_directives_target_app`
  ```sql
  CREATE INDEX idx_strategic_directives_target_app ON public.strategic_directives_v2 USING btree (target_application)
  ```
- `idx_strategic_directives_v2_category`
  ```sql
  CREATE INDEX idx_strategic_directives_v2_category ON public.strategic_directives_v2 USING btree (category)
  ```
- `idx_strategic_directives_v2_created_at`
  ```sql
  CREATE INDEX idx_strategic_directives_v2_created_at ON public.strategic_directives_v2 USING btree (created_at DESC)
  ```
- `idx_strategic_directives_v2_embedding`
  ```sql
  CREATE INDEX idx_strategic_directives_v2_embedding ON public.strategic_directives_v2 USING ivfflat (scope_embedding vector_cosine_ops) WITH (lists='50')
  ```
- `idx_strategic_directives_v2_legacy_id`
  ```sql
  CREATE INDEX idx_strategic_directives_v2_legacy_id ON public.strategic_directives_v2 USING btree (legacy_id) WHERE (legacy_id IS NOT NULL)
  ```
- `idx_strategic_directives_v2_priority`
  ```sql
  CREATE INDEX idx_strategic_directives_v2_priority ON public.strategic_directives_v2 USING btree (priority)
  ```
- `idx_strategic_directives_v2_sd_key`
  ```sql
  CREATE INDEX idx_strategic_directives_v2_sd_key ON public.strategic_directives_v2 USING btree (sd_key)
  ```
- `idx_strategic_directives_v2_sd_type`
  ```sql
  CREATE INDEX idx_strategic_directives_v2_sd_type ON public.strategic_directives_v2 USING btree (sd_type)
  ```
- `idx_strategic_directives_v2_status`
  ```sql
  CREATE INDEX idx_strategic_directives_v2_status ON public.strategic_directives_v2 USING btree (status)
  ```
- `strategic_directives_v2_legacy_id_unique`
  ```sql
  CREATE UNIQUE INDEX strategic_directives_v2_legacy_id_unique ON public.strategic_directives_v2 USING btree (legacy_id)
  ```
- `strategic_directives_v2_pkey`
  ```sql
  CREATE UNIQUE INDEX strategic_directives_v2_pkey ON public.strategic_directives_v2 USING btree (id)
  ```
- `strategic_directives_v2_sd_key_key`
  ```sql
  CREATE UNIQUE INDEX strategic_directives_v2_sd_key_key ON public.strategic_directives_v2 USING btree (sd_key)
  ```
- `strategic_directives_v2_sd_key_unique`
  ```sql
  CREATE UNIQUE INDEX strategic_directives_v2_sd_key_unique ON public.strategic_directives_v2 USING btree (sd_key)
  ```

## RLS Policies

### 1. anon_read_strategic_directives_v2 (SELECT)

- **Roles**: {anon}
- **Using**: `true`

### 2. authenticated_read_strategic_directives_v2 (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 3. service_role_all_strategic_directives_v2 (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

### 4. strategic_directives_v2_service_role_access (ALL)

- **Roles**: {authenticated}
- **Using**: `fn_is_service_role()`
- **With Check**: `fn_is_service_role()`

## Triggers

### audit_strategic_directives

- **Timing**: AFTER INSERT
- **Action**: `EXECUTE FUNCTION governance_audit_trigger()`

### audit_strategic_directives

- **Timing**: AFTER DELETE
- **Action**: `EXECUTE FUNCTION governance_audit_trigger()`

### audit_strategic_directives

- **Timing**: AFTER UPDATE
- **Action**: `EXECUTE FUNCTION governance_audit_trigger()`

### auto_assign_sequence_rank

- **Timing**: BEFORE INSERT
- **Action**: `EXECUTE FUNCTION assign_sequence_rank()`

### auto_calculate_progress_trigger

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION auto_calculate_progress()`

### auto_populate_legacy_id

- **Timing**: BEFORE INSERT
- **Action**: `EXECUTE FUNCTION populate_legacy_id_from_id()`

### check_sd_hierarchy

- **Timing**: BEFORE INSERT
- **Action**: `EXECUTE FUNCTION validate_sd_hierarchy()`

### check_sd_hierarchy

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION validate_sd_hierarchy()`

### enforce_handoff_trigger

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION enforce_handoff_on_phase_transition()`

### enforce_progress_trigger

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION enforce_progress_on_completion()`

### status_auto_transition

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION auto_transition_status()`

### tr_check_intensity_required

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION check_intensity_required()`

### tr_enforce_business_value_gate

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION enforce_business_value_gate()`

### tr_notify_working_sd

- **Timing**: AFTER UPDATE
- **Action**: `EXECUTE FUNCTION notify_working_sd_change()`

### tr_retro_notification

- **Timing**: AFTER UPDATE
- **Action**: `EXECUTE FUNCTION trigger_retro_notification()`

### trg_auto_complete_parent_orchestrator

- **Timing**: AFTER UPDATE
- **Action**: `EXECUTE FUNCTION try_auto_complete_parent_orchestrator()`

### trg_auto_set_is_parent

- **Timing**: AFTER INSERT
- **Action**: `EXECUTE FUNCTION auto_set_is_parent()`

### trg_auto_set_is_parent

- **Timing**: AFTER UPDATE
- **Action**: `EXECUTE FUNCTION auto_set_is_parent()`

### trg_capability_lifecycle

- **Timing**: AFTER UPDATE
- **Action**: `EXECUTE FUNCTION fn_handle_capability_lifecycle()`

### trg_check_contract_requirements

- **Timing**: BEFORE INSERT
- **Action**: `EXECUTE FUNCTION check_contract_requirements()`

### trg_check_contract_requirements

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION check_contract_requirements()`

### trg_doctrine_constraint_sd

- **Timing**: BEFORE INSERT
- **Action**: `EXECUTE FUNCTION enforce_doctrine_of_constraint()`

### trg_doctrine_constraint_sd

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION enforce_doctrine_of_constraint()`

### trg_enforce_child_creation_timing

- **Timing**: BEFORE INSERT
- **Action**: `EXECUTE FUNCTION enforce_child_creation_timing()`

### trg_enforce_metadata_object

- **Timing**: BEFORE INSERT
- **Action**: `EXECUTE FUNCTION enforce_metadata_object()`

### trg_enforce_metadata_object

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION enforce_metadata_object()`

### trg_enforce_orphan_protection

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION enforce_orphan_protection()`

### trg_enforce_parent_orchestrator_type

- **Timing**: AFTER INSERT
- **Action**: `EXECUTE FUNCTION enforce_parent_orchestrator_type()`

### trg_enforce_parent_orchestrator_type

- **Timing**: AFTER UPDATE
- **Action**: `EXECUTE FUNCTION enforce_parent_orchestrator_type()`

### trg_enforce_sd_type_change_explanation

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION enforce_sd_type_change_explanation()`

### trg_enforce_sd_type_change_risk

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION enforce_sd_type_change_risk()`

### trg_enforce_type_change_timing

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION enforce_type_change_timing()`

### trg_inherit_contracts_on_insert

- **Timing**: BEFORE INSERT
- **Action**: `EXECUTE FUNCTION inherit_parent_contracts()`

### trg_inherit_contracts_on_update

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION inherit_parent_contracts()`

### trg_inherit_parent_metadata

- **Timing**: BEFORE INSERT
- **Action**: `EXECUTE FUNCTION inherit_parent_metadata()`

### trg_inherit_parent_metadata_update

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION inherit_parent_metadata()`

### trigger_warn_sd_kr_alignment

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION warn_on_sd_transition_without_kr()`

### update_sd_timestamp

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION update_updated_at()`

### update_strategic_directives_v2_updated_at

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION update_updated_at_column()`

### validate_child_sd_sequence

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION validate_child_sd_sequence()`

## Usage Examples

_Common query patterns for this table:_


```javascript
// Get active SD by SD ID
const { data, error } = await supabase
  .from('strategic_directives_v2')
  .select('*')
  .eq('sd_id', 'SD-XXX-001')
  .single();

// Get all SDs in EXEC phase
const { data, error } = await supabase
  .from('strategic_directives_v2')
  .select('sd_id, title, status, current_phase')
  .eq('current_phase', 'EXEC')
  .order('created_at', { ascending: false });
```
---

[← Back to Schema Overview](../database-schema-overview.md)
