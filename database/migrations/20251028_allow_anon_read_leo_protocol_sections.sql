-- Allow anonymous users to read LEO protocol sections
-- This is needed for CLAUDE.md generation scripts to work with anon key

DO $$
BEGIN
    -- Drop policy if it exists
    DROP POLICY IF EXISTS "anon_read_leo_protocol_sections" ON leo_protocol_sections;

    -- Create policy
    CREATE POLICY "anon_read_leo_protocol_sections"
    ON leo_protocol_sections
    FOR SELECT
    TO anon
    USING (true);

EXCEPTION
    WHEN duplicate_object THEN
        -- Policy already exists, ignore
        RAISE NOTICE 'Policy anon_read_leo_protocol_sections already exists';
END$$;

-- Comment explaining why anon access is needed
COMMENT ON POLICY "anon_read_leo_protocol_sections" ON leo_protocol_sections IS
'Allows anonymous read access to protocol sections for CLAUDE.md generation scripts';
