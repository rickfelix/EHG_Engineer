-- =====================================================
-- Add Column Descriptions to product_requirements_v2
-- Purpose: Document field intent for future developers
-- =====================================================

-- Primary Keys & Identifiers
COMMENT ON COLUMN product_requirements_v2.id IS 'Human-readable primary key in format PRD-SD-XXX. Links PRD to its Strategic Directive.';
COMMENT ON COLUMN product_requirements_v2.sd_uuid IS 'Foreign key to strategic_directives_v2.uuid_id. Use this for all queries requiring UUID joins.';
COMMENT ON COLUMN product_requirements_v2.sd_id IS 'Strategic directive ID - unified column for pipeline compatibility. Mirrors directive_id for legacy support.';
COMMENT ON COLUMN product_requirements_v2.directive_id IS 'DEPRECATED: Use sd_uuid instead. Kept for backward compatibility during migration.';

-- Core Metadata
COMMENT ON COLUMN product_requirements_v2.title IS 'PRD title - typically matches Strategic Directive title. Displayed in dashboards and reports.';
COMMENT ON COLUMN product_requirements_v2.version IS 'Semantic version (e.g., "1.0", "2.1"). Incremented when PRD is significantly revised.';
COMMENT ON COLUMN product_requirements_v2.status IS 'PRD lifecycle status: draft, approved, in_progress, completed, archived.';
COMMENT ON COLUMN product_requirements_v2.category IS 'Feature category (e.g., authentication, reporting, dashboard). Used for grouping and filtering.';
COMMENT ON COLUMN product_requirements_v2.priority IS 'Priority level: CRITICAL (90+), HIGH (70-89), MEDIUM (50-69), LOW (30-49). Inherited from Strategic Directive.';

-- Executive & Context Sections
COMMENT ON COLUMN product_requirements_v2.executive_summary IS 'High-level summary (2-3 paragraphs) for stakeholders. Answers: What, Why, Impact.';
COMMENT ON COLUMN product_requirements_v2.business_context IS 'Business justification and value proposition. Explains why this feature matters to users/business.';
COMMENT ON COLUMN product_requirements_v2.technical_context IS 'Technical landscape and constraints. Existing systems, architecture patterns, integration points.';

-- Requirements (JSONB arrays/objects)
COMMENT ON COLUMN product_requirements_v2.functional_requirements IS 'JSONB array: Functional requirements describing WHAT the system must do. Format: [{ id, requirement, priority, acceptance_criteria }]';
COMMENT ON COLUMN product_requirements_v2.non_functional_requirements IS 'JSONB array: Non-functional requirements (performance, security, scalability). Format: [{ type, requirement, target_metric }]';
COMMENT ON COLUMN product_requirements_v2.technical_requirements IS 'JSONB array: Technical specifications and constraints. Technologies, libraries, patterns to use/avoid.';

-- Architecture & Design
COMMENT ON COLUMN product_requirements_v2.system_architecture IS 'Text description of system architecture. Component diagrams, data flows, integration patterns.';
COMMENT ON COLUMN product_requirements_v2.data_model IS 'JSONB object: Database schema design. Tables, columns, relationships, indexes, constraints.';
COMMENT ON COLUMN product_requirements_v2.api_specifications IS 'JSONB object: API contracts. Endpoints, request/response formats, authentication, error handling.';
COMMENT ON COLUMN product_requirements_v2.ui_ux_requirements IS 'JSONB object: UI/UX specifications. Component designs, user flows, accessibility requirements, responsive behavior.';

-- Implementation Guidance
COMMENT ON COLUMN product_requirements_v2.implementation_approach IS 'Text: Step-by-step implementation strategy. Phasing, checkpoints, migration approach.';
COMMENT ON COLUMN product_requirements_v2.technology_stack IS 'JSONB object: Technologies to be used. Languages, frameworks, libraries, tools. Format: { frontend: [], backend: [], infrastructure: [] }';
COMMENT ON COLUMN product_requirements_v2.dependencies IS 'JSONB array: External dependencies and blockers. Third-party services, infrastructure, other SDs. Format: [{ type, name, status, blocker }]';

-- Testing & Acceptance
COMMENT ON COLUMN product_requirements_v2.test_scenarios IS 'JSONB array: Test scenarios covering all user stories. Format: [{ id, scenario, expected_result, test_type }]';
COMMENT ON COLUMN product_requirements_v2.acceptance_criteria IS 'JSONB array: Criteria for marking PRD complete. Measurable, verifiable conditions. Format: [{ id, criterion, verification_method }]';
COMMENT ON COLUMN product_requirements_v2.performance_requirements IS 'JSONB object: Performance targets. Load times, throughput, concurrency, resource limits. Format: { metric: target }';

-- Workflow Checklists
COMMENT ON COLUMN product_requirements_v2.plan_checklist IS 'JSONB array: PLAN phase checklist items. Pre-implementation verification steps.';
COMMENT ON COLUMN product_requirements_v2.exec_checklist IS 'JSONB array: EXEC phase checklist items. Implementation and testing requirements.';
COMMENT ON COLUMN product_requirements_v2.validation_checklist IS 'JSONB array: PLAN verification checklist. Post-implementation validation steps.';

-- Progress Tracking
COMMENT ON COLUMN product_requirements_v2.progress IS 'Overall completion percentage (0-100). Calculated from phase_progress.';
COMMENT ON COLUMN product_requirements_v2.phase IS 'Current LEO phase: LEAD_PRE_APPROVAL, PLAN_PRD, EXEC_IMPL, PLAN_VERIFY, LEAD_FINAL.';
COMMENT ON COLUMN product_requirements_v2.phase_progress IS 'JSONB object: Progress breakdown by phase. Format: { LEAD: 100, PLAN: 100, EXEC: 50, ... }';

