-- Register issue pattern PAT-PORT-ISOL-001 (portfolio-isolation defect class).
-- SD-LEO-INFRA-FAIL-CLOSED-VENTURE-001-B / PA-7 / FR-B7.
--
-- Why this pattern: 70 SDs system-wide were stamped target_application='EHG'
-- when they should have routed to dedicated venture repos. PrivacyPatrol AI
-- (28 SDs) and CommitCraft AI (20 SDs) had code merged into the EHG host
-- instead of github.com/rickfelix/<venture>. Root cause: silent DEFAULT_TARGET
-- fallback in lib/eva/bridge/sd-router.js + dormant exit-gate verifier.
--
-- pattern_id is intentionally short (16 chars) to fit issue_patterns.pattern_id
-- VARCHAR(20) — rejected the longer 'PAT-PORTFOLIO-ISOLATION-001' (26 chars)
-- per database-agent C-DB-1.
--
-- Idempotent: ON CONFLICT (pattern_id) DO UPDATE per database-agent C-DB-4.
-- first_seen_sd_id and last_seen_sd_id are FK refs to strategic_directives_v2.id
-- (UUID, NOT sd_key) per database-agent C-DB-4.

INSERT INTO issue_patterns (
  pattern_id,
  issue_summary,
  category,
  severity,
  occurrence_count,
  proven_solutions,
  prevention_checklist,
  first_seen_sd_id,
  last_seen_sd_id,
  related_sub_agents,
  source_feedback_ids,
  created_at,
  updated_at
) VALUES (
  'PAT-PORT-ISOL-001',
  'Venture without registry entry silently routes to EHG host application — portfolio-isolation defect',
  'infrastructure',
  'high',
  1,
  '[
    {"solution": "DB-derived registry view (vw_venture_registry) replaces static applications/registry.json with NFKD name normalization", "times_applied": 1, "times_successful": 1, "success_rate": 100, "shipped_in": "SD-LEO-INFRA-FAIL-CLOSED-VENTURE-001-A"},
    {"solution": "Wire dormant verifyVentureResourceUrlsPopulated into advance_venture_stage RPC gateway", "times_applied": 1, "times_successful": 1, "success_rate": 100, "shipped_in": "SD-LEO-INFRA-FAIL-CLOSED-VENTURE-001-A"},
    {"solution": "Replace silent DEFAULT_TARGET=ehg fallback with VentureNotRegisteredError throw + sd_type-constrained null-venture branch", "times_applied": 1, "times_successful": 1, "success_rate": 100, "shipped_in": "SD-LEO-INFRA-FAIL-CLOSED-VENTURE-001-B"},
    {"solution": "Intake validator (validate-target-application.js) composes with existing crosscheck — rejects venture-vs-target mismatch + inverse smuggling", "times_applied": 1, "times_successful": 1, "success_rate": 100, "shipped_in": "SD-LEO-INFRA-FAIL-CLOSED-VENTURE-001-B"},
    {"solution": "Capability-suppression warning emission for venture-mismatched SDs (PA-5)", "times_applied": 1, "times_successful": 1, "success_rate": 100, "shipped_in": "SD-LEO-INFRA-FAIL-CLOSED-VENTURE-001-B"},
    {"solution": "Weekly drift sentinel + GHA workflow (PA-6)", "times_applied": 1, "times_successful": 1, "success_rate": 100, "shipped_in": "SD-LEO-INFRA-FAIL-CLOSED-VENTURE-001-B"}
  ]'::jsonb,
  '[
    "Verify ventures.repo_url IS NOT NULL before Stage 19 advance",
    "Verify resolver returns a non-null entry for the venture name (or throws VentureNotRegisteredError, not silent fallback)",
    "Verify exit-gate-enforcer is wired into advance_venture_stage RPC gateway and not flag-gated off",
    "Verify lookup normalizes venture name (NFKD + combining-mark strip + lowercase + alphanumeric strip)",
    "Verify sd-router throw distinguishes registry-miss (permanent) from registry-query-error (transient) per security-agent C-SEC-4",
    "Verify intake validator (PA-4) composes with existing target-application-crosscheck.js — both must run on insert path",
    "Verify capability suppression emits warning to feedback table when target_application does not match parent venture name",
    "Verify weekly drift sentinel returns 0 unmatched SDs",
    "Verify legitimate target_application=EHG SDs (venture_id IS NULL with sd_type IN infrastructure/governance/leo or metadata.engineering_only=true) flow unchanged"
  ]'::jsonb,
  '19e9282e-7873-44e2-b823-b5c4a7a3d1d4'::uuid,  -- Child A UUID (first proven solution shipped)
  '23a64dba-23b3-4823-8a80-df3533f2c8d2'::uuid,  -- Child B UUID (last proven solution shipped, this SD)
  ARRAY['DATABASE', 'SECURITY']::text[],
  '[]'::jsonb,
  NOW(),
  NOW()
)
ON CONFLICT (pattern_id) DO UPDATE SET
  occurrence_count = issue_patterns.occurrence_count + 1,
  last_seen_sd_id = EXCLUDED.last_seen_sd_id,
  updated_at = NOW();
