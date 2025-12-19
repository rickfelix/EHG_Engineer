-- ============================================================================
-- Migration: SD Baseline Issues Table
-- Date: 2025-12-19
-- Purpose: Track pre-existing codebase issues to prevent blocking unrelated SDs
-- SD: SD-HARDENING-V2-001B (originated), LEO Protocol Enhancement
-- ============================================================================

-- ============================================================================
-- Table: sd_baseline_issues
-- Tracks pre-existing issues across all sub-agent categories
-- ============================================================================

CREATE TABLE IF NOT EXISTS sd_baseline_issues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identification
  issue_key VARCHAR(30) UNIQUE NOT NULL,  -- BL-SEC-001, BL-PERF-002, etc.
  hash_signature TEXT UNIQUE,              -- Deduplication hash of file_path + line_number + description

  -- Classification
  category VARCHAR(50) NOT NULL CHECK (category IN (
    'security',        -- SECURITY sub-agent
    'testing',         -- TESTING sub-agent
    'performance',     -- PERFORMANCE sub-agent
    'database',        -- DATABASE sub-agent
    'documentation',   -- DOCMON sub-agent
    'accessibility',   -- DESIGN sub-agent
    'code_quality',    -- General linting/quality
    'dependency',      -- NPM/package issues
    'infrastructure'   -- CI/CD, build issues
  )),
  sub_agent_code VARCHAR(20) NOT NULL,     -- SECURITY, TESTING, PERFORMANCE, etc.
  severity VARCHAR(20) NOT NULL CHECK (severity IN ('critical', 'high', 'medium', 'low')),

  -- Location
  file_path TEXT,
  line_number INTEGER,
  description TEXT NOT NULL,
  evidence_snapshot JSONB DEFAULT '{}'::jsonb,  -- Diagnostic details when discovered

  -- Discovery & Tracking
  discovered_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  discovered_by_sd_id TEXT REFERENCES strategic_directives_v2(id) ON DELETE SET NULL,
  last_seen_at TIMESTAMPTZ DEFAULT NOW(),
  last_seen_sd_id TEXT REFERENCES strategic_directives_v2(id) ON DELETE SET NULL,
  occurrence_count INTEGER DEFAULT 1,
  affected_sd_ids TEXT[] DEFAULT '{}',  -- All SDs that have been blocked by this

  -- Ownership & Remediation
  owner_sd_id TEXT REFERENCES strategic_directives_v2(id) ON DELETE SET NULL,
  remediation_sd_id TEXT REFERENCES strategic_directives_v2(id) ON DELETE SET NULL,
  remediation_priority VARCHAR(20) CHECK (remediation_priority IN ('critical', 'high', 'medium', 'low', 'none')),
  due_date DATE,

  -- Lifecycle Status
  status VARCHAR(20) DEFAULT 'open' CHECK (
    status IN ('open', 'acknowledged', 'in_progress', 'resolved', 'wont_fix', 'false_positive')
  ),
  resolved_at TIMESTAMPTZ,

  -- Wont-fix handling (requires approval)
  wont_fix_justification TEXT,
  wont_fix_approved_by TEXT,
  wont_fix_approved_at TIMESTAMPTZ,
  wont_fix_expires_at TIMESTAMPTZ,  -- Default 1 year, requires re-evaluation
  risk_accepted_by TEXT,

  -- Relationships
  related_pattern_id VARCHAR(20),  -- Link to issue_patterns table
  related_issue_key VARCHAR(30),   -- Link to another baseline issue

  -- Metadata & Audit
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,

  -- Constraints
  CONSTRAINT wont_fix_requires_approval CHECK (
    status != 'wont_fix' OR (
      wont_fix_justification IS NOT NULL
      AND length(wont_fix_justification) >= 50
      AND wont_fix_approved_by IS NOT NULL
    )
  ),
  CONSTRAINT false_positive_requires_reason CHECK (
    status != 'false_positive' OR evidence_snapshot->>'false_positive_reason' IS NOT NULL
  )
);

