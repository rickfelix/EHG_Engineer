# Close the distinctiveness gap: award-library grounding + anti-default rules + layered AI hero images (the "as good as hand-work" follow-up)

## Type
feature

## Summary
The follow-up to the shipped design-authoring SD (SD-LEO-FEAT-AUTHOR-VENTURE-DESIGN-001, COMPLETED — craft rubrics + UX Peak conversion rules + FR-3 motion/parallax/micro-animations, on Fable). Chairman verdict on the first auto-generated sample (DataDistill): "lands as a real page, but not as good as the hand versions." Diagnosed root: the pipeline nails craft CORRECTNESS but lacks DISTINCTIVENESS — it defaulted to Inter (the AI-safe face), a conventional palette, and took no opinionated risk. This SD closes that gap using capabilities that ALREADY EXIST in the codebase (this is wiring + grounding, not inventing). THREE levers, all proven this session:
1. AWARD-LIBRARY GROUNDING — design_reference_library (137 Awwwards award-winning sites, ALL with extracted design_tokens across 11 archetypes) currently wires only into Stage-15 wireframes, NOT design authoring. Feed archetype-matched award references+tokens into the Fable authoring step.
2. ANTI-DEFAULT / DISTINCTIVENESS RULES — the "avoid AI-generated design" guidance (don't default to Inter; derive palette from subject; take one aesthetic risk) as a build-time generation-input category.
3. LAYERED AI HERO IMAGES — real image generation EXISTS and works (proven: lib/marketing/ai/image-generator.js → Gemini/Nano Banana Pro generated a real MarketLens hero this session) + the layering treatment (palette tint · gradient scrim for text legibility · fade-to-page · grain · parallax). Multi-model: Fable authors HTML/CSS, Gemini/OpenAI generates the image.
PROVEN BY HAND: the Adam MarketLens artifact (chairman "really awesome"/"I love it") demonstrates all three + reaffirmed micro-animations/parallax + the Stage-17 layout composition — that artifact is the quality bar.

## Scope (FRs)
- FR-1 AWARD-LIBRARY GROUNDING via INTELLIGENT RANDOMNESS + PARTIAL USE (chairman-refined 2026-07-06): do NOT rigidly 1:1 archetype-match (fintech→fintech, saas→saas) — that makes every venture in an archetype converge on the same look (repetitive). Instead:
  (a) INTELLIGENT RANDOMNESS — sample references with a WEIGHTED bias toward the venture's archetype but DELIBERATELY allow cross-archetype picks (e.g. bring an editorial creator-tools layout to a fintech venture), and vary the selection per generation (seeded per-venture so it's reproducible but no two ventures feel the same). "Intelligent" = varied-but-coherent/on-brand, not chaotic — the randomness is bounded by the brand genome + subject, never random-for-its-own-sake.
  (b) PARTIAL USE / ASPECTS ONLY — do NOT copy any one reference wholesale. Pull INDIVIDUAL token DIMENSIONS from DIFFERENT award sites (e.g. layout_pattern from site A, color_strategy from site B, typography_hierarchy from site C), and treat the award tokens as ONE weighted INFLUENCE blended with the brand genome + subject + the anti-default rules — NOT an authoritative template. Award grounding is a minority input (aspects), never 100% of the design.
  Mechanism: reuse the existing service/table (getDesignReferencesByArchetype at Stage 15) but add a cross-archetype sampler + per-dimension blend + per-venture seed. Feed the blended, partial token influence into the Fable authoring context.
- FR-2 ANTI-DEFAULT / DISTINCTIVENESS RULE SET: a build-time generation-input category encoding the "avoid AI-generated design" guidance — do NOT default to Inter/Space Grotesk; pick a characterful display face paired deliberately; derive neutrals with a hue bias toward the accent; take exactly one real aesthetic risk; avoid the known AI-default clusters (cream+serif+terracotta, purple-blue gradient hero, emoji section markers, everything centered, rounded-lg everywhere). Source from the artifact-design skill guidance.
- FR-3 LAYERED AI HERO IMAGES (multi-model, chairman priority): add an image-generation step (Gemini Nano Banana Pro via lib/marketing/ai/image-generator.js, OpenAI fallback) prompted from the brand genome, generating hero (+optional section) imagery. Apply the LAYERING treatment (never a plain image): palette tint, gradient scrim guaranteeing WCAG text contrast, fade-to-page edges, optional grain, content floated over, subtle parallax. Host as a compressed lazy-loaded asset (not a data-URI in prod). Graceful fallback to a tasteful gradient if gen fails. See [[chairman-design-prefs-hero-images-layered]].
- FR-4 CHAIRMAN ALWAYS-WANT SIGNATURE — THREE non-negotiable DEFAULTS on every customer-facing venture page (chairman 2026-07-06, reaffirmed "things I always want"): (1) PARALLAX (slight/restrained), (2) MICRO-ANIMATIONS (entry/hover/reveal/CTA), (3) GENERATED LAYERED AI HERO IMAGE (FR-3 above). These are DEFAULT-ON, high generation weight — every generated page carries all three unless the subject clearly calls for stillness. ONE easing curve, ONE entrance pattern, reduced-motion-safe. This is a hard default, not an option. See [[chairman-design-prefs-parallax-microanimation]] + [[chairman-design-prefs-hero-images-layered]].
- FR-5 FLOW THROUGH THE SHIPPED WIRING + AUDIT: all inputs delivered via the shipped design-input path (design-input-instructions.js / design-token-resolver.js / leaf-content.js) and graded by the design-fidelity observe-only audit. Re-generate the DataDistill sample and re-review against the chairman quality bar.

## Out of Scope
- The wiring (SD-LEO-FEAT-ROUTE-VENTURE-DESIGN-001, shipped) and the base authoring (SD-LEO-FEAT-AUTHOR-VENTURE-DESIGN-001, shipped) — this consumes both.
- Re-scraping Awwwards (the 137-row library already exists, SD-MAN-INFRA-AWWWARDS-CURATED-DESIGN-001).
- Backfilling/re-rendering existing live venture pages (separate follow-up once the pipeline proves quality).

## Success Metrics
- A regenerated venture landing is DISTINCTIVE: NOT Inter, palette grounded in the archetype's award references, one clear aesthetic point of view — chairman rates it at or near the hand-version bar.
- design_reference_library archetype-matched tokens verifiably present in the authoring context (not just Stage 15).
- A real layered AI hero image renders with WCAG-legible overlaid text + parallax; graceful fallback on gen failure; no fabricated content.
- Motion (parallax + micro-animations) present on every generated customer-facing page.
- MISS: a page that defaulted to Inter / a generic palette / no award grounding is caught by the audit.

## Smoke Test
1. Author a fintech test venture → context contains award-winning fintech design_tokens; output is NOT Inter and reflects the archetype's design language.
2. Generate + layer a hero image (Gemini) → renders with scrim/tint/fade/parallax, text AA-legible; kill the image API → graceful gradient fallback.
3. Re-generate DataDistill → chairman re-review shows a clear lift toward the hand-version bar.
4. Every generated page carries parallax + micro-animations (reduced-motion-safe).

## Dependencies
- SD-LEO-FEAT-ROUTE-VENTURE-DESIGN-001 (shipped) — wiring.
- SD-LEO-FEAT-AUTHOR-VENTURE-DESIGN-001 (shipped) — base authoring.

## Tier / allocation
Fable-high (Bravo) for authoring + the anti-default/distinctiveness judgment; the image-gen step calls Gemini/OpenAI (multi-model). Build on a Fable-capable account. Not Sonnet-able (design judgment).
