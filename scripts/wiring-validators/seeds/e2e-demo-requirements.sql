-- Seed: leo_wiring_validation_requirements (e2e_demo check_type)
-- SD-LEO-WIRING-VERIFICATION-FRAMEWORK-ORCH-001-E (FR-5, US-005)
--
-- Declares per-sd_type whether the e2e_demo check is REQUIRED, OPTIONAL, or
-- NOT_APPLICABLE (absent rows). D's gate logic reads this table to decide
-- whether to block /leo complete on missing/failed e2e_demo rows.
--
-- DEPENDS ON: D-owned table leo_wiring_validation_requirements (must exist
-- before this seed runs). Run order: D's migration -> this seed.
--
-- Idempotent: ON CONFLICT DO NOTHING per (sd_type, check_type) unique key.

INSERT INTO leo_wiring_validation_requirements
  (sd_type, check_type, required, rationale, created_at)
VALUES
  ('feature',                   'e2e_demo', true,
   'Feature SDs MUST prove their smoke_test_steps execute and match expected_outcomes — Q9 promoted to runtime gate.',
   now()),
  ('bugfix',                    'e2e_demo', true,
   'Bugfix SDs MUST demonstrate the fix is observable — same Q9 contract as feature.',
   now()),
  ('infrastructure-orchestrator', 'e2e_demo', true,
   'Orchestrator SDs MUST prove their declared end-to-end demo runs — closes the parent vision dimension self_validation.',
   now()),
  ('infrastructure',            'e2e_demo', false,
   'Plain infrastructure SDs are EXEMPT from runtime demo (no user-observable behavior). Recorder still runs if smoke_test_steps populated, but absence does not block.',
   now()),
  ('database',                  'e2e_demo', false,
   'Database SDs verified by DATABASE sub-agent + migration tests; e2e_demo is recommended but not required.',
   now()),
  ('security',                  'e2e_demo', true,
   'Security SDs MUST prove the auth/authz behavior is observable end-to-end.',
   now()),
  ('refactor',                  'e2e_demo', false,
   'Refactor SDs (behavior unchanged by definition) verified by REGRESSION sub-agent; e2e_demo not required.',
   now()),
  ('documentation',             'e2e_demo', false,
   'Documentation SDs have no runtime behavior — e2e_demo not applicable.',
   now())
ON CONFLICT (sd_type, check_type) DO NOTHING;
