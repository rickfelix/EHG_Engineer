-- Update column descriptions for strategic_directives_v2 table
-- Purpose: Clarify field purposes and unique identifiers for developers

-- Primary Identifiers
COMMENT ON COLUMN public.strategic_directives_v2.id IS
  'PRIMARY UNIQUE IDENTIFIER: Human-readable Strategic Directive ID (e.g., SD-UAT-001, SD-EXPORT-001). This is the main identifier used throughout the application, in handoffs, PRDs, and documentation. Format: SD-{CATEGORY}-{NUMBER}';

COMMENT ON COLUMN public.strategic_directives_v2.uuid_id IS
  'INTERNAL UUID: Auto-generated UUID for internal database relationships and foreign keys. Use this for new FK relationships in other tables. Not displayed to users.';

COMMENT ON COLUMN public.strategic_directives_v2.legacy_id IS
  'LEGACY IDENTIFIER: Old ID format from previous system versions. Deprecated - use id field instead. Kept for historical data migration purposes.';

-- Core Metadata
COMMENT ON COLUMN public.strategic_directives_v2.title IS
  'TITLE: Brief descriptive title of the strategic directive (max 500 chars). Should be concise and summarize the directive''s purpose.';

COMMENT ON COLUMN public.strategic_directives_v2.version IS
  'VERSION: Semantic version number (e.g., 1.0, 1.1, 2.0). Increments when significant changes are made to the SD. Default: 1.0';

COMMENT ON COLUMN public.strategic_directives_v2.status IS
  'STATUS: Current workflow state. Valid values: draft, pending_approval, active, in_progress, completed, archived, deferred. Status "deferred" indicates postponed due to business stage or priority mismatch.';

COMMENT ON COLUMN public.strategic_directives_v2.category IS
  'CATEGORY: Classification of the directive (e.g., infrastructure, feature, enhancement, fix, documentation). Used for filtering and organization.';

COMMENT ON COLUMN public.strategic_directives_v2.priority IS
  'PRIORITY: Business priority level. Valid values: CRITICAL (90+), HIGH (70-89), MEDIUM (50-69), LOW (30-49). Determines execution order and resource allocation.';

-- Content Fields
COMMENT ON COLUMN public.strategic_directives_v2.description IS
  'DESCRIPTION: Detailed description of what needs to be accomplished. This is the main body text explaining the directive''s requirements and context.';

COMMENT ON COLUMN public.strategic_directives_v2.strategic_intent IS
  'STRATEGIC INTENT: High-level business objective and strategic alignment. Explains WHY this directive matters to the organization''s goals.';

COMMENT ON COLUMN public.strategic_directives_v2.rationale IS
  'RATIONALE: Justification for this directive. Explains the business case, user need, or technical necessity driving this work.';

COMMENT ON COLUMN public.strategic_directives_v2.scope IS
  'SCOPE: Boundaries of what is included/excluded in this directive. Defines deliverables and explicitly states what is out of scope.';

-- Structured Data (JSONB arrays)
COMMENT ON COLUMN public.strategic_directives_v2.key_changes IS
  'KEY CHANGES: Array of major changes introduced by this directive. Format: [{ change: "Description", impact: "Impact assessment" }]';

COMMENT ON COLUMN public.strategic_directives_v2.strategic_objectives IS
  'STRATEGIC OBJECTIVES: Array of specific objectives this directive aims to achieve. Format: [{ objective: "Goal", metric: "Success measure" }]';

COMMENT ON COLUMN public.strategic_directives_v2.success_criteria IS
  'SUCCESS CRITERIA: Array of measurable criteria that define successful completion. Format: [{ criterion: "What", measure: "How to measure" }]';

COMMENT ON COLUMN public.strategic_directives_v2.key_principles IS
  'KEY PRINCIPLES: Array of guiding principles for implementation. Format: [{ principle: "Name", description: "Explanation" }]';

COMMENT ON COLUMN public.strategic_directives_v2.implementation_guidelines IS
  'IMPLEMENTATION GUIDELINES: Array of specific guidelines for EXEC phase. Format: [{ guideline: "Instruction", rationale: "Why" }]';

COMMENT ON COLUMN public.strategic_directives_v2.dependencies IS
  'DEPENDENCIES: Array of technical or business dependencies. Format: [{ dependency: "What", type: "technical/business", status: "ready/blocked" }]';

COMMENT ON COLUMN public.strategic_directives_v2.risks IS
  'RISKS: Array of identified risks and mitigation strategies. Format: [{ risk: "Description", severity: "high/medium/low", mitigation: "Strategy" }]';

COMMENT ON COLUMN public.strategic_directives_v2.success_metrics IS
  'SUCCESS METRICS: Array of quantifiable metrics to measure success. Format: [{ metric: "Name", target: "Target value", actual: "Current value" }]';

