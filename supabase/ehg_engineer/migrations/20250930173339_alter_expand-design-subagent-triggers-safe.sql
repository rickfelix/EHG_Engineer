-- ============================================================================
-- Expand Design Sub-Agent Triggers for UI/UX Coverage (SAFE VERSION)
-- ============================================================================
-- This migration safely adds capabilities column if missing, then expands
-- the Design sub-agent triggers for comprehensive UI and UX coverage
--
-- Date: 2025-09-30
-- Protocol: LEO v4.2.0
-- ============================================================================

-- Add capabilities column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'leo_sub_agents' AND column_name = 'capabilities'
    ) THEN
        ALTER TABLE leo_sub_agents ADD COLUMN capabilities JSONB DEFAULT '[]';
    END IF;
END $$;

-- First, check if Design sub-agent exists, if not create it
INSERT INTO leo_sub_agents (id, name, code, description, activation_type, priority, active, metadata)
VALUES (
  'design-sub-agent',
  'Senior Design Sub-Agent',
  'DESIGN',
  'Comprehensive UI/UX design sub-agent covering visual components, user flows, accessibility, and design system compliance',
  'automatic',
  70,
  true,
  '{
    "version": "4.2.0",
    "workflow_modes": ["ui_mode", "ux_mode", "integrated_mode"],
    "persona_file": "lib/agents/personas/sub-agents/design-agent.json"
  }'::jsonb
)
ON CONFLICT (id)
DO UPDATE SET
  description = EXCLUDED.description,
  priority = EXCLUDED.priority,
  metadata = EXCLUDED.metadata;

-- Update capabilities separately (since column might not have existed)
UPDATE leo_sub_agents
SET capabilities = '["UI Design", "UX Design", "Accessibility", "Design Systems", "User Flows", "Component Design", "Responsive Design"]'::jsonb
WHERE id = 'design-sub-agent';

-- Delete existing Design sub-agent triggers to start fresh
DELETE FROM leo_sub_agent_triggers
WHERE sub_agent_id = 'design-sub-agent';

-- ============================================================================
-- UI-SPECIFIC TRIGGERS
-- ============================================================================

