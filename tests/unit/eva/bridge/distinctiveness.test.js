// SD-LEO-FEAT-CLOSE-DISTINCTIVENESS-GAP-001 — close the chairman-named distinctiveness gap.
// TS-1 seeded sampler reproducibility/divergence/fail-soft, TS-2 render order + content +
// precedence, TS-3 hero spec determinism + layering + fallback, TS-4 always-want defaults,
// TS-5 regression/byte-identity is covered by the untouched design-authoring.test.js suite.
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import {
  buildDesignInstructionBlock,
  GENERATION_INPUTS,
} from '../../../../lib/eva/bridge/design-input-instructions.js';
import {
  blendInfluence,
  sampleDesignInfluence,
  hashSeed,
  TOKEN_DIMENSIONS,
} from '../../../../lib/eva/bridge/design-reference-sampler.js';
import { buildHeroImageSpec } from '../../../../lib/eva/bridge/hero-image-spec.js';

const require = createRequire(import.meta.url);
const SHARED_PROMPTS = require('../../../../lib/eva/bridge/shared-design-prompts.json');

// ── fixtures: a small synthetic library across two archetypes ──
function makeRow(site, archetype) {
  const design_tokens = {};
  for (const d of TOKEN_DIMENSIONS) design_tokens[d] = `${site} ${d} influence text`;
  return { site_name: site, archetype_category: archetype, design_tokens };
}
const LIB = [
  makeRow('FinA', 'fintech'), makeRow('FinB', 'fintech'), makeRow('FinC', 'fintech'),
  makeRow('EdA', 'edtech'), makeRow('CreA', 'creator_tools'), makeRow('CreB', 'creator_tools'),
];

describe('TS-1: seeded sampler — reproducibility, divergence, cross-archetype minority, fail-soft', () => {
  it('same ventureId reproduces identical per-dimension picks; different ventureId diverges', () => {
    const a1 = blendInfluence(LIB, { seedStr: 'venture-aaa', archetype: 'fintech' });
    const a2 = blendInfluence(LIB, { seedStr: 'venture-aaa', archetype: 'fintech' });
    const b = blendInfluence(LIB, { seedStr: 'venture-bbb', archetype: 'fintech' });
    expect(a1).toEqual(a2);
    expect(JSON.stringify(a1.dimensions)).not.toBe(JSON.stringify(b.dimensions));
  });

  it('covers all 7 dimensions, each naming its source site + archetype', () => {
    const r = blendInfluence(LIB, { seedStr: 'venture-aaa', archetype: 'fintech' });
    expect(Object.keys(r.dimensions).sort()).toEqual([...TOKEN_DIMENSIONS].sort());
    for (const v of Object.values(r.dimensions)) {
      expect(v.influence).toMatch(/influence text$/);
      expect(v.source_site).toBeTruthy();
      expect(v.source_archetype).toBeTruthy();
    }
  });

  it('guarantees a deliberate cross-archetype minority (>=1 pick outside the venture archetype)', () => {
    for (const seed of ['v1', 'v2', 'v3', 'v4', 'v5']) {
      const r = blendInfluence(LIB, { seedStr: seed, archetype: 'fintech' });
      const cross = Object.values(r.dimensions).filter((v) => v.source_archetype !== 'fintech');
      expect(cross.length, `seed ${seed} must include a cross-archetype pick`).toBeGreaterThanOrEqual(1);
    }
  });

  it('pulls dimensions from more than one site (partial leverage, never one template)', () => {
    const r = blendInfluence(LIB, { seedStr: 'venture-aaa', archetype: 'fintech' });
    const sites = new Set(Object.values(r.dimensions).map((v) => v.source_site));
    expect(sites.size).toBeGreaterThan(1);
  });

  it('fail-soft: empty rows -> null; DB entry point swallows errors -> null', async () => {
    expect(blendInfluence([], { seedStr: 'x', archetype: 'fintech' })).toBeNull();
    const boomSupabase = { from() { throw new Error('boom'); } };
    expect(await sampleDesignInfluence({ ventureId: 'v', supabase: boomSupabase })).toBeNull();
    expect(await sampleDesignInfluence({ ventureId: null, supabase: {} })).toBeNull();
  });

  it('hashSeed is deterministic and null-archetype sampling still works', () => {
    expect(hashSeed('abc')).toBe(hashSeed('abc'));
    const r = blendInfluence(LIB, { seedStr: 'no-arch' });
    expect(Object.keys(r.dimensions).length).toBe(TOKEN_DIMENSIONS.length);
  });
});

