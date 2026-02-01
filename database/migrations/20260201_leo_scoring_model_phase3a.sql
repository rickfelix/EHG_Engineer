-- =============================================================================
-- LEO Scoring Model - Phase 3a: Data Schema
-- SD: SD-LEO-SELF-IMPROVE-001G
-- Purpose: Create deterministic, versioned scoring rubric schema and
--          prioritization configuration for stable, replayable prioritization
-- =============================================================================

-- Enable pgcrypto for SHA-256 checksum and UUID generation
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =============================================================================
-- FR-1: leo_scoring_rubrics - Versioned, immutable rubrics for scoring dimensions
-- =============================================================================

CREATE TABLE IF NOT EXISTS leo_scoring_rubrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rubric_key TEXT NOT NULL,
    version INT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'deprecated')),
    dimensions JSONB NOT NULL,
    normalization_rules JSONB NOT NULL,
    stability_rules JSONB NOT NULL,
    dedupe_merge_confidence_rules JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by UUID NOT NULL,
    checksum TEXT NOT NULL,
    supersedes_rubric_id UUID NULL REFERENCES leo_scoring_rubrics(id) ON DELETE SET NULL,
    notes TEXT NULL,
    CONSTRAINT uq_leo_scoring_rubrics_key_version UNIQUE (rubric_key, version)
);

-- Index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_leo_scoring_rubrics_key_status
    ON leo_scoring_rubrics (rubric_key, status);
CREATE INDEX IF NOT EXISTS idx_leo_scoring_rubrics_checksum
    ON leo_scoring_rubrics (checksum);

-- Comment for documentation
COMMENT ON TABLE leo_scoring_rubrics IS
    'Versioned, immutable scoring rubrics for deterministic prioritization. SD: SD-LEO-SELF-IMPROVE-001G';

-- =============================================================================
-- FR-4: Validation function for rubric JSONB fields
-- =============================================================================

CREATE OR REPLACE FUNCTION validate_rubric_json(
    p_dimensions JSONB,
    p_normalization_rules JSONB,
    p_stability_rules JSONB,
    p_dedupe_rules JSONB
)
RETURNS BOOLEAN AS $$
DECLARE
    required_dimensions TEXT[] := ARRAY['value', 'alignment', 'risk', 'effort', 'dependency', 'confidence'];
    dim_key TEXT;
    dim_value JSONB;
    extra_keys TEXT[];
    mode_value TEXT;
BEGIN
    -- Validate dimensions contains exactly required keys
    FOR dim_key IN SELECT jsonb_object_keys(p_dimensions)
    LOOP
        IF NOT dim_key = ANY(required_dimensions) THEN
            RAISE EXCEPTION 'invalid_rubric_dimensions: Unexpected key "%" in dimensions. Allowed: %',
                dim_key, array_to_string(required_dimensions, ', ');
        END IF;
    END LOOP;

    -- Check all required keys exist
    FOREACH dim_key IN ARRAY required_dimensions
    LOOP
        IF NOT p_dimensions ? dim_key THEN
            RAISE EXCEPTION 'invalid_rubric_dimensions: Missing required key "%" in dimensions', dim_key;
        END IF;
    END LOOP;

    -- Validate normalization_rules
    mode_value := p_normalization_rules->>'mode';
    IF mode_value IS NOT NULL AND mode_value NOT IN ('none', 'linear_0_100', 'zscore_clipped') THEN
        RAISE EXCEPTION 'invalid_normalization_rules: mode must be one of (none, linear_0_100, zscore_clipped), got %', mode_value;
    END IF;

    -- Validate missing_value_policy if present
    IF p_normalization_rules ? 'missing_value_policy' THEN
        IF (p_normalization_rules->>'missing_value_policy') NOT IN ('error', 'impute_zero', 'impute_midpoint') THEN
            RAISE EXCEPTION 'invalid_normalization_rules: missing_value_policy must be one of (error, impute_zero, impute_midpoint)';
        END IF;
    END IF;

    -- Validate stability_rules.tie_breaker_order if present
    IF p_stability_rules ? 'tie_breaker_order' THEN
        FOR dim_key IN SELECT jsonb_array_elements_text(p_stability_rules->'tie_breaker_order')
        LOOP
            IF NOT dim_key = ANY(required_dimensions) THEN
                RAISE EXCEPTION 'invalid_stability_rules: tie_breaker_order contains invalid dimension "%"', dim_key;
            END IF;
        END LOOP;
    END IF;

    -- Validate dedupe_merge_confidence_rules thresholds if present
    IF p_dedupe_rules != '{}'::jsonb THEN
        IF p_dedupe_rules ? 'threshold_auto_merge' AND p_dedupe_rules ? 'threshold_needs_review' THEN
            IF (p_dedupe_rules->>'threshold_auto_merge')::numeric < (p_dedupe_rules->>'threshold_needs_review')::numeric THEN
                RAISE EXCEPTION 'invalid_dedupe_rules: threshold_auto_merge (%) must be >= threshold_needs_review (%)',
                    p_dedupe_rules->>'threshold_auto_merge', p_dedupe_rules->>'threshold_needs_review';
            END IF;
        END IF;
    END IF;

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- =============================================================================
-- Checksum computation function (deterministic SHA-256)
-- =============================================================================

