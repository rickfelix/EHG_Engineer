-- Schema Validation Service
-- Detect and prevent database schema mismatches before they cause script failures
-- Phase 2, Task 2 of LEO Protocol improvements
-- Date: 2025-09-24

-- ============================================================================
-- SCHEMA EXPECTATIONS REGISTRY
-- ============================================================================

-- Define expected schema structures for validation
CREATE TABLE IF NOT EXISTS schema_expectations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    table_name TEXT NOT NULL,
    column_name TEXT NOT NULL,
    expected_type TEXT,
    is_required BOOLEAN DEFAULT TRUE,
    expected_constraints TEXT[], -- Array of constraint descriptions
    validation_query TEXT, -- SQL to validate this expectation
    remediation_sql TEXT, -- SQL to fix if missing
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(table_name, column_name)
);

-- Pre-populate with critical schema expectations based on retrospective issues
INSERT INTO schema_expectations (table_name, column_name, expected_type, is_required, expected_constraints, validation_query, remediation_sql)
VALUES
    -- strategic_directives_v2 critical columns
    ('strategic_directives_v2', 'progress', 'integer', TRUE, ARRAY['CHECK (progress >= 0 AND progress <= 100)'],
     'SELECT column_name FROM information_schema.columns WHERE table_name = ''strategic_directives_v2'' AND column_name = ''progress''',
     'ALTER TABLE strategic_directives_v2 ADD COLUMN progress INTEGER CHECK (progress >= 0 AND progress <= 100) DEFAULT 0'),

    ('strategic_directives_v2', 'id', 'text', TRUE, ARRAY['PRIMARY KEY'],
     'SELECT column_name FROM information_schema.columns WHERE table_name = ''strategic_directives_v2'' AND column_name = ''id''',
     'Cannot add primary key to existing table - manual intervention required'),

    ('strategic_directives_v2', 'status', 'text', TRUE, ARRAY['CHECK constraint with valid statuses'],
     'SELECT column_name FROM information_schema.columns WHERE table_name = ''strategic_directives_v2'' AND column_name = ''status''',
     'ALTER TABLE strategic_directives_v2 ADD COLUMN status TEXT DEFAULT ''draft'''),

    ('strategic_directives_v2', 'title', 'text', TRUE, ARRAY['NOT NULL'],
     'SELECT column_name FROM information_schema.columns WHERE table_name = ''strategic_directives_v2'' AND column_name = ''title''',
     'ALTER TABLE strategic_directives_v2 ADD COLUMN title TEXT NOT NULL DEFAULT ''Untitled'''),

    -- leo_handoff_executions (was missing entirely)
    ('leo_handoff_executions', 'id', 'uuid', TRUE, ARRAY['PRIMARY KEY', 'DEFAULT gen_random_uuid()'],
     'SELECT table_name FROM information_schema.tables WHERE table_name = ''leo_handoff_executions''',
     'Run migration: database/migrations/2025-09-24-handoff-system-tables.sql'),

    ('leo_handoff_executions', 'sd_id', 'text', TRUE, ARRAY['NOT NULL', 'FOREIGN KEY'],
     'SELECT column_name FROM information_schema.columns WHERE table_name = ''leo_handoff_executions'' AND column_name = ''sd_id''',
     'Table leo_handoff_executions needs to be created first'),

    -- sub_agent_executions critical columns
    ('sub_agent_executions', 'id', 'uuid', TRUE, ARRAY['PRIMARY KEY'],
     'SELECT column_name FROM information_schema.columns WHERE table_name = ''sub_agent_executions'' AND column_name = ''id''',
     'Table likely needs to be created'),

    ('sub_agent_executions', 'context_id', 'text', FALSE, ARRAY[], -- Made optional since it was added later
     'SELECT column_name FROM information_schema.columns WHERE table_name = ''sub_agent_executions'' AND column_name = ''context_id''',
     'ALTER TABLE sub_agent_executions ADD COLUMN context_id TEXT'),

    -- prd_documents table
    ('prd_documents', 'prd_id', 'text', TRUE, ARRAY['PRIMARY KEY'],
     'SELECT column_name FROM information_schema.columns WHERE table_name = ''prd_documents'' AND column_name = ''prd_id''',
     'Check if prd_documents table exists and create if needed'),

    ('prd_documents', 'sd_id', 'text', TRUE, ARRAY['NOT NULL'],
     'SELECT column_name FROM information_schema.columns WHERE table_name = ''prd_documents'' AND column_name = ''sd_id''',
     'ALTER TABLE prd_documents ADD COLUMN sd_id TEXT NOT NULL')

