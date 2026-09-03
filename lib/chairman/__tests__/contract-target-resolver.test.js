/**
 * Tests for lib/chairman/contract-target-resolver.mjs
 * SD-LEO-ORCH-CAPA-CONTRACT-TRUTH-001-B (W2 child B), PR1.
 *
 * The central assertion here is SET EQUALITY, not membership. A resolver returning ONE file per
 * contract would satisfy "covers 100% of VALID_TARGET_CONTRACTS" while under-verifying by 2-3
 * files per contract -- reproducing the exact defect this child exists to close. Equality is the
 * falsifier; membership is not. (TESTING evidence row c16256ef, blocking condition 3.)
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  TARGET_CONTRACTS,
  PSEUDO_KEYS,
  ContractResolutionError,
  readMappingFiles,
  contractForFile,
  buildContractFileMap,
  resolveContractTargets,
  resolveRowTargets,
} from '../contract-target-resolver.mjs';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

/** Declared expected sets, pinned by equality. A mapping change must surface as a failing test
 *  here rather than silently widening or narrowing what gets verified. */
const EXPECTED = {
  adam: ['CLAUDE_ADAM.md', 'CLAUDE_ADAM_MANUAL.md', 'CLAUDE_ADAM_PROVENANCE.md'],
  coordinator: [
    'CLAUDE_COORDINATOR.md',
    'CLAUDE_COORDINATOR_MANUAL.md',
    'CLAUDE_COORDINATOR_PROVENANCE.md',
  ],
  solomon: [
    'CLAUDE_SOLOMON.md',
    'CLAUDE_SOLOMON_MANUAL.md',
    'CLAUDE_SOLOMON_MODEL_POSTURE.md',
    'CLAUDE_SOLOMON_PROVENANCE.md',
  ],
  protocol: [
    'CLAUDE.md',
    'CLAUDE_CORE.md',
    'CLAUDE_CORE_MANUAL.md',
    'CLAUDE_EXEC.md',
    'CLAUDE_LEAD.md',
    'CLAUDE_LEAD_MANUAL.md',
    'CLAUDE_PLAN.md',
    'CLAUDE_PLAN_MANUAL.md',
  ],
};

describe('contract-target-resolver — declared file sets pinned by EQUALITY', () => {
  for (const contract of Object.keys(EXPECTED)) {
    it(`${contract} resolves to exactly its declared file set`, () => {
      expect(resolveContractTargets(contract, { repoRoot: REPO_ROOT })).toEqual(EXPECTED[contract]);
    });
  }

  it('a scalar-returning resolver would FAIL these assertions (the falsifier)', () => {
    // Documents why equality is required: every role contract resolves to MORE than one file,
    // so a one-file-per-contract implementation cannot pass.
    for (const contract of ['adam', 'coordinator', 'solomon']) {
      expect(resolveContractTargets(contract, { repoRoot: REPO_ROOT }).length).toBeGreaterThan(1);
    }
    expect(resolveContractTargets('protocol', { repoRoot: REPO_ROOT }).length).toBe(8);
  });

  it('covers every target contract with a non-empty set', () => {
    const map = buildContractFileMap({ repoRoot: REPO_ROOT });
    expect(Object.keys(map).sort()).toEqual([...TARGET_CONTRACTS].sort());
    for (const c of TARGET_CONTRACTS) expect(map[c].length).toBeGreaterThan(0);
  });

  it('partitions the mapping: every real file belongs to exactly one contract', () => {
    const files = readMappingFiles({ repoRoot: REPO_ROOT });
    const map = buildContractFileMap({ repoRoot: REPO_ROOT });
    const assigned = Object.values(map).flat();
    expect(assigned.slice().sort()).toEqual(files.slice().sort());
    expect(new Set(assigned).size).toBe(assigned.length); // no file claimed twice
  });
});

describe('contract-target-resolver — pseudo-keys and digests are excluded', () => {
  it('never returns the SHARED pseudo-key, which is not a path', () => {
    const assigned = Object.values(buildContractFileMap({ repoRoot: REPO_ROOT })).flat();
    for (const pseudo of PSEUDO_KEYS) expect(assigned).not.toContain(pseudo);
  });

  it('excludes *_DIGEST.md files, which are absent from the mapping (FR-2 decision)', () => {
    const assigned = Object.values(buildContractFileMap({ repoRoot: REPO_ROOT })).flat();
    expect(assigned.filter((f) => f.includes('_DIGEST'))).toEqual([]);
  });
});