CREATE OR REPLACE FUNCTION compute_rubric_checksum(
    p_rubric_key TEXT,
    p_version INT,
    p_dimensions JSONB,
    p_normalization_rules JSONB,
    p_stability_rules JSONB,
    p_dedupe_rules JSONB
)
RETURNS TEXT AS $$
DECLARE
    canonical_input TEXT;
BEGIN
    -- Build canonical input string with stable JSON key ordering
    canonical_input := p_rubric_key || ':' || p_version::text || ':' ||
        (SELECT string_agg(kv.key || '=' || kv.value::text, ',' ORDER BY kv.key)
         FROM jsonb_each(p_dimensions) AS kv) || ':' ||
        (SELECT string_agg(kv.key || '=' || kv.value::text, ',' ORDER BY kv.key)
         FROM jsonb_each(p_normalization_rules) AS kv) || ':' ||
        (SELECT string_agg(kv.key || '=' || kv.value::text, ',' ORDER BY kv.key)
         FROM jsonb_each(p_stability_rules) AS kv) || ':' ||
        (SELECT string_agg(kv.key || '=' || kv.value::text, ',' ORDER BY kv.key)
         FROM jsonb_each(p_dedupe_rules) AS kv);

    RETURN encode(digest(canonical_input, 'sha256'), 'hex');
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- =============================================================================
-- Validation trigger for leo_scoring_rubrics
-- =============================================================================

CREATE OR REPLACE FUNCTION leo_scoring_rubrics_validate()
RETURNS TRIGGER AS $$
DECLARE
    expected_checksum TEXT;
BEGIN
    -- Validate JSONB fields
    PERFORM validate_rubric_json(
        NEW.dimensions,
        NEW.normalization_rules,
        NEW.stability_rules,
        NEW.dedupe_merge_confidence_rules
    );

    -- Compute expected checksum
    expected_checksum := compute_rubric_checksum(
        NEW.rubric_key,
        NEW.version,
        NEW.dimensions,
        NEW.normalization_rules,
        NEW.stability_rules,
        NEW.dedupe_merge_confidence_rules
    );

    -- Validate checksum matches (for INSERT, auto-compute if not provided correctly)
    IF TG_OP = 'INSERT' THEN
        -- Auto-compute checksum on INSERT
        NEW.checksum := expected_checksum;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_leo_scoring_rubrics_validate ON leo_scoring_rubrics;
CREATE TRIGGER trg_leo_scoring_rubrics_validate
    BEFORE INSERT ON leo_scoring_rubrics
    FOR EACH ROW
    EXECUTE FUNCTION leo_scoring_rubrics_validate();