INSERT INTO leo_sub_agent_triggers (sub_agent_id, trigger_phrase, trigger_type, trigger_context, priority, active, metadata)
VALUES
  -- Visual component triggers
  ('design-sub-agent', 'component', 'keyword', 'any', 80, true, '{"mode": "ui", "category": "component"}'::jsonb),
  ('design-sub-agent', 'visual', 'keyword', 'any', 75, true, '{"mode": "ui", "category": "visual"}'::jsonb),
  ('design-sub-agent', 'design system', 'keyword', 'any', 85, true, '{"mode": "ui", "category": "design_system"}'::jsonb),
  ('design-sub-agent', 'styling', 'keyword', 'any', 70, true, '{"mode": "ui", "category": "styling"}'::jsonb),
  ('design-sub-agent', 'CSS', 'keyword', 'any', 70, true, '{"mode": "ui", "category": "styling"}'::jsonb),
  ('design-sub-agent', 'Tailwind', 'keyword', 'any', 70, true, '{"mode": "ui", "category": "styling"}'::jsonb),
  ('design-sub-agent', 'interface', 'keyword', 'any', 75, true, '{"mode": "ui", "category": "interface"}'::jsonb),
  ('design-sub-agent', 'UI', 'keyword', 'any', 80, true, '{"mode": "ui", "category": "general"}'::jsonb),
  ('design-sub-agent', 'button', 'keyword', 'any', 65, true, '{"mode": "ui", "category": "component"}'::jsonb),
  ('design-sub-agent', 'form', 'keyword', 'any', 70, true, '{"mode": "ui", "category": "component"}'::jsonb),
  ('design-sub-agent', 'modal', 'keyword', 'any', 70, true, '{"mode": "ui", "category": "component"}'::jsonb),
  ('design-sub-agent', 'theme', 'keyword', 'any', 75, true, '{"mode": "ui", "category": "theming"}'::jsonb),
  ('design-sub-agent', 'dark mode', 'keyword', 'any', 75, true, '{"mode": "ui", "category": "theming"}'::jsonb),
  ('design-sub-agent', 'light mode', 'keyword', 'any', 75, true, '{"mode": "ui", "category": "theming"}'::jsonb),

  -- ============================================================================
  -- UX-SPECIFIC TRIGGERS
  -- ============================================================================

  -- User experience triggers
  ('design-sub-agent', 'user flow', 'keyword', 'any', 85, true, '{"mode": "ux", "category": "flow"}'::jsonb),
  ('design-sub-agent', 'navigation', 'keyword', 'any', 80, true, '{"mode": "ux", "category": "navigation"}'::jsonb),
  ('design-sub-agent', 'journey', 'keyword', 'any', 80, true, '{"mode": "ux", "category": "journey"}'::jsonb),
  ('design-sub-agent', 'interaction', 'keyword', 'any', 75, true, '{"mode": "ux", "category": "interaction"}'::jsonb),
  ('design-sub-agent', 'wireframe', 'keyword', 'any', 70, true, '{"mode": "ux", "category": "wireframe"}'::jsonb),
  ('design-sub-agent', 'prototype', 'keyword', 'any', 70, true, '{"mode": "ux", "category": "prototype"}'::jsonb),
  ('design-sub-agent', 'UX', 'keyword', 'any', 85, true, '{"mode": "ux", "category": "general"}'::jsonb),
  ('design-sub-agent', 'user experience', 'keyword', 'any', 85, true, '{"mode": "ux", "category": "general"}'::jsonb),
  ('design-sub-agent', 'accessibility', 'keyword', 'any', 90, true, '{"mode": "ux", "category": "accessibility"}'::jsonb),
  ('design-sub-agent', 'WCAG', 'keyword', 'any', 90, true, '{"mode": "ux", "category": "accessibility"}'::jsonb),
  ('design-sub-agent', 'ARIA', 'keyword', 'any', 85, true, '{"mode": "ux", "category": "accessibility"}'::jsonb),
  ('design-sub-agent', 'screen reader', 'keyword', 'any', 85, true, '{"mode": "ux", "category": "accessibility"}'::jsonb),

  -- ============================================================================
  -- BACKEND-TO-FRONTEND DETECTION TRIGGERS (HIGH PRIORITY)
  -- ============================================================================

  -- These are critical for preventing "invisible backend features"
  ('design-sub-agent', 'backend feature', 'keyword', 'any', 95, true, '{"mode": "integrated", "category": "backend_detection", "critical": true}'::jsonb),
  ('design-sub-agent', 'API endpoint', 'keyword', 'any', 95, true, '{"mode": "integrated", "category": "backend_detection", "critical": true}'::jsonb),
  ('design-sub-agent', 'database model', 'keyword', 'any', 90, true, '{"mode": "integrated", "category": "backend_detection"}'::jsonb),
  ('design-sub-agent', 'database table', 'keyword', 'any', 90, true, '{"mode": "integrated", "category": "backend_detection"}'::jsonb),
  ('design-sub-agent', 'new route', 'keyword', 'any', 90, true, '{"mode": "integrated", "category": "backend_detection"}'::jsonb),
  ('design-sub-agent', 'new endpoint', 'keyword', 'any', 95, true, '{"mode": "integrated", "category": "backend_detection", "critical": true}'::jsonb),
  ('design-sub-agent', 'controller', 'keyword', 'any', 85, true, '{"mode": "integrated", "category": "backend_detection"}'::jsonb),
  ('design-sub-agent', 'service layer', 'keyword', 'any', 80, true, '{"mode": "integrated", "category": "backend_detection"}'::jsonb),
  ('design-sub-agent', 'business logic', 'keyword', 'any', 85, true, '{"mode": "integrated", "category": "backend_detection"}'::jsonb),

  -- ============================================================================
  -- PHASE-BASED TRIGGERS (INTEGRATED MODE)
  -- ============================================================================

  -- Triggers for major feature work requiring both UI and UX
  ('design-sub-agent', 'new feature', 'keyword', 'PRD', 95, true, '{"mode": "integrated", "category": "feature", "required": true}'::jsonb),
  ('design-sub-agent', 'feature implementation', 'keyword', 'any', 90, true, '{"mode": "integrated", "category": "feature"}'::jsonb),
  ('design-sub-agent', 'user-facing', 'keyword', 'any', 95, true, '{"mode": "integrated", "category": "feature", "critical": true}'::jsonb),
  ('design-sub-agent', 'frontend', 'keyword', 'any', 85, true, '{"mode": "integrated", "category": "feature"}'::jsonb),
  ('design-sub-agent', 'page', 'keyword', 'any', 80, true, '{"mode": "integrated", "category": "feature"}'::jsonb),
  ('design-sub-agent', 'view', 'keyword', 'any', 75, true, '{"mode": "integrated", "category": "feature"}'::jsonb),
  ('design-sub-agent', 'dashboard', 'keyword', 'any', 85, true, '{"mode": "integrated", "category": "feature"}'::jsonb),
  ('design-sub-agent', 'responsive', 'keyword', 'any', 75, true, '{"mode": "ui", "category": "responsive"}'::jsonb),
  ('design-sub-agent', 'mobile', 'keyword', 'any', 70, true, '{"mode": "ui", "category": "responsive"}'::jsonb);

