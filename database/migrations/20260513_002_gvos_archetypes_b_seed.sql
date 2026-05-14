-- Migration: 20260513_002_gvos_archetypes_b_seed.sql
-- SD: SD-LEO-FEAT-GVOS-ACTIVATION-REMEDIATION-001 / FR-2
-- Pairs with: 20260513_002_gvos_archetypes_a_schema.sql (sibling SD-GVOS-COMPOSER-SNAPSHOTLOCKED-REGISTRY-ORCH-001)
-- Brainstorm: c30963a7-382b-4152-9de8-b8d8d146504f (11-archetype model)
--
-- Purpose: Seed 11 curated archetype bundles. Idempotent via prompt_token UNIQUE.
--
-- Acceptance (dual assertion required in one round-trip):
--   1. SELECT COUNT(*) FROM gvos_archetypes = 11
--   2. SUM(jsonb_array_length(negative_prompt_list)) = 28 (Aria Round-3 audit total)
--
-- Negative-prompt distribution (sums to 28):
--   Sovereign-Operator: 3   Brutalist-Utility: 3   Atmospheric-Quiet: 2
--   Editorial-Kinetic: 3    Clinical-Evidence: 4   Civic-Institutional: 2
--   Playful-Expressive: 2   Editorial-Print: 2     Gallery-Curatorial: 2
--   Artist-Expressive: 2    Cinematic-Immersive: 3
--   Sum: 3+3+2+3+4+2+2+2+2+2+3 = 28 ✓

BEGIN;

-- Migration-order check: gvos_prompt_rubrics must exist before this seed runs
-- (FR-2 GRANT statements referenced rubrics table per planning note).
DO $$
BEGIN
  IF to_regclass('public.gvos_prompt_rubrics') IS NULL THEN
    RAISE EXCEPTION 'Migration order violation: 20260513_007_gvos_prompt_rubrics_a_schema must apply BEFORE this seed (FR-3 before FR-2).'
      USING ERRCODE = 'P0001';
  END IF;
END $$;