-- Risk Management
COMMENT ON COLUMN product_requirements_v2.risks IS 'JSONB array: Identified risks and mitigation strategies. Format: [{ risk, impact, probability, mitigation }]';
COMMENT ON COLUMN product_requirements_v2.constraints IS 'JSONB array: Project constraints (time, budget, resources, technical). Format: [{ type, constraint, impact }]';
COMMENT ON COLUMN product_requirements_v2.assumptions IS 'JSONB array: Assumptions made during planning. Format: [{ assumption, validation_method }]';

-- Stakeholder Management
COMMENT ON COLUMN product_requirements_v2.stakeholders IS 'JSONB array: Key stakeholders and their roles. Format: [{ name, role, involvement_level }]';
COMMENT ON COLUMN product_requirements_v2.approved_by IS 'User ID or name of person who approved this PRD. Set during LEAD final approval.';
COMMENT ON COLUMN product_requirements_v2.approval_date IS 'Timestamp when PRD was approved. Marks transition from draft to approved status.';

-- Timeline
COMMENT ON COLUMN product_requirements_v2.planned_start IS 'Planned start date for EXEC implementation phase. Estimated during PLAN phase.';
COMMENT ON COLUMN product_requirements_v2.planned_end IS 'Planned completion date for entire SD. Used for roadmap planning.';
COMMENT ON COLUMN product_requirements_v2.actual_start IS 'Actual start timestamp when EXEC phase began. Auto-set when status changes to in_progress.';
COMMENT ON COLUMN product_requirements_v2.actual_end IS 'Actual completion timestamp when LEAD marked SD complete. Auto-set when status changes to completed.';

-- Audit Trail
COMMENT ON COLUMN product_requirements_v2.created_at IS 'Timestamp when PRD was created. Auto-set to NOW() on insert.';
COMMENT ON COLUMN product_requirements_v2.updated_at IS 'Timestamp of last modification. Auto-updated via trigger on any column change.';
COMMENT ON COLUMN product_requirements_v2.created_by IS 'User ID or agent code that created this PRD. Typically "PLAN" agent or human user ID.';
COMMENT ON COLUMN product_requirements_v2.updated_by IS 'User ID or agent code that last modified this PRD. Updated with each change.';

-- Extended Content
COMMENT ON COLUMN product_requirements_v2.metadata IS 'JSONB object: Flexible metadata storage. Custom fields, integrations, temporary data. Format: { key: value }';
COMMENT ON COLUMN product_requirements_v2.content IS 'Full markdown content of PRD. Can be used for markdown-based PRD generation or legacy compatibility.';
COMMENT ON COLUMN product_requirements_v2.evidence_appendix IS 'Supporting evidence and artifacts. Screenshots, logs, research findings. Appended to PRD for reference.';

-- Backlog Integration
COMMENT ON COLUMN product_requirements_v2.backlog_items IS 'JSONB array: Linked backlog items from sd_backlog_map. Cached for quick access. Format: [{ id, title, status }]';

-- AI-Enhanced Planning (BMAD/Reasoning)
COMMENT ON COLUMN product_requirements_v2.planning_section IS 'Structured planning information including implementation steps, risks, resources, and timeline. Generated by PRD Expert sub-agent.';
COMMENT ON COLUMN product_requirements_v2.reasoning_analysis IS 'Full chain-of-thought reasoning results from automatic analysis. Captures AI decision-making process.';
COMMENT ON COLUMN product_requirements_v2.complexity_analysis IS 'Complexity scoring and trigger analysis results. Used by sub-agents to assess SD difficulty.';
COMMENT ON COLUMN product_requirements_v2.reasoning_depth IS 'Depth of reasoning used (quick, standard, deep, ultra). Determines analysis thoroughness.';
COMMENT ON COLUMN product_requirements_v2.confidence_score IS 'Confidence score (0-100) from reasoning analysis. Higher = more certain about planning accuracy.';

-- Table-level comment
COMMENT ON TABLE product_requirements_v2 IS 'Product Requirements Documents (PRDs) for Strategic Directives. Created by PLAN agent during PLAN_PRD phase. Contains comprehensive implementation specifications: requirements, architecture, testing, risks, and acceptance criteria. One PRD per SD (1:1 relationship via sd_uuid foreign key).';

-- Verification
DO $$
DECLARE
  comment_count INTEGER;
BEGIN
  -- Count columns with descriptions
  SELECT COUNT(*) INTO comment_count
  FROM pg_description d
  JOIN pg_class c ON d.objoid = c.oid
  JOIN pg_namespace n ON c.relnamespace = n.oid
  WHERE n.nspname = 'public'
    AND c.relname = 'product_requirements_v2';

  IF comment_count >= 50 THEN
    RAISE NOTICE '✅ Column descriptions added successfully (% columns documented)', comment_count;
  ELSE
    RAISE WARNING '⚠️ Expected >= 50 descriptions, found %', comment_count;
  END IF;
END $$;

-- =====================================================
-- MIGRATION COMPLETE
-- =====================================================
-- All columns in product_requirements_v2 now have:
-- 1. Clear purpose descriptions
-- 2. Data format documentation (for JSONB fields)
-- 3. Usage guidance
-- 4. Lifecycle information (when set, by whom)
-- =====================================================
