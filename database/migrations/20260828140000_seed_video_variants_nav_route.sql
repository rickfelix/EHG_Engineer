-- Seed the /video-variants nav_routes row as a proper migration, not an ad hoc insert.
--
-- SD-LEO-FEAT-MEDIA-PRODUCTION-CAPABILITY-001-D (FR-6 / US-007). TESTING FAIL 49e5b1ef
-- (item 5): the row was previously inserted directly against the live DB during EXEC, with no
-- migration/seed file backing it -- it would not exist in a fresh environment (e.g. a restored
-- backup, a new Supabase project, or any environment rebuilt from migrations alone). It was
-- also seeded with maturity='draft', which useNavigation()/NavigationService filters out by
-- DEFAULT for every user: NavigationService.getUserPreferences() creates
-- { show_draft: false, show_development: false, show_complete: true } for any user without an
-- existing nav_preferences row (src/services/navigationService.ts:116-122), so a draft-maturity
-- route renders for NOBODY until a user explicitly opts into draft visibility. maturity is set
-- to 'complete' here so the route actually renders for a normal user with default preferences
-- -- confirmed by checking NavigationService's own default-preferences literal, not assumed.
--
-- Idempotent: upserts on the path unique constraint so re-running this file (or applying it to
-- an environment where the ad hoc row already exists from EXEC-time testing) converges to the
-- same row rather than erroring or duplicating.

INSERT INTO public.nav_routes
  (path, title, description, section, maturity, icon_key, sort_index, badge_key, static_badge, personas, persona_priority)
VALUES
  (
    '/video-variants',
    'Video Variant Testing',
    'Generate & score video variants',
    'go-to-market',
    'complete',
    'Palette',
    33,
    NULL,
    'New',
    ARRAY['chairman', 'builder'],
    '{"builder": 70, "chairman": 60}'::jsonb
  )
ON CONFLICT (path) DO UPDATE SET
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  section = EXCLUDED.section,
  maturity = EXCLUDED.maturity,
  icon_key = EXCLUDED.icon_key,
  sort_index = EXCLUDED.sort_index,
  badge_key = EXCLUDED.badge_key,
  static_badge = EXCLUDED.static_badge,
  personas = EXCLUDED.personas,
  persona_priority = EXCLUDED.persona_priority,
  is_enabled = true,
  updated_at = now();
