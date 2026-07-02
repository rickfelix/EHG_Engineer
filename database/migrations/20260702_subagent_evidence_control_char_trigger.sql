-- @approved-by: codestreetlabs@gmail.com
-- SD-LEO-INFRA-FIX-SYSTEMIC-WINDOWS-001 (FR-2)
--
-- BLOCKING (RAISE EXCEPTION) before-insert-or-update trigger on
-- sub_agent_execution_results. Unlike the advisory-only precedent in
-- 20260702_session_coordination_insert_lint.sql (RAISE NOTICE, never rejects),
-- this trigger REJECTS the write outright when a control character is found in
-- any of:
--   1. NEW.metadata->>'repo_path'
--   2. NEW.metadata->>'executed_from_cwd'
--   3. NEW.executed_from_cwd (top-level column, distinct from metadata.executed_from_cwd)
--
-- Rationale: Windows path literals (e.g. C:\Users\rickf\Projects\_EHG\...) get
-- hand-typed inline into JS/shell INSERT scripts. When that literal passes through
-- JS string-escape parsing before ever reaching the DB, backslash sequences like
-- \U, \P, \_, \E are silently DROPPED because they are not recognized JS escapes
-- (the backslash disappears, corrupting the path) -- while \r IS a recognized JS
-- escape and gets converted into a literal embedded carriage-return control byte.
-- Both failure modes produce a path string that looks superficially plausible but
-- is silently wrong, and the corrupted evidence row then fails (or worse, falsely
-- passes) the SUB_AGENT_REPO_RESOLUTION gate's repo_path comparison. Rejecting at
-- the DB layer catches every producer regardless of code path, rather than relying
-- on each caller to sanitize correctly.
--
-- Tab (\x09) is intentionally excluded from the reject class (all other C0 control
-- characters, including newline \x0A and carriage-return \x0D, ARE rejected): reject
-- class = [\x00-\x08\x0A-\x1F]. Windows paths never legitimately contain any control
-- character, so this is a strict reject with no false-positive risk for valid evidence.
-- QF-review fix: an earlier draft of this regex ([\x00-\x08\x0B-\x1F]) accidentally
-- excluded \x0A (newline) alongside tab, which would have let a `\node_modules`-style
-- corrupted path (\n JS-escaped into a literal LF) bypass this "BLOCKING" guard --
-- exactly the class of silent corruption this trigger exists to catch.

CREATE OR REPLACE FUNCTION reject_control_chars_in_subagent_evidence()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.metadata->>'repo_path' ~ '[\x00-\x08\x0A-\x1F]' THEN
    RAISE EXCEPTION
      'reject_control_chars_in_subagent_evidence: control character detected in metadata.repo_path (id=%). '
      'Windows path literals hand-typed into JS/shell INSERT scripts get silently corrupted by JS '
      'string-escape parsing before reaching the DB (\U/\P/\_/\E dropped, \r becomes a literal CR byte).',
      NEW.id;
  END IF;

  IF NEW.metadata->>'executed_from_cwd' ~ '[\x00-\x08\x0A-\x1F]' THEN
    RAISE EXCEPTION
      'reject_control_chars_in_subagent_evidence: control character detected in metadata.executed_from_cwd (id=%). '
      'Windows path literals hand-typed into JS/shell INSERT scripts get silently corrupted by JS '
      'string-escape parsing before reaching the DB (\U/\P/\_/\E dropped, \r becomes a literal CR byte).',
      NEW.id;
  END IF;

  IF NEW.executed_from_cwd ~ '[\x00-\x08\x0A-\x1F]' THEN
    RAISE EXCEPTION
      'reject_control_chars_in_subagent_evidence: control character detected in executed_from_cwd (id=%). '
      'Windows path literals hand-typed into JS/shell INSERT scripts get silently corrupted by JS '
      'string-escape parsing before reaching the DB (\U/\P/\_/\E dropped, \r becomes a literal CR byte).',
      NEW.id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION reject_control_chars_in_subagent_evidence() IS
  'BLOCKING (RAISE EXCEPTION) guard on sub_agent_execution_results: rejects inserts/updates '
  'where metadata.repo_path, metadata.executed_from_cwd, or the top-level executed_from_cwd '
  'column contains a C0 control character other than tab ([\x00-\x08\x0A-\x1F]). Exists '
  'because Windows path literals hand-typed inline in JS/shell INSERT scripts get silently '
  'corrupted by JS string-escape parsing before ever reaching the DB: \U, \P, \_, \E are '
  'dropped since they are not recognized JS escapes, while \r IS a recognized JS escape and '
  'becomes a literal embedded carriage-return control byte in the stored path. '
  'SD-LEO-INFRA-FIX-SYSTEMIC-WINDOWS-001 (FR-2).';

DROP TRIGGER IF EXISTS trg_subagent_evidence_reject_control_chars ON sub_agent_execution_results;
CREATE TRIGGER trg_subagent_evidence_reject_control_chars
  BEFORE INSERT OR UPDATE ON sub_agent_execution_results
  FOR EACH ROW
  EXECUTE FUNCTION reject_control_chars_in_subagent_evidence();