ON CONFLICT (table_name, column_name) DO NOTHING;

-- ============================================================================
-- SCHEMA VALIDATION FUNCTIONS
-- ============================================================================

-- Function to validate a single schema expectation
CREATE OR REPLACE FUNCTION validate_schema_expectation(p_expectation_id UUID)
RETURNS JSONB AS $$
DECLARE
    expectation_record RECORD;
    validation_result RECORD;
    result JSONB;
BEGIN
    -- Get the expectation
    SELECT * INTO expectation_record FROM schema_expectations WHERE id = p_expectation_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'valid', false,
            'error', 'Expectation not found',
            'expectation_id', p_expectation_id
        );
    END IF;

    -- Execute the validation query
    BEGIN
        EXECUTE expectation_record.validation_query INTO validation_result;

        -- If validation query returns result, the expectation is met
        IF validation_result IS NOT NULL THEN
            result := jsonb_build_object(
                'valid', true,
                'table_name', expectation_record.table_name,
                'column_name', expectation_record.column_name,
                'found', true
            );
        ELSE
            result := jsonb_build_object(
                'valid', false,
                'table_name', expectation_record.table_name,
                'column_name', expectation_record.column_name,
                'found', false,
                'remediation_sql', expectation_record.remediation_sql,
                'is_required', expectation_record.is_required
            );
        END IF;

    EXCEPTION WHEN OTHERS THEN
        result := jsonb_build_object(
            'valid', false,
            'table_name', expectation_record.table_name,
            'column_name', expectation_record.column_name,
            'error', SQLERRM,
            'remediation_sql', expectation_record.remediation_sql,
            'is_required', expectation_record.is_required
        );
    END;

    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Function to validate all schema expectations
CREATE OR REPLACE FUNCTION validate_all_schema_expectations()
RETURNS JSONB AS $$
DECLARE
    expectation_record RECORD;
    validation_result JSONB;
    overall_result JSONB := jsonb_build_object('valid', true, 'issues', '[]'::jsonb, 'summary', '{}'::jsonb);
    issues_count INTEGER := 0;
    required_issues_count INTEGER := 0;
BEGIN
    -- Check each expectation
    FOR expectation_record IN SELECT * FROM schema_expectations ORDER BY table_name, column_name
    LOOP
        validation_result := validate_schema_expectation(expectation_record.id);

        -- If validation failed, add to issues
        IF NOT (validation_result->>'valid')::boolean THEN
            overall_result := jsonb_set(
                overall_result,
                '{issues}',
                (overall_result->'issues') || jsonb_build_array(validation_result)
            );

            issues_count := issues_count + 1;

            -- Count required issues separately
            IF (validation_result->>'is_required')::boolean THEN
                required_issues_count := required_issues_count + 1;
                -- Mark overall result as invalid if required expectation fails
                overall_result := jsonb_set(overall_result, '{valid}', 'false'::jsonb);
            END IF;
        END IF;
    END LOOP;

    -- Add summary information
    overall_result := jsonb_set(overall_result, '{summary}', jsonb_build_object(
        'total_expectations', (SELECT COUNT(*) FROM schema_expectations),
        'total_issues', issues_count,
        'required_issues', required_issues_count,
        'optional_issues', issues_count - required_issues_count
    ));

    RETURN overall_result;
END;
$$ LANGUAGE plpgsql;

-- Function to generate remediation script for schema issues
CREATE OR REPLACE FUNCTION generate_schema_remediation_script()
RETURNS TEXT AS $$
DECLARE
    validation_results JSONB;
    issue JSONB;
    remediation_script TEXT := '-- Auto-generated Schema Remediation Script' || chr(10) || '-- Generated: ' || NOW() || chr(10) || chr(10);
    required_fixes TEXT := '';
    optional_fixes TEXT := '';