INSERT INTO public.gvos_archetypes (
  display_name, prompt_token, good_for_subtitle, tokens_required, prompt_directives,
  substrate, accent, typography_voice, industry_tags, audience_tags, business_model_tags,
  gating_class, negative_prompt_list, archetype_category, excluded, version
)
SELECT * FROM (VALUES
  -- 1. Sovereign-Operator: B2B SaaS, fintech, compliance — 3 negatives
  (
    'Quiet Confidence',
    'Sovereign-Operator',
    'B2B SaaS, fintech, compliance',
    jsonb_build_array('Bento-Grid Lattice', 'Zero-Radius Constraint', 'Recursive Padding', 'Neutral Plus Lighting', 'Backdrop Blur Depth', '1px Hairline Borders', 'Atomic Tokenization', 'Prefers-Reduced-Motion Guardrails', 'type_voice', 'type_scale_ratio', 'type_weight_contrast', 'motion_runtime', 'motion_reduce_fallback', 'Tabular-Numerics'),
    jsonb_build_object('motion_runtime', 'framer-motion', 'reading_level', 'professional', 'tone', 'restrained-authoritative'),
    jsonb_build_object('base', 'paper-white', 'surface', 'subtle-warm-gray', 'depth', 'translucent-cards'),
    jsonb_build_object('primary', 'deep-navy', 'support', 'graphite', 'cta', 'sovereign-blue'),
    'Geometric-Sans',
    jsonb_build_array('saas', 'fintech', 'compliance'),
    jsonb_build_array('executive', 'compliance-officer', 'CFO', 'enterprise-buyer'),
    jsonb_build_array('B2B-SaaS', 'enterprise-license', 'compliance-led'),
    NULL,
    jsonb_build_array('bright-startup-gradient-hero', 'animated-confetti-on-CTA', 'hand-drawn-icon-as-primary-visual'),
    'saas', FALSE, 1
  ),
  -- 2. Brutalist-Utility: Dev tools, infrastructure — 3 negatives
  (
    'Engineered Edge',
    'Brutalist-Utility',
    'Dev tools, infrastructure',
    jsonb_build_array('Bento-Grid Lattice', 'Zero-Radius Constraint', '1px Hairline Borders', 'Atomic Tokenization', 'Tactile Film Grain', 'Prefers-Reduced-Motion Guardrails', 'type_voice', 'type_scale_ratio', 'type_weight_contrast', 'motion_runtime', 'icon_source', 'Tabular-Numerics'),
    jsonb_build_object('motion_runtime', 'framer-motion', 'reading_level', 'technical', 'tone', 'precise-utilitarian'),
    jsonb_build_object('base', 'graphite', 'surface', 'cold-charcoal', 'depth', 'sharp-edge-cards'),
    jsonb_build_object('primary', 'electric-cyan', 'support', 'monospace-amber', 'cta', 'hot-red-monospace'),
    'Mono-Operator',
    jsonb_build_array('devtools', 'infrastructure', 'deeptech'),
    jsonb_build_array('developer', 'devops', 'site-reliability', 'architect'),
    jsonb_build_array('open-source', 'developer-tools', 'B2D'),
    NULL,
    jsonb_build_array('rounded-friendly-illustrations', 'pastel-color-palette', 'lifestyle-photography'),
    'deeptech', FALSE, 1
  ),
  -- 3. Atmospheric-Quiet: Wellness, personal finance — 2 negatives
  (
    'Calm Minimal',
    'Atmospheric-Quiet',
    'Wellness, personal finance',
    jsonb_build_array('Recursive Padding', 'Neutral Plus Lighting', 'Backdrop Blur Depth', 'Fragment Shader Shimmer', 'Atomic Tokenization', 'Prefers-Reduced-Motion Guardrails', 'type_voice', 'type_scale_ratio', 'motion_runtime', 'motion_reduce_fallback'),
    jsonb_build_object('motion_runtime', 'framer-motion', 'reading_level', 'plain', 'tone', 'reassuring-soft'),
    jsonb_build_object('base', 'breath-cream', 'surface', 'sand-warm', 'depth', 'air-gradient'),
    jsonb_build_object('primary', 'sage-green', 'support', 'dusk-blush', 'cta', 'still-cobalt'),
    'Humanist-Sans',
    jsonb_build_array('wellness', 'personal-finance', 'mental-health'),
    jsonb_build_array('individual', 'wellness-seeker', 'personal-investor'),
    jsonb_build_array('B2C', 'subscription-wellness', 'D2C'),
    NULL,
    jsonb_build_array('aggressive-CTAs', 'high-saturation-warning-colors'),
    'services', FALSE, 1
  ),
  -- 4. Editorial-Kinetic: Premium marketing, brand-led — 3 negatives
  (
    'Editorial Showcase',
    'Editorial-Kinetic',
    'Premium marketing, brand-led',
    jsonb_build_array('Bento-Grid Lattice', 'Geometric Asymmetry', 'Inertial Scroll Momentum', 'Staggered Path-Drawing', 'Magnetic Lerp', 'Scroll-Driven Variable Axis', 'Backdrop Blur Depth', 'Fragment Shader Shimmer', 'Atomic Tokenization', 'Prefers-Reduced-Motion Guardrails', 'type_voice', 'type_scale_ratio', 'type_weight_contrast', 'motion_runtime', 'cursor_touch_fallback', 'Full-Bleed-Media-Pattern'),
    jsonb_build_object('motion_runtime', 'framer-motion', 'reading_level', 'considered', 'tone', 'curated-prestige'),
    jsonb_build_object('base', 'gallery-white', 'surface', 'editorial-cream', 'depth', 'cinematic-blur'),
    jsonb_build_object('primary', 'editorial-black', 'support', 'foil-gold', 'cta', 'magazine-vermillion'),
    'Transitional-Serif',
    jsonb_build_array('luxury', 'premium-marketing', 'brand-agency'),
    jsonb_build_array('creative-director', 'brand-manager', 'marketing-vp'),
    jsonb_build_array('B2B-services', 'agency-retainer', 'premium-brand'),
    NULL,
    jsonb_build_array('low-resolution-stock-photos', 'inline-cta-stacks-without-hierarchy', 'fast-bouncy-easing'),
    'creator_tools', FALSE, 1
  ),
  -- 5. Clinical-Evidence: Healthcare, medical, legal — 4 negatives
  (
    'Evidence Forward',
    'Clinical-Evidence',
    'Healthcare, medical, legal',
    jsonb_build_array('Bento-Grid Lattice', 'Zero-Radius Constraint', 'Recursive Padding', '1px Hairline Borders', 'Atomic Tokenization', 'Prefers-Reduced-Motion Guardrails', 'type_voice', 'type_scale_ratio', 'type_weight_contrast', 'motion_runtime', 'A11Y-AAA-Contrast-Floor', 'Tabular-Numerics', 'Plain-Language-Preference'),
    jsonb_build_object('motion_runtime', 'framer-motion', 'reading_level', 'plain', 'tone', 'evidence-based-clinical', 'compliance', 'HIPAA-aware'),
    jsonb_build_object('base', 'clinical-white', 'surface', 'lab-eggshell', 'depth', 'flat-evidence'),
    jsonb_build_object('primary', 'medical-navy', 'support', 'evidence-amber', 'cta', 'consent-teal'),
    'Humanist-Sans',
    jsonb_build_array('healthcare', 'medical', 'legal', 'pharma'),
    jsonb_build_array('clinician', 'patient', 'medical-administrator', 'legal-counsel'),
    jsonb_build_array('B2B-healthcare', 'patient-portal', 'compliance-regulated'),
    NULL,
    jsonb_build_array('DNA-helix-overlay-on-blue-gradient', 'stock-photo-doctor-pointing-at-camera', 'aggressive-marketing-CTAs', 'unsubstantiated-statistical-claims'),
    'healthtech', FALSE, 1
  ),
  -- 6. Civic-Institutional: Government, education — 2 negatives
  (
    'Public Clarity',
    'Civic-Institutional',
    'Government, education',
    jsonb_build_array('Bento-Grid Lattice', 'Recursive Padding', '1px Hairline Borders', 'Atomic Tokenization', 'Prefers-Reduced-Motion Guardrails', 'type_voice', 'type_scale_ratio', 'motion_runtime', 'A11Y-AAA-Contrast-Floor', 'Plain-Language-Preference', 'Illustrative-Iconography'),
    jsonb_build_object('motion_runtime', 'framer-motion', 'reading_level', 'plain', 'tone', 'civic-clear-trustworthy', 'compliance', 'WCAG-AAA'),
    jsonb_build_object('base', 'public-paper', 'surface', 'civic-gray', 'depth', 'flat-institutional'),
    jsonb_build_object('primary', 'civic-navy', 'support', 'public-amber', 'cta', 'action-green'),
    'Humanist-Sans',
    jsonb_build_array('government', 'education', 'civic-services', 'nonprofit'),
    jsonb_build_array('citizen', 'student', 'educator', 'civic-administrator'),
    jsonb_build_array('B2G', 'public-service', 'nonprofit'),
    NULL,
    jsonb_build_array('corporate-marketing-aesthetic', 'commercial-product-photography-style'),
    'edtech', FALSE, 1
  ),
  -- 7. Playful-Expressive: Childrens, social-consumer — 2 negatives
  (
    'Friendly Energy',
    'Playful-Expressive',
    'Childrens, social-consumer',
    jsonb_build_array('Bento-Grid Lattice', 'Recursive Padding', 'Magnetic Lerp', 'Staggered Path-Drawing', 'Atomic Tokenization', 'Prefers-Reduced-Motion Guardrails', 'type_voice', 'type_scale_ratio', 'motion_runtime', 'motion_reduce_fallback', 'icon_source', 'cursor_touch_fallback', 'Bounce-Easing', 'Illustrative-Iconography', 'Plain-Language-Preference'),
    jsonb_build_object('motion_runtime', 'framer-motion', 'reading_level', 'plain', 'tone', 'warm-playful-inviting'),
    jsonb_build_object('base', 'warm-cream', 'surface', 'playful-mint', 'depth', 'soft-shadow-cards'),
    jsonb_build_object('primary', 'sunshine-coral', 'support', 'happy-marigold', 'cta', 'play-blue'),
    'Humanist-Sans',
    jsonb_build_array('childrens', 'social-consumer', 'family-products', 'toys'),
    jsonb_build_array('parent', 'child', 'family', 'caretaker'),
    jsonb_build_array('B2C', 'consumer-subscription', 'family-app'),
    NULL,
    jsonb_build_array('corporate-enterprise-blue', 'sterile-clinical-whitespace'),
    'e_commerce', FALSE, 1
  ),
  -- 8. Editorial-Print: Publishing, magazines — 2 negatives
  (
    'Long-form Authority',
    'Editorial-Print',
    'Publishing, magazines',
    jsonb_build_array('Geometric Asymmetry', 'Recursive Padding', '1px Hairline Borders', 'Atomic Tokenization', 'Prefers-Reduced-Motion Guardrails', 'type_voice', 'type_scale_ratio', 'type_weight_contrast', 'motion_runtime', 'Print-Grid-Asymmetry', 'Illustrative-Iconography', 'Tabular-Numerics'),
    jsonb_build_object('motion_runtime', 'framer-motion', 'reading_level', 'considered', 'tone', 'magazine-byline-authority'),
    jsonb_build_object('base', 'magazine-cream', 'surface', 'editorial-warm', 'depth', 'print-paper-shadow'),
    jsonb_build_object('primary', 'byline-charcoal', 'support', 'columnist-burgundy', 'cta', 'editorial-gold'),
    'Transitional-Serif',
    jsonb_build_array('publishing', 'magazines', 'editorial', 'long-form-journalism'),
    jsonb_build_array('reader', 'editor', 'publisher', 'literary-audience'),
    jsonb_build_array('subscription-publishing', 'D2C-print', 'B2C-content'),
    NULL,
    jsonb_build_array('motion-heavy-hero-sections', 'startup-style-flat-illustrations'),
    'creator_tools', FALSE, 1
  ),
  -- 9. Gallery-Curatorial: Art galleries, museums, luxury — 2 negatives
  (
    'Curated Silence',
    'Gallery-Curatorial',
    'Art galleries, museums, luxury',
    jsonb_build_array('Geometric Asymmetry', 'Recursive Padding', 'Inertial Scroll Momentum', 'Backdrop Blur Depth', 'Atomic Tokenization', 'Prefers-Reduced-Motion Guardrails', 'type_voice', 'type_scale_ratio', 'motion_runtime', 'cursor_touch_fallback', 'Full-Bleed-Media-Pattern'),
    jsonb_build_object('motion_runtime', 'framer-motion', 'reading_level', 'considered', 'tone', 'museum-curatorial-restrained'),
    jsonb_build_object('base', 'gallery-white', 'surface', 'museum-bone', 'depth', 'spotlight-soft'),
    jsonb_build_object('primary', 'curator-charcoal', 'support', 'patina-bronze', 'cta', 'placard-cobalt'),
    'Transitional-Serif',
    jsonb_build_array('art-galleries', 'museums', 'luxury', 'fine-art'),
    jsonb_build_array('collector', 'curator', 'gallery-visitor', 'luxury-consumer'),
    jsonb_build_array('B2C-luxury', 'museum-nonprofit', 'gallery-retail'),
    NULL,
    jsonb_build_array('busy-product-grid-overlays', 'aggressive-discount-banners'),
    'creator_tools', FALSE, 1
  ),
  -- 10. Artist-Expressive: Musicians, indie artists — 2 negatives
  (
    'Personal Voice',
    'Artist-Expressive',
    'Musicians, indie artists',
    jsonb_build_array('Geometric Asymmetry', 'Tactile Film Grain', 'Magnetic Lerp', 'Scroll-Driven Variable Axis', 'Fragment Shader Shimmer', 'Atomic Tokenization', 'Prefers-Reduced-Motion Guardrails', 'type_voice', 'motion_runtime', 'cursor_touch_fallback', 'Bounce-Easing', 'Artist-Override-Pack'),
    jsonb_build_object('motion_runtime', 'framer-motion', 'reading_level', 'considered', 'tone', 'authentic-personal-handmade'),
    jsonb_build_object('base', 'studio-warm', 'surface', 'tape-cream', 'depth', 'analog-grain'),
    jsonb_build_object('primary', 'inkblot-black', 'support', 'tape-yellow', 'cta', 'amp-red'),
    'Slab-Display',
    jsonb_build_array('musicians', 'indie-artists', 'creator-economy', 'performing-arts'),
    jsonb_build_array('fan', 'artist', 'creator', 'audiophile'),
    jsonb_build_array('D2C-creator', 'fan-subscription', 'merch-direct'),
    'artist',
    jsonb_build_array('corporate-grid-template', 'stock-photography-portraits'),
    'creator_tools', FALSE, 1
  ),
  -- 11. Cinematic-Immersive: Film/TV, streaming, AAA gaming — 3 negatives
  (
    'Big Screen',
    'Cinematic-Immersive',
    'Film/TV, streaming, AAA gaming',
    jsonb_build_array('Geometric Asymmetry', 'Inertial Scroll Momentum', 'Scroll-Driven Variable Axis', 'Fragment Shader Shimmer', 'Tactile Film Grain', 'Backdrop Blur Depth', 'Atomic Tokenization', 'Prefers-Reduced-Motion Guardrails', 'type_voice', 'type_scale_ratio', 'motion_runtime', 'motion_reduce_fallback', 'cursor_touch_fallback', 'Cinematic-Crop-Pack', 'Full-Bleed-Media-Pattern'),
    jsonb_build_object('motion_runtime', 'framer-motion', 'reading_level', 'considered', 'tone', 'cinematic-immersive-bold'),
    jsonb_build_object('base', 'deep-black', 'surface', 'cinema-charcoal', 'depth', 'spotlight-vignette'),
    jsonb_build_object('primary', 'screen-gold', 'support', 'arclight-amber', 'cta', 'premiere-crimson'),
    'Slab-Display',
    jsonb_build_array('film-tv', 'streaming', 'AAA-gaming', 'entertainment'),
    jsonb_build_array('audience', 'viewer', 'gamer', 'cinephile'),
    jsonb_build_array('B2C-entertainment', 'subscription-streaming', 'AAA-game-launch'),
    NULL,
    jsonb_build_array('natural-light-smiling-team-as-hero', 'corporate-stock-photography', 'bright-flat-pastel-color-palette'),
    'creator_tools', FALSE, 1
  )
) AS t (display_name, prompt_token, good_for_subtitle, tokens_required, prompt_directives, substrate, accent, typography_voice, industry_tags, audience_tags, business_model_tags, gating_class, negative_prompt_list, archetype_category, excluded, version)
WHERE NOT EXISTS (SELECT 1 FROM public.gvos_archetypes g WHERE g.prompt_token = t.prompt_token);

