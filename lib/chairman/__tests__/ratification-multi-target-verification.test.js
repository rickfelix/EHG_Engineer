/**
 * SD-LEO-ORCH-CAPA-CONTRACT-TRUTH-001-B — verifyMarkerAcrossTargetContracts.
 *
 * A SIBLING file rather than additions to ratification-writer.test.js or child A's
 * ratification-marker-verification.test.js: this layer is its own unit, and keeping it separate
 * means child B never edits a file child A owns. Sibling precedent stated at
 * ratification-regression-detector.test.js:9.
 *
 * The central assertions here are the ones that were INEXPRESSIBLE before this layer existed,
 * because the previous check never read row.target_contracts at all — a marker present in one
 * named contract and absent from another could not even be described, let alone caught.
 *
 * REPORT-VERSUS-REFUSE is what most of these pin, per the coordinator's ruling:
 *   "could not check"   -> REPORT (a result object, no throw)
 *   "checked and wrong" -> REFUSE (throw)
 * An earlier draft of this layer threw when no commit pin was derivable. That was wrong — an
 * underivable pin is missing infrastructure, and it affects 20 of 49 live rows. It now reports,
 * and the test below is what would catch a regression back to throwing.
 */

import { describe, it, expect, vi } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { verifyMarkerAcrossTargetContracts } from '../ratification-writer.mjs';

const MARKER = 'the ratified clause';

// The BASE check (child A's) reads a real manifest + rendered file from repoRoot, so this layer's
// tests need a fixture root for it. The PINNED layer on top is injected.
const FIXTURE_ROOT = mkdtempSync(join(tmpdir(), 'multi-target-fixture-'));
writeFileSync(join(FIXTURE_ROOT, 'claude-generation-manifest.json'), JSON.stringify({
  section_digests: { meta: { 94: { target_file: 'CLAUDE_ADAM.md' } } },
}));
writeFileSync(join(FIXTURE_ROOT, 'CLAUDE_ADAM.md'), `${MARKER}\ntail\n`);

const REF = { type: 'section_id', section_id: '94', manifest_hash: 'abc1234' };
const freshDrift = async () => ({ staleFiles: [] });

function makeSupabase(rowResult) {
  const maybeSingle = vi.fn(() => Promise.resolve(rowResult));
  const eq = vi.fn(() => ({ maybeSingle }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));
  return { from, _select: select };
}

const rowWith = (contracts) => ({ data: { target_contracts: contracts }, error: null });

function deps({ files = {}, contracts = {}, commit = 'deadbee', tier = 'exact_commit_pin', approximate = false } = {}) {
  return {
    resolveEncodeCommit: async () => ({ tier, commit, approximate, reason: 'test' }),
    readContractAtCommit: async (_c, relPath) => {
      if (!(relPath in files)) throw new Error(`absent at pin: ${relPath}`);
      return files[relPath];
    },
    resolveContractTargets: (c) => {
      if (!contracts[c]) throw new Error(`unknown contract ${c}`);
      return contracts[c];
    },
  };
}

const call = (sb, opts) => verifyMarkerAcrossTargetContracts(sb, 'row-1', REF, MARKER, {
  repoRoot: FIXTURE_ROOT, driftProbe: freshDrift, ...opts,
});

