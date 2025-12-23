-- Migration: Strip Nested Findings Trigger
-- Purpose: Prevent recursive snowballing in sub_agent_execution_results.metadata
-- Created: 2025-12-23
-- Issue: Continuous Improvement Coach was storing previous CIC results in metadata.findings,
--        creating exponential growth (40 MB per record due to recursive nesting)
--
-- This trigger strips nested findings from metadata before INSERT/UPDATE,
-- acting as a safety net even if the application code fails to strip them.

-- Function to strip nested findings from metadata JSONB
CREATE OR REPLACE FUNCTION strip_nested_findings_from_metadata()
RETURNS TRIGGER AS $$
DECLARE
  metadata_size INTEGER;
  findings_path TEXT[] := ARRAY['findings', 'sub_agent_results', 'results'];
  has_nested_findings BOOLEAN;
BEGIN
  -- Skip if metadata is null or not an object
  IF NEW.metadata IS NULL OR jsonb_typeof(NEW.metadata) != 'object' THEN
    RETURN NEW;
  END IF;

  -- Check if metadata has nested findings (the problematic pattern)
  has_nested_findings := (
    NEW.metadata ? 'findings' AND
    NEW.metadata->'findings' ? 'sub_agent_results' AND
    NEW.metadata->'findings'->'sub_agent_results' ? 'results' AND
    jsonb_typeof(NEW.metadata->'findings'->'sub_agent_results'->'results') = 'array' AND
    jsonb_array_length(NEW.metadata->'findings'->'sub_agent_results'->'results') > 0
  );

  IF NOT has_nested_findings THEN
    RETURN NEW;
  END IF;

  -- Calculate current metadata size
  metadata_size := length(NEW.metadata::text);

  -- Only process if metadata is suspiciously large (> 100 KB)
  -- Normal metadata should be < 10 KB
  IF metadata_size < 100000 THEN
    RETURN NEW;
  END IF;

  -- Log the stripping action
  RAISE NOTICE 'strip_nested_findings_trigger: Stripping nested findings from % (% bytes -> estimated 1-5 KB)',
    NEW.sub_agent_name, metadata_size;

  -- Strip nested findings by replacing sub_agent_results.results with summary
  NEW.metadata := jsonb_set(
    NEW.metadata,
    '{findings,sub_agent_results}',
    jsonb_build_object(
      'count', jsonb_array_length(NEW.metadata->'findings'->'sub_agent_results'->'results'),
      'result_ids', (
        SELECT jsonb_agg(elem->>'id')
        FROM jsonb_array_elements(NEW.metadata->'findings'->'sub_agent_results'->'results') elem
        WHERE elem->>'id' IS NOT NULL
      ),
      'sub_agent_codes', (
        SELECT jsonb_agg(DISTINCT elem->>'sub_agent_code')
        FROM jsonb_array_elements(NEW.metadata->'findings'->'sub_agent_results'->'results') elem
        WHERE elem->>'sub_agent_code' IS NOT NULL
      ),
      '_stripped_by_trigger', true,
      '_stripped_at', to_jsonb(now()),
      '_original_size_bytes', metadata_size
    )
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add comment explaining the function
COMMENT ON FUNCTION strip_nested_findings_from_metadata() IS
  'Strips nested findings from sub_agent_execution_results.metadata to prevent recursive snowballing. '
  'The Continuous Improvement Coach was storing previous CIC results, causing exponential growth (40 MB per record). '
  'This trigger acts as a safety net, reducing storage from 40 MB to ~1-5 KB.';

-- Create trigger on sub_agent_execution_results
DROP TRIGGER IF EXISTS strip_nested_findings_trigger ON public.sub_agent_execution_results;

CREATE TRIGGER strip_nested_findings_trigger
  BEFORE INSERT OR UPDATE ON public.sub_agent_execution_results
  FOR EACH ROW
  EXECUTE FUNCTION strip_nested_findings_from_metadata();

-- Add comment explaining the trigger
COMMENT ON TRIGGER strip_nested_findings_trigger ON public.sub_agent_execution_results IS
  'Safety net trigger that strips nested findings from metadata before storage. '
  'Prevents recursive snowballing that caused 40 MB records. '
  'Only activates when metadata > 100 KB (normal metadata is < 10 KB).';

-- Verification query to check trigger is working
-- Run this after applying migration:
-- SELECT tgname, tgtype, tgenabled FROM pg_trigger WHERE tgrelid = 'public.sub_agent_execution_results'::regclass;