COMMENT ON COLUMN public.strategic_directives_v2.stakeholders IS
  'STAKEHOLDERS: Array of stakeholders and their roles. Format: [{ name: "Person/Team", role: "Role", contact: "Email/Slack" }]';

-- Governance & Approval
COMMENT ON COLUMN public.strategic_directives_v2.approved_by IS
  'APPROVED BY: Name/ID of person who approved this directive (typically LEAD agent or human reviewer). NULL if not yet approved.';

COMMENT ON COLUMN public.strategic_directives_v2.approval_date IS
  'APPROVAL DATE: Timestamp when directive was approved and moved to active status. NULL if not yet approved.';

COMMENT ON COLUMN public.strategic_directives_v2.effective_date IS
  'EFFECTIVE DATE: Date when this directive becomes active/enforceable. Can be future-dated for planned implementations.';

COMMENT ON COLUMN public.strategic_directives_v2.expiry_date IS
  'EXPIRY DATE: Optional expiration date for time-bound directives. NULL for indefinite directives.';

COMMENT ON COLUMN public.strategic_directives_v2.review_schedule IS
  'REVIEW SCHEDULE: Cadence for reviewing this directive (e.g., "quarterly", "annually", "on completion"). NULL if no review needed.';

-- Audit Trail
COMMENT ON COLUMN public.strategic_directives_v2.created_at IS
  'CREATED AT: Timestamp when this record was first created in the database. Auto-set on INSERT.';

COMMENT ON COLUMN public.strategic_directives_v2.updated_at IS
  'UPDATED AT: Timestamp of last modification. Auto-updated on any UPDATE. Use this to track recent changes.';

COMMENT ON COLUMN public.strategic_directives_v2.created_by IS
  'CREATED BY: User/agent who created this directive (e.g., "LEAD", "human:john@example.com"). NULL if system-generated.';

COMMENT ON COLUMN public.strategic_directives_v2.updated_by IS
  'UPDATED BY: User/agent who last modified this directive. NULL if no updates since creation.';

-- Backlog Metrics (computed from sd_backlog_map)
COMMENT ON COLUMN public.strategic_directives_v2.h_count IS
  'HIGH PRIORITY COUNT: Number of HIGH priority backlog items linked to this SD. Computed from sd_backlog_map.';

COMMENT ON COLUMN public.strategic_directives_v2.m_count IS
  'MEDIUM PRIORITY COUNT: Number of MEDIUM priority backlog items linked to this SD. Computed from sd_backlog_map.';

COMMENT ON COLUMN public.strategic_directives_v2.l_count IS
  'LOW PRIORITY COUNT: Number of LOW priority backlog items linked to this SD. Computed from sd_backlog_map.';

COMMENT ON COLUMN public.strategic_directives_v2.future_count IS
  'FUTURE COUNT: Number of FUTURE backlog items linked to this SD (planned but not immediate). Computed from sd_backlog_map.';

COMMENT ON COLUMN public.strategic_directives_v2.must_have_count IS
  'MUST-HAVE COUNT: Number of MUST-HAVE backlog items (critical requirements). Computed from sd_backlog_map.';

COMMENT ON COLUMN public.strategic_directives_v2.wish_list_count IS
  'WISH-LIST COUNT: Number of WISH-LIST backlog items (nice-to-have features). Computed from sd_backlog_map.';

COMMENT ON COLUMN public.strategic_directives_v2.must_have_pct IS
  'MUST-HAVE PERCENTAGE: Percentage of backlog items marked as MUST-HAVE. Calculation: (must_have_count / total_items) * 100. High percentage indicates critical scope.';

COMMENT ON COLUMN public.strategic_directives_v2.rolled_triage IS
  'ROLLED TRIAGE: Aggregated triage classification from backlog items. Values: "mostly_must_have", "balanced", "mostly_wish_list".';

COMMENT ON COLUMN public.strategic_directives_v2.readiness IS
  'READINESS SCORE: Calculated readiness score (0-100) based on backlog completion, dependencies, and prerequisites. Higher = more ready for implementation.';

COMMENT ON COLUMN public.strategic_directives_v2.must_have_density IS
  'MUST-HAVE DENSITY: Ratio of MUST-HAVE items to total scope. High density indicates high-priority, mission-critical work.';

COMMENT ON COLUMN public.strategic_directives_v2.new_module_pct IS
  'NEW MODULE PERCENTAGE: Percentage of work involving new modules vs. enhancements to existing. High percentage = greenfield work.';

-- Import/Sync Fields
COMMENT ON COLUMN public.strategic_directives_v2.import_run_id IS
  'IMPORT RUN ID: UUID of the import batch that created/updated this record. Used for tracking bulk imports from external systems.';

