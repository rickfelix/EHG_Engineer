DROP FUNCTION IF EXISTS match_sub_agents_hybrid(vector, jsonb, float, float, float, int);

CREATE OR REPLACE FUNCTION match_sub_agents_hybrid(
  query_embedding vector(1536),
  keyword_matches jsonb DEFAULT '{}'::jsonb,
  semantic_weight float DEFAULT 0.6,
  keyword_weight float DEFAULT 0.4,
  match_threshold float DEFAULT 0.6,
  match_count int DEFAULT 10
)
RETURNS TABLE (
  id uuid,
  code text,
  name text,
  priority integer,
  semantic_score float,
  keyword_score float,
  combined_score float,
  keyword_match_count int
)
LANGUAGE plpgsql
AS $$
DECLARE
  max_keyword_matches int;
BEGIN
  SELECT COALESCE(MAX((value)::int), 1)
  INTO max_keyword_matches
  FROM jsonb_each_text(keyword_matches);

  RETURN QUERY
  SELECT
    sa.id,
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
$$;

DROP FUNCTION IF EXISTS match_sub_agents_semantic(vector, float, int);

CREATE OR REPLACE FUNCTION match_sub_agents_semantic(
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.7,
  match_count int DEFAULT 10
)
RETURNS TABLE (
  id uuid,
  code text,
  name text,
  priority integer,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    sa.id,
    sa.code,
    sa.name,
    sa.priority,
    1 - (sa.domain_embedding <=> query_embedding) AS similarity
  FROM leo_sub_agents sa
  WHERE
    sa.active = true
    AND sa.domain_embedding IS NOT NULL
    AND 1 - (sa.domain_embedding <=> query_embedding) >= match_threshold
  ORDER BY
    sa.domain_embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