-- ============================================================================
-- CREATE DESIGN HANDOFF TEMPLATE
-- ============================================================================

INSERT INTO leo_sub_agent_handoffs (sub_agent_id, handoff_template, validation_rules, required_outputs, success_criteria, version, active)
VALUES (
  'design-sub-agent',
  '{
    "handoff_name": "Design to EXEC Handoff",
    "sections": [
      "UI Component Specifications",
      "UX Flow Documentation",
      "Accessibility Requirements",
      "Design System Compliance",
      "Responsive Design Breakpoints",
      "Interaction Specifications",
      "Visual Design Assets"
    ],
    "ui_deliverables": [
      "Component visual mockups or references",
      "CSS/Tailwind class specifications",
      "Design tokens used",
      "Color palette and typography",
      "Spacing and layout grid"
    ],
    "ux_deliverables": [
      "User flow diagrams",
      "Navigation maps",
      "Interaction patterns defined",
      "Accessibility checklist completed",
      "User journey validation"
    ]
  }'::jsonb,
  '[
    {"rule": "ui_checklist_complete", "severity": "error", "message": "All UI checklist items must be completed"},
    {"rule": "ux_checklist_complete", "severity": "error", "message": "All UX checklist items must be completed"},
    {"rule": "accessibility_verified", "severity": "error", "message": "WCAG 2.1 AA compliance must be verified"},
    {"rule": "design_system_compliant", "severity": "warning", "message": "Components should follow design system patterns"}
  ]'::jsonb,
  '[
    "UI component specifications",
    "UX flow documentation",
    "Accessibility audit results",
    "Design system compliance report"
  ]'::jsonb,
  '[
    "Both UI and UX checklists 100% complete",
    "All interactive elements have accessibility attributes",
    "Responsive design tested at all breakpoints",
    "Design system patterns followed"
  ]'::jsonb,
  1,
  true
)
ON CONFLICT (id) DO UPDATE SET
  handoff_template = EXCLUDED.handoff_template,
  validation_rules = EXCLUDED.validation_rules,
  required_outputs = EXCLUDED.required_outputs,
  success_criteria = EXCLUDED.success_criteria;

-- ============================================================================
-- CREATE INDICES FOR PERFORMANCE
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_design_triggers_active
ON leo_sub_agent_triggers(sub_agent_id, active)
WHERE sub_agent_id = 'design-sub-agent' AND active = true;

CREATE INDEX IF NOT EXISTS idx_design_triggers_priority
ON leo_sub_agent_triggers(sub_agent_id, priority DESC)
WHERE sub_agent_id = 'design-sub-agent';

CREATE INDEX IF NOT EXISTS idx_design_triggers_context
ON leo_sub_agent_triggers(sub_agent_id, trigger_context)
WHERE sub_agent_id = 'design-sub-agent';

-- ============================================================================
-- VERIFICATION QUERY
-- ============================================================================

-- Verify all triggers were created
SELECT
  COUNT(*) as total_triggers,
  COUNT(*) FILTER (WHERE metadata->>'mode' = 'ui') as ui_triggers,
  COUNT(*) FILTER (WHERE metadata->>'mode' = 'ux') as ux_triggers,
  COUNT(*) FILTER (WHERE metadata->>'mode' = 'integrated') as integrated_triggers,
  COUNT(*) FILTER (WHERE (metadata->>'critical')::boolean = true) as critical_triggers
FROM leo_sub_agent_triggers
WHERE sub_agent_id = 'design-sub-agent' AND active = true;

-- Show trigger summary by category
SELECT
  metadata->>'mode' as mode,
  metadata->>'category' as category,
  COUNT(*) as count,
  AVG(priority) as avg_priority
FROM leo_sub_agent_triggers
WHERE sub_agent_id = 'design-sub-agent' AND active = true
GROUP BY metadata->>'mode', metadata->>'category'
ORDER BY avg_priority DESC;
