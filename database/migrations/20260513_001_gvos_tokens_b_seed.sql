-- Migration: 20260513_001_gvos_tokens_b_seed.sql
-- SD: SD-LEO-FEAT-GVOS-ACTIVATION-REMEDIATION-001 / FR-1
-- Pairs with: 20260513_001_gvos_tokens_a_schema.sql (sibling SD-GVOS-COMPOSER-SNAPSHOTLOCKED-REGISTRY-ORCH-001)
--
-- Purpose: Seed the gvos_tokens table with the ~31 atomic visual design tokens
--          referenced by archetype.tokens_required arrays in 20260513_002_b_seed.
--          Idempotent via INSERT ... WHERE NOT EXISTS pattern (name is UNIQUE).
--
-- Acceptance:
--   - SELECT COUNT(*) FROM gvos_tokens > 0 (target: 31).
--   - Zero orphan-FK from gvos_archetypes.tokens_required after FR-2 applies.
--   - Second-apply diff is zero (idempotency).

BEGIN;

-- ============================================================================
-- structural (4 tokens)
-- ============================================================================
INSERT INTO public.gvos_tokens (name, category, definition, implementation_hint, libraries_required, accessibility_notes)
SELECT * FROM (VALUES
  ('Bento-Grid Lattice', 'structural', 'Cell-based grid system with asymmetric module sizes, inspired by bento-box composition.', 'CSS Grid with named template areas; modules span 1-3 cells; auto-flow dense for chairman dashboards.', '[]'::jsonb, '12-column fallback for narrow viewports; gridded landmarks announced as semantic regions.'),
  ('Zero-Radius Constraint', 'structural', 'Strict zero-radius rule: all corners are sharp; no border-radius anywhere.', 'CSS: * { border-radius: 0 } at scope root; override only with explicit token Override-Pack-Curve.', '[]'::jsonb, 'High-contrast outlines remain accessible; focus rings use box-shadow not radius.'),
  ('Recursive Padding', 'structural', 'Padding scales with container depth (n × 8px); creates visual hierarchy via density.', 'CSS custom properties: --padding-depth: 8px; nested containers multiply.', '[]'::jsonb, 'Padding never collapses below 8px (44pt touch target on mobile).'),
  ('Geometric Asymmetry', 'structural', 'Intentional off-axis composition; primary content shifted ~5-10% from center.', 'CSS: grid-column-start offset by half a column on hero sections.', '[]'::jsonb, 'Reading flow preserved (left-to-right languages); RTL mirrored automatically.')
) AS t (name, category, definition, implementation_hint, libraries_required, accessibility_notes)
WHERE NOT EXISTS (SELECT 1 FROM public.gvos_tokens g WHERE g.name = t.name);

-- ============================================================================
-- kinetic (4 tokens)
-- ============================================================================
INSERT INTO public.gvos_tokens (name, category, definition, implementation_hint, framer_motion_pattern, libraries_required, accessibility_notes)
SELECT * FROM (VALUES
  ('Inertial Scroll Momentum', 'kinetic', 'Scroll-driven motion with inertial follow-through; deceleration after release.', 'useScroll + useTransform on Y axis; spring smoothing for follow-through.', 'const { scrollYProgress } = useScroll(); useSpring(scrollYProgress, { damping: 30 })', '["framer-motion"]'::jsonb, 'Prefers-reduced-motion: disable inertial follow-through; respect OS settings.'),
  ('Staggered Path-Drawing', 'kinetic', 'SVG path drawing animation with sequential element delays (50-150ms).', 'framer-motion pathLength variant + AnimatePresence stagger.', 'variants={{ visible: { pathLength: 1, transition: { duration: 1, delay: i * 0.1 } } }}', '["framer-motion"]'::jsonb, 'Skip animation if prefers-reduced-motion; render final state directly.'),
  ('Magnetic Lerp', 'kinetic', 'Interactive cursor-attractor: target element lerps toward pointer with damping.', 'useMotionValue + useSpring with damping: 30, stiffness: 400.', 'useMotionValue + useSpring with damping: 30, stiffness: 400', '["framer-motion"]'::jsonb, 'Disabled on touch devices and prefers-reduced-motion users.'),
  ('Scroll-Driven Variable Axis', 'kinetic', 'Variable font axis (wght, wdth, opsz) animated by scroll progress.', 'CSS font-variation-settings interpolation via scroll position.', 'useTransform(scrollY, [0, 100], [400, 700])', '["framer-motion"]'::jsonb, 'Static fallback at min axis values when font-variation-settings unsupported.')
) AS t (name, category, definition, implementation_hint, framer_motion_pattern, libraries_required, accessibility_notes)
WHERE NOT EXISTS (SELECT 1 FROM public.gvos_tokens g WHERE g.name = t.name);

