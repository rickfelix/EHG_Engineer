-- Migration: 20260404_expand_brainstorm_stage_check
-- Description: Expand brainstorm_sessions stage CHECK constraint to include
--   protocol, integration, and architecture domain phases.
--   Previously only venture lifecycle stages were allowed, causing INSERT
--   failures for non-venture brainstorms.
--
-- Affected table: brainstorm_sessions
-- Operation: DROP + ADD constraint (non-destructive, no data change)

ALTER TABLE brainstorm_sessions DROP CONSTRAINT brainstorm_sessions_stage_check;

ALTER TABLE brainstorm_sessions ADD CONSTRAINT brainstorm_sessions_stage_check
  CHECK (stage = ANY (ARRAY[
    'ideation', 'validation', 'mvp', 'growth', 'scale',
    'discovery', 'design', 'implement',
    'intake', 'process', 'output',
    'explore', 'decide', 'execute'
  ]));

-- Rollback:
-- ALTER TABLE brainstorm_sessions DROP CONSTRAINT brainstorm_sessions_stage_check;
-- ALTER TABLE brainstorm_sessions ADD CONSTRAINT brainstorm_sessions_stage_check
--   CHECK (stage = ANY (ARRAY['ideation', 'validation', 'mvp', 'growth', 'scale']));