-- ============================================================================
-- Dual acceptance assertion (FR-2 acceptance criterion #2)
-- ============================================================================
DO $$
DECLARE
  archetype_count INT;
  prompt_total INT;
BEGIN
  SELECT
    COUNT(*),
    COALESCE(SUM(jsonb_array_length(negative_prompt_list)), 0)
  INTO archetype_count, prompt_total
  FROM public.gvos_archetypes;

  IF archetype_count != 11 THEN
    RAISE EXCEPTION 'FR-2 acceptance FAILED: archetype count is % (expected 11)', archetype_count;
  END IF;

  IF prompt_total != 28 THEN
    RAISE EXCEPTION 'FR-2 acceptance FAILED: negative_prompt_list total is % (expected 28 per Aria Round-3 audit)', prompt_total;
  END IF;

  RAISE NOTICE 'FR-2 dual assertion PASSED: archetypes=% prompts=%', archetype_count, prompt_total;
END $$;

-- ============================================================================
-- Orphan-FK sanity check: every tokens_required entry resolves to gvos_tokens.name
-- ============================================================================
DO $$
DECLARE
  orphan_count INT;
BEGIN
  SELECT COUNT(*) INTO orphan_count
  FROM public.gvos_archetypes a
  CROSS JOIN LATERAL jsonb_array_elements_text(a.tokens_required) AS req(token_name)
  WHERE NOT EXISTS (SELECT 1 FROM public.gvos_tokens t WHERE t.name = req.token_name);

  IF orphan_count > 0 THEN
    RAISE EXCEPTION 'FR-2 orphan-FK FAILED: % archetype tokens_required entries do not resolve to gvos_tokens.name', orphan_count;
  END IF;

  RAISE NOTICE 'FR-2 orphan-FK check PASSED: all archetype tokens_required entries resolve to gvos_tokens';
END $$;

COMMIT;
