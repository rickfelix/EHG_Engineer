-- Migration: Root Cause Agent (RCA) v1 - Core Infrastructure
-- SD-RCA-001
-- Created: 2025-10-28
-- Purpose: Add Root Cause Agent for forensic failure analysis, CAPA tracking, and learning capture
--
-- Features:
-- - Root cause investigation records (root_cause_reports)
-- - Corrective and Preventive Action (CAPA) manifests (remediation_manifests)
-- - Learning signals for EVA integration (rca_learning_records)
-- - Defect taxonomy classification (defect_taxonomy)
-- - 4-tier trigger system (T1: Critical, T2: High, T3: Medium, T4: Manual)
-- - Multi-factor confidence scoring (40-100 scale)
-- - 2-axis severity matrix (P0-P4 from impact × likelihood)
-- - Gate enforcement (P0/P1 RCRs block handoff until CAPA verified)
-- - 30-day auto-stale guardrail
-- - Deduplication via failure_signature_hash
--
-- Dependencies: strategic_directives_v2, product_requirements_v2, retrospectives, sub_agent_execution_results

BEGIN;

-- ============================================================================
-- CORE RCA TABLES
-- ============================================================================

-- 1. Root Cause Reports (Primary Investigation Records)
CREATE TABLE IF NOT EXISTS root_cause_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Scope & Context
    scope_type TEXT NOT NULL CHECK (scope_type IN ('SD','PRD','BACKLOG','PIPELINE','RUNTIME','SUB_AGENT')),
    scope_id TEXT NOT NULL,
    sd_id VARCHAR(50) REFERENCES strategic_directives_v2(id) ON DELETE CASCADE,
    prd_id VARCHAR(100) REFERENCES product_requirements_v2(id) ON DELETE SET NULL,

    -- Trigger Information
    detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    trigger_source TEXT NOT NULL CHECK (trigger_source IN ('QUALITY_GATE','CI_PIPELINE','RUNTIME','MANUAL','SUB_AGENT','TEST_FAILURE','HANDOFF_REJECTION')),
    trigger_tier INTEGER NOT NULL CHECK (trigger_tier BETWEEN 1 AND 4),

    -- Failure Identification
    failure_signature TEXT NOT NULL,
    failure_signature_hash TEXT GENERATED ALWAYS AS (md5(failure_signature)) STORED,
    problem_statement TEXT NOT NULL,
    repro_steps TEXT,
    repro_success_rate NUMERIC CHECK (repro_success_rate BETWEEN 0 AND 1),

    -- Observed vs Expected
    observed JSONB NOT NULL,
    expected JSONB NOT NULL,

    -- Root Cause Analysis
    root_cause TEXT,
    root_cause_category TEXT CHECK (root_cause_category IN ('CODE_DEFECT','CONFIG_ERROR','INFRASTRUCTURE','PROCESS_GAP','REQUIREMENTS_AMBIGUITY','TEST_COVERAGE_GAP','DEPENDENCY_ISSUE','ENVIRONMENTAL','UNKNOWN')),
    causal_chain JSONB DEFAULT '[]'::jsonb,
    contributing_factors JSONB DEFAULT '[]'::jsonb,

    -- Evidence & Artifacts
    evidence_refs JSONB DEFAULT '{}'::jsonb,
    log_quality INTEGER CHECK (log_quality BETWEEN 0 AND 20),
    evidence_strength INTEGER CHECK (evidence_strength BETWEEN 0 AND 20),
    pattern_match_score INTEGER CHECK (pattern_match_score BETWEEN 0 AND 15),
    historical_success_bonus INTEGER CHECK (historical_success_bonus BETWEEN 0 AND 5),

    -- Confidence & Severity
    confidence INTEGER NOT NULL CHECK (confidence BETWEEN 0 AND 100),
    impact_level TEXT NOT NULL CHECK (impact_level IN ('CRITICAL','HIGH','MEDIUM','LOW')),
    likelihood_level TEXT NOT NULL CHECK (likelihood_level IN ('FREQUENT','OCCASIONAL','RARE','ISOLATED')),
    severity_priority TEXT GENERATED ALWAYS AS (
        CASE
            WHEN impact_level = 'CRITICAL' AND likelihood_level IN ('FREQUENT','OCCASIONAL') THEN 'P0'
            WHEN impact_level = 'CRITICAL' AND likelihood_level = 'RARE' THEN 'P1'
            WHEN impact_level = 'HIGH' AND likelihood_level = 'FREQUENT' THEN 'P0'
            WHEN impact_level = 'HIGH' AND likelihood_level = 'OCCASIONAL' THEN 'P1'
            WHEN impact_level = 'HIGH' AND likelihood_level = 'RARE' THEN 'P2'
            WHEN impact_level = 'MEDIUM' AND likelihood_level = 'FREQUENT' THEN 'P1'
            WHEN impact_level = 'MEDIUM' AND likelihood_level = 'OCCASIONAL' THEN 'P2'
            WHEN impact_level = 'MEDIUM' AND likelihood_level = 'RARE' THEN 'P3'
            ELSE 'P4'
        END
    ) STORED,

    -- Status & Lifecycle
    status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','IN_REVIEW','CAPA_PENDING','CAPA_APPROVED','FIX_IN_PROGRESS','RESOLVED','WONT_FIX','STALE')),
    analysis_attempts INTEGER DEFAULT 1 CHECK (analysis_attempts <= 3),

    -- Pattern Recognition
    related_rcr_ids UUID[],
    pattern_id VARCHAR(100),
    recurrence_count INTEGER DEFAULT 1,
    first_occurrence_at TIMESTAMPTZ DEFAULT NOW(),

    -- Learning Integration
    retrospective_id UUID,
    lessons_captured JSONB DEFAULT '[]'::jsonb,

    -- Audit
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMPTZ,
    created_by TEXT DEFAULT 'RCA',
    metadata JSONB DEFAULT '{}'::jsonb,

    -- Constraints
    CONSTRAINT valid_confidence_for_status CHECK (
        (status = 'OPEN' AND confidence >= 40) OR
        (status IN ('IN_REVIEW','CAPA_PENDING') AND confidence >= 60) OR
        (status IN ('CAPA_APPROVED','FIX_IN_PROGRESS','RESOLVED') AND confidence >= 70) OR
        status IN ('WONT_FIX','STALE')
    )
);