-- =============================================================================
-- TR-2: Immutability trigger - Block UPDATE/DELETE for non-admin roles
-- =============================================================================

CREATE OR REPLACE FUNCTION leo_scoring_rubrics_immutable()
RETURNS TRIGGER AS $$
BEGIN
    -- Check if current role is leo_admin (privileged role)
    IF current_setting('role', true) = 'leo_admin' OR
       current_setting('request.jwt.claims', true)::jsonb->>'role' = 'service_role' THEN
        -- Allow admin operations
        IF TG_OP = 'DELETE' THEN
            RETURN OLD;
        END IF;
        RETURN NEW;
    END IF;

    -- Block all modifications for non-admin
    RAISE EXCEPTION 'rubric_immutable: UPDATE and DELETE operations are blocked on leo_scoring_rubrics. Rubric versions are immutable once created. SQLSTATE=42501';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_leo_scoring_rubrics_immutable_update ON leo_scoring_rubrics;
CREATE TRIGGER trg_leo_scoring_rubrics_immutable_update
    BEFORE UPDATE ON leo_scoring_rubrics
    FOR EACH ROW
    EXECUTE FUNCTION leo_scoring_rubrics_immutable();

DROP TRIGGER IF EXISTS trg_leo_scoring_rubrics_immutable_delete ON leo_scoring_rubrics;
CREATE TRIGGER trg_leo_scoring_rubrics_immutable_delete
    BEFORE DELETE ON leo_scoring_rubrics
    FOR EACH ROW
    EXECUTE FUNCTION leo_scoring_rubrics_immutable();

-- =============================================================================
-- FR-2: leo_scoring_prioritization_config - Active rubric selection and settings
-- (Named differently to avoid conflict with existing leo_prioritization_config)
-- =============================================================================

CREATE TABLE IF NOT EXISTS leo_scoring_prioritization_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scope_type TEXT NOT NULL CHECK (scope_type IN ('application', 'workspace', 'global')),
    scope_id UUID NULL,
    active_rubric_id UUID NOT NULL REFERENCES leo_scoring_rubrics(id) ON DELETE RESTRICT,
    weights JSONB NOT NULL,
    tie_breakers JSONB NOT NULL DEFAULT '[]'::jsonb,
    normalization_mode TEXT NOT NULL DEFAULT 'linear_0_100' CHECK (normalization_mode IN ('none', 'linear_0_100', 'zscore_clipped')),
    score_rounding INT NOT NULL DEFAULT 2 CHECK (score_rounding BETWEEN 0 AND 6),
    deterministic_seed TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by UUID NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by UUID NOT NULL
);