-- ============================================================================
-- INDEXES - Essential for queries and performance
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_baseline_issues_category ON sd_baseline_issues(category);
CREATE INDEX IF NOT EXISTS idx_baseline_issues_status ON sd_baseline_issues(status);
CREATE INDEX IF NOT EXISTS idx_baseline_issues_severity ON sd_baseline_issues(severity);
CREATE INDEX IF NOT EXISTS idx_baseline_issues_sub_agent ON sd_baseline_issues(sub_agent_code);
CREATE INDEX IF NOT EXISTS idx_baseline_issues_discovered_by ON sd_baseline_issues(discovered_by_sd_id);
CREATE INDEX IF NOT EXISTS idx_baseline_issues_owner ON sd_baseline_issues(owner_sd_id);
CREATE INDEX IF NOT EXISTS idx_baseline_issues_remediation ON sd_baseline_issues(remediation_sd_id);
CREATE INDEX IF NOT EXISTS idx_baseline_issues_file_path ON sd_baseline_issues(file_path);

-- Partial index for common query: open critical issues
CREATE INDEX IF NOT EXISTS idx_baseline_issues_open_critical
  ON sd_baseline_issues(severity, created_at)
  WHERE status = 'open';

-- Partial index for stale issues (>30 days old and still open)
CREATE INDEX IF NOT EXISTS idx_baseline_issues_stale
  ON sd_baseline_issues(created_at, severity)
  WHERE status = 'open';

-- Hash signature for deduplication lookups
CREATE INDEX IF NOT EXISTS idx_baseline_issues_hash ON sd_baseline_issues(hash_signature);

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE sd_baseline_issues ENABLE ROW LEVEL SECURITY;

-- Service role has full access (for automated scripts)
CREATE POLICY "service_role_all" ON sd_baseline_issues
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- Authenticated users can read all baseline issues
CREATE POLICY "authenticated_select" ON sd_baseline_issues
  FOR SELECT TO authenticated
  USING (true);

-- Authenticated users can insert (for sub-agents running as authenticated)
CREATE POLICY "authenticated_insert" ON sd_baseline_issues
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- Authenticated users can update (for status changes, assignments)
CREATE POLICY "authenticated_update" ON sd_baseline_issues
  FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Auto-update timestamp on modification
CREATE OR REPLACE FUNCTION update_baseline_issues_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_baseline_issues_timestamp
  BEFORE UPDATE ON sd_baseline_issues
  FOR EACH ROW
  EXECUTE FUNCTION update_baseline_issues_timestamp();