-- 2. Corrective & Preventive Action (CAPA) Manifests
CREATE TABLE IF NOT EXISTS remediation_manifests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rcr_id UUID NOT NULL REFERENCES root_cause_reports(id) ON DELETE CASCADE,

    -- Remediation Plan
    immediate_fix TEXT,
    proposed_changes JSONB NOT NULL,

    -- Impact Assessment
    impact_assessment JSONB NOT NULL,
    risk_score INTEGER CHECK (risk_score BETWEEN 0 AND 100),
    affected_sd_count INTEGER DEFAULT 1,

    -- Verification Plan
    verification_plan JSONB NOT NULL,
    acceptance_criteria JSONB NOT NULL,

    -- Preventive Actions
    preventive_actions JSONB DEFAULT '[]'::jsonb,
    process_improvements JSONB DEFAULT '[]'::jsonb,

    -- Ownership & Status
    owner_agent TEXT NOT NULL CHECK (owner_agent IN ('PLAN','EXEC','LEAD','EVA','SUBAGENT','MANUAL')),
    assigned_to TEXT,
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','UNDER_REVIEW','APPROVED','REJECTED','IN_PROGRESS','IMPLEMENTED','VERIFIED','FAILED_VERIFICATION')),

    -- Lifecycle Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    approved_at TIMESTAMPTZ,
    implemented_at TIMESTAMPTZ,
    verified_at TIMESTAMPTZ,

    -- Audit
    metadata JSONB DEFAULT '{}'::jsonb
);

-- 3. RCA Learning Records (EVA Integration)
CREATE TABLE IF NOT EXISTS rca_learning_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rcr_id UUID NOT NULL REFERENCES root_cause_reports(id) ON DELETE CASCADE,

    -- Normalized Features for ML
    features JSONB NOT NULL,

    -- Classification
    label TEXT,
    defect_class VARCHAR(100),

    -- Learning Metadata
    preventable BOOLEAN DEFAULT true,
    prevention_stage TEXT CHECK (prevention_stage IN ('LEAD_PRE_APPROVAL','PLAN_PRD','EXEC_IMPL','PLAN_VERIFY','NEVER')),
    time_to_detect_hours NUMERIC,
    time_to_resolve_hours NUMERIC,

    -- EVA Integration
    eva_preference_id UUID,
    contributed_to_retrospective BOOLEAN DEFAULT false,

    -- Audit
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb
);

