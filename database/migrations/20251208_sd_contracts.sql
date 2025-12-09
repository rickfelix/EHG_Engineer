-- ============================================================================
-- MIGRATION: SD Data Contracts and UX Contracts
-- Created: 2025-12-08
-- Author: Claude Code (Architecture Enhancement)
--
-- Purpose: Implements parent-child SD contract system for enforcing consistency
--          across SD hierarchies. Data Contracts define schema boundaries,
--          UX Contracts define component/design boundaries.
--
-- Architectural Decisions:
--   - DATA_CONTRACT violations = BLOCKER (prevents completion)
--   - UX_CONTRACT violations = WARNING (allows override with justification)
--   - Contracts MANDATORY at each parent level (including sub-parents)
--   - Cultural design style STRICTLY INHERITED (no child overrides)
--
-- Reference: /home/rickf/.claude/plans/zazzy-sparking-planet.md
-- ============================================================================

-- ============================================================================
-- TABLE: sd_data_contracts
-- Purpose: Define schema boundaries for child SDs
-- ============================================================================
CREATE TABLE IF NOT EXISTS sd_data_contracts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parent_sd_id VARCHAR(50) NOT NULL REFERENCES strategic_directives_v2(id) ON DELETE CASCADE,
    contract_version INTEGER NOT NULL DEFAULT 1,

    -- Schema boundaries: what tables/columns children can touch
    allowed_tables TEXT[] NOT NULL,
    allowed_columns JSONB NOT NULL DEFAULT '{}'::jsonb,  -- { "table_name": ["col1", "col2"] }
    forbidden_operations TEXT[] NOT NULL DEFAULT ARRAY['DROP TABLE', 'TRUNCATE', 'DROP SCHEMA'],

    -- JSONB structure expectations for validation
    jsonb_schemas JSONB DEFAULT NULL,  -- { "table.column": { "type": "object|array", "required_keys": [] } }

    -- Type constraints inherited by all children
    column_types JSONB DEFAULT NULL,  -- { "table.column": "uuid|text|jsonb|timestamp" }

    -- Contract metadata
    description TEXT,
    rationale TEXT,  -- Why these boundaries exist
    created_by VARCHAR(100) DEFAULT 'system',

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Ensure one contract per parent SD per version
    CONSTRAINT unique_data_contract_version UNIQUE (parent_sd_id, contract_version)
);

-- Index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_data_contracts_parent_sd ON sd_data_contracts(parent_sd_id);

-- Comment
COMMENT ON TABLE sd_data_contracts IS
'Data contracts define schema boundaries for child SDs. Children can only touch
tables/columns explicitly allowed by their parent''s contract. Violations are BLOCKERs.
Reference: Consistency + Autonomy Architecture Plan';

-- ============================================================================
-- TABLE: sd_ux_contracts
-- Purpose: Define component/design boundaries for child SDs
-- ============================================================================
CREATE TABLE IF NOT EXISTS sd_ux_contracts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parent_sd_id VARCHAR(50) NOT NULL REFERENCES strategic_directives_v2(id) ON DELETE CASCADE,
    contract_version INTEGER NOT NULL DEFAULT 1,

    -- Component boundaries
    component_paths TEXT[] NOT NULL,  -- ["src/components/ventures/*", "src/pages/ventures/*"]
    forbidden_paths TEXT[] DEFAULT NULL,  -- Children CANNOT touch these paths

    -- Design consistency requirements
    required_design_tokens TEXT[] NOT NULL DEFAULT ARRAY['color', 'spacing', 'typography'],
    cultural_design_style VARCHAR(30) DEFAULT NULL,  -- Strictly inherited by all children
    max_component_loc INTEGER NOT NULL DEFAULT 600,

    -- UX flow boundaries
    navigation_patterns JSONB DEFAULT NULL,  -- Expected routes/flows
    error_handling_pattern VARCHAR(50) DEFAULT 'toast',  -- 'toast', 'inline', 'modal'
    loading_state_pattern VARCHAR(50) DEFAULT 'skeleton',  -- 'skeleton', 'spinner', 'progressive'

    -- Accessibility floor (cannot be lowered by children)
    min_wcag_level VARCHAR(10) NOT NULL DEFAULT 'AA',

    -- Contract metadata
    description TEXT,
    rationale TEXT,  -- Why these boundaries exist
    created_by VARCHAR(100) DEFAULT 'system',

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Ensure one contract per parent SD per version
    CONSTRAINT unique_ux_contract_version UNIQUE (parent_sd_id, contract_version)
);