describe('contract-target-resolver — fail-closed behaviour', () => {
  it('throws a named error for an unknown contract rather than returning empty', () => {
    expect(() => resolveContractTargets('nonesuch', { repoRoot: REPO_ROOT })).toThrow(
      ContractResolutionError
    );
    try {
      resolveContractTargets('nonesuch', { repoRoot: REPO_ROOT });
    } catch (err) {
      expect(err.code).toBe('CONTRACT_UNRESOLVABLE');
      expect(err.contract).toBe('nonesuch');
    }
  });

  it.each([['', 'empty string'], [null, 'null'], [undefined, 'undefined'], [42, 'a number']])(
    'rejects %s (%s) instead of coercing it',
    (bad) => {
      expect(() => resolveContractTargets(bad, { repoRoot: REPO_ROOT })).toThrow(
        ContractResolutionError
      );
    }
  );

  it('throws when the mapping is unreadable — never yields an empty set', () => {
    expect(() => readMappingFiles({ repoRoot: join(REPO_ROOT, 'no-such-dir-xyz') })).toThrow(
      ContractResolutionError
    );
  });
});

describe('contract-target-resolver — row-level resolution', () => {
  it('resolves a multi-contract row to the union, de-duplicated and sorted', () => {
    const { files, byContract } = resolveRowTargets(['adam', 'coordinator'], { repoRoot: REPO_ROOT });
    expect(byContract.adam).toEqual(EXPECTED.adam);
    expect(byContract.coordinator).toEqual(EXPECTED.coordinator);
    expect(files).toEqual([...EXPECTED.adam, ...EXPECTED.coordinator].sort());
    expect(new Set(files).size).toBe(files.length);
  });

  it("resolves the live row 20dc072b's declared contract ['protocol'] to 8 files", () => {
    // This row declares ['protocol'] but was encoded against section 601 -> CLAUDE_ADAM.md, a
    // file it does not name. The cross-target consistency check that rejects it (PR2) depends on
    // this resolution being complete and correct.
    const { files } = resolveRowTargets(['protocol'], { repoRoot: REPO_ROOT });
    expect(files).toEqual(EXPECTED.protocol);
    expect(files).not.toContain('CLAUDE_ADAM.md');
  });

  it('rejects an empty or non-array target_contracts', () => {
    expect(() => resolveRowTargets([], { repoRoot: REPO_ROOT })).toThrow(ContractResolutionError);
    expect(() => resolveRowTargets(null, { repoRoot: REPO_ROOT })).toThrow(ContractResolutionError);
  });
});

describe('contract-target-resolver — parity with the writer allowlist', () => {
  it("matches ratification-writer.mjs's VALID_TARGET_CONTRACTS", () => {
    // Read the source rather than importing, so this module stays free of an import cycle with
    // the writer while still failing loudly if the two lists drift apart.
    const src = readFileSync(join(REPO_ROOT, 'lib', 'chairman', 'ratification-writer.mjs'), 'utf8');
    const m = src.match(/VALID_TARGET_CONTRACTS\s*=\s*Object\.freeze\(\[([^\]]*)\]\)/);
    expect(m, 'VALID_TARGET_CONTRACTS not found in ratification-writer.mjs').toBeTruthy();
    const declared = m[1]
      .split(',')
      .map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
      .filter(Boolean);
    expect(declared.slice().sort()).toEqual([...TARGET_CONTRACTS].sort());
  });
});

describe('contract-target-resolver — file-to-contract attribution', () => {
  it.each([
    ['CLAUDE_ADAM.md', 'adam'],
    ['CLAUDE_ADAM_PROVENANCE.md', 'adam'],
    ['CLAUDE_COORDINATOR_MANUAL.md', 'coordinator'],
    ['CLAUDE_SOLOMON_MODEL_POSTURE.md', 'solomon'],
    ['CLAUDE.md', 'protocol'],
    ['CLAUDE_CORE.md', 'protocol'],
    ['CLAUDE_EXEC.md', 'protocol'],
  ])('attributes %s to %s', (file, contract) => {
    expect(contractForFile(file)).toBe(contract);
  });

  it('does not let a role prefix swallow an unrelated file with the same stem start', () => {
    // CLAUDE_ADAMANT.md must NOT read as the adam contract: the prefix rule requires an exact
    // filename or a '_' separator.
    expect(contractForFile('CLAUDE_ADAMANT.md')).toBe('protocol');
  });
});
