-- ============================================================================
-- MIGRATION: Fix Inherited Contract Propagation
-- Created: 2025-12-09
-- Author: Claude Code (Contract System Enhancement)
--
-- Purpose: Updates reinherit_contracts_for_children() to propagate INHERITED
--          contracts when parent has no self-defined contracts. This fixes the
--          grandchild inheritance problem where sub-parents (like 001D) inherit
--          contracts from their parent but don't define their own.
--
-- Problem: SD-VISION-TRANSITION-001D inherits contracts from 001, but when
--          reinherit_contracts_for_children('001D') is called, it returns NULL
--          because 001D has no self-defined contracts in sd_data_contracts.
--
-- Solution: Check parent's metadata for inherited_*_contract_id fields first,
--           then fall back to looking for parent-defined contracts.
--
-- Reference: Session analysis 2025-12-09 (vision document review)
-- ============================================================================

-- ============================================================================
-- UPDATED FUNCTION: reinherit_contracts_for_children(parent_sd_id)
-- Purpose: Propagates EITHER parent-defined OR parent-inherited contracts
-- ============================================================================
CREATE OR REPLACE FUNCTION reinherit_contracts_for_children(p_parent_sd_id VARCHAR(50))
RETURNS JSONB AS $$
DECLARE
    v_child RECORD;
    v_parent_metadata JSONB;
    v_data_contract_id UUID;
    v_data_contract_version INTEGER;
    v_ux_contract_id UUID;
    v_ux_contract_version INTEGER;
    v_cultural_design_style VARCHAR(30);
    v_min_wcag_level VARCHAR(10);
    v_updated_count INTEGER := 0;
    v_parent_chain TEXT[];
    v_current_parent VARCHAR(50);
    v_contract_source VARCHAR(100);
BEGIN
    -- First, get parent's metadata to check for inherited contracts
    SELECT metadata INTO v_parent_metadata
    FROM strategic_directives_v2
    WHERE id = p_parent_sd_id;

    -- Strategy 1: Check if parent has INHERITED contracts (in metadata)
    IF v_parent_metadata IS NOT NULL AND
       v_parent_metadata->>'inherited_data_contract_id' IS NOT NULL THEN

        -- Use parent's inherited contracts
        v_data_contract_id := (v_parent_metadata->>'inherited_data_contract_id')::UUID;
        v_data_contract_version := (v_parent_metadata->>'data_contract_version')::INTEGER;
        v_ux_contract_id := (v_parent_metadata->>'inherited_ux_contract_id')::UUID;
        v_ux_contract_version := (v_parent_metadata->>'ux_contract_version')::INTEGER;
        v_cultural_design_style := v_parent_metadata->>'cultural_design_style';
        v_min_wcag_level := COALESCE(v_parent_metadata->>'min_wcag_level', 'AA');
        v_contract_source := 'inherited_via_' || p_parent_sd_id;

        RAISE NOTICE 'Using inherited contracts from parent % metadata', p_parent_sd_id;
    ELSE
        -- Strategy 2: Look for parent-DEFINED contracts (original behavior)
        SELECT id, contract_version INTO v_data_contract_id, v_data_contract_version
        FROM sd_data_contracts
        WHERE parent_sd_id = p_parent_sd_id
        ORDER BY contract_version DESC
        LIMIT 1;

        SELECT id, contract_version, cultural_design_style, min_wcag_level
        INTO v_ux_contract_id, v_ux_contract_version, v_cultural_design_style, v_min_wcag_level
        FROM sd_ux_contracts
        WHERE parent_sd_id = p_parent_sd_id
        ORDER BY contract_version DESC
        LIMIT 1;

        v_contract_source := 'inherited_from_' || p_parent_sd_id;

        RAISE NOTICE 'Using parent-defined contracts from %', p_parent_sd_id;
    END IF;

    -- If still no contracts found, return early with error
    IF v_data_contract_id IS NULL AND v_ux_contract_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'No contracts found for parent ' || p_parent_sd_id || ' (neither defined nor inherited)',
            'parent_sd_id', p_parent_sd_id,
            'children_updated', 0
        );
    END IF;

    -- Build parent chain for audit trail
    v_parent_chain := ARRAY[p_parent_sd_id];
    v_current_parent := p_parent_sd_id;
    LOOP
        SELECT parent_sd_id INTO v_current_parent
        FROM strategic_directives_v2
        WHERE id = v_current_parent;

        EXIT WHEN v_current_parent IS NULL;
        v_parent_chain := array_append(v_parent_chain, v_current_parent);
    END LOOP;

    -- Update all children of this parent
    FOR v_child IN
        SELECT id, metadata
        FROM strategic_directives_v2
        WHERE parent_sd_id = p_parent_sd_id
    LOOP
        UPDATE strategic_directives_v2
        SET metadata = jsonb_strip_nulls(jsonb_build_object(
            'contract_governed', TRUE,
            'contract_parent_chain', v_parent_chain,
            'inherited_data_contract_id', v_data_contract_id,
            'data_contract_version', v_data_contract_version,
            'inherited_ux_contract_id', v_ux_contract_id,
            'ux_contract_version', v_ux_contract_version,
            'cultural_design_style', v_cultural_design_style,
            'cultural_design_style_source', v_contract_source,
            'min_wcag_level', v_min_wcag_level
        ) || COALESCE(v_child.metadata, '{}'))
        WHERE id = v_child.id;

        v_updated_count := v_updated_count + 1;
        RAISE NOTICE 'Updated child: %', v_child.id;
    END LOOP;

    RETURN jsonb_build_object(
        'success', TRUE,
        'parent_sd_id', p_parent_sd_id,
        'children_updated', v_updated_count,
        'data_contract_id', v_data_contract_id,
        'ux_contract_id', v_ux_contract_id,
        'cultural_design_style', v_cultural_design_style,
        'contract_source', v_contract_source,
        'parent_chain', v_parent_chain
    );
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION reinherit_contracts_for_children IS
'Propagates contracts to all children of a parent SD.

UPDATED 2025-12-09: Now checks parent metadata for INHERITED contracts first,
then falls back to looking for parent-DEFINED contracts. This fixes the grandchild
inheritance problem where sub-parents inherit but don''t define their own contracts.

Usage:
  SELECT reinherit_contracts_for_children(''SD-VISION-TRANSITION-001D'');

Returns JSON with success status, count of updated children, and contract details.';

-- ============================================================================
-- LOG MIGRATION
-- ============================================================================
DO $$
BEGIN
    RAISE NOTICE '=== Inherited Contract Propagation Fix Complete ===';
    RAISE NOTICE 'Updated: reinherit_contracts_for_children()';
    RAISE NOTICE 'Now checks parent metadata for inherited contracts first';
    RAISE NOTICE 'Falls back to parent-defined contracts if no inherited found';
    RAISE NOTICE 'Fixes grandchild inheritance for sub-parent SDs';
END $$;
