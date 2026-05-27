-- SD-LEO-INFRA-CLEANUP-NON-VENTURE-001 / FR1-FR4
-- Cleanup the 27 historical non-venture L2/L1 vision-doc rows that violate
-- the A.3 partial-implication CHECK constraint shipped in UNIFY-VENTURE-NON-001.
--
-- These rows are pre-excision orphans of the Stage-1 stub writer at
-- lib/eva/eva-orchestrator.js:183-191 (excised by UNIFY Child B.2) plus
-- mixed-origin abandoned drafts. Status flips active → draft_seed (enum
-- value added by UNIFY Child A.1); rows remain in table and are re-promotable
-- via Child D /brainstorm --seed-from=draft_seed flag.
--
-- chairman_approved is PRESERVED (not zeroed) per database-agent guidance —
-- the rich-shape CHECK predicate is independent of approval status, and a
-- future P2 follow-up can re-extract dimensions on the 5 chair=true rows
-- and re-promote to active.
--
-- Predicate uses the inverse of the CHECK constraint exactly (CHECK-isomorphic),
-- per database-agent COND-USE-CHECK-PARITY-PREDICATE:
--   CHECK: (status='active' implies (extracted_dimensions IS NOT NULL AND char_length(content) > 500))
--   VIOLATING: status='active' AND NOT (extracted_dimensions IS NOT NULL AND char_length(content) > 500)
--
-- Manifest of the 27 violator UUIDs (audited 2026-05-27):
--   a4cfe1b2-6f81-425b-a43b-ade8c066adf7  VISION-PORTFOLIO-SYSTEM-001 (L1, clen=166, chair=false)
--   046cdee1-b644-4b6f-8138-feccc6ae6e70  VISION-SD-LEO-INFRA-MISSING-VENTURE-DB-TABLES-001
--   85ad6c1e-a7fc-4383-b664-8ad62d5f4c6e  VISION-PODCAST-REPURPOSE-ENGINE-L2-001
--   cd094c8f-2d11-4d4c-810b-35a10a28582d  VISION-LEGACYGUARD-AI-L2-001
--   61964be7-0773-4086-9e62-49a401329ec9  AUTONOMOUS-CONSULTANT-AGENT
--   28765590-21e1-4fce-ba6f-3495ca776916  VISION-S15-STITCH-RELIABILITY-L2-001 (chair=true, 60-char mis-approval)
--   b35569fb-ddc6-4846-8c07-79754c750a28  VISION-LEGACYOS-L2-001
--   9a28bbf7-9248-4f02-8afe-e6c7792757c2  VISION-AEGIS-WILLS-L2-001
--   556198b9-64c4-4d88-ad55-57b43dc4e9b1  VISION-LOGSCRUB-API-L2-001
--   ec1a3980-eea8-4ade-9661-ff6b427628ce  VISION-CHAIRMAN-WEB-UI-V2-001
--   192de259-77b5-4aa9-aa7c-b2a8bc4dc7ad  VISION-LOGSCRUB-API-L2-002 (chair=true, long-nulldims)
--   ac927e5c-b13e-4c6e-8fd4-aa9a8d10005a  VISION-LOGSCRUB-API-L2-003 (chair=true, long-nulldims)
--   61e794b0-9eb2-4049-806c-9ea872da3959  VISION-AETERNA-WILLS-L2-001
--   5abfcbc3-2b92-4550-b2f1-ccf8728a7c91  VISION-AI-POWERED-CREATIVE-WORKSPACE-L2-002 (chair=true, long-nulldims)
--   f0861c70-b673-497e-931e-5bd5255992a9  VISION-NICHEPULSE-L2-001
--   306093eb-cced-4503-a136-ba885f1c6e15  VISION-COMPLYBOT-L2-001
--   12004981-ca6a-4979-8a99-d77dd0c76fdb  VISION-CODEDOC-AI-L2-001
--   7b382a95-8971-432a-93e0-8d4e5f91919b  VISION-GITLOG-SCRIBE-L2-001
--   691e29c9-589f-48ff-bd35-9e11cf4ed336  VISION-NAMESIGNAL-L2-001
--   2e36b7c1-bba6-4312-84fd-c4b2fa7ea9cc  VISION-API-COMPLIANCE-SHIELD-L2-001
--   4cf2f8d0-40c7-45b0-bfbf-554f9e3598cf  VISION-IMPACTPATH-L2-001
--   3d77df0a-b0fd-49c2-9c7a-4eb2d8e6562e  VISION-CRON-CANARY-L2-001
--   915f3377-440d-4b68-b8cf-ff6ca9f9d03d  VISION-IMPACTPORTFOLIO-L2-001
--   414d6394-7967-40d5-a313-c7a1aa255340  VIS-RESTRUCTURE-STAGE-15-MOVE-ORCH-001 (chair=true, long-nulldims)
--   182fb652-dc06-4b6e-9b04-8c3dd4e82c7e  VISION-NICHEMETRICS-L2-001
--   3bb3628c-fa02-4d06-9285-76af9e1eee15  VISION-RENDER-L2-001
--   ddb4cf83-d39c-4224-a14b-172c8fe5117d  VISION-SOMA-AI-L2-001
--
-- NOTE: update_eva_vision_documents_updated_at trigger bumps updated_at on
-- 27 rows (cosmetic, expected). Other triggers (auto_validate_vision_quality,
-- enforce_vision_quality_on_advancement, fn_cascade_invalidation_on_vision_update)
-- do NOT fire on status-only UPDATE per database-agent trigger analysis.

BEGIN;

-- Pre-flight: drift-aware + idempotent.
-- Accept 0 (already-applied, no-op) or 27 (expected baseline). Anything else
-- means the DB state has drifted from the audit baseline — abort.
DO $$
DECLARE
  expected INT := 27;
  pre INT;
BEGIN
  SELECT COUNT(*) INTO pre
    FROM eva_vision_documents
    WHERE status = 'active'
      AND NOT ((extracted_dimensions IS NOT NULL) AND (char_length(content) > 500));
  IF pre = 0 THEN
    RAISE NOTICE 'PRE-CHECK: 0 violators (already applied or migrated). Migration will be a no-op.';
  ELSIF pre = expected THEN
    RAISE NOTICE 'PRE-CHECK PASSED: % violators identified for archival.', pre;
  ELSE
    RAISE EXCEPTION
      'PRE-CHECK FAILED: expected % violators (baseline) or 0 (already applied), found %. '
      'Re-audit via scripts/one-off/_audit-cleanup-non-venture-l2-violators.mjs before re-applying.',
      expected, pre;
  END IF;
END $$;

-- Idempotent UPDATE: archive violators to draft_seed.
-- chairman_approved preserved; only status changes.
UPDATE eva_vision_documents
   SET status = 'draft_seed'
 WHERE status = 'active'
   AND NOT ((extracted_dimensions IS NOT NULL) AND (char_length(content) > 500));

-- Post-flight: assert zero violators remain.
DO $$
DECLARE
  rem INT;
BEGIN
  SELECT COUNT(*) INTO rem
    FROM eva_vision_documents
    WHERE status = 'active'
      AND NOT ((extracted_dimensions IS NOT NULL) AND (char_length(content) > 500));
  IF rem > 0 THEN
    RAISE EXCEPTION
      'POST-CHECK FAILED: % violators remain after archival. Aborting transaction.', rem;
  END IF;
  RAISE NOTICE 'POST-CHECK PASSED: 0 violators remain.';
END $$;

COMMIT;
