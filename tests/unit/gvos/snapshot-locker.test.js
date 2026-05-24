/**
 * Unit tests — GVOS backend snapshot locker (FR-6 lock, backend port).
 *
 * SD-LEO-REFAC-RETIRE-LEGACY-STAGE-001
 *
 * Covers the pure, parity-critical logic the S17 lock hook depends on:
 *  - buildLockedSnapshot: archetype/token snapshot, compliance exclusion, pack
 *    decomposition, deterministic hash (must match EHG/src/lib/gvos/snapshot-locker.ts).
 *  - decompose: pack vs non-pack split + structural disables.
 */
import { describe, it, expect } from 'vitest';
import { buildLockedSnapshot, defaultHash } from '../../../lib/gvos/snapshot-locker.js';
import { decompose, isPackToken } from '../../../lib/gvos/pack-decomposer.js';

// Mirrors the Canvas AI archetype "Atmospheric-Quiet" shape (no pack tokens).
const archetype = {
  prompt_token: 'Atmospheric-Quiet',
  tokens_required: ['Recursive Padding', 'Backdrop Blur Depth', 'type_voice'],
  substrate: { base: 'breath-cream', depth: 'air-gradient', surface: 'sand-warm' },
  accent: { cta: 'still-cobalt', primary: 'sage-green', support: 'dusk-blush' },
  typography_voice: 'Humanist-Sans',
};
const liveTokens = [
  { name: 'Recursive Padding', category: 'structural', version_major: 1, version_minor: 0, version_patch: 0 },
  { name: 'Backdrop Blur Depth', category: 'structural', version_major: 1, version_minor: 2, version_patch: 0 },
  { name: 'type_voice', category: 'typography', version_major: 2, version_minor: 0, version_patch: 1 },
];

describe('buildLockedSnapshot (GVOS FR-6 backend port)', () => {
  it('freezes archetype identity + sorted tokens + version triples', () => {
    const { locked } = buildLockedSnapshot(archetype, liveTokens, {});
    expect(locked.archetype_prompt_token).toBe('Atmospheric-Quiet');
    expect(locked.substrate).toEqual(archetype.substrate);
    expect(locked.accent).toEqual(archetype.accent);
    expect(locked.typography_voice).toBe('Humanist-Sans');
    // tokens_required is sorted
    expect(locked.tokens_required).toEqual(['Backdrop Blur Depth', 'Recursive Padding', 'type_voice']);
    // version triples present + sorted by token_name
    expect(locked.locked_token_versions.map((v) => v.token_name)).toEqual([
      'Backdrop Blur Depth', 'Recursive Padding', 'type_voice',
    ]);
    expect(locked.locked_token_versions[2]).toMatchObject({ token_name: 'type_voice', version_major: 2, version_minor: 0, version_patch: 1 });
    expect(typeof locked.snapshot_hash).toBe('string');
    expect(locked.snapshot_hash).toHaveLength(16); // FNV-1a 64-bit hex
  });

  it('excludes compliance-category tokens from the lock (live propagation)', () => {
    const withCompliance = {
      ...archetype,
      tokens_required: ['Recursive Padding', 'WCAG-AA-Contrast'],
    };
    const tokens = [
      { name: 'Recursive Padding', category: 'structural', version_major: 1, version_minor: 0, version_patch: 0 },
      { name: 'WCAG-AA-Contrast', category: 'compliance', version_major: 3, version_minor: 0, version_patch: 0 },
    ];
    const { locked, excluded_compliance_tokens } = buildLockedSnapshot(withCompliance, tokens, {});
    expect(excluded_compliance_tokens).toEqual(['WCAG-AA-Contrast']);
    expect(locked.tokens_required).toEqual(['Recursive Padding']);
    expect(locked.locked_token_versions.map((v) => v.token_name)).toEqual(['Recursive Padding']);
  });

  it('decomposes pack tokens: pack name is the versioned unit, atomics are not in tokens_required', () => {
    const withPack = {
      ...archetype,
      tokens_required: ['Recursive Padding', 'Full-Bleed-Media-Pattern'],
    };
    const tokens = [
      { name: 'Recursive Padding', category: 'structural', version_major: 1, version_minor: 0, version_patch: 0 },
      { name: 'Full-Bleed-Media-Pattern', category: 'pack', version_major: 1, version_minor: 0, version_patch: 0 },
    ];
    const { locked, decomposed_packs } = buildLockedSnapshot(withPack, tokens, {});
    expect(decomposed_packs).toEqual(['Full-Bleed-Media-Pattern']);
    // pack NAME present; its atomics (e.g. media_aspect) are NOT in tokens_required
    expect(locked.tokens_required).toContain('Full-Bleed-Media-Pattern');
    expect(locked.tokens_required).not.toContain('media_aspect');
  });

  it('produces a deterministic, stable snapshot_hash for identical inputs', () => {
    const a = buildLockedSnapshot(archetype, liveTokens, { foo: 'bar' });
    const b = buildLockedSnapshot(archetype, liveTokens, { foo: 'bar' });
    expect(a.locked.snapshot_hash).toBe(b.locked.snapshot_hash);
    // a different override changes the hash (snapshot integrity)
    const c = buildLockedSnapshot(archetype, liveTokens, { foo: 'baz' });
    expect(c.locked.snapshot_hash).not.toBe(a.locked.snapshot_hash);
  });

  it('defaultHash is a stable 16-char FNV-1a hex', () => {
    expect(defaultHash('x')).toHaveLength(16);
    expect(defaultHash('x')).toBe(defaultHash('x'));
    expect(defaultHash('x')).not.toBe(defaultHash('y'));
  });
});

describe('decompose (pack-decomposer backend port)', () => {
  it('splits packs from non-packs and applies disables', () => {
    const r = decompose(['Recursive-Padding', 'Artist-Override-Pack', 'Geometric-Asymmetry']);
    expect(r.packs_found).toEqual(['Artist-Override-Pack']);
    expect(r.non_pack_tokens).toEqual(['Recursive-Padding', 'Geometric-Asymmetry']);
    // Artist-Override-Pack disables Recursive-Padding + Geometric-Asymmetry
    expect(r.disabled).toEqual(['Geometric-Asymmetry', 'Recursive-Padding']);
    expect(isPackToken('Artist-Override-Pack')).toBe(true);
    expect(isPackToken('Recursive-Padding')).toBe(false);
  });
});
