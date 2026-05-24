/**
 * GVOS Pack Decomposer — Node.js port for the EHG_Engineer worker.
 *
 * SD-LEO-REFAC-RETIRE-LEGACY-STAGE-001 (GVOS FR-6 lock, backend half).
 *
 * Mirrors EHG/src/lib/gvos/pack-decomposer.ts. Expands the 3 composite pack
 * tokens into atomic sub-tokens and resolves their structural disables. Used by
 * the S17 backend lock writer (snapshot-locker.js) so a venture's locked_prompt_snapshot
 * freezes the same effective token set the frontend composer/locker would compute.
 *
 * Parity contract: PACK_EXPANSIONS, decompose(), and isPackToken() MUST stay
 * byte-equivalent to EHG/src/lib/gvos/pack-decomposer.ts. Drift is regression-tested
 * via tests/unit/gvos/snapshot-locker.test.js.
 */

/**
 * Single-source-of-truth pack expansion table — must match the TS PACK_EXPANSIONS.
 * @type {Readonly<Record<string, { atomics: ReadonlyArray<{name:string, value:string|number|boolean}>, disables: ReadonlyArray<string> }>>}
 */
export const PACK_EXPANSIONS = Object.freeze({
  'Full-Bleed-Media-Pattern': {
    atomics: [
      { name: 'media_aspect', value: '21/9' },
      { name: 'media_fit', value: 'cover' },
      { name: 'media_mobile_fallback', value: 'aspect-9-16-portrait-crop' },
      { name: 'media_overlay', value: 'gradient-bottom-12pct-rgba-0-0-0-0.4' },
    ],
    disables: [],
  },
  'Artist-Override-Pack': {
    atomics: [
      { name: 'padding_scale', value: 'loose' },
      { name: 'grid_mode', value: 'free' },
      { name: 'cursor_style', value: 'default' },
    ],
    disables: ['Recursive-Padding', 'Geometric-Asymmetry'],
  },
  'Cinematic-Crop-Pack': {
    atomics: [
      { name: 'letterbox_ratio', value: '2.35:1' },
      { name: 'hero_reveal', value: 'fade-then-scale' },
      { name: 'audio_cue', value: 'one-shot-bass-on-hero-mount' },
      { name: 'motion_runtime', value: 'gsap' },
    ],
    disables: [],
  },
});

export const PACK_TOKEN_NAMES = Object.freeze(Object.keys(PACK_EXPANSIONS));

/** @param {string} name */
export function isPackToken(name) {
  return PACK_TOKEN_NAMES.includes(name);
}

/**
 * Expand a single pack token name into its atomic sub-tokens.
 * Returns [] if `name` is not a registered pack.
 * @param {string} name
 */
export function expandPack(name) {
  if (!isPackToken(name)) return [];
  return PACK_EXPANSIONS[name].atomics.map((a) => ({
    name: a.name,
    value: a.value,
    source_pack: name,
  }));
}

/**
 * Token names disabled when `packName` is active.
 * @param {string} packName
 */
export function getPackDisables(packName) {
  if (!isPackToken(packName)) return [];
  return Array.from(PACK_EXPANSIONS[packName].disables);
}

/**
 * Decompose a list of token names into packs/non-packs/atomics/disables.
 * Deterministic ordering: input order preserved for non-pack tokens; pack atomics
 * in declaration order. Mirrors the TS decompose().
 *
 * @param {ReadonlyArray<string>} tokenNames
 * @returns {{ packs_found: string[], non_pack_tokens: string[], atomics: Array<{name:string,value:unknown,source_pack:string}>, disabled: string[], effective_token_names: string[] }}
 */
export function decompose(tokenNames) {
  const packsFound = [];
  const nonPackTokens = [];
  for (const t of tokenNames) {
    if (isPackToken(t)) packsFound.push(t);
    else nonPackTokens.push(t);
  }

  const atomics = packsFound.flatMap((p) => expandPack(p));

  const disabledSet = new Set();
  for (const p of packsFound) for (const d of getPackDisables(p)) disabledSet.add(d);

  const effectiveNonPack = nonPackTokens.filter((t) => !disabledSet.has(t));
  const effective = [...effectiveNonPack, ...atomics.map((a) => a.name)];

  return {
    packs_found: packsFound,
    non_pack_tokens: nonPackTokens,
    atomics,
    disabled: Array.from(disabledSet).sort(),
    effective_token_names: effective,
  };
}
