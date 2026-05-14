-- Migration 2 (FR-14): archetype motion DNA mapping (idempotent JSONB @> guards)
-- Total UPDATE statements: 68 (11 archetypes × variable subset 4–9 tokens)

BEGIN;

UPDATE gvos_archetypes
SET tokens_required = tokens_required || to_jsonb('Press-Tactile-80ms'::text)
WHERE prompt_token = 'Editorial-Print'
  AND NOT (tokens_required @> '["Press-Tactile-80ms"]'::jsonb);

UPDATE gvos_archetypes
SET tokens_required = tokens_required || to_jsonb('Focus-Ring-Crossfade-150ms'::text)
WHERE prompt_token = 'Editorial-Print'
  AND NOT (tokens_required @> '["Focus-Ring-Crossfade-150ms"]'::jsonb);

UPDATE gvos_archetypes
SET tokens_required = tokens_required || to_jsonb('Page-Crossfade-180ms'::text)
WHERE prompt_token = 'Editorial-Print'
  AND NOT (tokens_required @> '["Page-Crossfade-180ms"]'::jsonb);

UPDATE gvos_archetypes
SET tokens_required = tokens_required || to_jsonb('Toast-Slide-In-180ms'::text)
WHERE prompt_token = 'Editorial-Print'
  AND NOT (tokens_required @> '["Toast-Slide-In-180ms"]'::jsonb);

UPDATE gvos_archetypes
SET tokens_required = tokens_required || to_jsonb('Press-Tactile-80ms'::text)
WHERE prompt_token = 'Artist-Expressive'
  AND NOT (tokens_required @> '["Press-Tactile-80ms"]'::jsonb);

UPDATE gvos_archetypes
SET tokens_required = tokens_required || to_jsonb('Focus-Ring-Crossfade-150ms'::text)
WHERE prompt_token = 'Artist-Expressive'
  AND NOT (tokens_required @> '["Focus-Ring-Crossfade-150ms"]'::jsonb);

UPDATE gvos_archetypes
SET tokens_required = tokens_required || to_jsonb('Toast-Slide-In-180ms'::text)
WHERE prompt_token = 'Artist-Expressive'
  AND NOT (tokens_required @> '["Toast-Slide-In-180ms"]'::jsonb);

UPDATE gvos_archetypes
SET tokens_required = tokens_required || to_jsonb('Modal-Scale-In-200ms'::text)
WHERE prompt_token = 'Artist-Expressive'
  AND NOT (tokens_required @> '["Modal-Scale-In-200ms"]'::jsonb);

UPDATE gvos_archetypes
SET tokens_required = tokens_required || to_jsonb('Hover-Lift-100ms'::text)
WHERE prompt_token = 'Artist-Expressive'
  AND NOT (tokens_required @> '["Hover-Lift-100ms"]'::jsonb);

UPDATE gvos_archetypes
SET tokens_required = tokens_required || to_jsonb('Field-Validation-Shake-160ms'::text)
WHERE prompt_token = 'Artist-Expressive'
  AND NOT (tokens_required @> '["Field-Validation-Shake-160ms"]'::jsonb);

UPDATE gvos_archetypes
SET tokens_required = tokens_required || to_jsonb('Empty-State-Fade-In-300ms'::text)
WHERE prompt_token = 'Artist-Expressive'
  AND NOT (tokens_required @> '["Empty-State-Fade-In-300ms"]'::jsonb);

UPDATE gvos_archetypes
SET tokens_required = tokens_required || to_jsonb('Page-Crossfade-180ms'::text)
WHERE prompt_token = 'Atmospheric-Quiet'
  AND NOT (tokens_required @> '["Page-Crossfade-180ms"]'::jsonb);

UPDATE gvos_archetypes
SET tokens_required = tokens_required || to_jsonb('Hover-Lift-100ms'::text)
WHERE prompt_token = 'Atmospheric-Quiet'
  AND NOT (tokens_required @> '["Hover-Lift-100ms"]'::jsonb);

