-- Grant access to all companies for the first authenticated user (when one exists)
-- This allows testing the multi-company functionality
DO $$
DECLARE
    first_user_id uuid;
    company_record RECORD;
BEGIN
    -- Get the first user if any exist
    SELECT id INTO first_user_id FROM auth.users LIMIT 1;
    
    -- If a user exists, grant them access to all companies
    IF first_user_id IS NOT NULL THEN
        FOR company_record IN SELECT id FROM companies LOOP
            INSERT INTO user_company_access (user_id, company_id, access_level, granted_by) 
            VALUES (first_user_id, company_record.id, 'admin', first_user_id)
            ON CONFLICT (user_id, company_id) DO NOTHING;
        END LOOP;
    END IF;
END $$;