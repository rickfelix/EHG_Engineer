-- @approved-by: rickfelix@example.com
-- SD-LEO-INFRA-VENTURE-STAGE-DEFINITION-001 (follow-up to 20260530_venture_stage_definition_alignment.sql)
--
-- Stage 23 "Launch Readiness" grouping: the prior migration moved it to THE_LAUNCH, but the
-- DEPLOYED app convention (ehg/src/config/venture-workflow.ts WorkflowChunk type + generator
-- comment map) defines THE_BUILD = stages 18-23. Rather than fight that convention (which would
-- require generator-comment edits and a chunk regrouping consumers may rely on), keep stage 23 in
-- THE_BUILD and align phase_number + phase_name to it, so all three (chunk/phase_number/phase_name)
-- agree and the generator's existing 18-23 boundary stays correct. This is the original divergence
-- the audit flagged (it was phase_number 6 vs chunk THE_BUILD); now resolved toward THE_BUILD.
UPDATE venture_stages SET chunk = 'THE_BUILD', phase_number = 5, phase_name = 'The Build' WHERE stage_number = 23;

DO $v$
DECLARE k text;
BEGIN
  SELECT chunk || '|' || phase_number || '|' || phase_name INTO k FROM venture_stages WHERE stage_number = 23;
  IF k <> 'THE_BUILD|5|The Build' THEN RAISE EXCEPTION 'stage 23 not aligned (got %)', k; END IF;
  -- phases must still be a clean partition: THE_BUILD = 18-23, THE_LAUNCH = 24-26
  IF (SELECT count(*) FROM venture_stages WHERE chunk='THE_BUILD' AND stage_number NOT BETWEEN 18 AND 23) > 0
     OR (SELECT count(*) FROM venture_stages WHERE stage_number BETWEEN 18 AND 23 AND chunk<>'THE_BUILD') > 0
  THEN RAISE EXCEPTION 'THE_BUILD chunk no longer equals stages 18-23'; END IF;
  RAISE NOTICE 'stage 23 aligned to THE_BUILD / phase 5 / The Build.';
END $v$;