UPDATE gvos_archetypes
SET tokens_required = tokens_required || to_jsonb('Empty-State-Fade-In-300ms'::text)
WHERE prompt_token = 'Atmospheric-Quiet'
  AND NOT (tokens_required @> '["Empty-State-Fade-In-300ms"]'::jsonb);

UPDATE gvos_archetypes
SET tokens_required = tokens_required || to_jsonb('Tooltip-Fade-100ms-delay-300ms'::text)
WHERE prompt_token = 'Atmospheric-Quiet'
  AND NOT (tokens_required @> '["Tooltip-Fade-100ms-delay-300ms"]'::jsonb);

UPDATE gvos_archetypes
SET tokens_required = tokens_required || to_jsonb('Modal-Scale-In-200ms'::text)
WHERE prompt_token = 'Atmospheric-Quiet'
  AND NOT (tokens_required @> '["Modal-Scale-In-200ms"]'::jsonb);

UPDATE gvos_archetypes
SET tokens_required = tokens_required || to_jsonb('Press-Tactile-80ms'::text)
WHERE prompt_token = 'Brutalist-Utility'
  AND NOT (tokens_required @> '["Press-Tactile-80ms"]'::jsonb);

UPDATE gvos_archetypes
SET tokens_required = tokens_required || to_jsonb('Focus-Ring-Crossfade-150ms'::text)
WHERE prompt_token = 'Brutalist-Utility'
  AND NOT (tokens_required @> '["Focus-Ring-Crossfade-150ms"]'::jsonb);

UPDATE gvos_archetypes
SET tokens_required = tokens_required || to_jsonb('Skeleton-Shimmer-1200ms'::text)
WHERE prompt_token = 'Brutalist-Utility'
  AND NOT (tokens_required @> '["Skeleton-Shimmer-1200ms"]'::jsonb);

UPDATE gvos_archetypes
SET tokens_required = tokens_required || to_jsonb('Toast-Slide-In-180ms'::text)
WHERE prompt_token = 'Brutalist-Utility'
  AND NOT (tokens_required @> '["Toast-Slide-In-180ms"]'::jsonb);

UPDATE gvos_archetypes
SET tokens_required = tokens_required || to_jsonb('Modal-Scale-In-200ms'::text)
WHERE prompt_token = 'Brutalist-Utility'
  AND NOT (tokens_required @> '["Modal-Scale-In-200ms"]'::jsonb);

UPDATE gvos_archetypes
SET tokens_required = tokens_required || to_jsonb('Tab-Underline-Slide-200ms'::text)
WHERE prompt_token = 'Brutalist-Utility'
  AND NOT (tokens_required @> '["Tab-Underline-Slide-200ms"]'::jsonb);

UPDATE gvos_archetypes
SET tokens_required = tokens_required || to_jsonb('Disabled-Press-Damper-50ms'::text)
WHERE prompt_token = 'Brutalist-Utility'
  AND NOT (tokens_required @> '["Disabled-Press-Damper-50ms"]'::jsonb);

UPDATE gvos_archetypes
SET tokens_required = tokens_required || to_jsonb('Press-Tactile-80ms'::text)
WHERE prompt_token = 'Clinical-Evidence'
  AND NOT (tokens_required @> '["Press-Tactile-80ms"]'::jsonb);

UPDATE gvos_archetypes
SET tokens_required = tokens_required || to_jsonb('Focus-Ring-Crossfade-150ms'::text)
WHERE prompt_token = 'Clinical-Evidence'
  AND NOT (tokens_required @> '["Focus-Ring-Crossfade-150ms"]'::jsonb);

UPDATE gvos_archetypes
SET tokens_required = tokens_required || to_jsonb('Skeleton-Shimmer-1200ms'::text)
WHERE prompt_token = 'Clinical-Evidence'
  AND NOT (tokens_required @> '["Skeleton-Shimmer-1200ms"]'::jsonb);

UPDATE gvos_archetypes
SET tokens_required = tokens_required || to_jsonb('Toast-Slide-In-180ms'::text)
WHERE prompt_token = 'Clinical-Evidence'
  AND NOT (tokens_required @> '["Toast-Slide-In-180ms"]'::jsonb);

