-- ============================================================================
-- SD-LEO-FIX-VENTURE-STAGE-TRANSITIONS-001 FR-004
-- Backfill missing venture_stage_transitions rows for PrivacyPatrol AI venture
--
-- Origin: PrivacyPatrol AI venture monitoring (2026-05-03) revealed 3 missing
-- audit-trail rows: S12->S13, S15->S16, S16->S17. The advance happened
-- (ventures.current_lifecycle_stage and venture_stage_work both consistent),
-- but the transition write silently failed at stage-execution-worker.js:2211
-- before the FR-002 observability fix landed.
--
-- Idempotency: deterministic v5 UUID idempotency_key + ON CONFLICT DO NOTHING
-- against the partial unique index idx_venture_stage_transitions_idempotency
-- ON (venture_id, idempotency_key) WHERE idempotency_key IS NOT NULL.
-- Re-running this migration produces zero additional rows.
--
-- transition_type='normal' is used because the CHECK constraint allows only
-- ('normal','skip','rollback','pivot'); 'backfilled' would fail. Provenance
-- is preserved in the deterministic idempotency_key suffix and this header.
--
-- Down-migration recipe (emergency rollback):
--   DELETE FROM venture_stage_transitions
--   WHERE venture_id = '08d20036-03c9-4a26-bbc5-f37a18dfdf23'
--     AND idempotency_key IN (
--       uuid_generate_v5('6ba7b812-9dad-11d1-80b4-00c04fd430c8'::uuid, '08d20036-03c9-4a26-bbc5-f37a18dfdf23:12->13:backfill-sd-leo-fix-vst-001'),
--       uuid_generate_v5('6ba7b812-9dad-11d1-80b4-00c04fd430c8'::uuid, '08d20036-03c9-4a26-bbc5-f37a18dfdf23:15->16:backfill-sd-leo-fix-vst-001'),
--       uuid_generate_v5('6ba7b812-9dad-11d1-80b4-00c04fd430c8'::uuid, '08d20036-03c9-4a26-bbc5-f37a18dfdf23:16->17:backfill-sd-leo-fix-vst-001')
--     );
-- ============================================================================

BEGIN;

-- Ensure uuid-ossp extension is available for uuid_generate_v5
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Insert the 3 missing PrivacyPatrol AI transitions with deterministic
-- idempotency keys derived from venture_id + transition shape + SD provenance.
-- The OID namespace UUID '6ba7b812-9dad-11d1-80b4-00c04fd430c8' is the standard
-- DNS-namespace UUID; we use it as a stable namespace constant for v5 keys.
INSERT INTO venture_stage_transitions (
  venture_id,
  from_stage,
  to_stage,
  transition_type,
  idempotency_key
) VALUES
  (
    '08d20036-03c9-4a26-bbc5-f37a18dfdf23',
    12,
    13,
    'normal',
    uuid_generate_v5('6ba7b812-9dad-11d1-80b4-00c04fd430c8'::uuid, '08d20036-03c9-4a26-bbc5-f37a18dfdf23:12->13:backfill-sd-leo-fix-vst-001')
  ),
  (
    '08d20036-03c9-4a26-bbc5-f37a18dfdf23',
    15,
    16,
    'normal',
    uuid_generate_v5('6ba7b812-9dad-11d1-80b4-00c04fd430c8'::uuid, '08d20036-03c9-4a26-bbc5-f37a18dfdf23:15->16:backfill-sd-leo-fix-vst-001')
  ),
  (
    '08d20036-03c9-4a26-bbc5-f37a18dfdf23',
    16,
    17,
    'normal',
    uuid_generate_v5('6ba7b812-9dad-11d1-80b4-00c04fd430c8'::uuid, '08d20036-03c9-4a26-bbc5-f37a18dfdf23:16->17:backfill-sd-leo-fix-vst-001')
  )
ON CONFLICT (venture_id, idempotency_key) DO NOTHING;

-- Post-flight check: confirm exactly 3 rows now exist for the affected venture
-- at these stage boundaries. Comment out for production apply if you want to
-- avoid raising on partial state; uncomment for staging validation.
--
-- DO $$
-- DECLARE
--   v_count INT;
-- BEGIN
--   SELECT COUNT(*) INTO v_count
--   FROM venture_stage_transitions
--   WHERE venture_id = '08d20036-03c9-4a26-bbc5-f37a18dfdf23'
--     AND ((from_stage = 12 AND to_stage = 13) OR
--          (from_stage = 15 AND to_stage = 16) OR
--          (from_stage = 16 AND to_stage = 17));
--   IF v_count <> 3 THEN
--     RAISE EXCEPTION 'Backfill verification failed: expected 3 rows, found %', v_count;
--   END IF;
-- END $$;

COMMIT;