-- Unique constraint: one active config per (scope_type, scope_id)
-- For 'global' scope, scope_id must be NULL
CREATE UNIQUE INDEX IF NOT EXISTS idx_leo_scoring_prio_config_scope
    ON leo_scoring_prioritization_config (scope_type, COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- Partial unique index for global scope (only one global config allowed)
CREATE UNIQUE INDEX IF NOT EXISTS idx_leo_scoring_prio_config_global
    ON leo_scoring_prioritization_config (scope_type) WHERE scope_type = 'global';

COMMENT ON TABLE leo_scoring_prioritization_config IS
    'Active rubric selection and deterministic scoring settings per scope. SD: SD-LEO-SELF-IMPROVE-001G';

-- =============================================================================
-- Validation function for prioritization config weights
-- =============================================================================

CREATE OR REPLACE FUNCTION validate_prioritization_weights(p_weights JSONB)
RETURNS BOOLEAN AS $$
DECLARE
    required_keys TEXT[] := ARRAY['value', 'alignment', 'risk', 'effort', 'dependency', 'confidence'];
    weight_key TEXT;
    weight_sum NUMERIC := 0;
BEGIN
    -- Check all required keys exist
    FOREACH weight_key IN ARRAY required_keys
    LOOP
        IF NOT p_weights ? weight_key THEN
            RAISE EXCEPTION 'invalid_weights: Missing required key "%" in weights', weight_key;
        END IF;

        -- Validate each weight is a number
        IF jsonb_typeof(p_weights->weight_key) != 'number' THEN
            RAISE EXCEPTION 'invalid_weights: Weight for "%" must be a number', weight_key;
        END IF;

        weight_sum := weight_sum + (p_weights->>weight_key)::numeric;
    END LOOP;

    -- Check for extra keys
    FOR weight_key IN SELECT jsonb_object_keys(p_weights)
    LOOP
        IF NOT weight_key = ANY(required_keys) THEN
            RAISE EXCEPTION 'invalid_weights: Unexpected key "%" in weights', weight_key;
        END IF;
    END LOOP;

    -- Validate weights sum to 1.0 (with small tolerance)
    IF ABS(weight_sum - 1.0) > 0.0001 THEN
        RAISE EXCEPTION 'invalid_weights: Weights must sum to 1.0, got %', weight_sum;
    END IF;

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- =============================================================================
-- Validation and auto-update trigger for config
-- =============================================================================

CREATE OR REPLACE FUNCTION leo_scoring_prio_config_validate()
RETURNS TRIGGER AS $$
BEGIN
    -- Validate weights
    PERFORM validate_prioritization_weights(NEW.weights);

    -- Enforce global scope_id must be NULL
    IF NEW.scope_type = 'global' AND NEW.scope_id IS NOT NULL THEN
        RAISE EXCEPTION 'invalid_scope: For scope_type=global, scope_id must be NULL';
    END IF;

    -- Auto-update timestamp
    IF TG_OP = 'UPDATE' THEN
        NEW.updated_at := now();
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_leo_scoring_prio_config_validate ON leo_scoring_prioritization_config;
CREATE TRIGGER trg_leo_scoring_prio_config_validate
    BEFORE INSERT OR UPDATE ON leo_scoring_prioritization_config
    FOR EACH ROW
    EXECUTE FUNCTION leo_scoring_prio_config_validate();

-- =============================================================================
-- FR-3: Add scoring metadata columns to leo_protocol_sections
-- =============================================================================

-- Add columns only if they don't exist (idempotent)
DO $$
BEGIN
    -- scoring_rubric_id
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'leo_protocol_sections' AND column_name = 'scoring_rubric_id'
    ) THEN
        ALTER TABLE leo_protocol_sections ADD COLUMN scoring_rubric_id UUID NULL;
    END IF;

    -- scoring_input
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'leo_protocol_sections' AND column_name = 'scoring_input'
    ) THEN
        ALTER TABLE leo_protocol_sections ADD COLUMN scoring_input JSONB NULL;
    END IF;

    -- scoring_output
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'leo_protocol_sections' AND column_name = 'scoring_output'
    ) THEN
        ALTER TABLE leo_protocol_sections ADD COLUMN scoring_output JSONB NULL;
    END IF;

    -- scoring_total
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'leo_protocol_sections' AND column_name = 'scoring_total'
    ) THEN
        ALTER TABLE leo_protocol_sections ADD COLUMN scoring_total NUMERIC(6,2) NULL;
    END IF;

    -- scoring_normalized_total
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'leo_protocol_sections' AND column_name = 'scoring_normalized_total'
    ) THEN
        ALTER TABLE leo_protocol_sections ADD COLUMN scoring_normalized_total NUMERIC(6,2) NULL;
    END IF;

    -- scoring_computed_at
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'leo_protocol_sections' AND column_name = 'scoring_computed_at'
    ) THEN
        ALTER TABLE leo_protocol_sections ADD COLUMN scoring_computed_at TIMESTAMPTZ NULL;
    END IF;

    -- scoring_computed_by
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'leo_protocol_sections' AND column_name = 'scoring_computed_by'
    ) THEN
        ALTER TABLE leo_protocol_sections ADD COLUMN scoring_computed_by UUID NULL;
    END IF;
