-- @approved-by: codestreetlabs@gmail.com
-- SD-LEO-INFRA-POST-BUILD-ARTIFACT-001-B
-- Adds a FK constraint from post_build_verdicts.deviation_artifact_id to
-- venture_artifacts(id), closing an integrity gap flagged by adversarial
-- /ship review (PR #5555, INFO finding): the column was previously an
-- unconstrained bare uuid, allowing a dangling reference to a deleted or
-- never-existed artifact row.
--
-- ON DELETE SET NULL (not CASCADE): venture_artifacts rows are effectively
-- append-only in current usage (Child A's deviation ledger never deletes),
-- so this is a defensive backstop, not an expected-to-fire path. If a
-- deviation record is ever removed, the verdict row itself remains
-- meaningful — it just no longer cites a specific deviation artifact.
ALTER TABLE post_build_verdicts
  ADD CONSTRAINT fk_post_build_verdicts_deviation_artifact
  FOREIGN KEY (deviation_artifact_id) REFERENCES venture_artifacts(id) ON DELETE SET NULL;
