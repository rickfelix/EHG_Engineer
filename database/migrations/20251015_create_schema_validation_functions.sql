-- Migration: Create Schema Validation Support Functions
-- Purpose: Support schema-validator.js module to prevent type mismatches
-- Related: SD-KNOWLEDGE-001 Issue #1 - UUID type mismatch prevention
-- Date: 2025-10-15

-- ============================================================================
-- Function: get_table_schema
-- Description: Returns column information for a given table
-- Used by: scripts/modules/schema-validator.js
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_table_schema(table_name TEXT)
RETURNS TABLE (
  column_name TEXT,
  data_type TEXT,
  is_nullable TEXT,
  column_default TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.column_name::TEXT,
    c.data_type::TEXT,
    c.is_nullable::TEXT,
    c.column_default::TEXT
  FROM information_schema.columns c
  WHERE c.table_name = get_table_schema.table_name
    AND c.table_schema = 'public'
  ORDER BY c.ordinal_position;
END;
$$;

-- Grant execute permission to anon and authenticated roles
GRANT EXECUTE ON FUNCTION public.get_table_schema(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.get_table_schema(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_table_schema(TEXT) TO service_role;

COMMENT ON FUNCTION public.get_table_schema(TEXT) IS
'Returns schema information for a table to support pre-insert validation.
Used by schema-validator.js to prevent type mismatches like UUID vs TEXT issues.
Created to prevent recurrence of SD-KNOWLEDGE-001 Issue #1.';

-- ============================================================================
-- Function: validate_uuid_format
-- Description: Validates if a string is a proper UUID format
-- Used by: Schema validation checks
-- ============================================================================

CREATE OR REPLACE FUNCTION public.validate_uuid_format(value TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  -- Try to cast to UUID - if it fails, return false
  PERFORM value::UUID;
  RETURN TRUE;
EXCEPTION
  WHEN OTHERS THEN
    RETURN FALSE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.validate_uuid_format(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.validate_uuid_format(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.validate_uuid_format(TEXT) TO service_role;

COMMENT ON FUNCTION public.validate_uuid_format(TEXT) IS
'Validates if a text value can be safely cast to UUID type.
Returns TRUE if valid, FALSE if invalid.
Part of schema validation infrastructure to prevent type mismatch errors.';

-- ============================================================================
-- Verification queries
-- ============================================================================

-- Test get_table_schema function
DO $$
DECLARE
  schema_count INTEGER;
BEGIN
  -- Test with a known table
  SELECT COUNT(*) INTO schema_count
  FROM public.get_table_schema('strategic_directives');

  IF schema_count > 0 THEN
    RAISE NOTICE 'get_table_schema function working: Found % columns for strategic_directives', schema_count;
  ELSE
    RAISE WARNING 'get_table_schema returned no results - this may be expected if table does not exist';
  END IF;
END;
$$;

-- Test validate_uuid_format function
DO $$
DECLARE
  test_valid_uuid BOOLEAN;
  test_invalid_uuid BOOLEAN;
BEGIN
  -- Test valid UUID
  test_valid_uuid := public.validate_uuid_format('550e8400-e29b-41d4-a716-446655440000');

  -- Test invalid UUID
  test_invalid_uuid := public.validate_uuid_format('not-a-uuid-12345');

  IF test_valid_uuid = TRUE AND test_invalid_uuid = FALSE THEN
    RAISE NOTICE 'validate_uuid_format function working correctly';
  ELSE
    RAISE WARNING 'validate_uuid_format may not be working as expected';
  END IF;
END;
$$;

-- ============================================================================
-- Success message
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '✅ Schema validation functions created successfully';
  RAISE NOTICE '   - get_table_schema(table_name TEXT)';
  RAISE NOTICE '   - validate_uuid_format(value TEXT)';
  RAISE NOTICE '   ';
  RAISE NOTICE '   These functions support the schema-validator.js module';
  RAISE NOTICE '   to prevent type mismatch errors like those in SD-KNOWLEDGE-001.';
END;
$$;