END $$;

-- Add FK constraint (if table and column exist)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables WHERE table_name = 'leo_protocol_sections'
    ) AND EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'leo_protocol_sections' AND column_name = 'scoring_rubric_id'
    ) THEN
        -- Drop if exists, then recreate
        ALTER TABLE leo_protocol_sections
            DROP CONSTRAINT IF EXISTS fk_leo_protocol_sections_scoring_rubric;

        ALTER TABLE leo_protocol_sections
            ADD CONSTRAINT fk_leo_protocol_sections_scoring_rubric
            FOREIGN KEY (scoring_rubric_id) REFERENCES leo_scoring_rubrics(id) ON DELETE SET NULL;
    END IF;
END $$;

-- Add CHECK constraint: if scoring_rubric_id is set, scoring_computed_at must be non-null
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables WHERE table_name = 'leo_protocol_sections'
    ) THEN
        ALTER TABLE leo_protocol_sections
            DROP CONSTRAINT IF EXISTS chk_scoring_provenance;

        ALTER TABLE leo_protocol_sections
            ADD CONSTRAINT chk_scoring_provenance
            CHECK (scoring_rubric_id IS NULL OR scoring_computed_at IS NOT NULL);
    END IF;
END $$;

-- =============================================================================
-- TR-3: Deterministic scoring function - score_proposal
-- =============================================================================

CREATE OR REPLACE FUNCTION score_proposal(
    p_scoring_input JSONB,
    p_config_id UUID
)
RETURNS TABLE (
    scoring_output JSONB,
    scoring_total NUMERIC(6,2),
    scoring_normalized_total NUMERIC(6,2),
    rubric_id UUID,
    checksum TEXT
) AS $$
DECLARE
    v_config RECORD;
    v_rubric RECORD;
    v_dim_key TEXT;
    v_raw_score NUMERIC;
    v_weight NUMERIC;
    v_weighted_sum NUMERIC := 0;
    v_normalized_sum NUMERIC := 0;
    v_norm_score NUMERIC;
    v_clip_min NUMERIC;
    v_clip_max NUMERIC;
    v_rounding INT;
    v_scores JSONB := '{}'::jsonb;
    v_canonical_output TEXT;