UPDATE gvos_archetypes
SET tokens_required = tokens_required || to_jsonb('Press-Tactile-80ms'::text)
WHERE prompt_token = 'Editorial-Kinetic'
  AND NOT (tokens_required @> '["Press-Tactile-80ms"]'::jsonb);

UPDATE gvos_archetypes
SET tokens_required = tokens_required || to_jsonb('Focus-Ring-Crossfade-150ms'::text)
WHERE prompt_token = 'Editorial-Kinetic'
  AND NOT (tokens_required @> '["Focus-Ring-Crossfade-150ms"]'::jsonb);

UPDATE gvos_archetypes
SET tokens_required = tokens_required || to_jsonb('Skeleton-Shimmer-1200ms'::text)
WHERE prompt_token = 'Editorial-Kinetic'
  AND NOT (tokens_required @> '["Skeleton-Shimmer-1200ms"]'::jsonb);

UPDATE gvos_archetypes
SET tokens_required = tokens_required || to_jsonb('Toast-Slide-In-180ms'::text)
WHERE prompt_token = 'Editorial-Kinetic'
  AND NOT (tokens_required @> '["Toast-Slide-In-180ms"]'::jsonb);

UPDATE gvos_archetypes
SET tokens_required = tokens_required || to_jsonb('Modal-Scale-In-200ms'::text)
WHERE prompt_token = 'Editorial-Kinetic'
  AND NOT (tokens_required @> '["Modal-Scale-In-200ms"]'::jsonb);

UPDATE gvos_archetypes
SET tokens_required = tokens_required || to_jsonb('Tab-Underline-Slide-200ms'::text)
WHERE prompt_token = 'Editorial-Kinetic'
  AND NOT (tokens_required @> '["Tab-Underline-Slide-200ms"]'::jsonb);

UPDATE gvos_archetypes
SET tokens_required = tokens_required || to_jsonb('Page-Crossfade-180ms'::text)
WHERE prompt_token = 'Editorial-Kinetic'
  AND NOT (tokens_required @> '["Page-Crossfade-180ms"]'::jsonb);

UPDATE gvos_archetypes
SET tokens_required = tokens_required || to_jsonb('Hover-Lift-100ms'::text)
WHERE prompt_token = 'Editorial-Kinetic'
  AND NOT (tokens_required @> '["Hover-Lift-100ms"]'::jsonb);

UPDATE gvos_archetypes
SET tokens_required = tokens_required || to_jsonb('Page-Crossfade-180ms'::text)
WHERE prompt_token = 'Gallery-Curatorial'
  AND NOT (tokens_required @> '["Page-Crossfade-180ms"]'::jsonb);

UPDATE gvos_archetypes
SET tokens_required = tokens_required || to_jsonb('Hover-Lift-100ms'::text)
WHERE prompt_token = 'Gallery-Curatorial'
  AND NOT (tokens_required @> '["Hover-Lift-100ms"]'::jsonb);

UPDATE gvos_archetypes
SET tokens_required = tokens_required || to_jsonb('Empty-State-Fade-In-300ms'::text)
WHERE prompt_token = 'Gallery-Curatorial'
  AND NOT (tokens_required @> '["Empty-State-Fade-In-300ms"]'::jsonb);

UPDATE gvos_archetypes
SET tokens_required = tokens_required || to_jsonb('Modal-Scale-In-200ms'::text)
WHERE prompt_token = 'Gallery-Curatorial'
  AND NOT (tokens_required @> '["Modal-Scale-In-200ms"]'::jsonb);

UPDATE gvos_archetypes
SET tokens_required = tokens_required || to_jsonb('Tooltip-Fade-100ms-delay-300ms'::text)
WHERE prompt_token = 'Gallery-Curatorial'
  AND NOT (tokens_required @> '["Tooltip-Fade-100ms-delay-300ms"]'::jsonb);

