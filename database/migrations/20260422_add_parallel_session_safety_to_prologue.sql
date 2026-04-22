-- Migration: Add parallel-session safety to Session Prologue
-- Date: 2026-04-22
-- Context: Four parallel Claude Code sessions collided in a shared
-- working tree today, causing tool-result "internal error" responses
-- on writes that actually succeeded (PR #3219 root-caused and fixed
-- the auto-worktree hook; PR #3219 also introduced
-- `npm run session:check-concurrency`). This adds a prologue rule so
-- future sessions surface the safety check proactively.
--
-- Appends item 8 to the leo_protocol_sections row with
-- section_type='session_prologue' (id=209 under protocol
-- leo-v4-3-3-ui-parity).

-- Safety check: only apply if the text is not already present
UPDATE leo_protocol_sections
SET content = content || E'\n' ||
'8. **Parallel-session safety** - In shared-working-tree sessions, run `npm run session:check-concurrency` before Write/Edit work; if contention is detected, isolate with `npm run session:worktree`
> Why: Parallel Claude Code sessions sharing one working tree cause tool-result "internal error" messages when one session''s `git checkout` mutates files mid-PostToolUse-hook in another session. The SessionStart auto-worktree hook (`scripts/hooks/concurrent-session-worktree.cjs`) catches some cases but is point-in-time; the CLI gives any session an explicit isolation check.'
WHERE section_type = 'session_prologue'
  AND protocol_id = 'leo-v4-3-3-ui-parity'
  AND content NOT LIKE '%Parallel-session safety%';

-- Verify
--   SELECT LENGTH(content), content FROM leo_protocol_sections
--   WHERE section_type = 'session_prologue' AND protocol_id = 'leo-v4-3-3-ui-parity';
