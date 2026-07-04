-- @approved-by: codestreetlabs@gmail.com
-- SD-LEO-FIX-CHAIRMAN-APPROVED-VENTURE-001
--
-- Supplemental quarantine sweep for 7 residual venture_artifacts rows that the
-- 2026-06-10 bulk quarantine (venture_artifacts_storm_quarantine_20260610, 2684 rows)
-- missed. These 7 rows match the exact same mislabeled/duplicate predicate:
--   (19, 'blueprint_sprint_plan'), (21, 'build_security_audit'), (22, 'launch_test_plan')
-- Verified: no inbound FKs reference venture_artifacts.id. Verified per-venture: 3 of 4
-- source ventures are status='cancelled'; the 4th (DataDistill) has progressed to
-- current_lifecycle_stage=26, long past stages 19-22. Row selection is by exact id
-- (not a live predicate re-scan) to avoid ever sweeping a future legitimate row that
-- happens to reuse one of these legacy type names.
--
-- House pattern: quarantine-move only, never hard-delete.

BEGIN;

CREATE TABLE IF NOT EXISTS venture_artifacts_storm_quarantine_20260704 (
  LIKE venture_artifacts INCLUDING ALL
);

INSERT INTO venture_artifacts_storm_quarantine_20260704
SELECT * FROM venture_artifacts
WHERE id IN (
  '09dbf89c-f68e-4d49-bd3e-585f2cf0c396', -- Canvas AI, S19 blueprint_sprint_plan
  '6dc7797a-0a0c-4659-825c-2ac3606eb393', -- CronLinter, S19 blueprint_sprint_plan
  'e313befa-b9c7-4a5b-a710-f726ef3da680', -- CronGenius, S19 blueprint_sprint_plan
  '2078ebd5-d13c-488a-9dd3-e9311664d764', -- DataDistill, S19 blueprint_sprint_plan
  '45ca1ed6-53f8-465a-b4eb-dce7db48a741', -- DataDistill, S22 launch_test_plan
  'fd9cc1e7-dd6f-4175-a533-c8d8804ae518', -- DataDistill, S21 build_security_audit
  '2bb15b9d-976b-43bd-abb0-6e45bcdd107c'  -- DataDistill, S22 launch_test_plan (dup)
);

DELETE FROM venture_artifacts
WHERE id IN (
  '09dbf89c-f68e-4d49-bd3e-585f2cf0c396',
  '6dc7797a-0a0c-4659-825c-2ac3606eb393',
  'e313befa-b9c7-4a5b-a710-f726ef3da680',
  '2078ebd5-d13c-488a-9dd3-e9311664d764',
  '45ca1ed6-53f8-465a-b4eb-dce7db48a741',
  'fd9cc1e7-dd6f-4175-a533-c8d8804ae518',
  '2bb15b9d-976b-43bd-abb0-6e45bcdd107c'
);

COMMENT ON TABLE venture_artifacts_storm_quarantine_20260704 IS
  'Supplemental quarantine sweep (SD-LEO-FIX-CHAIRMAN-APPROVED-VENTURE-001): 7 residual mislabeled/duplicate venture_artifacts rows missed by the 2026-06-10 bulk quarantine action. Quarantine-only per house pattern -- never hard-deleted.';

COMMIT;