-- ============================================================================
-- atmospheric (4 tokens)
-- ============================================================================
INSERT INTO public.gvos_tokens (name, category, definition, implementation_hint, libraries_required, accessibility_notes)
SELECT * FROM (VALUES
  ('Fragment Shader Shimmer', 'atmospheric', 'WebGL fragment shader producing subtle moving light pattern; hero-background use only.', 'Three.js ShaderMaterial with uTime uniform driven by requestAnimationFrame.', '["three"]'::jsonb, 'Static gradient fallback for prefers-reduced-motion + WebGL-unsupported browsers.'),
  ('Tactile Film Grain', 'atmospheric', 'Subtle SVG noise overlay (~3-5% opacity) for tactile imperfection.', 'SVG feTurbulence filter applied as overlay <div> with mix-blend-mode: overlay.', '[]'::jsonb, 'Disabled when prefers-contrast: more is set.'),
  ('Neutral Plus Lighting', 'atmospheric', 'Soft directional ambient lighting metaphor: 30% darker top-left, 30% lighter bottom-right.', 'CSS radial-gradient with two stops; positioned relative to viewport.', '[]'::jsonb, 'High-contrast mode disables gradient lighting in favor of solid colors.'),
  ('Backdrop Blur Depth', 'atmospheric', 'Layered translucent surfaces with backdrop-filter: blur to create depth hierarchy.', 'backdrop-filter: blur(12px) saturate(180%); cascade by z-index.', '[]'::jsonb, 'Fallback to opaque surface when backdrop-filter unsupported (Firefox/older Safari).')
) AS t (name, category, definition, implementation_hint, libraries_required, accessibility_notes)
WHERE NOT EXISTS (SELECT 1 FROM public.gvos_tokens g WHERE g.name = t.name);

-- ============================================================================
-- compliance (3 tokens)
-- ============================================================================
INSERT INTO public.gvos_tokens (name, category, definition, implementation_hint, libraries_required, accessibility_notes)
SELECT * FROM (VALUES
  ('1px Hairline Borders', 'compliance', 'Strict 1-CSS-pixel borders with adjusted contrast for retina-density screens.', 'border-width: 1px; opacity adjusted for device-pixel-ratio >= 2.', '[]'::jsonb, 'Border contrast >= 3:1 against background (WCAG 2.1 AA non-text contrast).'),
  ('Atomic Tokenization', 'compliance', 'All visual properties (color/spacing/typography) emitted as design tokens, never literals.', 'CSS custom properties scoped via :root with tier-specific overrides.', '[]'::jsonb, 'Token names readable in dev tools; semantic naming (--color-text-primary) preferred over visual (--color-blue-500).'),
  ('Prefers-Reduced-Motion Guardrails', 'compliance', 'Every kinetic token honors @media (prefers-reduced-motion: reduce) by disabling motion or providing static fallback.', 'CSS @media query gates animations; framer-motion useReducedMotion() hook.', '["framer-motion"]'::jsonb, 'Verify static fallback delivers same information; never lose content to motion-disabled users.')
) AS t (name, category, definition, implementation_hint, libraries_required, accessibility_notes)
WHERE NOT EXISTS (SELECT 1 FROM public.gvos_tokens g WHERE g.name = t.name);