COMMENT ON COLUMN public.strategic_directives_v2.present_in_latest_import IS
  'PRESENT IN LATEST IMPORT: Boolean flag indicating if this SD was present in the most recent import. FALSE suggests it may be stale or removed upstream.';

-- Execution Metadata
COMMENT ON COLUMN public.strategic_directives_v2.sequence_rank IS
  'SEQUENCE RANK: Execution order within dependency chain. Lower numbers = higher priority and earlier execution. Used by LEO Protocol for scheduling.';

COMMENT ON COLUMN public.strategic_directives_v2.sd_key IS
  'SD KEY: Human-readable key format used by Vision Alignment Pipeline (e.g., SD-2025-09-22-vision-pipeline). Alternative to id field for workflows.';

COMMENT ON COLUMN public.strategic_directives_v2.parent_sd_id IS
  'PARENT SD ID: References parent directive if this is a child/sub-directive. NULL for top-level directives. Foreign key to id field.';

-- Status & Archival
COMMENT ON COLUMN public.strategic_directives_v2.is_active IS
  'IS ACTIVE: Boolean flag indicating if this SD is currently active. FALSE = soft-deleted/archived. Default: TRUE.';

COMMENT ON COLUMN public.strategic_directives_v2.archived_at IS
  'ARCHIVED AT: Timestamp when this directive was archived. NULL if currently active. Set when is_active changes to FALSE.';

COMMENT ON COLUMN public.strategic_directives_v2.archived_by IS
  'ARCHIVED BY: User/agent who archived this directive. NULL if not archived.';

-- Extended Metadata
COMMENT ON COLUMN public.strategic_directives_v2.governance_metadata IS
  'GOVERNANCE METADATA: Flexible JSONB object for governance-related data (compliance, approvals, audit trails). Structure varies by org policy.';

COMMENT ON COLUMN public.strategic_directives_v2.metadata IS
  'METADATA: Flexible JSONB object for additional custom fields not covered by schema. Use sparingly - prefer structured columns.';

-- Application Targeting (SD-ARCH-EHG-007)
COMMENT ON COLUMN public.strategic_directives_v2.target_application IS
  'TARGET APPLICATION: Which application this SD targets. Valid values: "EHG" (unified frontend with user + admin at /admin/*) or "EHG_Engineer" (backend API only). Default: EHG.';

-- Progress Tracking
COMMENT ON COLUMN public.strategic_directives_v2.progress IS
  'PROGRESS (LEGACY): Old progress field (0-100 integer). DEPRECATED - use progress_percentage instead. Kept for backward compatibility.';

COMMENT ON COLUMN public.strategic_directives_v2.progress_percentage IS
  'PROGRESS PERCENTAGE: Current completion percentage (0-100). Calculated from LEO Protocol 5-phase workflow progress. Auto-updated by handoffs.';

COMMENT ON COLUMN public.strategic_directives_v2.completion_date IS
  'COMPLETION DATE: Timestamp when status changed to "completed". NULL if not yet complete. Auto-set by LEAD final approval.';

-- LEO Protocol Workflow
COMMENT ON COLUMN public.strategic_directives_v2.current_phase IS
  'CURRENT PHASE: Current LEO Protocol workflow phase. Valid values: LEAD_APPROVAL, PLAN_PRD, EXEC_IMPLEMENTATION, PLAN_VERIFY, LEAD_FINAL. Default: LEAD_APPROVAL.';

COMMENT ON COLUMN public.strategic_directives_v2.phase_progress IS
  'PHASE PROGRESS: Progress within current phase (0-100). Resets to 0 when moving to next phase. Used for granular progress tracking.';

COMMENT ON COLUMN public.strategic_directives_v2.is_working_on IS
  'IS WORKING ON: Boolean flag indicating if an agent is actively working on this SD. Used to prevent concurrent modifications. Default: FALSE.';

COMMENT ON COLUMN public.strategic_directives_v2.confidence_score IS
  'CONFIDENCE SCORE: Overall quality/confidence score (0-100) from sub-agent verification. Aggregated from TESTING, SECURITY, DATABASE, etc. NULL until verification complete.';

-- BMAD Enhancements
COMMENT ON COLUMN public.strategic_directives_v2.checkpoint_plan IS
  'CHECKPOINT PLAN: BMAD Enhancement - Checkpoint breakdown for large SDs (>8 user stories). Structure: { checkpoints: [{ id: 1, user_stories: ["US-001"], estimated_hours: 3, milestone: "Description" }], total_checkpoints: 3 }. NULL for small SDs.';

-- Table comment
COMMENT ON TABLE public.strategic_directives_v2 IS
  'STRATEGIC DIRECTIVES v2: Main table for storing Strategic Directives in the LEO Protocol workflow. Each row represents a unit of work (feature, fix, enhancement) that flows through the 5-phase LEO workflow (LEAD → PLAN → EXEC → PLAN → LEAD). Use id field as primary identifier in all references.';