-- Auto-generate hash_signature for deduplication
CREATE OR REPLACE FUNCTION generate_baseline_hash_signature()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.hash_signature IS NULL THEN
    NEW.hash_signature = md5(
      COALESCE(NEW.file_path, '') || '|' ||
      COALESCE(NEW.line_number::TEXT, '') || '|' ||
      NEW.description
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_generate_baseline_hash
  BEFORE INSERT ON sd_baseline_issues
  FOR EACH ROW
  EXECUTE FUNCTION generate_baseline_hash_signature();

-- Auto-set wont_fix_expires_at to 1 year from approval
CREATE OR REPLACE FUNCTION set_wont_fix_expiration()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'wont_fix' AND NEW.wont_fix_approved_at IS NOT NULL AND NEW.wont_fix_expires_at IS NULL THEN
    NEW.wont_fix_expires_at = NEW.wont_fix_approved_at + INTERVAL '1 year';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_set_wont_fix_expiration
  BEFORE INSERT OR UPDATE ON sd_baseline_issues
  FOR EACH ROW
  EXECUTE FUNCTION set_wont_fix_expiration();

-- ============================================================================
-- VIEW: Baseline Summary by Category
-- ============================================================================

CREATE OR REPLACE VIEW baseline_summary AS
SELECT
  category,
  sub_agent_code,
  COUNT(*) FILTER (WHERE status = 'open') as open_count,
  COUNT(*) FILTER (WHERE status = 'acknowledged') as acknowledged_count,
  COUNT(*) FILTER (WHERE status = 'in_progress') as in_progress_count,
  COUNT(*) FILTER (WHERE status IN ('open', 'acknowledged') AND severity = 'critical') as critical_count,
  COUNT(*) FILTER (WHERE status = 'resolved') as resolved_count,
  COUNT(*) FILTER (WHERE status = 'wont_fix') as wont_fix_count,
  MIN(created_at) FILTER (WHERE status = 'open') as oldest_open_issue,
  COUNT(*) FILTER (WHERE status = 'open' AND created_at < NOW() - INTERVAL '30 days') as stale_count,
  COUNT(*) as total_count
FROM sd_baseline_issues
GROUP BY category, sub_agent_code;

-- ============================================================================
-- VIEW: Stale Issues Report (for LEAD gate)
-- ============================================================================

CREATE OR REPLACE VIEW baseline_stale_issues AS
SELECT
  issue_key,
  category,
  sub_agent_code,
  severity,
  file_path,
  description,
  created_at,
  EXTRACT(DAY FROM NOW() - created_at) as days_old,
  owner_sd_id,
  remediation_sd_id
FROM sd_baseline_issues
WHERE status = 'open'
  AND created_at < NOW() - INTERVAL '30 days'
ORDER BY severity DESC, created_at ASC;

-- ============================================================================
-- FUNCTION: Generate Issue Key
-- ============================================================================

CREATE OR REPLACE FUNCTION generate_baseline_issue_key(p_category TEXT)
RETURNS TEXT AS $$
DECLARE
  v_prefix TEXT;
  v_count INTEGER;
  v_key TEXT;
BEGIN
  -- Map category to prefix
  v_prefix := CASE p_category
    WHEN 'security' THEN 'BL-SEC'
    WHEN 'testing' THEN 'BL-TST'
    WHEN 'performance' THEN 'BL-PRF'
    WHEN 'database' THEN 'BL-DB'
    WHEN 'documentation' THEN 'BL-DOC'
    WHEN 'accessibility' THEN 'BL-A11Y'
    WHEN 'code_quality' THEN 'BL-CQ'
    WHEN 'dependency' THEN 'BL-DEP'
    WHEN 'infrastructure' THEN 'BL-INF'
    ELSE 'BL-GEN'
  END;

  -- Get next sequence number for this prefix
  SELECT COUNT(*) + 1 INTO v_count
  FROM sd_baseline_issues
  WHERE issue_key LIKE v_prefix || '-%';

  v_key := v_prefix || '-' || LPAD(v_count::TEXT, 3, '0');

  RETURN v_key;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- FUNCTION: Check Baseline Gate (for LEAD phase)
-- ============================================================================

CREATE OR REPLACE FUNCTION check_baseline_gate(p_sd_id TEXT DEFAULT NULL)
RETURNS JSONB AS $$
DECLARE
  v_stale_critical INTEGER;
  v_stale_total INTEGER;
  v_total_open INTEGER;
  v_owned_issues INTEGER;
  v_verdict TEXT;
  v_issues JSONB := '[]'::jsonb;
  v_warnings JSONB := '[]'::jsonb;
BEGIN
  -- Count stale critical issues (>30 days, open)
  SELECT COUNT(*) INTO v_stale_critical
  FROM sd_baseline_issues
  WHERE status = 'open'
    AND severity = 'critical'
    AND created_at < NOW() - INTERVAL '30 days';

  -- Count all stale issues
  SELECT COUNT(*) INTO v_stale_total
  FROM sd_baseline_issues
  WHERE status = 'open'
    AND created_at < NOW() - INTERVAL '30 days';

  -- Count total open issues
  SELECT COUNT(*) INTO v_total_open
  FROM sd_baseline_issues
  WHERE status = 'open';

  -- Count issues owned by this SD (if SD provided)
  IF p_sd_id IS NOT NULL THEN
    SELECT COUNT(*) INTO v_owned_issues
    FROM sd_baseline_issues
    WHERE owner_sd_id = p_sd_id
      AND status IN ('open', 'acknowledged');
  ELSE
    v_owned_issues := 0;
  END IF;

  -- Determine verdict
  IF v_owned_issues > 0 THEN
    v_verdict := 'BLOCKED';
    v_issues := v_issues || jsonb_build_array(
      format('SD owns %s unresolved baseline issues that must be addressed', v_owned_issues)
    );
  ELSIF v_stale_critical > 0 THEN
    v_verdict := 'BLOCKED';
    v_issues := v_issues || jsonb_build_array(
      format('%s critical baseline issues unaddressed for >30 days', v_stale_critical)
    );
  ELSE
    v_verdict := 'PASS';
  END IF;

  -- Add warnings
  IF v_total_open > 10 THEN
    v_warnings := v_warnings || jsonb_build_array(
      format('Baseline debt growing: %s open issues', v_total_open)
    );
  END IF;

  IF v_stale_total - v_stale_critical > 5 THEN
    v_warnings := v_warnings || jsonb_build_array(
      format('%s non-critical issues unaddressed for >30 days', v_stale_total - v_stale_critical)
    );
  END IF;

  RETURN jsonb_build_object(
    'verdict', v_verdict,
    'score', CASE WHEN v_verdict = 'PASS' THEN 100 ELSE 0 END,
    'stale_critical_count', v_stale_critical,
    'stale_total_count', v_stale_total,
    'total_open_count', v_total_open,
    'owned_issues_count', v_owned_issues,
    'issues', v_issues,
    'warnings', v_warnings
  );
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- COMMENTS for documentation
-- ============================================================================

COMMENT ON TABLE sd_baseline_issues IS 'Tracks pre-existing codebase issues that should not block unrelated SD completion. Part of LEO Protocol governance.';
COMMENT ON COLUMN sd_baseline_issues.issue_key IS 'Unique identifier in format BL-{CAT}-{NNN} (e.g., BL-SEC-001)';
COMMENT ON COLUMN sd_baseline_issues.hash_signature IS 'MD5 hash of file_path|line_number|description for deduplication';
COMMENT ON COLUMN sd_baseline_issues.category IS 'Issue category matching sub-agent domain';
COMMENT ON COLUMN sd_baseline_issues.sub_agent_code IS 'Sub-agent that detected this issue (SECURITY, TESTING, etc.)';
COMMENT ON COLUMN sd_baseline_issues.severity IS 'Issue severity: critical issues block LEAD gate after 30 days';
COMMENT ON COLUMN sd_baseline_issues.discovered_by_sd_id IS 'SD that first detected this issue';
COMMENT ON COLUMN sd_baseline_issues.last_seen_sd_id IS 'Most recent SD to encounter this issue';
COMMENT ON COLUMN sd_baseline_issues.occurrence_count IS 'Number of times this issue has been detected across SDs';
COMMENT ON COLUMN sd_baseline_issues.affected_sd_ids IS 'Array of SDs that were blocked or affected by this issue';
COMMENT ON COLUMN sd_baseline_issues.owner_sd_id IS 'SD responsible for remediation (LEAD assignment)';
COMMENT ON COLUMN sd_baseline_issues.remediation_sd_id IS 'SD actively working on fixing this issue';
COMMENT ON COLUMN sd_baseline_issues.status IS 'Lifecycle: open → acknowledged → in_progress → resolved/wont_fix';
COMMENT ON COLUMN sd_baseline_issues.wont_fix_justification IS 'Required justification (≥50 chars) when accepting risk';
COMMENT ON COLUMN sd_baseline_issues.wont_fix_expires_at IS 'Wont-fix decisions expire after 1 year for re-evaluation';
COMMENT ON VIEW baseline_summary IS 'Summary statistics of baseline issues by category for dashboard';
COMMENT ON VIEW baseline_stale_issues IS 'Issues open for >30 days, used by LEAD gate';
COMMENT ON FUNCTION check_baseline_gate IS 'Returns PASS/BLOCKED verdict for LEAD phase gate';
COMMENT ON FUNCTION generate_baseline_issue_key IS 'Generates unique issue key like BL-SEC-001';

-- ============================================================================
-- Verification
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE 'Migration complete: sd_baseline_issues table created';
  RAISE NOTICE 'Views created: baseline_summary, baseline_stale_issues';
  RAISE NOTICE 'Functions created: check_baseline_gate, generate_baseline_issue_key';
END $$;
