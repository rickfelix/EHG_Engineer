-- DB-derived venture registry view replacing static applications/registry.json.
-- SD-LEO-INFRA-FAIL-CLOSED-VENTURE-001-A / PA-3
--
-- Why: applications/registry.json drifts from ventures table when a venture is
-- created with a name-style mismatch (e.g., ventures.name='CommitCraft AI' but
-- registry key='commitcraft-ai'). Coupling the registry to the source-of-truth
-- ventures table eliminates the drift class. NFKC name normalization handles
-- the remaining surface (homoglyphs, diacritics, separator differences).
--
-- ventures-only design: per live schema introspection 2026-05-05,
-- venture_resources is EAV and has NO flat repo_url / deployment_url columns
-- (the 20260503_venture_resources_add_replit_urls.sql migration was never
-- applied to live). The needed fields live on ventures directly.
--
-- Filters:
--   deleted_at IS NULL — exclude soft-deleted ventures
--   status IN ('active', 'paused') — exclude cancelled / archived / completed
--   repo_url IS NOT NULL — only ventures with a registered code repository
--                          (matches the registry's purpose: routing SDs to repos)
--
-- COLLATE "C" — locale-deterministic uniqueness across servers/databases.
-- NORMALIZE(name, NFKC) — Unicode NFKC normalization per security-agent C-SEC-1.

CREATE OR REPLACE VIEW vw_venture_registry AS
SELECT
  v.id,
  v.name,
  LOWER(REGEXP_REPLACE(NORMALIZE(v.name, NFKC), '[^A-Za-z0-9]', '', 'g')) COLLATE "C"
    AS normalized_name,
  v.local_path,
  v.repo_url,
  v.deployment_url,
  v.deployment_target,
  v.status,
  v.current_lifecycle_stage,
  v.created_at
FROM ventures v
WHERE v.deleted_at IS NULL
  AND v.status IN ('active', 'paused')
  AND v.repo_url IS NOT NULL;

COMMENT ON VIEW vw_venture_registry IS
'DB-derived venture registry replacing static applications/registry.json. Joins via ventures only (venture_resources is EAV without flat URL columns). Filters active/paused ventures with repo_url populated. NFKC + alphanumeric-strip normalized_name supports name-style-mismatch lookup. Read by lib/venture-resolver.js::getVentureConfig(). SD-LEO-INFRA-FAIL-CLOSED-VENTURE-001-A.';
