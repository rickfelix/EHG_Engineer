-- @approved-by: codestreetlabs@gmail.com
-- approval-note: chairman ruling A at terminal 2026-08-22 ~13:4xZ (4-file packet, item SEC-02); scribe adam-08049808
-- SEC-02: claude_sessions carries a legacy anon policy ("Allow all for anon", cmd=SELECT, USING(true)).
-- Live-read 2026-08-22 pg_policies: SELECT-only (the FOR ALL description in the queue item was stale/narrowed).
-- Only the missing anon GRANT (42501) holds the surface closed; one routine grant would open session
-- metadata to anon. anon has no legitimate read of claude_sessions -- drop the policy entirely.
-- DOWN: CREATE POLICY "Allow all for anon" ON public.claude_sessions FOR SELECT TO anon USING (true);
DROP POLICY IF EXISTS "Allow all for anon" ON public.claude_sessions;
