-- @approved-by: codestreetlabs@gmail.com
-- Chairman verbal "Apply All" in the room 2026-09-12 12:4xZ (decision be559366); additive ADD COLUMN IF NOT EXISTS only.
-- QF-20260912-253: add 6 columns that real code already assumes exist on public.feedback.
--
-- Confirmed via 3 independent checks (live DB select(*), database/schema-reference-snapshot.json,
-- and an exhaustive grep of all feedback-related migrations) that these columns were ABSENT --
-- a migration was simply never written, not a case of dead/abandoned feature code:
--   - lib/quality/priority-calculator.js:231-234 writes priority_reasoning with a comment
--     explicitly asserting it is a "pre-existing column" -- the author believed it already existed.
--   - lib/quality/focus-filter.js:73,168 READS burst_group_id (.is('burst_group_id', null)) --
--     an active consumer, not merely a writer with nothing downstream.
--   - lib/quality/triage-engine.js writes assigned_at/assignment_reason (alongside the real,
--     existing assigned_to column in the same UPDATE) and priority_reasoning/burst_group_id.
--   - lib/quality/ignore-patterns.js writes ignored_by_pattern_id/ignore_reason. NOTE: this one
--     call site (autoIgnoreFeedback) is reached only via matchesIgnorePattern(), which the same
--     file's own comments say is already stubbed ("feedback_ignore_patterns table does not
--     exist -- return stub/no-op/empty") -- so this particular path is currently unreachable
--     dead code one level up. Adding the columns here is still correct (matches what the code
--     assumes, harmless, nullable) but does not by itself restore the ignore-patterns feature;
--     that is a separate, larger gap, out of this QF's scope.
--
-- Every .from('feedback').update() call referencing these columns fails at the DB layer today
-- (PostgREST rejects the whole statement on an unknown column), regardless of any trigger.
--
-- Pure ADD COLUMN, no DO block, no new constraints -- stays TIER-1 (auto-appliable).

ALTER TABLE feedback ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMPTZ NULL;
COMMENT ON COLUMN feedback.assigned_at IS
  'When this feedback item was assigned (lib/quality/triage-engine.js applyAssignmentRule). Written alongside the pre-existing assigned_to column.';

ALTER TABLE feedback ADD COLUMN IF NOT EXISTS assignment_reason TEXT NULL;
COMMENT ON COLUMN feedback.assignment_reason IS
  'Why this feedback item was assigned to assigned_to (lib/quality/triage-engine.js applyAssignmentRule).';

ALTER TABLE feedback ADD COLUMN IF NOT EXISTS priority_reasoning TEXT NULL;
COMMENT ON COLUMN feedback.priority_reasoning IS
  'Explanation for the computed priority value (lib/quality/priority-calculator.js, lib/quality/triage-engine.js).';

ALTER TABLE feedback ADD COLUMN IF NOT EXISTS burst_group_id UUID NULL;
COMMENT ON COLUMN feedback.burst_group_id IS
  'References the feedback.id of this occurrence''s burst group (lib/quality/burst-detector.js). Read by lib/quality/focus-filter.js to exclude already-grouped items.';

ALTER TABLE feedback ADD COLUMN IF NOT EXISTS ignored_by_pattern_id UUID NULL;
COMMENT ON COLUMN feedback.ignored_by_pattern_id IS
  'References the matched ignore-pattern id (lib/quality/ignore-patterns.js autoIgnoreFeedback). Currently unreachable: matchesIgnorePattern() is stubbed pending the separate feedback_ignore_patterns table.';

ALTER TABLE feedback ADD COLUMN IF NOT EXISTS ignore_reason TEXT NULL;
COMMENT ON COLUMN feedback.ignore_reason IS
  'Why this feedback item was auto-ignored (lib/quality/ignore-patterns.js autoIgnoreFeedback). Currently unreachable, see ignored_by_pattern_id.';