-- Index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_ux_contracts_parent_sd ON sd_ux_contracts(parent_sd_id);
CREATE INDEX IF NOT EXISTS idx_ux_contracts_cultural_style ON sd_ux_contracts(cultural_design_style)
    WHERE cultural_design_style IS NOT NULL;

-- Comment
COMMENT ON TABLE sd_ux_contracts IS
'UX contracts define component/design boundaries for child SDs. Children can only
modify components within allowed paths and must use parent''s cultural design style.
Violations are WARNINGs (can override with justification).
Reference: Consistency + Autonomy Architecture Plan';

-- ============================================================================
-- TABLE: sd_contract_violations
-- Purpose: Track contract violations and overrides
-- ============================================================================
CREATE TABLE IF NOT EXISTS sd_contract_violations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sd_id VARCHAR(50) NOT NULL REFERENCES strategic_directives_v2(id) ON DELETE CASCADE,
    contract_id UUID NOT NULL,  -- References either data or ux contract
    contract_type VARCHAR(20) NOT NULL CHECK (contract_type IN ('data', 'ux')),

    -- Violation details
    violation_type VARCHAR(50) NOT NULL,  -- 'FORBIDDEN_TABLE', 'PATH_BOUNDARY', 'STYLE_DRIFT', etc.
    severity VARCHAR(20) NOT NULL CHECK (severity IN ('BLOCKER', 'WARNING')),
    message TEXT NOT NULL,
    context JSONB DEFAULT NULL,  -- Additional context (table name, path, etc.)

    -- Override (for WARNINGs only)
    overridden BOOLEAN NOT NULL DEFAULT FALSE,
    override_justification TEXT,
    overridden_by VARCHAR(100),
    overridden_at TIMESTAMPTZ,

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_violations_sd_id ON sd_contract_violations(sd_id);
CREATE INDEX IF NOT EXISTS idx_violations_contract ON sd_contract_violations(contract_id);
CREATE INDEX IF NOT EXISTS idx_violations_unresolved ON sd_contract_violations(sd_id, severity)
    WHERE overridden = FALSE;

-- Comment
COMMENT ON TABLE sd_contract_violations IS
'Tracks all contract violations detected during SD lifecycle.
BLOCKER violations prevent SD completion.
WARNING violations can be overridden with documented justification.';

-- ============================================================================
-- FUNCTION: inherit_parent_contracts()
-- Purpose: Auto-inherit contract references when child SD is created
-- ============================================================================
CREATE OR REPLACE FUNCTION inherit_parent_contracts()
RETURNS TRIGGER AS $$
DECLARE
    v_data_contract RECORD;
    v_ux_contract RECORD;
    v_parent_chain TEXT[] := ARRAY[]::TEXT[];
    v_current_parent VARCHAR(50);