UPDATE gvos_archetypes
SET tokens_required = tokens_required || to_jsonb('Press-Tactile-80ms'::text)
WHERE prompt_token = 'Playful-Expressive'
  AND NOT (tokens_required @> '["Press-Tactile-80ms"]'::jsonb);

UPDATE gvos_archetypes
SET tokens_required = tokens_required || to_jsonb('Focus-Ring-Crossfade-150ms'::text)
WHERE prompt_token = 'Playful-Expressive'
  AND NOT (tokens_required @> '["Focus-Ring-Crossfade-150ms"]'::jsonb);

UPDATE gvos_archetypes
SET tokens_required = tokens_required || to_jsonb('Toast-Slide-In-180ms'::text)
WHERE prompt_token = 'Playful-Expressive'
  AND NOT (tokens_required @> '["Toast-Slide-In-180ms"]'::jsonb);

UPDATE gvos_archetypes
SET tokens_required = tokens_required || to_jsonb('Modal-Scale-In-200ms'::text)
WHERE prompt_token = 'Playful-Expressive'
  AND NOT (tokens_required @> '["Modal-Scale-In-200ms"]'::jsonb);

UPDATE gvos_archetypes
SET tokens_required = tokens_required || to_jsonb('Hover-Lift-100ms'::text)
WHERE prompt_token = 'Playful-Expressive'
  AND NOT (tokens_required @> '["Hover-Lift-100ms"]'::jsonb);

UPDATE gvos_archetypes
SET tokens_required = tokens_required || to_jsonb('Field-Validation-Shake-160ms'::text)
WHERE prompt_token = 'Playful-Expressive'
  AND NOT (tokens_required @> '["Field-Validation-Shake-160ms"]'::jsonb);

UPDATE gvos_archetypes
SET tokens_required = tokens_required || to_jsonb('Empty-State-Fade-In-300ms'::text)
WHERE prompt_token = 'Playful-Expressive'
  AND NOT (tokens_required @> '["Empty-State-Fade-In-300ms"]'::jsonb);

UPDATE gvos_archetypes
SET tokens_required = tokens_required || to_jsonb('Press-Tactile-80ms'::text)
WHERE prompt_token = 'Sovereign-Operator'
  AND NOT (tokens_required @> '["Press-Tactile-80ms"]'::jsonb);

UPDATE gvos_archetypes
SET tokens_required = tokens_required || to_jsonb('Focus-Ring-Crossfade-150ms'::text)
WHERE prompt_token = 'Sovereign-Operator'
  AND NOT (tokens_required @> '["Focus-Ring-Crossfade-150ms"]'::jsonb);

UPDATE gvos_archetypes
SET tokens_required = tokens_required || to_jsonb('Skeleton-Shimmer-1200ms'::text)
WHERE prompt_token = 'Sovereign-Operator'
  AND NOT (tokens_required @> '["Skeleton-Shimmer-1200ms"]'::jsonb);

UPDATE gvos_archetypes
SET tokens_required = tokens_required || to_jsonb('Toast-Slide-In-180ms'::text)
WHERE prompt_token = 'Sovereign-Operator'
  AND NOT (tokens_required @> '["Toast-Slide-In-180ms"]'::jsonb);

UPDATE gvos_archetypes
SET tokens_required = tokens_required || to_jsonb('Modal-Scale-In-200ms'::text)
WHERE prompt_token = 'Sovereign-Operator'
  AND NOT (tokens_required @> '["Modal-Scale-In-200ms"]'::jsonb);

UPDATE gvos_archetypes
SET tokens_required = tokens_required || to_jsonb('Tab-Underline-Slide-200ms'::text)
WHERE prompt_token = 'Sovereign-Operator'
  AND NOT (tokens_required @> '["Tab-Underline-Slide-200ms"]'::jsonb);

UPDATE gvos_archetypes
SET tokens_required = tokens_required || to_jsonb('Disabled-Press-Damper-50ms'::text)
WHERE prompt_token = 'Sovereign-Operator'
  AND NOT (tokens_required @> '["Disabled-Press-Damper-50ms"]'::jsonb);