describe('verifyMarkerAcrossTargetContracts — REFUSES on measured disagreement', () => {
  // THE CORE FIX. Measured: 34 of 49 live rows carry the marker in SOME but not ALL of their named
  // contracts, and the single-file check recorded every one as encoded.
  it('refuses when the marker is in one named contract but absent from another', async () => {
    const sb = makeSupabase(rowWith(['adam', 'coordinator']));
    await expect(call(sb, {
      deps: deps({
        contracts: { adam: ['CLAUDE_ADAM.md'], coordinator: ['CLAUDE_COORDINATOR.md'] },
        files: { 'CLAUDE_ADAM.md': `${MARKER}\n`, 'CLAUDE_COORDINATOR.md': 'nothing relevant\n' },
      }),
    })).rejects.toThrow(/absent from 1 of 2 named target contract/);
  });

  // Row 20dc072b: declares ['protocol'] but is encoded against section 601 -> CLAUDE_ADAM.md, a
  // file it does not name. Validated there and stamped anyway; this row is exactly why the covered
  // slot count is 48 rather than 49.
  it('refuses when encoded_ref renders into a file the row does not name (row 20dc072b shape)', async () => {
    const sb = makeSupabase(rowWith(['protocol']));
    await expect(call(sb, {
      deps: deps({
        contracts: { protocol: ['CLAUDE.md', 'CLAUDE_CORE.md'] },
        files: { 'CLAUDE.md': `${MARKER}\n`, 'CLAUDE_CORE.md': `${MARKER}\n` },
      }),
    })).rejects.toThrow(/CROSS-TARGET INCONSISTENCY/);
  });

  it('names the pin tier in the refusal so approximate evidence is distinguishable', async () => {
    const sb = makeSupabase(rowWith(['adam']));
    await expect(call(sb, {
      deps: deps({
        tier: 'approximate_encoded_at_pin', approximate: true,
        contracts: { adam: ['CLAUDE_ADAM.md'] },
        files: { 'CLAUDE_ADAM.md': 'no marker\n' },
      }),
    })).rejects.toThrow(/approximate_encoded_at_pin \(APPROXIMATE\)/);
  });
});

describe('verifyMarkerAcrossTargetContracts — REPORTS when it could not check', () => {
  // The correction the coordinator ruled on: an underivable pin is missing infrastructure, not a
  // disagreement. 20 of 49 live rows carry a manifest_hash that is not a git object.
  it('reports rather than throwing when no commit pin is derivable', async () => {
    const sb = makeSupabase(rowWith(['adam']));
    const result = await call(sb, {
      deps: deps({ commit: null, tier: 'db_section_content', contracts: { adam: ['CLAUDE_ADAM.md'] } }),
    });
    expect(result.multi_target_checked).toBe(false);
    expect(result.reason).toBe('no_commit_pin');
    expect(result.verified).toBe(true); // child A's base check DID verify the live file
  });

  it('reports when the row cannot be read', async () => {
    const sb = makeSupabase({ data: null, error: { message: 'boom' } });
    const result = await call(sb, { deps: deps({ contracts: { adam: ['CLAUDE_ADAM.md'] } }) });
    expect(result.multi_target_checked).toBe(false);
    expect(result.reason).toBe('target_contracts_unreadable');
  });

  it('reports when the row names no target contracts', async () => {
    const sb = makeSupabase(rowWith([]));
    const result = await call(sb, { deps: deps({ contracts: {} }) });
    expect(result.multi_target_checked).toBe(false);
    expect(result.reason).toBe('no_target_contracts');
  });

  it('reports when a declared contract cannot be resolved to files', async () => {
    const sb = makeSupabase(rowWith(['nonesuch']));
    const result = await call(sb, { deps: deps({ contracts: {} }) });
    expect(result.multi_target_checked).toBe(false);
    expect(result.reason).toMatch(/contract_unresolvable/);
  });

  it('reports when nothing is readable at the pin (shallow clone, pruned object)', async () => {
    const sb = makeSupabase(rowWith(['adam']));
    const result = await call(sb, {
      deps: deps({ contracts: { adam: ['CLAUDE_ADAM.md'] }, files: {} }),
    });
    expect(result.multi_target_checked).toBe(false);
    expect(result.reason).toBe('no_targets_readable_at_pin');
  });
});

