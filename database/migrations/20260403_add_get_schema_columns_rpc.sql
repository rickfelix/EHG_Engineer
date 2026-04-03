-- Migration: Add get_schema_columns RPC function
-- SD: SD-LEO-ORCH-SELF-HEALING-DATABASE-001-B
-- Purpose: Expose information_schema.columns via PostgREST-compatible RPC
--          for the schema-preflight validation library

CREATE OR REPLACE FUNCTION public.get_schema_columns(p_table_name text DEFAULT NULL)
RETURNS TABLE (
  table_name text,
  column_name text,
  data_type text,
  udt_name text,
  is_nullable text,
  column_default text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    c.table_name::text,
    c.column_name::text,
    c.data_type::text,
    c.udt_name::text,
    c.is_nullable::text,
    c.column_default::text
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND (p_table_name IS NULL OR c.table_name = p_table_name)
  ORDER BY c.table_name, c.ordinal_position;
$$;

-- Grant execute to service role (used by LEO pipeline scripts)
GRANT EXECUTE ON FUNCTION public.get_schema_columns(text) TO service_role;

COMMENT ON FUNCTION public.get_schema_columns(text) IS
  'Returns public schema column metadata for pre-flight validation. Accepts optional table name filter. SD-LEO-ORCH-SELF-HEALING-DATABASE-001-B.';