UPDATE gvos_archetypes
SET tokens_required = tokens_required || to_jsonb('Number-Tick-Smooth-Lerp'::text)
WHERE prompt_token = 'Sovereign-Operator'
  AND NOT (tokens_required @> '["Number-Tick-Smooth-Lerp"]'::jsonb);

UPDATE gvos_archetypes
SET tokens_required = tokens_required || to_jsonb('Progress-Ease-Out-Cubic'::text)
WHERE prompt_token = 'Sovereign-Operator'
  AND NOT (tokens_required @> '["Progress-Ease-Out-Cubic"]'::jsonb);

UPDATE gvos_archetypes
SET tokens_required = tokens_required || to_jsonb('Press-Tactile-80ms'::text)
WHERE prompt_token = 'Cinematic-Immersive'
  AND NOT (tokens_required @> '["Press-Tactile-80ms"]'::jsonb);

UPDATE gvos_archetypes
SET tokens_required = tokens_required || to_jsonb('Focus-Ring-Crossfade-150ms'::text)
WHERE prompt_token = 'Cinematic-Immersive'
  AND NOT (tokens_required @> '["Focus-Ring-Crossfade-150ms"]'::jsonb);

UPDATE gvos_archetypes
SET tokens_required = tokens_required || to_jsonb('Skeleton-Shimmer-1200ms'::text)
WHERE prompt_token = 'Cinematic-Immersive'
  AND NOT (tokens_required @> '["Skeleton-Shimmer-1200ms"]'::jsonb);

UPDATE gvos_archetypes
SET tokens_required = tokens_required || to_jsonb('Toast-Slide-In-180ms'::text)
WHERE prompt_token = 'Cinematic-Immersive'
  AND NOT (tokens_required @> '["Toast-Slide-In-180ms"]'::jsonb);

UPDATE gvos_archetypes
SET tokens_required = tokens_required || to_jsonb('Modal-Scale-In-200ms'::text)
WHERE prompt_token = 'Cinematic-Immersive'
  AND NOT (tokens_required @> '["Modal-Scale-In-200ms"]'::jsonb);

UPDATE gvos_archetypes
SET tokens_required = tokens_required || to_jsonb('Tab-Underline-Slide-200ms'::text)
WHERE prompt_token = 'Cinematic-Immersive'
  AND NOT (tokens_required @> '["Tab-Underline-Slide-200ms"]'::jsonb);

UPDATE gvos_archetypes
SET tokens_required = tokens_required || to_jsonb('Page-Crossfade-180ms'::text)
WHERE prompt_token = 'Cinematic-Immersive'
  AND NOT (tokens_required @> '["Page-Crossfade-180ms"]'::jsonb);

UPDATE gvos_archetypes
SET tokens_required = tokens_required || to_jsonb('Press-Tactile-80ms'::text)
WHERE prompt_token = 'Civic-Institutional'
  AND NOT (tokens_required @> '["Press-Tactile-80ms"]'::jsonb);

UPDATE gvos_archetypes
SET tokens_required = tokens_required || to_jsonb('Focus-Ring-Crossfade-150ms'::text)
WHERE prompt_token = 'Civic-Institutional'
  AND NOT (tokens_required @> '["Focus-Ring-Crossfade-150ms"]'::jsonb);

UPDATE gvos_archetypes
SET tokens_required = tokens_required || to_jsonb('Skeleton-Shimmer-1200ms'::text)
WHERE prompt_token = 'Civic-Institutional'
  AND NOT (tokens_required @> '["Skeleton-Shimmer-1200ms"]'::jsonb);

UPDATE gvos_archetypes
SET tokens_required = tokens_required || to_jsonb('Toast-Slide-In-180ms'::text)
WHERE prompt_token = 'Civic-Institutional'
  AND NOT (tokens_required @> '["Toast-Slide-In-180ms"]'::jsonb);

UPDATE gvos_archetypes
SET tokens_required = tokens_required || to_jsonb('Tab-Underline-Slide-200ms'::text)
WHERE prompt_token = 'Civic-Institutional'
  AND NOT (tokens_required @> '["Tab-Underline-Slide-200ms"]'::jsonb);