describe('TS-2: render order + distinctiveness content + correctness precedence', () => {
  const influence = blendInfluence(LIB, { seedStr: 'venture-aaa', archetype: 'fintech' });
  const block = buildDesignInstructionBlock(SHARED_PROMPTS, undefined, { awardInfluence: influence });

  it('renders all sections in order: CRAFT -> CONVERSION -> DISTINCTIVENESS -> MOTION -> HERO -> AWARD -> CHECKLIST -> EXEMPLAR', () => {
    const idx = {
      craft: block.indexOf('DESIGN DO-RULES'),
      conversion: block.indexOf('CONVERSION PSYCHOLOGY'),
      distinctiveness: block.indexOf('DISTINCTIVENESS (ANTI-DEFAULT)'),
      motion: block.indexOf('MOTION GRAMMAR'),
      hero: block.indexOf('LAYERED AI HERO IMAGE'),
      award: block.indexOf('AWARD-WINNING DESIGN INFLUENCE'),
      checklist: block.indexOf('DESIGN VERIFICATION CHECKLIST'),
      exemplar: block.indexOf('STYLE EXEMPLAR'),
    };
    for (const [name, i] of Object.entries(idx)) expect(i, `${name} present`).toBeGreaterThan(-1);
    const order = ['craft', 'conversion', 'distinctiveness', 'motion', 'hero', 'award', 'checklist', 'exemplar'];
    for (let i = 1; i < order.length; i++) {
      expect(idx[order[i - 1]], `${order[i - 1]} before ${order[i]}`).toBeLessThan(idx[order[i]]);
    }
  });

  it('distinctiveness names the default faces to avoid, the AI-default clusters, and the ONE-risk rule', () => {
    expect(block).toContain('NEVER default to Inter or Space Grotesk');
    expect(block).toContain('EXACTLY ONE deliberate aesthetic risk');
    expect(block).toContain('purple-blue gradient hero');
    expect(block).toMatch(/emoji as section markers/);
  });

  it('FR-3: the correctness-precedence paragraph is present and references floors + guardrail', () => {
    expect(block).toContain('PRECEDENCE — CORRECTNESS AND INTEGRITY OUTRANK DISTINCTIVENESS');
    expect(block).toMatch(/WCAG contrast.*hard floors/s);
    expect(block).toContain('no-fabrication guardrail also outranks');
  });

  it('award influence renders per-dimension sources + seed provenance; absent influence omits the section', () => {
    expect(block).toContain(`seed ${influence.seed}`);
    expect(block).toContain('MINORITY influence');
    const noAward = buildDesignInstructionBlock(SHARED_PROMPTS);
    expect(noAward).not.toContain('AWARD-WINNING DESIGN INFLUENCE');
    expect(noAward).toContain('DISTINCTIVENESS (ANTI-DEFAULT)');
  });

  it('existing contracts hold: empty prompts -> empty string; deterministic; legacy inputs fallback', () => {
    expect(buildDesignInstructionBlock([], undefined, { awardInfluence: influence })).toBe('');
    expect(buildDesignInstructionBlock(SHARED_PROMPTS, undefined, { awardInfluence: influence })).toBe(block);
    const legacy = buildDesignInstructionBlock(SHARED_PROMPTS, {});
    expect(legacy.startsWith('DESIGN VERIFICATION CHECKLIST')).toBe(true);
  });
});

describe('TS-3: hero image spec — determinism, layering, integrity, fallback', () => {
  const genome = { ventureName: 'DataDistill', subject: 'statistical distillation of large datasets', primaryColor: '#1E3A8A', accentColor: '#14B8A6' };

  it('is deterministic and derives the prompt from genome fields', () => {
    const a = buildHeroImageSpec(genome);
    expect(a).toEqual(buildHeroImageSpec(genome));
    expect(a.prompt).toContain('DataDistill');
    expect(a.prompt).toContain('statistical distillation');
    expect(a.prompt).toContain('#1E3A8A');
  });

  it('integrity: forbids screenshots/stock/text-in-image in the prompt itself', () => {
    const spec = buildHeroImageSpec(genome);
    expect(spec.prompt).toContain('NOT a product screenshot');
    expect(spec.prompt).toContain('NOT stock photography');
    expect(spec.prompt).toMatch(/no text or lettering/);
  });

  it('layering carries tint + WCAG scrim + fade + grain + reduced-motion-safe transform-only parallax', () => {
    const { layering } = buildHeroImageSpec(genome);
    expect(layering.tint.color).toBe('#1E3A8A');
    expect(layering.scrim.purpose).toContain('WCAG');
    expect(layering.fadeToPage).toBe(true);
    expect(layering.parallax.transformOnly).toBe(true);
    expect(layering.parallax.reducedMotionSafe).toBe(true);
  });

  it('gradient fallback is part of the contract (brand-derived, never a broken image)', () => {
    const { fallback } = buildHeroImageSpec(genome);
    expect(fallback.kind).toBe('gradient');
    expect(fallback.css).toContain('#1E3A8A');
    expect(fallback.rule).toContain('never a broken image');
  });
});

describe('TS-4: chairman always-want signature default-ON', () => {
  it('the motion category carries the default-ON signature (parallax + micro-animations + layered hero)', () => {
    const motionText = GENERATION_INPUTS.motion.do_rules.map((r) => r.rule).join(' ');
    expect(motionText).toContain('CHAIRMAN SIGNATURE — DEFAULT-ON');
    expect(motionText).toMatch(/restrained parallax/);
    expect(motionText).toMatch(/micro-animations/);
    expect(motionText).toMatch(/LAYERED hero image/);
    expect(motionText).toContain('reduced-motion-safe');
  });

  it('the hero-image do-rules are present in the static inputs (rendered on every block)', () => {
    expect(GENERATION_INPUTS.hero_image.do_rules.length).toBeGreaterThanOrEqual(4);
    const heroText = GENERATION_INPUTS.hero_image.do_rules.map((r) => r.rule).join(' ');
    expect(heroText).toContain('never a fabricated product screenshot');
    expect(heroText).toContain('gradient');
  });
});