BEGIN
    -- Load config
    SELECT * INTO v_config FROM leo_scoring_prioritization_config WHERE id = p_config_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'config_not_found: No config found with id %', p_config_id;
    END IF;

    -- Load rubric
    SELECT * INTO v_rubric FROM leo_scoring_rubrics WHERE id = v_config.active_rubric_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'rubric_not_found: No rubric found with id %', v_config.active_rubric_id;
    END IF;

    -- Get normalization params
    v_clip_min := COALESCE((v_rubric.normalization_rules->>'clip_min')::numeric, 0);
    v_clip_max := COALESCE((v_rubric.normalization_rules->>'clip_max')::numeric, 100);
    v_rounding := COALESCE(v_config.score_rounding, 2);

    -- Process each dimension
    FOR v_dim_key IN SELECT jsonb_object_keys(v_rubric.dimensions)
    LOOP
        -- Get raw score from input
        IF p_scoring_input ? v_dim_key THEN
            v_raw_score := (p_scoring_input->>v_dim_key)::numeric;
        ELSE
            -- Handle missing value per policy
            CASE v_rubric.normalization_rules->>'missing_value_policy'
                WHEN 'impute_zero' THEN v_raw_score := 0;
                WHEN 'impute_midpoint' THEN v_raw_score := (v_clip_min + v_clip_max) / 2;
                ELSE RAISE EXCEPTION 'missing_input: Required dimension "%" not found in scoring_input', v_dim_key;
            END CASE;
        END IF;

        -- Get weight
        v_weight := (v_config.weights->>v_dim_key)::numeric;

        -- Apply normalization based on mode
        CASE v_config.normalization_mode
            WHEN 'none' THEN
                v_norm_score := v_raw_score;
            WHEN 'linear_0_100' THEN
                -- Clip and scale to 0-100
                v_norm_score := GREATEST(v_clip_min, LEAST(v_clip_max, v_raw_score));
            WHEN 'zscore_clipped' THEN
                -- For simplicity, clip to range (full zscore would need population stats)
                v_norm_score := GREATEST(v_clip_min, LEAST(v_clip_max, v_raw_score));
            ELSE
                v_norm_score := v_raw_score;
        END CASE;

        -- Round per configuration
        v_norm_score := ROUND(v_norm_score, v_rounding);
        v_raw_score := ROUND(v_raw_score, v_rounding);

        -- Compute weighted contributions
        v_weighted_sum := v_weighted_sum + (v_raw_score * v_weight);
        v_normalized_sum := v_normalized_sum + (v_norm_score * v_weight);

        -- Build output JSON (canonical key order will be handled later)
        v_scores := v_scores || jsonb_build_object(
            v_dim_key, jsonb_build_object(
                'raw', v_raw_score,
                'normalized', v_norm_score,
                'weight', v_weight,
                'weighted_raw', ROUND(v_raw_score * v_weight, v_rounding),
                'weighted_normalized', ROUND(v_norm_score * v_weight, v_rounding)
            )
        );
    END LOOP;

    -- Build final output with canonical ordering
    scoring_output := jsonb_build_object(
        'alignment', v_scores->'alignment',
        'confidence', v_scores->'confidence',
        'dependency', v_scores->'dependency',
        'effort', v_scores->'effort',
        'risk', v_scores->'risk',
        'value', v_scores->'value'
    );

    scoring_total := ROUND(v_weighted_sum, v_rounding);
    scoring_normalized_total := ROUND(v_normalized_sum, v_rounding);
    rubric_id := v_rubric.id;

    -- Compute checksum for output verification
    v_canonical_output := scoring_output::text || ':' || scoring_total::text || ':' || scoring_normalized_total::text;
    checksum := encode(digest(v_canonical_output, 'sha256'), 'hex');

    RETURN NEXT;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION score_proposal IS
    'Deterministic scoring function. Returns identical outputs for identical inputs. SD: SD-LEO-SELF-IMPROVE-001G';

-- =============================================================================
-- FR-5: Merge confidence scoring function
-- =============================================================================

CREATE OR REPLACE FUNCTION score_merge_confidence(
    p_candidate_a JSONB,
    p_candidate_b JSONB,
    p_rubric_id UUID
)
RETURNS TABLE (
    confidence NUMERIC(5,2),
    decision TEXT,
    explanation JSONB
) AS $$
DECLARE
    v_rubric RECORD;
    v_rules JSONB;
    v_field RECORD;
    v_total_weight NUMERIC := 0;
    v_weighted_match NUMERIC := 0;
    v_match_score NUMERIC;
    v_field_explanations JSONB := '[]'::jsonb;
    v_threshold_auto NUMERIC;
    v_threshold_review NUMERIC;
    v_threshold_reject NUMERIC;
    v_explainability BOOLEAN;
