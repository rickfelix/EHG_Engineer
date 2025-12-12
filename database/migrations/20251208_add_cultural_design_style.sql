-- ============================================================================
-- MIGRATION: Add Cultural Design Style to Ventures
-- SD: SD-DESIGN-CULTURAL-001 (future implementation)
-- Created: 2025-12-08
-- Author: Claude Code (Design Sub-Agent Enhancement)
--
-- Purpose: Adds venture-based cultural design style selection to support
--          the Handcrafted Design System (Stage 55 PRD)
-- Reference: docs/02_api/design_system_handcrafted.md
--            docs/workflow/stages_v2.yaml (Stage 10: Strategic Naming)
-- ============================================================================

-- Create enum for cultural design styles
DO $$ BEGIN
    CREATE TYPE cultural_design_style_enum AS ENUM (
        'wabi_sabi',      -- Japanese: organic asymmetry, intentional imperfection
        'swiss_minimal',  -- Precision with breaks, high legibility, trust
        'bauhaus',        -- Form follows function, geometric primitives
        'california_modern' -- Optimistic functionality, warm minimalism
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Add cultural_design_style column to ventures table
ALTER TABLE ventures
ADD COLUMN IF NOT EXISTS cultural_design_style cultural_design_style_enum DEFAULT NULL;

-- Add design_style_config JSONB for additional style parameters
ALTER TABLE ventures
ADD COLUMN IF NOT EXISTS design_style_config JSONB DEFAULT NULL;

-- Comment explaining the fields
COMMENT ON COLUMN ventures.cultural_design_style IS
'Cultural design style selected during Stage 10 (Strategic Naming).
Determines UI aesthetic variance applied by the design sub-agent.
Reference: docs/02_api/design_system_handcrafted.md';

COMMENT ON COLUMN ventures.design_style_config IS
'Optional JSON configuration for design style customization.
Example: {"intensity": 5, "color_override": "warm", "accessibility_strict": true}';

-- Create reference table for cultural design style details
CREATE TABLE IF NOT EXISTS cultural_design_styles (
    style_key VARCHAR(30) PRIMARY KEY,
    display_name VARCHAR(100) NOT NULL,
    description TEXT,
    best_for TEXT[], -- Industry verticals this style suits
    characteristics TEXT,
    variance_rules JSONB, -- Mathematical variance parameters
    tailwind_tokens JSONB, -- Default Tailwind class mappings
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE cultural_design_styles ENABLE ROW LEVEL SECURITY;

-- Public read access (reference table)
CREATE POLICY "cultural_design_styles_select" ON cultural_design_styles
    FOR SELECT USING (true);

-- Seed the reference data
INSERT INTO cultural_design_styles (style_key, display_name, description, best_for, characteristics, variance_rules, tailwind_tokens)
VALUES
    (
        'wabi_sabi',
        'Wabi-sabi (Japanese)',
        'Beauty in imperfection, organic asymmetry, natural warmth. Celebrates the handcrafted and impermanent.',
        ARRAY['wellness', 'artisanal', 'premium lifestyle', 'sustainability', 'handmade goods', 'organic products'],
        'Organic asymmetry, intentional imperfection, natural warmth, subtle textures',
        '{"spacing_variance": 0.05, "desaturation": 0.10, "off_center": 0.15, "rotation_max_deg": 3, "corner_softening": 0.05}'::JSONB,
        '{"bg": "bg-stone-50", "text": "text-stone-800", "accent": "text-amber-700", "radius": "rounded-lg", "shadow": "shadow-sm"}'::JSONB
    ),
    (
        'swiss_minimal',
        'Swiss Minimal',
        'Clarity through reduction, grid precision with intentional breaks, high legibility and trust.',
        ARRAY['fintech', 'enterprise B2B', 'legal', 'healthcare', 'insurance', 'government'],
        'Grid precision with 2% breaks, golden ratio typography, high contrast, clean lines',
        '{"grid_deviation": 0.02, "contrast_ratio": 7.0, "type_scale": 1.25, "spacing_strict": true}'::JSONB,
        '{"bg": "bg-slate-50", "text": "text-slate-900", "accent": "text-blue-800", "radius": "rounded-sm", "shadow": "shadow-sm"}'::JSONB
    ),
    (
        'bauhaus',
        'Bauhaus',
        'Form follows function with character, geometric primitives, bold and purposeful.',
        ARRAY['architecture', 'manufacturing', 'design tools', 'education', 'engineering', 'construction'],
        'Geometric shapes, bold colors, functional design, intentional 3% corner softening',
        '{"corner_softening": 0.03, "vibrance_boost": 0.10, "geometric_shapes": true, "primary_colors": true}'::JSONB,
        '{"bg": "bg-white", "text": "text-gray-900", "accent": "text-red-600", "radius": "rounded-none", "shadow": "shadow-md"}'::JSONB
    ),
    (
        'california_modern',
        'California Modern',
        'Optimistic functionality, warm minimalism, approachable and friendly.',
        ARRAY['consumer apps', 'SaaS', 'social platforms', 'startups', 'lifestyle', 'fitness', 'food tech'],
        'Warm colors, breathing room, soft shadows, approachable typography',
        '{"brightness_boost": 0.15, "warmth_shift": 0.05, "breathing_room": 0.10, "shadow_softness": 0.8}'::JSONB,
        '{"bg": "bg-orange-50", "text": "text-gray-800", "accent": "text-orange-600", "radius": "rounded-xl", "shadow": "shadow-lg"}'::JSONB
    )
ON CONFLICT (style_key) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    description = EXCLUDED.description,
    best_for = EXCLUDED.best_for,
    characteristics = EXCLUDED.characteristics,
    variance_rules = EXCLUDED.variance_rules,
    tailwind_tokens = EXCLUDED.tailwind_tokens;

-- Create index for efficient style lookups
CREATE INDEX IF NOT EXISTS idx_ventures_cultural_design_style
ON ventures(cultural_design_style)
WHERE cultural_design_style IS NOT NULL;

-- ============================================================================
-- FUNCTION: Get recommended style based on industry
-- ============================================================================
CREATE OR REPLACE FUNCTION get_recommended_cultural_style(p_industry TEXT)
RETURNS TABLE (
    style_key VARCHAR(30),
    display_name VARCHAR(100),
    match_reason TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        cds.style_key,
        cds.display_name,
        'Industry match: ' || p_industry AS match_reason
    FROM cultural_design_styles cds
    WHERE p_industry = ANY(cds.best_for)
    ORDER BY cds.style_key
    LIMIT 1;

    -- If no match, default to california_modern (most versatile)
    IF NOT FOUND THEN
        RETURN QUERY
        SELECT
            cds.style_key,
            cds.display_name,
            'Default recommendation for versatility' AS match_reason
        FROM cultural_design_styles cds
        WHERE cds.style_key = 'california_modern';
    END IF;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_recommended_cultural_style IS
'Returns recommended cultural design style based on venture industry.
Used during Stage 10 (Strategic Naming) to suggest appropriate design aesthetic.';