describe('verifyMarkerAcrossTargetContracts — ACCEPTS and extends child A result', () => {
  it('accepts when every named contract carries the marker, and reports which', async () => {
    const sb = makeSupabase(rowWith(['adam', 'coordinator']));
    const result = await call(sb, {
      deps: deps({
        contracts: { adam: ['CLAUDE_ADAM.md'], coordinator: ['CLAUDE_COORDINATOR.md'] },
        files: { 'CLAUDE_ADAM.md': `${MARKER}\n`, 'CLAUDE_COORDINATOR.md': `intro\n${MARKER}\n` },
      }),
    });
    expect(result.multi_target_checked).toBe(true);
    expect(result.verified_contracts).toEqual(['adam', 'coordinator']);
    expect(result.pin_tier).toBe('exact_commit_pin');
    expect(result.approximate).toBe(false);
  });

  // ANY-MEMBER-SATISFIES: a clause renders into ONE companion, so requiring every file of a
  // contract would fail every legitimate row.
  it('accepts a marker carried by a companion file rather than the base contract file', async () => {
    const sb = makeSupabase(rowWith(['adam']));
    const result = await call(sb, {
      deps: deps({
        contracts: { adam: ['CLAUDE_ADAM.md', 'CLAUDE_ADAM_MANUAL.md'] },
        files: { 'CLAUDE_ADAM.md': 'no marker here\n', 'CLAUDE_ADAM_MANUAL.md': `${MARKER}\n` },
      }),
    });
    expect(result.multi_target_checked).toBe(true);
    expect(result.verified_contracts).toEqual(['adam']);
  });

  // The layer must not swallow or reshape what child A reports.
  it("preserves child A's fields on the extended result", async () => {
    const sb = makeSupabase(rowWith(['adam']));
    const result = await call(sb, {
      deps: deps({ contracts: { adam: ['CLAUDE_ADAM.md'] }, files: { 'CLAUDE_ADAM.md': `${MARKER}\n` } }),
    });
    expect(result.verified).toBe(true);
    expect(result.stale_checked).toBe(true);
    expect(result.target_file).toBe('CLAUDE_ADAM.md');
    expect(typeof result.checked_at).toBe('string');
  });
});

describe("verifyMarkerAcrossTargetContracts — child A's verdict is never second-guessed", () => {
  // When the base check could not verify, the layer returns its verdict untouched and does not
  // reach for the row at all. Regressing this would mean widening a check that never ran.
  it('returns the base verdict unchanged when the base could not verify, without reading the row', async () => {
    const emptyRoot = mkdtempSync(join(tmpdir(), 'multi-target-empty-'));
    const sb = makeSupabase(rowWith(['adam']));
    const result = await verifyMarkerAcrossTargetContracts(sb, 'row-1', REF, MARKER, {
      repoRoot: emptyRoot, driftProbe: freshDrift, deps: deps({}),
    });
    expect(result.verified).toBe(false);
    expect(result.reason).toBe('no_manifest');
    expect(result.multi_target_checked).toBe(false);
    expect(sb.from).not.toHaveBeenCalled();
  });

  // Child A refuses an absent marker BEFORE this layer runs; that refusal must survive layering.
  it("still throws on child A's absent-marker refusal", async () => {
    const sb = makeSupabase(rowWith(['adam']));
    await expect(verifyMarkerAcrossTargetContracts(sb, 'row-1', REF, 'prose that is nowhere on disk', {
      repoRoot: FIXTURE_ROOT, driftProbe: freshDrift, deps: deps({}),
    })).rejects.toThrow(/is not present in the live content/);
  });

  // And child A's staleness refusal must survive too.
  it("still throws on child A's stale-contract refusal", async () => {
    const sb = makeSupabase(rowWith(['adam']));
    const staleDrift = async () => ({ staleFiles: ['CLAUDE_ADAM.md'] });
    await expect(verifyMarkerAcrossTargetContracts(sb, 'row-1', REF, MARKER, {
      repoRoot: FIXTURE_ROOT, driftProbe: staleDrift, deps: deps({}),
    })).rejects.toThrow(/is STALE against leo_protocol_sections/);
  });
});
