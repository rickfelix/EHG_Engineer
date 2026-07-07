/**
 * Hero-image generation spec builder.
 * SD-LEO-FEAT-CLOSE-DISTINCTIVENESS-GAP-001 (FR-4).
 *
 * PURE function: brand genome in -> {prompt, layering, fallback} out. The actual generation
 * goes through the EXISTING lib/marketing/ai/image-generator.js factory (Gemini path with
 * its built-in brand-overlay/fallback machinery) — this module only authors WHAT to ask for
 * and HOW to layer it, keeping the integrity rules in the spec itself:
 *  - atmospheric/abstract brand-derived imagery, NEVER a fabricated product screenshot
 *    presented as real, never stock photography, no text baked into the image;
 *  - the layering treatment guarantees WCAG-legible text over the image;
 *  - graceful gradient fallback is part of the contract, not an afterthought.
 *
 * @module lib/eva/bridge/hero-image-spec
 */

/**
 * @param {object} brandGenome
 * @param {string} brandGenome.ventureName
 * @param {string} [brandGenome.subject]        - what the venture does (drives the metaphor)
 * @param {string} [brandGenome.primaryColor]   - hex
 * @param {string} [brandGenome.accentColor]    - hex
 * @param {string} [brandGenome.mood]           - optional tonal direction (e.g. 'precise, calm')
 * @returns {{prompt: string, layering: object, fallback: object}}
 */
export function buildHeroImageSpec(brandGenome = {}) {
  const {
    ventureName = 'the venture',
    subject = 'its product domain',
    primaryColor = '#1E3A8A',
    accentColor = '#14B8A6',
    mood = 'confident, precise, modern',
  } = brandGenome;

  const prompt = [
    `Wide atmospheric hero background image for ${ventureName}, an abstract visual metaphor of ${subject}.`,
    `Palette anchored on ${primaryColor} with restrained ${accentColor} accents; mood: ${mood}.`,
    'Abstract materials, light and depth — NOT a user interface, NOT a product screenshot, NOT stock photography, no people, no logos, and absolutely no text or lettering in the image.',
    'Composition leaves calm negative space on the left third for overlaid headline content. High detail, soft depth of field, 16:9.',
  ].join(' ');

  return {
    prompt,
    layering: {
      tint: { color: primaryColor, blend: 'multiply', opacity: 0.35 },
      scrim: {
        direction: 'to right',
        from: 'rgba(8,12,24,0.82)',
        to: 'rgba(8,12,24,0.10)',
        purpose: 'guarantee WCAG AA text contrast over the image lightest region',
      },
      fadeToPage: true,
      grain: { enabled: true, opacity: 0.05 },
      parallax: { transformOnly: true, factor: -0.06, reducedMotionSafe: true },
    },
    fallback: {
      kind: 'gradient',
      css: `linear-gradient(135deg, ${primaryColor} 0%, ${accentColor} 140%)`,
      rule: 'If generation fails or the asset is unavailable, render this brand-derived gradient — never a broken image, never an empty box; disclose the fallback in build output.',
    },
  };
}