-- ============================================================================
-- typography (3 tokens)
-- ============================================================================
INSERT INTO public.gvos_tokens (name, category, definition, implementation_hint, libraries_required, accessibility_notes)
SELECT * FROM (VALUES
  ('type_voice', 'typography', 'Voice marker selecting one of the 5 canonical type voices (Geometric-Sans, Humanist-Sans, Transitional-Serif, Slab-Display, Mono-Operator).', 'CSS font-family stack with subset fallbacks; load via @font-face with font-display: swap.', '[]'::jsonb, 'Font-display: swap prevents FOIT; system fallbacks announced semantically by archetype.'),
  ('type_scale_ratio', 'typography', 'Typographic scale ratio (1.125, 1.2, 1.25, 1.333, 1.5) governing step between heading sizes.', 'CSS custom property --type-scale; clamp() with viewport-based fluid sizing.', '[]'::jsonb, 'Minimum body size 16px (1rem); h1-h6 never exceed 2x at small breakpoints.'),
  ('type_weight_contrast', 'typography', 'Weight contrast ratio between body and emphasis (e.g., 400 vs 700 = strong, 400 vs 500 = subtle).', 'font-weight via variable axis (wght) where supported; fixed weights as fallback.', '[]'::jsonb, 'Minimum 200 unit weight difference between body and emphasis for visual hierarchy.')
) AS t (name, category, definition, implementation_hint, libraries_required, accessibility_notes)
WHERE NOT EXISTS (SELECT 1 FROM public.gvos_tokens g WHERE g.name = t.name);

-- ============================================================================
-- vertical-expansion (6 tokens — added in B2 chairman-confirmed Option B)
-- ============================================================================
INSERT INTO public.gvos_tokens (name, category, definition, implementation_hint, libraries_required, accessibility_notes)
SELECT * FROM (VALUES
  ('Illustrative-Iconography', 'vertical-expansion', 'Hand-drawn or stylized iconography (vs photographic). Used for Civic-Institutional, Editorial-Print, Playful-Expressive.', 'SVG icons with consistent stroke-width; library reference: Lucide / Phosphor stylized variants.', '["lucide-react"]'::jsonb, 'aria-label on every decorative icon; aria-hidden on purely-decorative.'),
  ('A11Y-AAA-Contrast-Floor', 'vertical-expansion', 'WCAG 2.1 AAA contrast (7:1 normal text, 4.5:1 large text). Required for Clinical-Evidence, Civic-Institutional.', 'Contrast tooling at design time; CI gate via axe-core threshold.', '["@axe-core/playwright"]'::jsonb, 'Validate via automated tooling; manual review for non-text contrast.'),
  ('Tabular-Numerics', 'vertical-expansion', 'OpenType tabular figures (font-feature-settings: "tnum") for data-heavy archetypes.', 'CSS: font-variant-numeric: tabular-nums; on financial/medical/scientific data cells.', '[]'::jsonb, 'Tabular numerics improve scannability for screen-reader users on numeric tables.'),
  ('Plain-Language-Preference', 'vertical-expansion', 'Reading-level constraint: target 8th-grade or lower for Civic-Institutional + Clinical-Evidence + Playful-Expressive.', 'Composer emits prompt_directives.reading_level=plain; Lovable validates output.', '[]'::jsonb, 'WCAG 3.1.5 reading level (AAA); use Flesch-Kincaid or hemingway-app metric.'),
  ('Print-Grid-Asymmetry', 'vertical-expansion', 'Print-publication-inspired asymmetric column grid (e.g., 4 narrow + 1 wide; or sidebar gutter).', 'CSS Grid with explicit column widths; pattern reference: Bauhaus print posters.', '[]'::jsonb, 'Reading order preserved via source order; flex order avoided for screen readers.'),
  ('Bounce-Easing', 'vertical-expansion', 'Cubic-bezier easing with overshoot for Playful-Expressive and Artist-Expressive archetypes.', 'CSS: cubic-bezier(0.34, 1.56, 0.64, 1); framer-motion: type: "spring", bounce: 0.4.', '["framer-motion"]'::jsonb, 'Disabled under prefers-reduced-motion: use linear ease instead.')
) AS t (name, category, definition, implementation_hint, libraries_required, accessibility_notes)
WHERE NOT EXISTS (SELECT 1 FROM public.gvos_tokens g WHERE g.name = t.name);

