-- Create backlog entries for Vision Alignment Strategic Directives
-- These provide work estimates for WSJF scoring without detailed story breakdown

INSERT INTO strategic_directives_backlog (
  sd_id,
  sd_title,
  page_category,
  page_title,
  total_items,
  h_count,
  m_count,
  l_count,
  future_count,
  must_have_count,
  wish_list_count,
  must_have_pct,
  rolled_triage,
  readiness,
  must_have_density,
  new_module_pct,
  present_in_latest_import,
  created_at,
  updated_at
) VALUES
-- SD-GOVERNANCE-001: 2 PRDs (Schema + Proposals)
(
  'SD-GOVERNANCE-001',
  'Governance Data Model',
  'Infrastructure',
  'Data Governance Foundation',
  20,      -- total_items
  8,       -- h_count (schema design, constraints)
  8,       -- m_count (linkage logic, validation)
  4,       -- l_count (documentation, cleanup)
  0,       -- future_count
  12,      -- must_have_count (schema + core linkage)
  8,       -- wish_list_count
  60.0,    -- must_have_pct
  'H(8) M(8) L(4)',
  75.0,    -- readiness
  0.6,     -- must_have_density
  30.0,    -- new_module_pct
  true,
  NOW(),
  NOW()
),
-- SD-VISION-001: 1 PRD (Gap Analysis)
(
  'SD-VISION-001',
  'Vision Alignment Pipeline',
  'Governance',
  'Vision Gap Detection & Analysis',
  15,      -- total_items
  6,       -- h_count (gap detection algorithms)
  6,       -- m_count (recommendation engine)
  3,       -- l_count (reporting)
  0,       -- future_count
  10,      -- must_have_count (core gap detection)
  5,       -- wish_list_count
  66.7,    -- must_have_pct
  'H(6) M(6) L(3)',
  85.0,    -- readiness (high - well defined)
  0.67,    -- must_have_density
  40.0,    -- new_module_pct
  true,
  NOW(),
  NOW()
),
-- SD-WSJF-001: 2 PRDs (Scoring + Apply)
(
  'SD-WSJF-001',
  'WSJF Sequencing Optimization',
  'Optimization',
  'Weighted Shortest Job First Implementation',
  25,      -- total_items
  10,      -- h_count (scoring algorithm, apply logic)
  10,      -- m_count (proposals, rollback)
  5,       -- l_count (audit, documentation)
  0,       -- future_count
  15,      -- must_have_count (algorithm + apply)
  10,      -- wish_list_count
  60.0,    -- must_have_pct
  'H(10) M(10) L(5)',
  80.0,    -- readiness
  0.6,     -- must_have_density
  50.0,    -- new_module_pct (new algorithms)
  true,
  NOW(),
  NOW()
),
-- SD-PIPELINE-001: 2 PRDs (Security + Gates)
(
  'SD-PIPELINE-001',
  'CI/CD Pipeline Hardening',
  'Infrastructure',
  'Production Pipeline Safety',
  22,      -- total_items
  12,      -- h_count (security, gates, rollback)
  7,       -- m_count (concurrency, dry-run)
  3,       -- l_count (documentation)
  0,       -- future_count
  16,      -- must_have_count (critical safety)
  6,       -- wish_list_count
  72.7,    -- must_have_pct (high - safety critical)
  'H(12) M(7) L(3)',
  85.0,    -- readiness
  0.73,    -- must_have_density
  20.0,    -- new_module_pct
  true,
  NOW(),
  NOW()
),
-- SD-MONITORING-001: 1 PRD (Metrics)
(
  'SD-MONITORING-001',
  'Observability Framework',
  'Operations',
  'Metrics Collection & Dashboards',
  12,      -- total_items
  4,       -- h_count (collection pipeline)
  5,       -- m_count (dashboards, alerting)
  3,       -- l_count (documentation)
  0,       -- future_count
  7,       -- must_have_count (core metrics)
  5,       -- wish_list_count
  58.3,    -- must_have_pct
  'H(4) M(5) L(3)',
  65.0,    -- readiness (medium - less defined)
  0.58,    -- must_have_density
  35.0,    -- new_module_pct
  true,
  NOW(),
  NOW()
)
ON CONFLICT (sd_id) DO UPDATE SET
  total_items = EXCLUDED.total_items,
  h_count = EXCLUDED.h_count,
  m_count = EXCLUDED.m_count,
  l_count = EXCLUDED.l_count,
  must_have_count = EXCLUDED.must_have_count,
  must_have_pct = EXCLUDED.must_have_pct,
  rolled_triage = EXCLUDED.rolled_triage,
  readiness = EXCLUDED.readiness,
  updated_at = NOW();

-- Verify insertion
SELECT
  sd_id,
  sd_title,
  total_items,
  CONCAT('H:', h_count, ' M:', m_count, ' L:', l_count) as breakdown,
  must_have_pct || '%' as must_have_percentage,
  readiness || '%' as readiness_score
FROM strategic_directives_backlog
WHERE sd_id IN (
  'SD-GOVERNANCE-001',
  'SD-VISION-001',
  'SD-WSJF-001',
  'SD-PIPELINE-001',
  'SD-MONITORING-001'
)
ORDER BY sd_id;