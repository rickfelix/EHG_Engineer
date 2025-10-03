-- Add description and test_type fields to uat_cases table
-- This will store detailed test instructions and distinguish manual vs automatic tests

-- First, check what columns exist
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'uat_cases'
ORDER BY ordinal_position;

-- Add description column if it doesn't exist
ALTER TABLE uat_cases
ADD COLUMN IF NOT EXISTS description TEXT;

-- Add test_type column to distinguish manual vs automatic tests
ALTER TABLE uat_cases
ADD COLUMN IF NOT EXISTS test_type VARCHAR(20) DEFAULT 'automatic';

-- Update existing test cases with helpful descriptions
UPDATE uat_cases SET description =
CASE
    -- Authentication tests
    WHEN id = 'TEST-AUTH-001' THEN 'Navigate to login page, enter valid credentials (admin@test.com / Admin123!), click Sign In, verify dashboard loads and username appears in header'
    WHEN id = 'TEST-AUTH-002' THEN 'Navigate to login page, enter invalid credentials (wrong@test.com / wrongpass), click Sign In, verify error message appears and user stays on login page'
    WHEN id = 'TEST-AUTH-003' THEN 'Navigate to login page, leave fields empty, click Sign In, verify validation messages appear for required fields'
    WHEN id = 'TEST-AUTH-004' THEN 'Click "Forgot Password" link, enter email, submit form, verify reset email confirmation message appears'

    -- Dashboard tests
    WHEN id = 'TEST-DASH-001' THEN 'After login, verify dashboard page loads completely with all widgets, charts, and metrics visible without errors'
    WHEN id = 'TEST-DASH-002' THEN 'On dashboard, verify all navigation menu items are visible and clickable in the sidebar'
    WHEN id = 'TEST-DASH-003' THEN 'Check that dashboard displays real-time data updates when changes occur (may need to open in two tabs)'

    -- Ventures tests
    WHEN id = 'TEST-VENT-001' THEN 'Navigate to Ventures page, verify list of ventures displays with proper formatting and data'
    WHEN id = 'TEST-VENT-004' THEN 'Click "New Venture" button, fill in all required fields with test data, submit form, verify venture is created and appears in list'

    -- Manual tests (if they exist)
    WHEN id LIKE 'MANUAL-%' THEN title -- Use title as description for manual tests

    ELSE 'Test case needs detailed description'
END
WHERE description IS NULL;

-- Mark existing tests as automatic
UPDATE uat_cases
SET test_type = 'automatic'
WHERE id NOT LIKE 'MANUAL-%';

-- Mark manual tests as manual
UPDATE uat_cases
SET test_type = 'manual'
WHERE id LIKE 'MANUAL-%';

-- Verify the columns were added
SELECT
    id,
    section,
    title,
    priority,
    test_type,
    CASE
        WHEN description IS NOT NULL THEN '✓ Has description'
        ELSE '✗ Missing description'
    END as description_status
FROM uat_cases
ORDER BY test_type, section, id
LIMIT 10;