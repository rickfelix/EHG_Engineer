-- SD-LEO-INFRA-LEO-PROTOCOL-SECTIONS-ID-SEQ-RESYNC-001
-- @approved-by: codestreetlabs@gmail.com
--
-- leo_protocol_sections.id had drifted ahead of its sequence: a prior process inserted rows with
-- explicit, non-sequential ids without ever advancing leo_protocol_sections_id_seq. Confirmed live:
-- last_value=613 (nextval() -> 614) while MAX(id)=616 -- a plain nextval()-driven INSERT (the normal
-- application path) collides on duplicate key 23505 the moment it lands on an id already used by an
-- explicit-id row (614/615/616 already exist).
--
-- Re-sync the sequence to MAX(id) so nextval() resumes returning unused ids.
SELECT setval('public.leo_protocol_sections_id_seq', (SELECT MAX(id) FROM public.leo_protocol_sections), true);

-- Root cause of the reported 42501: sequence USAGE was already granted to service_role/authenticated/
-- anon (confirmed live via information_schema.role_usage_grants), so nextval()/currval() already work
-- for those roles -- but setval() requires UPDATE privilege on the sequence, which was granted to NO
-- role except the owner (postgres). GRANT UPDATE (not USAGE, already present) so service_role -- the
-- role workers/MCP connect as via SUPABASE_SERVICE_ROLE_KEY -- can self-repair a future drift (e.g.
-- another explicit-id insert) without needing an elevated migration run every time.
GRANT UPDATE, SELECT ON SEQUENCE public.leo_protocol_sections_id_seq TO service_role;
