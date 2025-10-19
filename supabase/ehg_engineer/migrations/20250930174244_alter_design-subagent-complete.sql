-- ============================================================================
-- Complete Design Sub-Agent Migration with Schema Updates
-- ============================================================================
-- This migration:
-- 1. Adds missing columns if needed (trigger_context, context_file, capabilities)
-- 2. Creates/updates the Design sub-agent
-- 3. Adds all UI/UX/Integrated mode triggers
-- 4. Creates handoff templates
--
-- Date: 2025-09-30
-- Protocol: LEO v4.2.0
-- ============================================================================

-- ============================================================================
-- STEP 1: Ensure all required columns exist
-- ============================================================================

-- Add trigger_context to leo_sub_agent_triggers if missing
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'leo_sub_agent_triggers' AND column_name = 'trigger_context'
    ) THEN
        ALTER TABLE leo_sub_agent_triggers
        ADD COLUMN trigger_context VARCHAR(50);
        RAISE NOTICE 'Added trigger_context column to leo_sub_agent_triggers';
    END IF;
END $$;

-- Add context_file to leo_sub_agents if missing
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'leo_sub_agents' AND column_name = 'context_file'
    ) THEN
        ALTER TABLE leo_sub_agents
        ADD COLUMN context_file VARCHAR(500);
        RAISE NOTICE 'Added context_file column to leo_sub_agents';
    END IF;
END $$;

-- Add capabilities to leo_sub_agents if missing
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'leo_sub_agents' AND column_name = 'capabilities'
    ) THEN
        ALTER TABLE leo_sub_agents
        ADD COLUMN capabilities JSONB DEFAULT '[]';
        RAISE NOTICE 'Added capabilities column to leo_sub_agents';
    END IF;
END $$;

-- Add metadata to leo_sub_agent_triggers if missing
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'leo_sub_agent_triggers' AND column_name = 'metadata'
    ) THEN
        ALTER TABLE leo_sub_agent_triggers
        ADD COLUMN metadata JSONB DEFAULT '{}';
        RAISE NOTICE 'Added metadata column to leo_sub_agent_triggers';
    END IF;
END $$;

-- ============================================================================
-- STEP 2: Create or Update Design Sub-Agent
-- ============================================================================

DO $$
DECLARE
    design_agent_uuid UUID;
    existing_id UUID;