BEGIN
    -- Only process child SDs (those with a parent)
    IF NEW.parent_sd_id IS NULL THEN
        RETURN NEW;
    END IF;

    -- Initialize metadata if null
    IF NEW.metadata IS NULL THEN
        NEW.metadata := '{}'::jsonb;
    END IF;

    -- Build parent chain for full inheritance tracking
    v_current_parent := NEW.parent_sd_id;
    WHILE v_current_parent IS NOT NULL LOOP
        v_parent_chain := array_append(v_parent_chain, v_current_parent);
        SELECT parent_sd_id INTO v_current_parent
        FROM strategic_directives_v2
        WHERE id = v_current_parent;
    END LOOP;

    -- Store parent chain in metadata
    NEW.metadata := jsonb_set(
        NEW.metadata,
        '{contract_parent_chain}',
        to_jsonb(v_parent_chain)
    );

    -- Find most recent data contract from immediate parent
    SELECT * INTO v_data_contract
    FROM sd_data_contracts
    WHERE parent_sd_id = NEW.parent_sd_id
    ORDER BY contract_version DESC
    LIMIT 1;

    IF FOUND THEN
        NEW.metadata := jsonb_set(
            NEW.metadata,
            '{inherited_data_contract_id}',
            to_jsonb(v_data_contract.id::text)
        );
        NEW.metadata := jsonb_set(
            NEW.metadata,
            '{data_contract_version}',
            to_jsonb(v_data_contract.contract_version)
        );
    END IF;

    -- Find most recent UX contract from immediate parent
    SELECT * INTO v_ux_contract
    FROM sd_ux_contracts
    WHERE parent_sd_id = NEW.parent_sd_id
    ORDER BY contract_version DESC
    LIMIT 1;

    IF FOUND THEN
        NEW.metadata := jsonb_set(
            NEW.metadata,
            '{inherited_ux_contract_id}',
            to_jsonb(v_ux_contract.id::text)
        );
        NEW.metadata := jsonb_set(
            NEW.metadata,
            '{ux_contract_version}',
            to_jsonb(v_ux_contract.contract_version)
        );

        -- STRICTLY inherit cultural design style (no child override allowed)
        IF v_ux_contract.cultural_design_style IS NOT NULL THEN
            NEW.metadata := jsonb_set(
                NEW.metadata,
                '{cultural_design_style}',
                to_jsonb(v_ux_contract.cultural_design_style)
            );
            NEW.metadata := jsonb_set(
                NEW.metadata,
                '{cultural_design_style_source}',
                to_jsonb('inherited_from_' || NEW.parent_sd_id)
            );
        END IF;

        -- Inherit accessibility floor
        NEW.metadata := jsonb_set(
            NEW.metadata,
            '{min_wcag_level}',
            to_jsonb(v_ux_contract.min_wcag_level)
        );
    END IF;

    -- Mark as contract-governed
    NEW.metadata := jsonb_set(
        NEW.metadata,
        '{contract_governed}',
        'true'::jsonb
    );

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for INSERT
DROP TRIGGER IF EXISTS trg_inherit_contracts_on_insert ON strategic_directives_v2;
CREATE TRIGGER trg_inherit_contracts_on_insert
    BEFORE INSERT ON strategic_directives_v2
    FOR EACH ROW
    EXECUTE FUNCTION inherit_parent_contracts();

-- Create trigger for UPDATE (when parent_sd_id changes)
DROP TRIGGER IF EXISTS trg_inherit_contracts_on_update ON strategic_directives_v2;
CREATE TRIGGER trg_inherit_contracts_on_update
    BEFORE UPDATE OF parent_sd_id ON strategic_directives_v2
    FOR EACH ROW
    WHEN (OLD.parent_sd_id IS DISTINCT FROM NEW.parent_sd_id)
    EXECUTE FUNCTION inherit_parent_contracts();

-- ============================================================================
-- FUNCTION: check_contract_requirements()
-- Purpose: Validate that parent SDs have required contracts before children
-- ============================================================================
CREATE OR REPLACE FUNCTION check_contract_requirements()
RETURNS TRIGGER AS $$
DECLARE
    v_has_data_contract BOOLEAN;
    v_has_ux_contract BOOLEAN;
    v_parent_relationship_type TEXT;
