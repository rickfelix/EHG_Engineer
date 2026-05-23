-- QF-20260523-684 / harness_backlog 1b16cf7e
-- Fix: match_sub_agents_hybrid RETURNS TABLE declared `id uuid`, but
-- leo_sub_agents.id is `character varying`. At runtime RETURN QUERY raised
-- "structure of query does not match function result type", disabling hybrid
-- sub-agent selection (it fell back to keyword-only) and logging noise at
-- PLAN-TO-LEAD / LEAD_FINAL. Declare `id text` and select sa.id::text so the
-- result structure matches the actual column type. The JS consumer
-- (lib/modules/context-aware-selector/hybrid-matching.js) does not use `id`.
-- Idempotent: DROP IF EXISTS + CREATE. A bare CREATE OR REPLACE cannot be used
-- here because PostgreSQL forbids changing a function's return type in place
-- (ERROR 42P13: cannot change return type of existing function). The function is
-- a utility RPC with no dependent objects, so DROP is safe.

DROP FUNCTION IF EXISTS public.match_sub_agents_hybrid(
  vector, jsonb, double precision, double precision, double precision, integer
);

CREATE FUNCTION public.match_sub_agents_hybrid(
  query_embedding vector,
  keyword_matches jsonb DEFAULT '{}'::jsonb,
  semantic_weight double precision DEFAULT 0.6,
  keyword_weight double precision DEFAULT 0.4,
  match_threshold double precision DEFAULT 0.6,
  match_count integer DEFAULT 10
)
RETURNS TABLE(
  id text,
  code text,
  name text,
  priority integer,
  semantic_score double precision,
  keyword_score double precision,
  combined_score double precision,
  keyword_match_count integer
)
LANGUAGE plpgsql
AS $function$
  DECLARE
    max_keyword_matches int;
  BEGIN
    SELECT COALESCE(MAX((value)::int), 1)
    INTO max_keyword_matches
    FROM jsonb_each_text(keyword_matches);

    RETURN QUERY
    SELECT
      sa.id::text,
      sa.code,
      sa.name,
      sa.priority,
      (1 - (sa.domain_embedding <=> query_embedding))::float AS semantic_score,
      COALESCE(
        ((keyword_matches->>sa.code)::float / max_keyword_matches),
        0
      )::float AS keyword_score,
      (
        semantic_weight * (1 - (sa.domain_embedding <=> query_embedding)) +
        keyword_weight * COALESCE(
          ((keyword_matches->>sa.code)::float / max_keyword_matches),
          0
        )
      )::float AS combined_score,
      COALESCE((keyword_matches->>sa.code)::int, 0) AS keyword_match_count
    FROM leo_sub_agents sa
    WHERE
      sa.active = true
      AND sa.domain_embedding IS NOT NULL
      AND (
        semantic_weight * (1 - (sa.domain_embedding <=> query_embedding)) +
        keyword_weight * COALESCE(
          ((keyword_matches->>sa.code)::float / max_keyword_matches),
          0
        )
      ) >= match_threshold
    ORDER BY
      combined_score DESC,
      sa.priority DESC
    LIMIT match_count;
  END;
$function$;