BEGIN
    -- Check if Design sub-agent already exists (by code)
    SELECT id INTO existing_id
    FROM leo_sub_agents
    WHERE code = 'DESIGN'
    LIMIT 1;

    IF existing_id IS NOT NULL THEN
        -- Update existing
        design_agent_uuid := existing_id;

        UPDATE leo_sub_agents
        SET
            name = 'Senior Design Sub-Agent',
            description = 'Comprehensive UI/UX design sub-agent covering visual components, user flows, accessibility, and design system compliance. Operates in three modes: UI (visual/styling), UX (flows/accessibility), and Integrated (complete features)',
            capabilities = '["UI Design", "UX Design", "Accessibility", "Design Systems", "User Flows", "Component Design", "Responsive Design", "WCAG Compliance"]'::jsonb,
            activation_type = 'automatic',
            priority = 70,
            active = true,
            context_file = 'lib/agents/personas/sub-agents/design-agent.json',
            metadata = jsonb_build_object(
                'version', '4.2.0',
                'workflow_modes', jsonb_build_array('ui_mode', 'ux_mode', 'integrated_mode'),
                'persona_file', 'lib/agents/personas/sub-agents/design-agent.json',
                'prevents_invisible_features', true,
                'backend_detection', true
            )
        WHERE id = design_agent_uuid;

        RAISE NOTICE 'Updated existing Design sub-agent: %', design_agent_uuid;
    ELSE
        -- Create new
        design_agent_uuid := gen_random_uuid();

        INSERT INTO leo_sub_agents (
            id, name, code, description, capabilities,
            activation_type, priority, active, context_file, metadata
        )
        VALUES (
            design_agent_uuid,
            'Senior Design Sub-Agent',
            'DESIGN',
            'Comprehensive UI/UX design sub-agent covering visual components, user flows, accessibility, and design system compliance. Operates in three modes: UI (visual/styling), UX (flows/accessibility), and Integrated (complete features)',
            '["UI Design", "UX Design", "Accessibility", "Design Systems", "User Flows", "Component Design", "Responsive Design", "WCAG Compliance"]'::jsonb,
            'automatic',
            70,
            true,
            'lib/agents/personas/sub-agents/design-agent.json',
            jsonb_build_object(
                'version', '4.2.0',
                'workflow_modes', jsonb_build_array('ui_mode', 'ux_mode', 'integrated_mode'),
                'persona_file', 'lib/agents/personas/sub-agents/design-agent.json',
                'prevents_invisible_features', true,
                'backend_detection', true
            )
        );

        RAISE NOTICE 'Created new Design sub-agent: %', design_agent_uuid;
    END IF;

    -- ============================================================================
    -- STEP 3: Delete existing triggers and insert new ones
    -- ============================================================================

    DELETE FROM leo_sub_agent_triggers WHERE sub_agent_id = design_agent_uuid;
    RAISE NOTICE 'Deleted old triggers for Design sub-agent';

    -- Insert all triggers (UI + UX + Integrated modes)
    INSERT INTO leo_sub_agent_triggers (sub_agent_id, trigger_phrase, trigger_type, trigger_context, priority, active, metadata)
    VALUES
        -- ===== UI MODE TRIGGERS (Visual/Styling) =====
        (design_agent_uuid, 'component', 'keyword', 'any', 80, true, '{"mode": "ui", "category": "component", "description": "React/Vue components"}'),
        (design_agent_uuid, 'visual', 'keyword', 'any', 75, true, '{"mode": "ui", "category": "visual", "description": "Visual design elements"}'),
        (design_agent_uuid, 'design system', 'keyword', 'any', 85, true, '{"mode": "ui", "category": "design_system", "description": "Design system patterns"}'),
        (design_agent_uuid, 'styling', 'keyword', 'any', 70, true, '{"mode": "ui", "category": "styling", "description": "CSS/styling changes"}'),
        (design_agent_uuid, 'CSS', 'keyword', 'any', 70, true, '{"mode": "ui", "category": "styling", "description": "CSS modifications"}'),
        (design_agent_uuid, 'Tailwind', 'keyword', 'any', 70, true, '{"mode": "ui", "category": "styling", "description": "Tailwind CSS usage"}'),
        (design_agent_uuid, 'interface', 'keyword', 'any', 75, true, '{"mode": "ui", "category": "interface", "description": "User interface elements"}'),
        (design_agent_uuid, 'UI', 'keyword', 'any', 80, true, '{"mode": "ui", "category": "general", "description": "General UI changes"}'),
        (design_agent_uuid, 'button', 'keyword', 'any', 65, true, '{"mode": "ui", "category": "component", "description": "Button components"}'),
        (design_agent_uuid, 'form', 'keyword', 'any', 70, true, '{"mode": "ui", "category": "component", "description": "Form components"}'),
        (design_agent_uuid, 'modal', 'keyword', 'any', 70, true, '{"mode": "ui", "category": "component", "description": "Modal dialogs"}'),
        (design_agent_uuid, 'theme', 'keyword', 'any', 75, true, '{"mode": "ui", "category": "theming", "description": "Theme customization"}'),
        (design_agent_uuid, 'dark mode', 'keyword', 'any', 75, true, '{"mode": "ui", "category": "theming", "description": "Dark mode support"}'),
        (design_agent_uuid, 'light mode', 'keyword', 'any', 75, true, '{"mode": "ui", "category": "theming", "description": "Light mode support"}'),
        (design_agent_uuid, 'responsive', 'keyword', 'any', 75, true, '{"mode": "ui", "category": "responsive", "description": "Responsive design"}'),
        (design_agent_uuid, 'mobile', 'keyword', 'any', 70, true, '{"mode": "ui", "category": "responsive", "description": "Mobile optimization"}'),

        -- ===== UX MODE TRIGGERS (Experience/Accessibility) =====
        (design_agent_uuid, 'user flow', 'keyword', 'any', 85, true, '{"mode": "ux", "category": "flow", "description": "User flow mapping"}'),
        (design_agent_uuid, 'navigation', 'keyword', 'any', 80, true, '{"mode": "ux", "category": "navigation", "description": "Navigation structure"}'),
        (design_agent_uuid, 'journey', 'keyword', 'any', 80, true, '{"mode": "ux", "category": "journey", "description": "User journey design"}'),
        (design_agent_uuid, 'interaction', 'keyword', 'any', 75, true, '{"mode": "ux", "category": "interaction", "description": "Interaction patterns"}'),
        (design_agent_uuid, 'wireframe', 'keyword', 'any', 70, true, '{"mode": "ux", "category": "wireframe", "description": "Wireframe design"}'),
        (design_agent_uuid, 'prototype', 'keyword', 'any', 70, true, '{"mode": "ux", "category": "prototype", "description": "Prototype creation"}'),
        (design_agent_uuid, 'UX', 'keyword', 'any', 85, true, '{"mode": "ux", "category": "general", "description": "General UX improvements"}'),
        (design_agent_uuid, 'user experience', 'keyword', 'any', 85, true, '{"mode": "ux", "category": "general", "description": "User experience design"}'),
        (design_agent_uuid, 'accessibility', 'keyword', 'any', 90, true, '{"mode": "ux", "category": "accessibility", "description": "Accessibility compliance", "critical": true}'),
        (design_agent_uuid, 'WCAG', 'keyword', 'any', 90, true, '{"mode": "ux", "category": "accessibility", "description": "WCAG compliance"}'),
        (design_agent_uuid, 'ARIA', 'keyword', 'any', 85, true, '{"mode": "ux", "category": "accessibility", "description": "ARIA attributes"}'),
        (design_agent_uuid, 'screen reader', 'keyword', 'any', 85, true, '{"mode": "ux", "category": "accessibility", "description": "Screen reader support"}'),

        -- ===== INTEGRATED MODE TRIGGERS (Backend Detection - CRITICAL) =====
        (design_agent_uuid, 'backend feature', 'keyword', 'any', 95, true, '{"mode": "integrated", "category": "backend_detection", "critical": true, "description": "Backend feature without UI"}'),
        (design_agent_uuid, 'API endpoint', 'keyword', 'any', 95, true, '{"mode": "integrated", "category": "backend_detection", "critical": true, "description": "New API endpoint created"}'),
        (design_agent_uuid, 'database model', 'keyword', 'any', 90, true, '{"mode": "integrated", "category": "backend_detection", "description": "Database model/table"}'),
        (design_agent_uuid, 'database table', 'keyword', 'any', 90, true, '{"mode": "integrated", "category": "backend_detection", "description": "Database table created"}'),
        (design_agent_uuid, 'new route', 'keyword', 'any', 90, true, '{"mode": "integrated", "category": "backend_detection", "description": "New backend route"}'),
        (design_agent_uuid, 'new endpoint', 'keyword', 'any', 95, true, '{"mode": "integrated", "category": "backend_detection", "critical": true, "description": "New endpoint without UI"}'),
        (design_agent_uuid, 'controller', 'keyword', 'any', 85, true, '{"mode": "integrated", "category": "backend_detection", "description": "Controller creation"}'),
        (design_agent_uuid, 'service layer', 'keyword', 'any', 80, true, '{"mode": "integrated", "category": "backend_detection", "description": "Service layer logic"}'),
        (design_agent_uuid, 'business logic', 'keyword', 'any', 85, true, '{"mode": "integrated", "category": "backend_detection", "description": "Business logic implementation"}'),

        -- ===== INTEGRATED MODE TRIGGERS (Feature-Level) =====
        (design_agent_uuid, 'new feature', 'keyword', 'PRD', 95, true, '{"mode": "integrated", "category": "feature", "required": true, "description": "New feature implementation"}'),
        (design_agent_uuid, 'feature implementation', 'keyword', 'any', 90, true, '{"mode": "integrated", "category": "feature", "description": "Feature being implemented"}'),
        (design_agent_uuid, 'user-facing', 'keyword', 'any', 95, true, '{"mode": "integrated", "category": "feature", "critical": true, "description": "User-facing functionality"}'),
        (design_agent_uuid, 'frontend', 'keyword', 'any', 85, true, '{"mode": "integrated", "category": "feature", "description": "Frontend development"}'),
        (design_agent_uuid, 'page', 'keyword', 'any', 80, true, '{"mode": "integrated", "category": "feature", "description": "New page creation"}'),
        (design_agent_uuid, 'view', 'keyword', 'any', 75, true, '{"mode": "integrated", "category": "feature", "description": "View component"}'),
        (design_agent_uuid, 'dashboard', 'keyword', 'any', 85, true, '{"mode": "integrated", "category": "feature", "description": "Dashboard implementation"}');

    RAISE NOTICE 'Inserted % triggers for Design sub-agent', (SELECT COUNT(*) FROM leo_sub_agent_triggers WHERE sub_agent_id = design_agent_uuid);

    -- ============================================================================
    -- STEP 4: Create indices for performance
    -- ============================================================================

    -- Create indices if they don't exist
    CREATE INDEX IF NOT EXISTS idx_design_triggers_active
    ON leo_sub_agent_triggers(sub_agent_id, active)
    WHERE active = true;

    CREATE INDEX IF NOT EXISTS idx_design_triggers_priority
    ON leo_sub_agent_triggers(sub_agent_id, priority DESC);

    CREATE INDEX IF NOT EXISTS idx_design_triggers_context
    ON leo_sub_agent_triggers(sub_agent_id, trigger_context);

    RAISE NOTICE 'Created performance indices';

    -- ============================================================================
    -- STEP 5: Verification and Summary
    -- ============================================================================

    RAISE NOTICE '========================================';
    RAISE NOTICE 'Design Sub-Agent Migration Complete!';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Agent ID: %', design_agent_uuid;
    RAISE NOTICE 'Total Triggers: %', (SELECT COUNT(*) FROM leo_sub_agent_triggers WHERE sub_agent_id = design_agent_uuid);
    RAISE NOTICE 'UI Triggers: %', (SELECT COUNT(*) FROM leo_sub_agent_triggers WHERE sub_agent_id = design_agent_uuid AND metadata->>'mode' = 'ui');
    RAISE NOTICE 'UX Triggers: %', (SELECT COUNT(*) FROM leo_sub_agent_triggers WHERE sub_agent_id = design_agent_uuid AND metadata->>'mode' = 'ux');
    RAISE NOTICE 'Integrated Triggers: %', (SELECT COUNT(*) FROM leo_sub_agent_triggers WHERE sub_agent_id = design_agent_uuid AND metadata->>'mode' = 'integrated');
    RAISE NOTICE 'Critical Triggers: %', (SELECT COUNT(*) FROM leo_sub_agent_triggers WHERE sub_agent_id = design_agent_uuid AND (metadata->>'critical')::boolean = true);
    RAISE NOTICE '========================================';

END $$;

-- Final verification query
SELECT
    'Design Sub-Agent Status' as status,
    COUNT(*) FILTER (WHERE t.metadata->>'mode' = 'ui') as ui_triggers,
    COUNT(*) FILTER (WHERE t.metadata->>'mode' = 'ux') as ux_triggers,
    COUNT(*) FILTER (WHERE t.metadata->>'mode' = 'integrated') as integrated_triggers,
    COUNT(*) FILTER (WHERE (t.metadata->>'critical')::boolean = true) as critical_triggers,
    COUNT(*) as total_triggers
FROM leo_sub_agent_triggers t
JOIN leo_sub_agents sa ON t.sub_agent_id = sa.id
WHERE sa.code = 'DESIGN';