BEGIN
    -- Only check when setting a parent_sd_id
    IF NEW.parent_sd_id IS NULL THEN
        RETURN NEW;
    END IF;

    -- Check if parent is actually a parent-type SD
    SELECT relationship_type INTO v_parent_relationship_type
    FROM strategic_directives_v2
    WHERE id = NEW.parent_sd_id;

    -- Only enforce contracts for actual parent SDs (not standalone)
    IF v_parent_relationship_type = 'parent' THEN
        -- Check for data contract
        SELECT EXISTS(
            SELECT 1 FROM sd_data_contracts WHERE parent_sd_id = NEW.parent_sd_id
        ) INTO v_has_data_contract;

        -- Check for UX contract
        SELECT EXISTS(
            SELECT 1 FROM sd_ux_contracts WHERE parent_sd_id = NEW.parent_sd_id
        ) INTO v_has_ux_contract;

        -- Warn if contracts are missing (but don't block)
        IF NOT v_has_data_contract THEN
            RAISE WARNING 'Parent SD % has no data contract defined. Child SD % may not have schema boundaries enforced.',
                NEW.parent_sd_id, NEW.id;
        END IF;

        IF NOT v_has_ux_contract THEN
            RAISE WARNING 'Parent SD % has no UX contract defined. Child SD % may not have design boundaries enforced.',
                NEW.parent_sd_id, NEW.id;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for contract requirement check
DROP TRIGGER IF EXISTS trg_check_contract_requirements ON strategic_directives_v2;
CREATE TRIGGER trg_check_contract_requirements
    BEFORE INSERT OR UPDATE OF parent_sd_id ON strategic_directives_v2
    FOR EACH ROW
    EXECUTE FUNCTION check_contract_requirements();

-- ============================================================================
-- RLS POLICIES
-- ============================================================================

-- Enable RLS on new tables
ALTER TABLE sd_data_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE sd_ux_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE sd_contract_violations ENABLE ROW LEVEL SECURITY;

-- Data contracts: public read, authenticated write
CREATE POLICY "sd_data_contracts_select" ON sd_data_contracts
    FOR SELECT USING (true);

CREATE POLICY "sd_data_contracts_insert" ON sd_data_contracts
    FOR INSERT TO authenticated
    WITH CHECK (true);

CREATE POLICY "sd_data_contracts_update" ON sd_data_contracts
    FOR UPDATE TO authenticated
    USING (true);

-- UX contracts: public read, authenticated write
CREATE POLICY "sd_ux_contracts_select" ON sd_ux_contracts
    FOR SELECT USING (true);

CREATE POLICY "sd_ux_contracts_insert" ON sd_ux_contracts
    FOR INSERT TO authenticated
    WITH CHECK (true);

CREATE POLICY "sd_ux_contracts_update" ON sd_ux_contracts
    FOR UPDATE TO authenticated
    USING (true);

-- Violations: public read, authenticated write
CREATE POLICY "sd_contract_violations_select" ON sd_contract_violations
    FOR SELECT USING (true);

CREATE POLICY "sd_contract_violations_insert" ON sd_contract_violations
    FOR INSERT TO authenticated
    WITH CHECK (true);

CREATE POLICY "sd_contract_violations_update" ON sd_contract_violations
    FOR UPDATE TO authenticated
    USING (true);

-- ============================================================================
-- UPDATED_AT TRIGGERS
-- ============================================================================
CREATE TRIGGER update_sd_data_contracts_updated_at
    BEFORE UPDATE ON sd_data_contracts
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_sd_ux_contracts_updated_at
    BEFORE UPDATE ON sd_ux_contracts
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- LOG MIGRATION
-- ============================================================================
DO $$
BEGIN
    RAISE NOTICE '=== SD Contracts Migration Complete ===';
    RAISE NOTICE 'Created tables: sd_data_contracts, sd_ux_contracts, sd_contract_violations';
    RAISE NOTICE 'Created function: inherit_parent_contracts()';
    RAISE NOTICE 'Created function: check_contract_requirements()';
    RAISE NOTICE 'Created triggers: trg_inherit_contracts_on_insert, trg_inherit_contracts_on_update, trg_check_contract_requirements';
    RAISE NOTICE 'Architectural decisions:';
    RAISE NOTICE '  - DATA_CONTRACT violations = BLOCKER';
    RAISE NOTICE '  - UX_CONTRACT violations = WARNING (with override)';
    RAISE NOTICE '  - Contracts MANDATORY at each parent level';
    RAISE NOTICE '  - Cultural design style STRICTLY INHERITED';
END $$;
