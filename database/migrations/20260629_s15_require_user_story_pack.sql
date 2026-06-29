-- @approved-by: codestreetlabs@gmail.com
--
-- 20260629_s15_require_user_story_pack.sql
-- SD-LEO-INFRA-S15-USER-STORY-PACK-GAP-001 (FR-2)
--
-- Make the 15->16 boundary contract EXPLICIT about the user-story pack. Stage 15
-- required_artifacts was ['wireframe_screens'] only, so the missing canonical
-- blueprint_user_story_pack was non-blocking and slipped through silently — even
-- though the S17 Devil's Advocate flags its absence as a HIGH risk (development
-- stalls / rework). FR-1 now persists blueprint_user_story_pack on every stage-15
-- run (it is generated unconditionally, unlike wireframes which are conditional
-- on S10 brand data), so requiring it at the boundary is safe and closes the
-- silent gap.
--
-- blueprint_wireframes is intentionally NOT required here — wireframe generation
-- is conditionally skipped when S10 brand data is unavailable, so requiring it
-- would wrongly block those ventures. The DA still surfaces it as advisory.
--
-- Additive + idempotent. Rollback:
--   UPDATE venture_stages SET required_artifacts = array_remove(required_artifacts, 'blueprint_user_story_pack') WHERE stage_number = 15;

BEGIN;

UPDATE venture_stages
SET required_artifacts = array_append(required_artifacts, 'blueprint_user_story_pack'),
    updated_at = now()
WHERE stage_number = 15
  AND NOT ('blueprint_user_story_pack' = ANY (required_artifacts));

COMMIT;
