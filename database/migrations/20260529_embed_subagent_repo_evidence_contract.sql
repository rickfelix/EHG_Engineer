-- @approved-by: rickfelix@example.com
-- QF-20260529-628 / feedback bbe5451d
--
-- Embed the canonical sub-agent repo-evidence contract into the Session Prologue.
-- RCA 9d33b954 (PROTOCOL_PROCESS): folklore in older prompts/memories said to store
-- top-level repo_path/local_path on sub_agent_execution_results, but those columns do
-- NOT exist; the code, gate, view and table columns were all verified CORRECT (no
-- defect). This adds the authoritative contract as prologue item 11 so the folklore has
-- a deterministically-loaded counter. Appends to leo_protocol_sections session_prologue
-- (id=209, protocol leo-v4-3-3-ui-parity); idempotent via the NOT LIKE guard. The
-- regenerated CLAUDE.md + CLAUDE_DIGEST.md prologue lines are committed alongside.

UPDATE leo_protocol_sections
SET content = content || E'\n' ||
'11. **Sub-agent repo evidence** — sub-agents record their repo as `metadata.repo_path` + `executed_from_cwd`; there are NO top-level `repo_path`/`local_path` columns on `sub_agent_execution_results`. The canonical writer is `lib/sub-agents/resolve-repo.js` `applySubAgentRepoVerdict` — never hand-roll path columns. The `SUB_AGENT_REPO_RESOLUTION` gate compares `metadata->>repo_path` to `applications.local_path` via the `v_sub_agent_repo_compliance` view.
> Why: Folklore in older prompts/memories said to store top-level `repo_path`/`local_path`; following it produces malformed evidence the gate cannot read. Code, gate, view and the results-table columns were all verified correct (bbe5451d / RCA 9d33b954 — PROTOCOL_PROCESS guidance-vs-columns drift), so this prologue line is the authoritative contract.'
WHERE section_type = 'session_prologue'
  AND protocol_id = 'leo-v4-3-3-ui-parity'
  AND content NOT LIKE '%Sub-agent repo evidence%';

-- Verify:
--   SELECT content LIKE '%Sub-agent repo evidence%' FROM leo_protocol_sections
--   WHERE section_type='session_prologue' AND protocol_id='leo-v4-3-3-ui-parity';
