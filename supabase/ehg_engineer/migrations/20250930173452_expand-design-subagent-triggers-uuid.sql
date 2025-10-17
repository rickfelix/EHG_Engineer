-- ============================================================================
-- Expand Design Sub-Agent Triggers for UI/UX Coverage (UUID VERSION)
-- ============================================================================

-- Generate a UUID for design-sub-agent
DO $$
DECLARE
    design_agent_uuid UUID;
BEGIN
    -- Use a deterministic UUID based on the name
    design_agent_uuid := gen_random_uuid();

    -- Insert or update the Design sub-agent with UUID
    INSERT INTO leo_sub_agents (id, name, code, description, activation_type, priority, active, metadata)
    VALUES (
        design_agent_uuid,
        'Senior Design Sub-Agent',
        'DESIGN',
        'Comprehensive UI/UX design sub-agent covering visual components, user flows, accessibility, and design system compliance',
        'automatic',
        70,
        true,
        jsonb_build_object(
            'version', '4.2.0',
            'workflow_modes', jsonb_build_array('ui_mode', 'ux_mode', 'integrated_mode'),
            'persona_file', 'lib/agents/personas/sub-agents/design-agent.json'
        )
    )
    ON CONFLICT (code)
    DO UPDATE SET
        description = EXCLUDED.description,
        priority = EXCLUDED.priority,
        metadata = EXCLUDED.metadata
    RETURNING id INTO design_agent_uuid;

    -- Delete existing Design sub-agent triggers
    DELETE FROM leo_sub_agent_triggers
    WHERE sub_agent_id = design_agent_uuid;

    -- Insert UI triggers
    INSERT INTO leo_sub_agent_triggers (sub_agent_id, trigger_phrase, trigger_type, trigger_context, priority, active, metadata)
    VALUES
        (design_agent_uuid, 'component', 'keyword', 'any', 80, true, '{"mode": "ui", "category": "component"}'),
        (design_agent_uuid, 'visual', 'keyword', 'any', 75, true, '{"mode": "ui", "category": "visual"}'),
        (design_agent_uuid, 'design system', 'keyword', 'any', 85, true, '{"mode": "ui", "category": "design_system"}'),
        (design_agent_uuid, 'styling', 'keyword', 'any', 70, true, '{"mode": "ui", "category": "styling"}'),
        (design_agent_uuid, 'CSS', 'keyword', 'any', 70, true, '{"mode": "ui", "category": "styling"}'),
        (design_agent_uuid, 'Tailwind', 'keyword', 'any', 70, true, '{"mode": "ui", "category": "styling"}'),
        (design_agent_uuid, 'interface', 'keyword', 'any', 75, true, '{"mode": "ui", "category": "interface"}'),
        (design_agent_uuid, 'UI', 'keyword', 'any', 80, true, '{"mode": "ui", "category": "general"}'),
        (design_agent_uuid, 'button', 'keyword', 'any', 65, true, '{"mode": "ui", "category": "component"}'),
        (design_agent_uuid, 'form', 'keyword', 'any', 70, true, '{"mode": "ui", "category": "component"}'),
        (design_agent_uuid, 'modal', 'keyword', 'any', 70, true, '{"mode": "ui", "category": "component"}'),
        (design_agent_uuid, 'theme', 'keyword', 'any', 75, true, '{"mode": "ui", "category": "theming"}'),
        (design_agent_uuid, 'dark mode', 'keyword', 'any', 75, true, '{"mode": "ui", "category": "theming"}'),
        (design_agent_uuid, 'light mode', 'keyword', 'any', 75, true, '{"mode": "ui", "category": "theming"}'),
        -- UX triggers
        (design_agent_uuid, 'user flow', 'keyword', 'any', 85, true, '{"mode": "ux", "category": "flow"}'),
        (design_agent_uuid, 'navigation', 'keyword', 'any', 80, true, '{"mode": "ux", "category": "navigation"}'),
        (design_agent_uuid, 'journey', 'keyword', 'any', 80, true, '{"mode": "ux", "category": "journey"}'),
        (design_agent_uuid, 'interaction', 'keyword', 'any', 75, true, '{"mode": "ux", "category": "interaction"}'),
        (design_agent_uuid, 'wireframe', 'keyword', 'any', 70, true, '{"mode": "ux", "category": "wireframe"}'),
        (design_agent_uuid, 'prototype', 'keyword', 'any', 70, true, '{"mode": "ux", "category": "prototype"}'),
        (design_agent_uuid, 'UX', 'keyword', 'any', 85, true, '{"mode": "ux", "category": "general"}'),
        (design_agent_uuid, 'user experience', 'keyword', 'any', 85, true, '{"mode": "ux", "category": "general"}'),
        (design_agent_uuid, 'accessibility', 'keyword', 'any', 90, true, '{"mode": "ux", "category": "accessibility"}'),
        (design_agent_uuid, 'WCAG', 'keyword', 'any', 90, true, '{"mode": "ux", "category": "accessibility"}'),
        (design_agent_uuid, 'ARIA', 'keyword', 'any', 85, true, '{"mode": "ux", "category": "accessibility"}'),
        (design_agent_uuid, 'screen reader', 'keyword', 'any', 85, true, '{"mode": "ux", "category": "accessibility"}'),
        -- Backend detection triggers (CRITICAL)
        (design_agent_uuid, 'backend feature', 'keyword', 'any', 95, true, '{"mode": "integrated", "category": "backend_detection", "critical": true}'),
        (design_agent_uuid, 'API endpoint', 'keyword', 'any', 95, true, '{"mode": "integrated", "category": "backend_detection", "critical": true}'),
        (design_agent_uuid, 'database model', 'keyword', 'any', 90, true, '{"mode": "integrated", "category": "backend_detection"}'),
        (design_agent_uuid, 'database table', 'keyword', 'any', 90, true, '{"mode": "integrated", "category": "backend_detection"}'),
        (design_agent_uuid, 'new route', 'keyword', 'any', 90, true, '{"mode": "integrated", "category": "backend_detection"}'),
        (design_agent_uuid, 'new endpoint', 'keyword', 'any', 95, true, '{"mode": "integrated", "category": "backend_detection", "critical": true}'),
        (design_agent_uuid, 'controller', 'keyword', 'any', 85, true, '{"mode": "integrated", "category": "backend_detection"}'),
        (design_agent_uuid, 'service layer', 'keyword', 'any', 80, true, '{"mode": "integrated", "category": "backend_detection"}'),
        (design_agent_uuid, 'business logic', 'keyword', 'any', 85, true, '{"mode": "integrated", "category": "backend_detection"}'),
        -- Feature triggers
        (design_agent_uuid, 'new feature', 'keyword', 'PRD', 95, true, '{"mode": "integrated", "category": "feature", "required": true}'),
        (design_agent_uuid, 'feature implementation', 'keyword', 'any', 90, true, '{"mode": "integrated", "category": "feature"}'),
        (design_agent_uuid, 'user-facing', 'keyword', 'any', 95, true, '{"mode": "integrated", "category": "feature", "critical": true}'),
        (design_agent_uuid, 'frontend', 'keyword', 'any', 85, true, '{"mode": "integrated", "category": "feature"}'),
        (design_agent_uuid, 'page', 'keyword', 'any', 80, true, '{"mode": "integrated", "category": "feature"}'),
        (design_agent_uuid, 'view', 'keyword', 'any', 75, true, '{"mode": "integrated", "category": "feature"}'),
        (design_agent_uuid, 'dashboard', 'keyword', 'any', 85, true, '{"mode": "integrated", "category": "feature"}'),
        (design_agent_uuid, 'responsive', 'keyword', 'any', 75, true, '{"mode": "ui", "category": "responsive"}'),
        (design_agent_uuid, 'mobile', 'keyword', 'any', 70, true, '{"mode": "ui", "category": "responsive"}');

    RAISE NOTICE 'Design sub-agent UUID: %', design_agent_uuid;
    RAISE NOTICE 'Successfully created % triggers', (SELECT COUNT(*) FROM leo_sub_agent_triggers WHERE sub_agent_id = design_agent_uuid);
END $$;

-- Verification
SELECT
    COUNT(*) as total_triggers,
    COUNT(*) FILTER (WHERE metadata->>'mode' = 'ui') as ui_triggers,
    COUNT(*) FILTER (WHERE metadata->>'mode' = 'ux') as ux_triggers,
    COUNT(*) FILTER (WHERE metadata->>'mode' = 'integrated') as integrated_triggers
FROM leo_sub_agent_triggers t
JOIN leo_sub_agents sa ON t.sub_agent_id = sa.id
WHERE sa.code = 'DESIGN';