-- ============================================================================
-- hidden-risk (4 tokens — runtime fallback governance)
-- ============================================================================
INSERT INTO public.gvos_tokens (name, category, definition, implementation_hint, libraries_required, accessibility_notes)
SELECT * FROM (VALUES
  ('motion_runtime', 'hidden-risk', 'Declares the motion runtime library used (framer-motion default; GSAP allowed for complex timelines).', 'composer emits in prompt_directives: { motion_runtime: "framer-motion" }; Lovable picks library.', '["framer-motion"]'::jsonb, 'Both runtimes must respect prefers-reduced-motion.'),
  ('motion_reduce_fallback', 'hidden-risk', 'Behavior when user has prefers-reduced-motion: reduce (default: disable + show final state).', 'CSS: @media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration: 0.01s !important } }', '[]'::jsonb, 'Required by WCAG 2.3.3 (Animation from Interactions).'),
  ('icon_source', 'hidden-risk', 'Icon library selection: lucide-react default; svgr custom for branded archetypes.', 'Import strategy: tree-shakeable; bundle-size budget 30KB per archetype.', '["lucide-react"]'::jsonb, 'Decorative icons aria-hidden; semantic icons aria-label.'),
  ('cursor_touch_fallback', 'hidden-risk', 'Magnetic-Lerp and similar cursor-driven tokens require touch-device fallback (disable or replace).', '@media (pointer: coarse) { /* disable cursor-tracking */ }', '[]'::jsonb, 'Touch users get static or alternative micro-interaction (tap-to-reveal).')
) AS t (name, category, definition, implementation_hint, libraries_required, accessibility_notes)
WHERE NOT EXISTS (SELECT 1 FROM public.gvos_tokens g WHERE g.name = t.name);

-- ============================================================================
-- pack (3 tokens — composite tokens that decompose at composer time)
-- ============================================================================
INSERT INTO public.gvos_tokens (name, category, definition, implementation_hint, libraries_required, accessibility_notes)
SELECT * FROM (VALUES
  ('Full-Bleed-Media-Pattern', 'pack', 'Composite pack: full-width hero media + edge-to-edge image grid + zero margin sections.', 'Decomposes to: no-container max-width; image aspect-ratio enforcement; loading="lazy" below fold.', '[]'::jsonb, 'Decorative imagery alt=""; informative imagery descriptive alt; aria-roledescription on hero.'),
  ('Artist-Override-Pack', 'pack', 'Composite pack for Artist-Expressive: permits color-saturation overrides, hand-drawn elements, off-grid placement.', 'Decomposes to: relaxed grid; custom-property hue-rotate; cursor variants.', '["framer-motion"]'::jsonb, 'Maintains AA contrast despite saturation overrides; alt-text mandatory.'),
  ('Cinematic-Crop-Pack', 'pack', 'Composite pack for Cinematic-Immersive: 2.35:1 letterbox, slow ken-burns, deep-shadow gradient overlays.', 'Decomposes to: aspect-ratio: 2.35/1; framer-motion scale animation; ::after pseudo for shadow gradient.', '["framer-motion"]'::jsonb, 'Static fallback frame at center; prefers-reduced-motion disables ken-burns.')
) AS t (name, category, definition, implementation_hint, libraries_required, accessibility_notes)
WHERE NOT EXISTS (SELECT 1 FROM public.gvos_tokens g WHERE g.name = t.name);

-- ============================================================================
-- Verify: expected 31 tokens (4+4+4+3+3+6+4+3 = 31)
-- ============================================================================
DO $$
DECLARE
  total_tokens INT;
BEGIN
  SELECT COUNT(*) INTO total_tokens FROM public.gvos_tokens;
  IF total_tokens < 31 THEN
    RAISE NOTICE 'gvos_tokens count: % (expected >= 31)', total_tokens;
  ELSE
    RAISE NOTICE 'gvos_tokens count: % (>= 31 target reached)', total_tokens;
  END IF;
END $$;

COMMIT;
