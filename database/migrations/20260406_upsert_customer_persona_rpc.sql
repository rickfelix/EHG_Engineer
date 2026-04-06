-- Migration: Create upsert_customer_persona RPC function
-- SD: SD-MAN-FIX-FIX-CUSTOMER-PERSONAS-001
-- Purpose: Fix customer_personas upsert failure caused by PostgREST's inability
--          to resolve expression-based partial unique indexes.
--          The idx_customer_personas_canonical index uses COALESCE(industry, '')
--          which .upsert() cannot target via onConflict parameter.

CREATE OR REPLACE FUNCTION public.upsert_customer_persona(
  p_name text,
  p_demographics jsonb DEFAULT '{}'::jsonb,
  p_goals text[] DEFAULT '{}'::text[],
  p_pain_points text[] DEFAULT '{}'::text[],
  p_psychographics jsonb DEFAULT '{}'::jsonb,
  p_industry text DEFAULT '',
  p_source_venture_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO customer_personas (name, demographics, goals, pain_points, psychographics, industry, source_venture_id)
  VALUES (p_name, p_demographics, p_goals, p_pain_points, p_psychographics, p_industry, p_source_venture_id)
  ON CONFLICT (name, COALESCE(industry, '')) WHERE canonical_id IS NULL
  DO UPDATE SET
    demographics = EXCLUDED.demographics,
    goals = EXCLUDED.goals,
    pain_points = EXCLUDED.pain_points,
    psychographics = EXCLUDED.psychographics,
    source_venture_id = EXCLUDED.source_venture_id
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- Grant execute to service_role (used by stage worker)
GRANT EXECUTE ON FUNCTION public.upsert_customer_persona(text, jsonb, text[], text[], jsonb, text, uuid) TO service_role;

COMMENT ON FUNCTION public.upsert_customer_persona IS 'Upsert a customer persona using the expression-based partial unique index idx_customer_personas_canonical. Required because PostgREST/Supabase JS .upsert() cannot resolve ON CONFLICT with COALESCE expressions.';
