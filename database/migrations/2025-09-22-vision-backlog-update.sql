-- Update Strategic Directives with backlog estimates for WSJF scoring
-- These columns exist in strategic_directives_v2 table

-- SD-GOVERNANCE-001: Governance Data Model (2 PRDs)
UPDATE strategic_directives_v2
SET
  h_count = 8,
  m_count = 8,
  l_count = 4,
  future_count = 0,
  must_have_count = 12,
  wish_list_count = 8,
  must_have_pct = 60.0,
  rolled_triage = 'H(8) M(8) L(4)',
  readiness = 75.0,
  must_have_density = 0.6,
  new_module_pct = 30.0,
  category = 'Infrastructure',
  updated_at = NOW()
WHERE sd_key = 'SD-GOVERNANCE-001';

-- SD-VISION-001: Vision Alignment Pipeline (1 PRD)
UPDATE strategic_directives_v2
SET
  h_count = 6,
  m_count = 6,
  l_count = 3,
  future_count = 0,
  must_have_count = 10,
  wish_list_count = 5,
  must_have_pct = 66.7,
  rolled_triage = 'H(6) M(6) L(3)',
  readiness = 85.0,
  must_have_density = 0.67,
  new_module_pct = 40.0,
  category = 'Governance',
  updated_at = NOW()
WHERE sd_key = 'SD-VISION-001';

-- SD-WSJF-001: WSJF Sequencing Optimization (2 PRDs)
UPDATE strategic_directives_v2
SET
  h_count = 10,
  m_count = 10,
  l_count = 5,
  future_count = 0,
  must_have_count = 15,
  wish_list_count = 10,
  must_have_pct = 60.0,
  rolled_triage = 'H(10) M(10) L(5)',
  readiness = 80.0,
  must_have_density = 0.6,
  new_module_pct = 50.0,
  category = 'Optimization',
  updated_at = NOW()
WHERE sd_key = 'SD-WSJF-001';

-- SD-PIPELINE-001: CI/CD Pipeline Hardening (2 PRDs)
UPDATE strategic_directives_v2
SET
  h_count = 12,
  m_count = 7,
  l_count = 3,
  future_count = 0,
  must_have_count = 16,
  wish_list_count = 6,
  must_have_pct = 72.7,
  rolled_triage = 'H(12) M(7) L(3)',
  readiness = 85.0,
  must_have_density = 0.73,
  new_module_pct = 20.0,
  category = 'Infrastructure',
  updated_at = NOW()
WHERE sd_key = 'SD-PIPELINE-001';

-- SD-MONITORING-001: Observability Framework (1 PRD)
UPDATE strategic_directives_v2
SET
  h_count = 4,
  m_count = 5,
  l_count = 3,
  future_count = 0,
  must_have_count = 7,
  wish_list_count = 5,
  must_have_pct = 58.3,
  rolled_triage = 'H(4) M(5) L(3)',
  readiness = 65.0,
  must_have_density = 0.58,
  new_module_pct = 35.0,
  category = 'Operations',
  updated_at = NOW()
WHERE sd_key = 'SD-MONITORING-001';

-- Verify the updates
SELECT
  sd_key,
  title,
  (h_count + m_count + l_count) as total_items,
  CONCAT('H:', h_count, ' M:', m_count, ' L:', l_count) as breakdown,
  must_have_pct || '%' as must_have_percentage,
  readiness || '%' as readiness_score,
  category
FROM strategic_directives_v2
WHERE sd_key IN (
  'SD-GOVERNANCE-001',
  'SD-VISION-001',
  'SD-WSJF-001',
  'SD-PIPELINE-001',
  'SD-MONITORING-001'
)
ORDER BY sd_key;