BEGIN
    -- Load rubric
    SELECT * INTO v_rubric FROM leo_scoring_rubrics WHERE id = p_rubric_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'rubric_not_found: No rubric found with id %', p_rubric_id;
    END IF;

    v_rules := v_rubric.dedupe_merge_confidence_rules;

    -- Get thresholds
    v_threshold_auto := COALESCE((v_rules->>'threshold_auto_merge')::numeric, 90);
    v_threshold_review := COALESCE((v_rules->>'threshold_needs_review')::numeric, 70);
    v_threshold_reject := COALESCE((v_rules->>'threshold_reject')::numeric, 0);
    v_explainability := COALESCE((v_rules->>'explainability')::boolean, false);

    -- Process each field in dedupe rules
    FOR v_field IN SELECT * FROM jsonb_array_elements(v_rules->'fields')
    LOOP
        v_total_weight := v_total_weight + COALESCE((v_field.value->>'weight')::numeric, 1);

        -- Compare fields based on comparator
        CASE v_field.value->>'comparator'
            WHEN 'exact' THEN
                IF p_candidate_a->(v_field.value->>'field_name') = p_candidate_b->(v_field.value->>'field_name') THEN
                    v_match_score := 100;
                ELSE
                    v_match_score := 0;
                END IF;
            WHEN 'fuzzy' THEN
                -- Simple fuzzy: compare text similarity (would need pg_trgm for real fuzzy)
                IF LOWER(p_candidate_a->>(v_field.value->>'field_name')) = LOWER(p_candidate_b->>(v_field.value->>'field_name')) THEN
                    v_match_score := 100;
                ELSE
                    v_match_score := 0;
                END IF;
            WHEN 'numeric_tolerance' THEN
                -- Numeric comparison with tolerance
                IF ABS(
                    COALESCE((p_candidate_a->>(v_field.value->>'field_name'))::numeric, 0) -
                    COALESCE((p_candidate_b->>(v_field.value->>'field_name'))::numeric, 0)
                ) <= COALESCE((v_field.value->>'tolerance')::numeric, 0) THEN
                    v_match_score := 100;
                ELSE
                    v_match_score := 0;
                END IF;
            ELSE
                -- Default: exact match
                IF p_candidate_a->(v_field.value->>'field_name') = p_candidate_b->(v_field.value->>'field_name') THEN
                    v_match_score := 100;
                ELSE
                    v_match_score := 0;
                END IF;
        END CASE;

        v_weighted_match := v_weighted_match + (v_match_score * COALESCE((v_field.value->>'weight')::numeric, 1));

        -- Build explanation if enabled
        IF v_explainability THEN
            v_field_explanations := v_field_explanations || jsonb_build_array(
                jsonb_build_object(
                    'field', v_field.value->>'field_name',
                    'match_score', v_match_score,
                    'weight', COALESCE((v_field.value->>'weight')::numeric, 1),
                    'contribution', ROUND(v_match_score * COALESCE((v_field.value->>'weight')::numeric, 1) / NULLIF(v_total_weight, 0), 2)
                )
            );
        END IF;
    END LOOP;

    -- Calculate final confidence
    IF v_total_weight > 0 THEN
        confidence := ROUND(v_weighted_match / v_total_weight, 2);
    ELSE
        confidence := 0;
    END IF;

    -- Determine decision based on thresholds
    IF confidence >= v_threshold_auto THEN
        decision := 'auto_merge';
    ELSIF confidence >= v_threshold_review THEN
        decision := 'needs_review';
    ELSE
        decision := 'reject';
    END IF;

    -- Build explanation
    IF v_explainability THEN
        explanation := jsonb_build_object(
            'field_contributions', v_field_explanations,
            'total_weight', v_total_weight,
            'weighted_match', v_weighted_match,
            'final_confidence', confidence,
            'thresholds', jsonb_build_object(
                'auto_merge', v_threshold_auto,
                'needs_review', v_threshold_review,
                'reject', v_threshold_reject
            )
        );
    ELSE
        explanation := NULL;
    END IF;

    RETURN NEXT;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION score_merge_confidence IS
    'Deterministic merge-confidence scoring for deduplication. SD: SD-LEO-SELF-IMPROVE-001G';

-- =============================================================================
-- RLS Policies
-- =============================================================================

-- Enable RLS
ALTER TABLE leo_scoring_rubrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE leo_scoring_prioritization_config ENABLE ROW LEVEL SECURITY;

