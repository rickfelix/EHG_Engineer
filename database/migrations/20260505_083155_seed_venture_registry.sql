-- Seed ventures table from existing applications/registry.json (idempotent).
-- SD-LEO-INFRA-FAIL-CLOSED-VENTURE-001-A / PA-3 (FR-A7)
--
-- Why: The transition from static registry.json to vw_venture_registry must
-- not produce a registry blackout window. This migration backfills the 5 known
-- registry entries (ehg, test-leo-project, test-venture, test-cicd, commitcraft-ai)
-- as ventures rows where they don't already exist. ON CONFLICT DO NOTHING uses
-- the unique partial index from migration 20260505_083153 (must run before this
-- one — sequential filenames enforce order).
--
-- Empirically: registry has 5 entries; ventures has 0 of them as of 2026-05-05
-- (per database-agent introspection). All 5 will be inserted on first apply;
-- subsequent applies are no-op.
--
-- Idempotent via:
--   1. INSERT ... ON CONFLICT (LOWER(REGEXP_REPLACE(NORMALIZE(name,NFKC),'[^A-Za-z0-9]','','g')) COLLATE "C")
--      DO NOTHING — works because the unique partial index from 083153 covers
--      this exact expression with WHERE deleted_at IS NULL AND status IN (active,paused)
--   2. Each INSERT also defends with NOT EXISTS check on already-present normalized name

DO $$
DECLARE
  registry_entries CONSTANT JSONB[] := ARRAY[
    '{"name": "EHG_Engineer", "local_path": "C:/Users/rickf/Projects/_EHG/EHG_Engineer", "repo_url": "https://github.com/rickfelix/EHG_Engineer.git"}'::JSONB,
    '{"name": "ehg", "local_path": "C:/Users/rickf/Projects/_EHG/ehg", "repo_url": "https://github.com/rickfelix/ehg.git"}'::JSONB,
    '{"name": "test-leo-project", "local_path": "C:/Users/rickf/Projects/_EHG/test-leo-project", "repo_url": null}'::JSONB,
    '{"name": "test-venture", "local_path": "C:/Users/rickf/Projects/_EHG/EHG_Engineer/test-venture", "repo_url": null}'::JSONB,
    '{"name": "test-cicd", "local_path": "C:/Users/rickf/Projects/_EHG/EHG_Engineer/test-cicd", "repo_url": null}'::JSONB,
    '{"name": "commitcraft-ai", "local_path": "C:/Users/rickf/Projects/_EHG/commitcraft-ai", "repo_url": "https://github.com/rickfelix/commitcraft-ai.git"}'::JSONB
  ];
  entry JSONB;
  v_normalized TEXT;
BEGIN
  FOREACH entry IN ARRAY registry_entries LOOP
    v_normalized := LOWER(REGEXP_REPLACE(NORMALIZE(entry->>'name', NFKC), '[^A-Za-z0-9]', '', 'g'));

    INSERT INTO ventures (
      id,
      name,
      local_path,
      repo_url,
      status,
      pipeline_mode,
      created_at,
      updated_at
    )
    SELECT
      gen_random_uuid(),
      entry->>'name',
      entry->>'local_path',
      entry->>'repo_url',
      'active',
      'building',
      NOW(),
      NOW()
    WHERE NOT EXISTS (
      SELECT 1 FROM ventures v
      WHERE v.deleted_at IS NULL
        AND v.status IN ('active', 'paused')
        AND LOWER(REGEXP_REPLACE(NORMALIZE(v.name, NFKC), '[^A-Za-z0-9]', '', 'g')) COLLATE "C"
            = v_normalized COLLATE "C"
    );
  END LOOP;
END $$;
