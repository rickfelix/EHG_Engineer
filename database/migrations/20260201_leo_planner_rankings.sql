-- Migration: leo_planner_rankings table for Central Planner stability tracking
-- SD: SD-LEO-SELF-IMPROVE-001H (Phase 3b: Central Planner Orchestration)
-- Purpose: Store ranking outputs for stability comparison across planning cycles

-- Create the rankings storage table
CREATE TABLE IF NOT EXISTS leo_planner_rankings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    correlation_id TEXT NOT NULL,
    queue JSONB NOT NULL DEFAULT '[]'::jsonb,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    stability JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_leo_planner_rankings_created_at
    ON leo_planner_rankings (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_leo_planner_rankings_correlation_id
    ON leo_planner_rankings (correlation_id);

-- GIN index for JSONB queue searches
CREATE INDEX IF NOT EXISTS idx_leo_planner_rankings_queue_gin
    ON leo_planner_rankings USING GIN (queue);

-- Comment
COMMENT ON TABLE leo_planner_rankings IS 'Stores Central Planner output for stability tracking and audit';
COMMENT ON COLUMN leo_planner_rankings.queue IS 'Ordered list of ranked proposals (JSON array)';
COMMENT ON COLUMN leo_planner_rankings.stability IS 'Stability metrics comparing to previous ranking';

-- Retention policy: Keep last 30 days of rankings
-- Can be cleaned up via scheduled job
CREATE OR REPLACE FUNCTION cleanup_old_planner_rankings()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM leo_planner_rankings
    WHERE created_at < NOW() - INTERVAL '30 days';
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Grant permissions
GRANT ALL ON leo_planner_rankings TO authenticated;
GRANT ALL ON leo_planner_rankings TO service_role;

-- Register the prioritization_planner sub-agent
INSERT INTO leo_sub_agents (
    code,
    name,
    description,
    activation_type,
    priority,
    script_path,
    context_file,
    active,
    metadata,
    capabilities
) VALUES (
    'PRIORITIZATION_PLANNER',
    'Prioritization Planner',
    E'# Prioritization Planner Sub-Agent\n\n**Identity**: You are a Prioritization Planner that orchestrates proposal ranking, clustering, and deduplication.\n\n## Core Directive\n\nWhen invoked for prioritization tasks, aggregate proposals from multiple sources, cluster by theme, deduplicate, and rank with stability checks.\n\n## Invocation Commands\n\n### Run Planning Cycle\n```bash\nnode lib/planner/central-planner.js\n```\n\n### Dry Run (no persistence)\n```bash\nnode lib/planner/central-planner.js --dry-run\n```\n\n### JSON Output\n```bash\nnode lib/planner/central-planner.js --json\n```\n\n## When to Use\n\n- Before /leo assist processes inbox\n- When feedback queue exceeds 20 items\n- After batch retrospective creation\n- Weekly planning cycles\n\n## Output\n\nProduces JSON conforming to prioritization_planner_output.schema.json with:\n- Ranked queue of proposals\n- Theme clusters\n- Deduplication summary\n- Stability metrics\n\n## Success Metrics\n\n- Ranking consistency: ≥85%\n- Deduplication reduction: ≥30%\n- Human alignment rate: ≥70%',
    'manual',
    50,
    'lib/planner/central-planner.js',
    NULL,
    TRUE,
    jsonb_build_object(
        'version', '1.0.0',
        'sd_id', 'SD-LEO-SELF-IMPROVE-001H',
        'output_schema', 'docs/schemas/prioritization_planner_output.schema.json',
        'trigger_keywords', '["prioritization", "ranking", "cluster proposals", "deduplicate feedback", "planning cycle", "queue ordering", "proposal ranking", "theme clustering", "stability check", "human alignment"]'::jsonb
    ),
    '["clustering", "deduplication", "ranking", "stability_checks", "proposal_aggregation"]'::jsonb
) ON CONFLICT (code) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    script_path = EXCLUDED.script_path,
    active = EXCLUDED.active,
    metadata = EXCLUDED.metadata,
    capabilities = EXCLUDED.capabilities;

-- Verify insertion
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM leo_sub_agents WHERE code = 'PRIORITIZATION_PLANNER') THEN
        RAISE EXCEPTION 'Failed to insert PRIORITIZATION_PLANNER sub-agent';
    END IF;
    RAISE NOTICE 'Successfully created leo_planner_rankings table and registered PRIORITIZATION_PLANNER sub-agent';
END $$;