-- 4. Defect Taxonomy
CREATE TABLE IF NOT EXISTS defect_taxonomy (
    id SERIAL PRIMARY KEY,
    category VARCHAR(100) NOT NULL UNIQUE,
    parent_category VARCHAR(100),
    description TEXT,
    prevention_stage TEXT CHECK (prevention_stage IN ('LEAD_PRE_APPROVAL','PLAN_PRD','EXEC_IMPL','PLAN_VERIFY','NEVER')),
    typical_severity TEXT,
    occurrence_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- INDEXES
-- ============================================================================

-- root_cause_reports indexes
CREATE INDEX IF NOT EXISTS idx_rcr_status ON root_cause_reports(status) WHERE status IN ('OPEN','IN_REVIEW','CAPA_PENDING');
CREATE INDEX IF NOT EXISTS idx_rcr_severity ON root_cause_reports(severity_priority, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rcr_sd_id ON root_cause_reports(sd_id) WHERE sd_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_rcr_prd_id ON root_cause_reports(prd_id) WHERE prd_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_rcr_trigger_source ON root_cause_reports(trigger_source, trigger_tier);
CREATE INDEX IF NOT EXISTS idx_rcr_created_at ON root_cause_reports(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rcr_pattern_id ON root_cause_reports(pattern_id) WHERE pattern_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_rcr_dedup ON root_cause_reports(failure_signature_hash) WHERE status IN ('OPEN', 'IN_REVIEW');

-- remediation_manifests indexes
CREATE INDEX IF NOT EXISTS idx_capa_status ON remediation_manifests(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_capa_rcr_id ON remediation_manifests(rcr_id);
CREATE INDEX IF NOT EXISTS idx_capa_owner ON remediation_manifests(owner_agent, status);

-- rca_learning_records indexes
CREATE INDEX IF NOT EXISTS idx_learning_rcr_id ON rca_learning_records(rcr_id);
CREATE INDEX IF NOT EXISTS idx_learning_defect_class ON rca_learning_records(defect_class);
CREATE INDEX IF NOT EXISTS idx_learning_preventable ON rca_learning_records(preventable, prevention_stage);

-- ============================================================================
-- RLS POLICIES
-- ============================================================================

-- root_cause_reports RLS
ALTER TABLE root_cause_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_root_cause_reports"
ON root_cause_reports
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "authenticated_read_root_cause_reports"
ON root_cause_reports
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "authenticated_insert_root_cause_reports"
ON root_cause_reports
FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "authenticated_update_root_cause_reports"
ON root_cause_reports
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

-- remediation_manifests RLS
ALTER TABLE remediation_manifests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_remediation_manifests"
ON remediation_manifests
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "authenticated_read_remediation_manifests"
ON remediation_manifests
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "authenticated_insert_remediation_manifests"
ON remediation_manifests
FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "authenticated_update_remediation_manifests"
ON remediation_manifests
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

-- rca_learning_records RLS
ALTER TABLE rca_learning_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_rca_learning_records"
ON rca_learning_records
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "authenticated_read_rca_learning_records"
ON rca_learning_records
FOR SELECT
TO authenticated
USING (true);

-- defect_taxonomy RLS
ALTER TABLE defect_taxonomy ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_defect_taxonomy"
ON defect_taxonomy
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "authenticated_read_defect_taxonomy"
ON defect_taxonomy
FOR SELECT
TO authenticated
USING (true);

-- ============================================================================
-- TRIGGER FUNCTIONS
-- ============================================================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_rcr_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_rcr_updated_at_trigger
    BEFORE UPDATE ON root_cause_reports
    FOR EACH ROW
    EXECUTE FUNCTION update_rcr_updated_at();

-- Auto-stale RCAs after 30 days (Guardrail)
CREATE OR REPLACE FUNCTION auto_stale_rca()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status IN ('OPEN', 'IN_REVIEW') AND
       NEW.created_at < NOW() - INTERVAL '30 days' AND
       OLD.status IN ('OPEN', 'IN_REVIEW') THEN
        NEW.status := 'STALE';
        NEW.metadata := jsonb_set(
            COALESCE(NEW.metadata, '{}'::jsonb),
            '{stale_reason}',
            '"No progress within 30 days - auto-staled"'
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_auto_stale_rca
    BEFORE UPDATE ON root_cause_reports
    FOR EACH ROW
    WHEN (OLD.updated_at < NEW.updated_at)
    EXECUTE FUNCTION auto_stale_rca();

-- Auto-update RCR status when CAPA verified
CREATE OR REPLACE FUNCTION update_rcr_on_capa_verified()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'VERIFIED' AND OLD.status != 'VERIFIED' THEN
        UPDATE root_cause_reports
        SET status = 'RESOLVED',
            resolved_at = NOW(),
            updated_at = NOW()
        WHERE id = NEW.rcr_id AND status != 'RESOLVED';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_rcr_on_capa_verified
    AFTER UPDATE ON remediation_manifests
    FOR EACH ROW
    WHEN (NEW.status = 'VERIFIED')
    EXECUTE FUNCTION update_rcr_on_capa_verified();

-- ============================================================================
-- VIEWS
-- ============================================================================

-- v_rca_analytics: 30-day analytics
CREATE OR REPLACE VIEW v_rca_analytics AS
SELECT
    rcr.root_cause_category,
    rcr.impact_level,
    rcr.likelihood_level,
    rcr.severity_priority,
    COUNT(*) as occurrence_count,
    AVG(rcr.confidence) as avg_confidence,
    AVG(EXTRACT(EPOCH FROM (rcr.resolved_at - rcr.created_at))/3600) as avg_resolution_hours,
    COUNT(*) FILTER (WHERE rcr.status = 'RESOLVED') as resolved_count,
    COUNT(*) FILTER (WHERE rcr.status IN ('OPEN','IN_REVIEW')) as open_count,
    MAX(rcr.created_at) as last_occurrence,
    ARRAY_AGG(DISTINCT rcr.sd_id) FILTER (WHERE rcr.sd_id IS NOT NULL) as affected_sds
FROM root_cause_reports rcr
WHERE rcr.created_at >= NOW() - INTERVAL '30 days'
GROUP BY rcr.root_cause_category, rcr.impact_level, rcr.likelihood_level, rcr.severity_priority
ORDER BY occurrence_count DESC, severity_priority ASC;

-- v_rca_pattern_recurrence: Recurring patterns (2+ occurrences)
CREATE OR REPLACE VIEW v_rca_pattern_recurrence AS
SELECT
    rcr.pattern_id,
    rcr.root_cause_category,
    COUNT(*) as recurrence_count,
    MIN(rcr.first_occurrence_at) as first_seen,
    MAX(rcr.created_at) as last_seen,
    ARRAY_AGG(rcr.id ORDER BY rcr.created_at DESC) as rcr_ids,
    BOOL_OR(rcr.status = 'RESOLVED') as has_resolution,
    AVG(rcr.confidence) as avg_confidence
FROM root_cause_reports rcr
WHERE rcr.pattern_id IS NOT NULL
GROUP BY rcr.pattern_id, rcr.root_cause_category
HAVING COUNT(*) >= 2
ORDER BY recurrence_count DESC, last_seen DESC;

-- v_rca_comprehensive_analytics: With taxonomy join (90-day window)
CREATE OR REPLACE VIEW v_rca_comprehensive_analytics AS
SELECT
    dt.category as defect_class,
    dt.parent_category as root_cause_category,
    dt.prevention_stage,
    COUNT(lr.id) as occurrence_count,
    AVG(lr.time_to_detect_hours) as avg_detect_hours,
    AVG(lr.time_to_resolve_hours) as avg_resolve_hours,
    SUM(CASE WHEN lr.preventable THEN 1 ELSE 0 END) as preventable_count,
    SUM(CASE WHEN lr.preventable THEN 0 ELSE 1 END) as unpreventable_count,
    ARRAY_AGG(DISTINCT rcr.sd_id) FILTER (WHERE rcr.sd_id IS NOT NULL) as affected_sds,
    MAX(rcr.created_at) as last_occurrence,
    MIN(rcr.created_at) as first_occurrence
FROM defect_taxonomy dt
LEFT JOIN rca_learning_records lr ON lr.defect_class = dt.category
LEFT JOIN root_cause_reports rcr ON rcr.id = lr.rcr_id
WHERE rcr.created_at >= NOW() - INTERVAL '90 days' OR rcr.created_at IS NULL
GROUP BY dt.category, dt.parent_category, dt.prevention_stage
ORDER BY occurrence_count DESC NULLS LAST;

-- ============================================================================
-- COMMENTS (Documentation)
-- ============================================================================

COMMENT ON TABLE root_cause_reports IS 'Root cause investigation records for failures, defects, and quality issues across LEO Protocol';
COMMENT ON TABLE remediation_manifests IS 'Corrective and Preventive Action (CAPA) plans linked to root cause reports';
COMMENT ON TABLE rca_learning_records IS 'Normalized learning signals for EVA integration and pattern recognition';
COMMENT ON TABLE defect_taxonomy IS 'Classification taxonomy for defect categorization and prevention stage mapping';
COMMENT ON VIEW v_rca_analytics IS 'Analytics view for RCA patterns over last 30 days';
COMMENT ON VIEW v_rca_pattern_recurrence IS 'Tracks recurring patterns with 2+ occurrences';
COMMENT ON VIEW v_rca_comprehensive_analytics IS 'Comprehensive analytics with taxonomy join (90-day window)';

COMMENT ON COLUMN root_cause_reports.failure_signature IS 'Unique identifier for deduplication (e.g., test_name + error_type + file_path)';
COMMENT ON COLUMN root_cause_reports.confidence IS 'Confidence score (0-100): BASE(40) + log_quality(20) + evidence_strength(20) + pattern_match(15) + historical_success(5)';
COMMENT ON COLUMN root_cause_reports.severity_priority IS 'Generated priority (P0-P4) from impact × likelihood matrix';
COMMENT ON COLUMN root_cause_reports.analysis_attempts IS 'Guardrail: Limited to 3 attempts before manual escalation required';

-- ============================================================================
-- SEED DATA
-- ============================================================================

-- Seed defect_taxonomy
INSERT INTO defect_taxonomy (category, parent_category, description, prevention_stage, typical_severity) VALUES
('test_coverage_gap_regression', 'TEST_COVERAGE_GAP', 'Previously passing test now fails', 'EXEC_IMPL', 'HIGH'),
('test_coverage_gap_initial', 'TEST_COVERAGE_GAP', 'Functionality never had test coverage', 'PLAN_PRD', 'MEDIUM'),
('code_defect_runtime', 'CODE_DEFECT', 'Runtime error with stack trace', 'EXEC_IMPL', 'HIGH'),
('code_defect_logic', 'CODE_DEFECT', 'Logic error without runtime exception', 'PLAN_VERIFY', 'MEDIUM'),
('config_error_ci', 'CONFIG_ERROR', 'CI/CD pipeline configuration issue', 'PLAN_PRD', 'HIGH'),
('config_error_env', 'CONFIG_ERROR', 'Environment configuration issue', 'PLAN_VERIFY', 'MEDIUM'),
('config_error_application', 'CONFIG_ERROR', 'Application configuration issue', 'EXEC_IMPL', 'MEDIUM'),
('requirements_ambiguity', 'REQUIREMENTS_AMBIGUITY', 'Unclear or conflicting requirements', 'LEAD_PRE_APPROVAL', 'HIGH'),
('process_gap', 'PROCESS_GAP', 'Missing or inadequate process step', 'PLAN_PRD', 'MEDIUM')
ON CONFLICT (category) DO UPDATE SET
    parent_category = EXCLUDED.parent_category,
    description = EXCLUDED.description,
    prevention_stage = EXCLUDED.prevention_stage,
    typical_severity = EXCLUDED.typical_severity;

-- Register RCA Sub-Agent
INSERT INTO leo_sub_agents (id, name, code, description, capabilities, activation_type, priority, script_path, active)
VALUES (
    '6fd0174b-1ad0-470c-b06c-2778a7e9f15c'::uuid,
    'Root Cause Analysis Agent',
    'RCA',
    'Forensic intelligence agent for defect triage, root cause determination, and CAPA generation. Investigates failures across tests, gates, sub-agents, and CI/CD. CORRECTIVE ONLY - does not implement fixes.',
    '["failure_analysis", "pattern_recognition", "defect_triage", "forensic_investigation", "capa_generation", "preventive_recommendations", "retrospective_contribution"]'::jsonb,
    'automatic',
    95,
    'scripts/root-cause-agent.js',
    true
)
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    code = EXCLUDED.code,
    description = EXCLUDED.description,
    capabilities = EXCLUDED.capabilities,
    activation_type = EXCLUDED.activation_type,
    priority = EXCLUDED.priority,
    script_path = EXCLUDED.script_path,
    active = EXCLUDED.active;

-- RCA Triggers (4-tier system: T1=Critical, T2=High, T3=Medium, T4=Manual)
-- Delete existing triggers first to avoid duplicates
DELETE FROM leo_sub_agent_triggers WHERE sub_agent_id = '6fd0174b-1ad0-470c-b06c-2778a7e9f15c'::uuid;

INSERT INTO leo_sub_agent_triggers (sub_agent_id, trigger_phrase, trigger_type, trigger_context, priority, metadata)
VALUES
    -- T1: Critical (Priority 100)
    ('6fd0174b-1ad0-470c-b06c-2778a7e9f15c'::uuid, 'sub_agent_blocked', 'pattern', 'sub_agent_results', 100, '{"tier": 1, "severity": "P0", "auto_invoke": true}'::jsonb),
    ('6fd0174b-1ad0-470c-b06c-2778a7e9f15c'::uuid, 'ci_pipeline_failure', 'pattern', 'ci_cd', 100, '{"tier": 1, "severity": "P0", "consecutive_threshold": 2}'::jsonb),
    ('6fd0174b-1ad0-470c-b06c-2778a7e9f15c'::uuid, 'quality_gate_critical', 'pattern', 'gate_reviews', 100, '{"tier": 1, "threshold": 70, "operator": "lt"}'::jsonb),

    -- T2: High (Priority 90)
    ('6fd0174b-1ad0-470c-b06c-2778a7e9f15c'::uuid, 'test_regression', 'pattern', 'test_results', 90, '{"tier": 2, "severity": "P1", "failure_threshold": 3}'::jsonb),
    ('6fd0174b-1ad0-470c-b06c-2778a7e9f15c'::uuid, 'handoff_rejection', 'pattern', 'handoffs', 90, '{"tier": 2, "severity": "P1", "rejection_count": 2}'::jsonb),
    ('6fd0174b-1ad0-470c-b06c-2778a7e9f15c'::uuid, 'sub_agent_fail', 'pattern', 'sub_agent_results', 85, '{"tier": 2, "severity": "P1", "confidence_threshold": 80}'::jsonb),

    -- T3: Medium (Priority 75)
    ('6fd0174b-1ad0-470c-b06c-2778a7e9f15c'::uuid, 'quality_degradation', 'pattern', 'retrospectives', 75, '{"tier": 3, "severity": "P2", "score_drop": 15}'::jsonb),
    ('6fd0174b-1ad0-470c-b06c-2778a7e9f15c'::uuid, 'pattern_recurrence', 'pattern', 'issue_patterns', 70, '{"tier": 3, "severity": "P2", "recurrence_threshold": 3}'::jsonb),
    ('6fd0174b-1ad0-470c-b06c-2778a7e9f15c'::uuid, 'performance_regression', 'pattern', 'sub_agent_results', 70, '{"tier": 3, "severity": "P2", "increase_pct": 50}'::jsonb),

    -- T4: Manual (Priority 60)
    ('6fd0174b-1ad0-470c-b06c-2778a7e9f15c'::uuid, 'diagnose defect', 'keyword', 'any', 60, '{"tier": 4, "severity": "P3", "manual": true}'::jsonb),
    ('6fd0174b-1ad0-470c-b06c-2778a7e9f15c'::uuid, 'rca', 'keyword', 'any', 60, '{"tier": 4, "severity": "P3", "manual": true}'::jsonb),
    ('6fd0174b-1ad0-470c-b06c-2778a7e9f15c'::uuid, 'root cause', 'keyword', 'any', 60, '{"tier": 4, "severity": "P4", "manual": true}'::jsonb);

-- Update handoff template for EXEC-to-PLAN-VERIFICATION with RCA fields
-- Update or insert EXEC-to-PLAN handoff template with RCA integration
DO $$
BEGIN
    -- Try to update existing template first
    UPDATE leo_handoff_templates
    SET template_structure = '{
            "executive_summary": "string",
            "deliverables_manifest": "string",
            "key_decisions": "string",
            "known_issues": "string",
            "resource_utilization": "string",
            "action_items": "string",
            "completeness_report": "string",
            "rca_integration": {
                "open_rcr_count": "integer",
                "blocking_rcr_ids": "uuid[]",
                "capa_verification_status": "string (ALL_VERIFIED|PENDING|BLOCKED)",
                "rcr_details": [
                    {
                        "rcr_id": "uuid",
                        "capa_id": "uuid",
                        "severity": "string",
                        "status": "string",
                        "verification_plan": "string",
                        "exit_criteria": "string"
                    }
                ]
            }
        }'::jsonb,
        required_elements = '["executive_summary", "deliverables_manifest", "key_decisions", "known_issues", "resource_utilization", "action_items", "completeness_report", "rca_integration"]'::jsonb,
        validation_rules = '{
            "rca_integration": {
                "rule": "If open_rcr_count > 0, capa_verification_status must be ALL_VERIFIED to proceed",
                "blocking_condition": "capa_verification_status != ALL_VERIFIED AND any rcr severity IN (P0, P1)"
            }
        }'::jsonb,
        version = 2
    WHERE from_agent = 'EXEC'
      AND to_agent = 'PLAN'
      AND handoff_type = 'EXEC-to-PLAN-VERIFICATION';

    -- If no rows were updated, insert new one
    IF NOT FOUND THEN
        INSERT INTO leo_handoff_templates (from_agent, to_agent, handoff_type, template_structure, required_elements, validation_rules, active, version)
        VALUES (
            'EXEC',
            'PLAN',
            'EXEC-to-PLAN-VERIFICATION',
            '{
                "executive_summary": "string",
                "deliverables_manifest": "string",
                "key_decisions": "string",
                "known_issues": "string",
                "resource_utilization": "string",
                "action_items": "string",
                "completeness_report": "string",
                "rca_integration": {
                    "open_rcr_count": "integer",
                    "blocking_rcr_ids": "uuid[]",
                    "capa_verification_status": "string (ALL_VERIFIED|PENDING|BLOCKED)",
                    "rcr_details": [
                        {
                            "rcr_id": "uuid",
                            "capa_id": "uuid",
                            "severity": "string",
                            "status": "string",
                            "verification_plan": "string",
                            "exit_criteria": "string"
                        }
                    ]
                }
            }'::jsonb,
            '["executive_summary", "deliverables_manifest", "key_decisions", "known_issues", "resource_utilization", "action_items", "completeness_report", "rca_integration"]'::jsonb,
            '{
                "rca_integration": {
                    "rule": "If open_rcr_count > 0, capa_verification_status must be ALL_VERIFIED to proceed",
                    "blocking_condition": "capa_verification_status != ALL_VERIFIED AND any rcr severity IN (P0, P1)"
                }
            }'::jsonb,
            true,
            2
        );
    END IF;
END $$;

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

DO $$
DECLARE
    rca_agent_count INTEGER;
    rca_trigger_count INTEGER;
    rca_table_count INTEGER;
    taxonomy_count INTEGER;
BEGIN
    -- Verify RCA sub-agent registered
    SELECT COUNT(*) INTO rca_agent_count FROM leo_sub_agents WHERE code = 'RCA';

    -- Verify RCA triggers registered
    SELECT COUNT(*) INTO rca_trigger_count FROM leo_sub_agent_triggers WHERE sub_agent_id = '6fd0174b-1ad0-470c-b06c-2778a7e9f15c'::uuid;

    -- Verify RCA tables created
    SELECT COUNT(*) INTO rca_table_count
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN ('root_cause_reports', 'remediation_manifests', 'rca_learning_records', 'defect_taxonomy');

    -- Verify taxonomy seeded
    SELECT COUNT(*) INTO taxonomy_count FROM defect_taxonomy;

    -- Assertions
    IF rca_agent_count = 0 THEN
        RAISE EXCEPTION 'RCA sub-agent was not inserted correctly';
    END IF;

    IF rca_trigger_count < 12 THEN
        RAISE WARNING 'RCA sub-agent has fewer triggers than expected (expected 12, got %)', rca_trigger_count;
    END IF;

    IF rca_table_count < 4 THEN
        RAISE EXCEPTION 'Not all RCA tables were created (expected 4, got %)', rca_table_count;
    END IF;

    IF taxonomy_count < 9 THEN
        RAISE WARNING 'Defect taxonomy has fewer categories than expected (expected 9, got %)', taxonomy_count;
    END IF;

    RAISE NOTICE '✅ RCA Migration completed successfully';
    RAISE NOTICE '  - RCA agent registered: %', rca_agent_count;
    RAISE NOTICE '  - RCA triggers configured: %', rca_trigger_count;
    RAISE NOTICE '  - RCA tables created: %', rca_table_count;
    RAISE NOTICE '  - Taxonomy categories: %', taxonomy_count;
END $$;

COMMIT;

-- ============================================================================
-- ROLLBACK INSTRUCTIONS (if needed)
-- ============================================================================

/*
BEGIN;

-- Drop triggers
DROP TRIGGER IF EXISTS trigger_auto_stale_rca ON root_cause_reports;
DROP TRIGGER IF EXISTS trigger_update_rcr_on_capa_verified ON remediation_manifests;
DROP TRIGGER IF EXISTS update_rcr_updated_at_trigger ON root_cause_reports;

-- Drop functions
DROP FUNCTION IF EXISTS auto_stale_rca();
DROP FUNCTION IF EXISTS update_rcr_on_capa_verified();
DROP FUNCTION IF EXISTS update_rcr_updated_at();

-- Drop views
DROP VIEW IF EXISTS v_rca_comprehensive_analytics;
DROP VIEW IF EXISTS v_rca_pattern_recurrence;
DROP VIEW IF EXISTS v_rca_analytics;

-- Drop tables (cascade will handle foreign keys)
DROP TABLE IF EXISTS rca_learning_records CASCADE;
DROP TABLE IF EXISTS remediation_manifests CASCADE;
DROP TABLE IF EXISTS root_cause_reports CASCADE;
DROP TABLE IF EXISTS defect_taxonomy CASCADE;

-- Remove RCA sub-agent triggers
DELETE FROM leo_sub_agent_triggers WHERE sub_agent_id = '6fd0174b-1ad0-470c-b06c-2778a7e9f15c'::uuid;

-- Remove RCA sub-agent
DELETE FROM leo_sub_agents WHERE code = 'RCA';

-- Remove handoff template updates
DELETE FROM leo_handoff_templates
WHERE handoff_type = 'EXEC-to-PLAN-VERIFICATION' AND version = 2;

COMMIT;
*/

-- ============================================================================
-- POST-MIGRATION MANUAL STEPS
-- ============================================================================

-- REQUIRED:
--
-- 1. Create runtime monitoring module:
--    - lib/rca-runtime-triggers.js
--
-- 2. Create CLI script:
--    - scripts/root-cause-agent.js
--
-- 3. Create learning ingestion script:
--    - scripts/rca-learning-ingestion.js
--
-- 4. Update unified-handoff-system.js:
--    - Add validateRCAGateForHandoff() function
--    - Integrate into EXEC→PLAN verification
--
-- 5. Create CI/CD workflow:
--    - .github/workflows/rca-auto-trigger.yml
--
-- 6. Update Playwright workflow:
--    - .github/workflows/playwright-e2e.yml (add artifact upload)
--
-- 7. Create operator documentation:
--    - docs/reference/root-cause-agent.md
--
-- 8. Update package.json scripts:
--    - rca:ingest-learnings
--    - rca:status
--    - rca:gate-check
--
-- VERIFICATION:
--
-- node scripts/root-cause-agent.js status --sd-id <SD-ID>
-- node scripts/rca-learning-ingestion.js --batch
-- SELECT * FROM leo_sub_agents WHERE code = 'RCA';
-- SELECT COUNT(*) FROM leo_sub_agent_triggers WHERE sub_agent_id = '6fd0174b-1ad0-470c-b06c-2778a7e9f15c'::uuid;