-- 2-end. Post-UPDATE assertion: each archetype gained the expected motion tokens
DO $$
DECLARE
  arc record;
  expected JSONB := '{"Editorial-Print":["Press-Tactile-80ms","Focus-Ring-Crossfade-150ms","Page-Crossfade-180ms","Toast-Slide-In-180ms"],"Artist-Expressive":["Press-Tactile-80ms","Focus-Ring-Crossfade-150ms","Toast-Slide-In-180ms","Modal-Scale-In-200ms","Hover-Lift-100ms","Field-Validation-Shake-160ms","Empty-State-Fade-In-300ms"],"Atmospheric-Quiet":["Page-Crossfade-180ms","Hover-Lift-100ms","Empty-State-Fade-In-300ms","Tooltip-Fade-100ms-delay-300ms","Modal-Scale-In-200ms"],"Brutalist-Utility":["Press-Tactile-80ms","Focus-Ring-Crossfade-150ms","Skeleton-Shimmer-1200ms","Toast-Slide-In-180ms","Modal-Scale-In-200ms","Tab-Underline-Slide-200ms","Disabled-Press-Damper-50ms"],"Clinical-Evidence":["Press-Tactile-80ms","Focus-Ring-Crossfade-150ms","Skeleton-Shimmer-1200ms","Toast-Slide-In-180ms"],"Editorial-Kinetic":["Press-Tactile-80ms","Focus-Ring-Crossfade-150ms","Skeleton-Shimmer-1200ms","Toast-Slide-In-180ms","Modal-Scale-In-200ms","Tab-Underline-Slide-200ms","Page-Crossfade-180ms","Hover-Lift-100ms"],"Gallery-Curatorial":["Page-Crossfade-180ms","Hover-Lift-100ms","Empty-State-Fade-In-300ms","Modal-Scale-In-200ms","Tooltip-Fade-100ms-delay-300ms"],"Playful-Expressive":["Press-Tactile-80ms","Focus-Ring-Crossfade-150ms","Toast-Slide-In-180ms","Modal-Scale-In-200ms","Hover-Lift-100ms","Field-Validation-Shake-160ms","Empty-State-Fade-In-300ms"],"Sovereign-Operator":["Press-Tactile-80ms","Focus-Ring-Crossfade-150ms","Skeleton-Shimmer-1200ms","Toast-Slide-In-180ms","Modal-Scale-In-200ms","Tab-Underline-Slide-200ms","Disabled-Press-Damper-50ms","Number-Tick-Smooth-Lerp","Progress-Ease-Out-Cubic"],"Cinematic-Immersive":["Press-Tactile-80ms","Focus-Ring-Crossfade-150ms","Skeleton-Shimmer-1200ms","Toast-Slide-In-180ms","Modal-Scale-In-200ms","Tab-Underline-Slide-200ms","Page-Crossfade-180ms"],"Civic-Institutional":["Press-Tactile-80ms","Focus-Ring-Crossfade-150ms","Skeleton-Shimmer-1200ms","Toast-Slide-In-180ms","Tab-Underline-Slide-200ms"]}'::jsonb;
  tok TEXT;
  missing INTEGER := 0;
BEGIN
  FOR arc IN SELECT prompt_token, tokens_required FROM gvos_archetypes WHERE prompt_token = ANY (ARRAY(SELECT jsonb_object_keys(expected))) LOOP
    FOR tok IN SELECT jsonb_array_elements_text(expected -> arc.prompt_token) LOOP
      IF NOT (arc.tokens_required @> to_jsonb(tok)) THEN
        RAISE WARNING 'FR-14: archetype % missing motion token %', arc.prompt_token, tok;
        missing := missing + 1;
      END IF;
    END LOOP;
  END LOOP;
  IF missing > 0 THEN
    RAISE EXCEPTION 'FR-14 verification failed: % archetype/token pairs missing post-migration', missing;
  END IF;
END $$;

COMMIT;