BEGIN
    -- Get all validation issues
    validation_results := validate_all_schema_expectations();

    -- Process each issue
    FOR issue IN SELECT * FROM jsonb_array_elements(validation_results->'issues')
    LOOP
        IF (issue->>'is_required')::boolean THEN
            required_fixes := required_fixes || '-- REQUIRED: ' || (issue->>'table_name') || '.' || (issue->>'column_name') || chr(10);
            required_fixes := required_fixes || COALESCE(issue->>'remediation_sql', '-- Manual intervention required') || ';' || chr(10) || chr(10);
        ELSE
            optional_fixes := optional_fixes || '-- OPTIONAL: ' || (issue->>'table_name') || '.' || (issue->>'column_name') || chr(10);
            optional_fixes := optional_fixes || COALESCE(issue->>'remediation_sql', '-- Manual intervention required') || ';' || chr(10) || chr(10);
        END IF;
    END LOOP;

    -- Combine the script
    IF required_fixes != '' THEN
        remediation_script := remediation_script || '-- ============================================================================' || chr(10);
        remediation_script := remediation_script || '-- REQUIRED FIXES (Must be applied)' || chr(10);
        remediation_script := remediation_script || '-- ============================================================================' || chr(10) || chr(10);
        remediation_script := remediation_script || required_fixes;
    END IF;

    IF optional_fixes != '' THEN
        remediation_script := remediation_script || '-- ============================================================================' || chr(10);
        remediation_script := remediation_script || '-- OPTIONAL FIXES (Recommended)' || chr(10);
        remediation_script := remediation_script || '-- ============================================================================' || chr(10) || chr(10);
        remediation_script := remediation_script || optional_fixes;
    END IF;

    IF required_fixes = '' AND optional_fixes = '' THEN
        remediation_script := remediation_script || '-- No schema issues found. All expectations are met!' || chr(10);
    END IF;

    RETURN remediation_script;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- SCHEMA VALIDATION VIEWS
-- ============================================================================

-- View for current schema validation status
CREATE OR REPLACE VIEW v_schema_validation_status AS
SELECT
    se.table_name,
    se.column_name,
    se.expected_type,
    se.is_required,
    CASE
        WHEN EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = se.table_name AND column_name = se.column_name
        ) THEN 'EXISTS'
        ELSE 'MISSING'
    END as current_status,
    se.remediation_sql,
    se.updated_at
FROM schema_expectations se
ORDER BY
    se.is_required DESC,
    se.table_name,
    se.column_name;

-- View for schema issues that need immediate attention
CREATE OR REPLACE VIEW v_schema_critical_issues AS
SELECT
    table_name,
    column_name,
    expected_type,
    'MISSING' as issue_type,
    remediation_sql,
    'CRITICAL' as priority
FROM schema_expectations se
WHERE is_required = TRUE
  AND NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = se.table_name AND column_name = se.column_name
  )
ORDER BY table_name, column_name;

-- ============================================================================
-- INTEGRATION FUNCTIONS FOR LEO PROTOCOL
-- ============================================================================

-- Function for scripts to check schema before execution
CREATE OR REPLACE FUNCTION check_schema_before_script(
    p_script_name TEXT,
    p_required_tables TEXT[],
    p_required_columns JSONB DEFAULT '{}'::jsonb -- Format: {"table_name": ["col1", "col2"]}
) RETURNS BOOLEAN AS $$
DECLARE
    table_name TEXT;
    column_name TEXT;
    columns_array JSONB;
    missing_items TEXT[] := '{}';