-- Service role full access
CREATE POLICY "Service role full access to leo_scoring_rubrics"
    ON leo_scoring_rubrics FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Service role full access to leo_scoring_prioritization_config"
    ON leo_scoring_prioritization_config FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

-- Anon read access for published rubrics
CREATE POLICY "Anon can read published scoring rubrics"
    ON leo_scoring_rubrics FOR SELECT
    USING (status = 'published');

-- Anon read access for config
CREATE POLICY "Anon can read scoring prioritization config"
    ON leo_scoring_prioritization_config FOR SELECT
    USING (true);

-- =============================================================================
-- Seed data: Default rubric and config for testing
-- =============================================================================

-- Insert a default rubric (will be used for testing)
INSERT INTO leo_scoring_rubrics (
    rubric_key,
    version,
    status,
    dimensions,
    normalization_rules,
    stability_rules,
    dedupe_merge_confidence_rules,
    created_by,
    checksum
) VALUES (
    'prioritization_v1',
    1,
    'published',
    '{
        "value": {"description": "Business value delivered", "min": 0, "max": 100},
        "alignment": {"description": "Strategic alignment score", "min": 0, "max": 100},
        "risk": {"description": "Risk level (lower is better)", "min": 0, "max": 100},
        "effort": {"description": "Implementation effort (lower is better)", "min": 0, "max": 100},
        "dependency": {"description": "Dependency complexity (lower is better)", "min": 0, "max": 100},
        "confidence": {"description": "Estimation confidence", "min": 0, "max": 100}
    }'::jsonb,
    '{
        "mode": "linear_0_100",
        "clip_min": 0,
        "clip_max": 100,
        "rounding_decimals": 2,
        "missing_value_policy": "impute_midpoint"
    }'::jsonb,
    '{
        "max_rank_delta_per_revision": 5,
        "min_score_delta_to_reorder": 0.5,
        "tie_breaker_order": ["value", "alignment", "risk"],
        "deterministic_rounding": true
    }'::jsonb,
    '{
        "fields": [
            {"field_name": "title", "weight": 3, "comparator": "fuzzy"},
            {"field_name": "category", "weight": 2, "comparator": "exact"},
            {"field_name": "priority", "weight": 1, "comparator": "exact"}
        ],
        "threshold_auto_merge": 90,
        "threshold_needs_review": 70,
        "threshold_reject": 30,
        "explainability": true
    }'::jsonb,
    '00000000-0000-0000-0000-000000000000'::uuid,
    'placeholder' -- Will be auto-computed by trigger
) ON CONFLICT (rubric_key, version) DO NOTHING;

-- Insert default global config
INSERT INTO leo_scoring_prioritization_config (
    scope_type,
    scope_id,
    active_rubric_id,
    weights,
    tie_breakers,
    normalization_mode,
    score_rounding,
    created_by,
    updated_by
)
SELECT
    'global',
    NULL,
    r.id,
    '{
        "value": 0.25,
        "alignment": 0.20,
        "risk": 0.15,
        "effort": 0.15,
        "dependency": 0.10,
        "confidence": 0.15
    }'::jsonb,
    '["value", "alignment", "risk"]'::jsonb,
    'linear_0_100',
    2,
    '00000000-0000-0000-0000-000000000000'::uuid,
    '00000000-0000-0000-0000-000000000000'::uuid
FROM leo_scoring_rubrics r
WHERE r.rubric_key = 'prioritization_v1' AND r.version = 1
ON CONFLICT DO NOTHING;

-- =============================================================================
-- Completion marker
-- =============================================================================
COMMENT ON TABLE leo_scoring_rubrics IS
    'Versioned, immutable scoring rubrics for deterministic prioritization. SD: SD-LEO-SELF-IMPROVE-001G Phase 3a';
COMMENT ON TABLE leo_scoring_prioritization_config IS
    'Active rubric selection and deterministic scoring settings per scope. SD: SD-LEO-SELF-IMPROVE-001G Phase 3a';