BEGIN
    -- Check required tables exist
    FOREACH table_name IN ARRAY p_required_tables
    LOOP
        IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = table_name) THEN
            missing_items := array_append(missing_items, 'TABLE: ' || table_name);
        END IF;
    END LOOP;

    -- Check required columns exist
    FOR table_name IN SELECT jsonb_object_keys(p_required_columns)
    LOOP
        columns_array := p_required_columns->table_name;
        FOR column_name IN SELECT jsonb_array_elements_text(columns_array)
        LOOP
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = table_name AND column_name = column_name
            ) THEN
                missing_items := array_append(missing_items, 'COLUMN: ' || table_name || '.' || column_name);
            END IF;
        END LOOP;
    END LOOP;

    -- If any missing items, raise exception with details
    IF array_length(missing_items, 1) > 0 THEN
        RAISE EXCEPTION 'SCHEMA_VALIDATION_FAILURE: Script % blocked due to missing schema elements: %. Run schema validation service to fix.',
            p_script_name, array_to_string(missing_items, ', ');
    END IF;

    RAISE NOTICE 'SCHEMA_VALIDATION_PASS: Script % - all required schema elements present', p_script_name;
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Function to add new schema expectation
CREATE OR REPLACE FUNCTION add_schema_expectation(
    p_table_name TEXT,
    p_column_name TEXT,
    p_expected_type TEXT DEFAULT NULL,
    p_is_required BOOLEAN DEFAULT TRUE,
    p_validation_query TEXT DEFAULT NULL,
    p_remediation_sql TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    expectation_id UUID;
    default_validation_query TEXT;
    default_remediation_sql TEXT;
BEGIN
    -- Generate default validation query if not provided
    default_validation_query := COALESCE(
        p_validation_query,
        'SELECT column_name FROM information_schema.columns WHERE table_name = ''' || p_table_name || ''' AND column_name = ''' || p_column_name || ''''
    );

    -- Generate default remediation SQL if not provided
    default_remediation_sql := COALESCE(
        p_remediation_sql,
        'ALTER TABLE ' || p_table_name || ' ADD COLUMN ' || p_column_name || ' ' || COALESCE(p_expected_type, 'TEXT')
    );

    INSERT INTO schema_expectations (
        table_name,
        column_name,
        expected_type,
        is_required,
        validation_query,
        remediation_sql
    ) VALUES (
        p_table_name,
        p_column_name,
        p_expected_type,
        p_is_required,
        default_validation_query,
        default_remediation_sql
    ) RETURNING id INTO expectation_id;

    RAISE NOTICE 'SCHEMA_EXPECTATION_ADDED: %.% (%) - %',
        p_table_name, p_column_name, p_expected_type,
        CASE WHEN p_is_required THEN 'REQUIRED' ELSE 'OPTIONAL' END;

    RETURN expectation_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- VERIFICATION & TESTING
-- ============================================================================

-- Test the schema validation service
DO $$
DECLARE
    validation_results JSONB;
    issue_count INTEGER;
BEGIN
    RAISE NOTICE '🔍 SCHEMA VALIDATION SERVICE INSTALLED';
    RAISE NOTICE '═══════════════════════════════════════════════════════════════';

    -- Run initial validation
    validation_results := validate_all_schema_expectations();
    issue_count := (validation_results->'summary'->>'total_issues')::integer;

    RAISE NOTICE '✅ schema_expectations - Registry of expected schema structure';
    RAISE NOTICE '✅ validate_schema_expectation() - Single expectation validator';
    RAISE NOTICE '✅ validate_all_schema_expectations() - Complete schema check';
    RAISE NOTICE '✅ generate_schema_remediation_script() - Auto-fix generator';
    RAISE NOTICE '✅ check_schema_before_script() - Pre-execution validation';
    RAISE NOTICE '✅ add_schema_expectation() - Dynamic expectation management';
    RAISE NOTICE '';

    IF issue_count = 0 THEN
        RAISE NOTICE '🎉 SCHEMA VALIDATION PASSED: All expectations met!';
    ELSE
        RAISE NOTICE '⚠️  SCHEMA ISSUES DETECTED: % issues found', issue_count;
        RAISE NOTICE '🔧 Run generate_schema_remediation_script() for fixes';
    END IF;

    RAISE NOTICE '';
    RAISE NOTICE '📊 Schema Expectations Loaded: % total expectations', (validation_results->'summary'->>'total_expectations');
    RAISE NOTICE '🚀 Ready to prevent schema-related script failures';
    RAISE NOTICE '';
    RAISE NOTICE '💡 Usage Examples:';
    RAISE NOTICE '   • SELECT validate_all_schema_expectations();';
    RAISE NOTICE '   • SELECT generate_schema_remediation_script();';
    RAISE NOTICE '   • SELECT * FROM v_schema_critical_issues;';
END;
$$;