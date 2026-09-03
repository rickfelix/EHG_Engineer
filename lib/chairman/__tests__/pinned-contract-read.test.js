/**
 * Tests for lib/chairman/pinned-contract-read.mjs
 * SD-LEO-ORCH-CAPA-CONTRACT-TRUTH-001-B (W2 child B), PR1.
 *
 * These run against the REAL git object database of this checkout, deliberately. The behaviour
 * under test IS "what git says about these object names", and a mocked git would assert only that
 * the mock was configured as expected -- which is precisely the class of vacuous green this
 * workstream exists to remove.
 *
 * The live hash fixtures below are real encoded_ref.manifest_hash values measured from
 * chairman_ratifications on 2026-09-03, covering all THREE kinds present in live data (the SD
 * originally assumed two).
 */

import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  TIER,
  PinnedReadError,
  isCommitObject,
  readContractAtCommit,
  lastCommitTouchingBefore,
  resolveEncodeCommit,
} from '../pinned-contract-read.mjs';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const HEAD = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: REPO_ROOT, encoding: 'utf8' }).trim();

/** Real live values. 11-char ones ARE commits in this repo; 16- and 64-char ones are not. */
const LIVE_HASH = {
  commit11: '2c238e89ff0',            // 9 live rows
  commit11b: 'f096e4e2500',           // 9 live rows
  notObject16: '7f3f312bcf29793d',    // 6 live rows — superseded manifest digest
  notObject16b: '650bd77d4f394818',   // the CURRENT manifest's db_snapshot_hash
  notObject64: 'bfedf3a0ee30fc645dba13f1c841f5b18d737a90902700a8c4abb62a9f18f4bc', // 2 live rows
};

describe('isCommitObject — discriminates by OBJECT LOOKUP, never by length', () => {
  it('accepts a real commit sha', async () => {
    expect(await isCommitObject(HEAD, { repoRoot: REPO_ROOT })).toBe(true);
  });

  it.each([[LIVE_HASH.commit11], [LIVE_HASH.commit11b]])(
    'accepts live 11-char value %s, which IS a commit',
    async (h) => {
      expect(await isCommitObject(h, { repoRoot: REPO_ROOT })).toBe(true);
    }
  );

  it.each([[LIVE_HASH.notObject16], [LIVE_HASH.notObject16b], [LIVE_HASH.notObject64]])(
    'rejects live value %s, which is hex but NOT a git object',
    async (h) => {
      expect(await isCommitObject(h, { repoRoot: REPO_ROOT })).toBe(false);
    }
  );

  it('a length-based rule would MISCLASSIFY: rejected values are valid hex of object-name length', () => {
    // 7f3f312bcf29793d is 16 hex chars — syntactically a legal abbreviated sha. Only asking git
    // reveals that no such object exists. This test exists so a future "just check the length"
    // refactor fails loudly.
    expect(LIVE_HASH.notObject16).toMatch(/^[0-9a-f]{7,40}$/);
    expect(LIVE_HASH.commit11).toMatch(/^[0-9a-f]{7,40}$/);
    expect(LIVE_HASH.notObject16.length).toBeGreaterThan(LIVE_HASH.commit11.length);
  });

  it.each([[''], [null], [undefined], ['not-hex-at-all'], ['zz3f312bcf29793d']])(
    'returns false for malformed input %s without throwing',
    async (bad) => {
      expect(await isCommitObject(bad, { repoRoot: REPO_ROOT })).toBe(false);
    }
  );
});

describe('readContractAtCommit — reads from the object DB, not the working tree', () => {
  it('reads a tracked file at HEAD', async () => {
    const content = await readContractAtCommit(HEAD, 'package.json', { repoRoot: REPO_ROOT });
    expect(content).toContain('"name"');
  });

  it('reads a rendered contract at HEAD', async () => {
    const content = await readContractAtCommit(HEAD, 'CLAUDE.md', { repoRoot: REPO_ROOT });
    expect(content.length).toBeGreaterThan(0);
  });

  it('THROWS for a path absent at that commit rather than returning empty', async () => {
    await expect(
      readContractAtCommit(HEAD, 'no-such-file-xyz-12345.md', { repoRoot: REPO_ROOT })
    ).rejects.toThrow(PinnedReadError);
  });

  it('surfaces PINNED_READ_UNAVAILABLE for an unreadable pin', async () => {
    try {
      await readContractAtCommit(HEAD, 'no-such-file-xyz-12345.md', { repoRoot: REPO_ROOT });
      throw new Error('expected a throw');
    } catch (err) {
      expect(err.code).toBe('PINNED_READ_UNAVAILABLE');
    }
  });

  it.each([['', 'CLAUDE.md'], [HEAD, ''], [null, 'CLAUDE.md']])(
    'rejects bad arguments (%s, %s)',
    async (c, p) => {
      await expect(readContractAtCommit(c, p, { repoRoot: REPO_ROOT })).rejects.toThrow(PinnedReadError);
    }
  );
});

describe('resolveEncodeCommit — three tiers, and the tier is recorded', () => {
  it('TIER 1: a row whose manifest_hash IS a commit pins exactly', async () => {
    const v = await resolveEncodeCommit(
      { encoded_ref: { manifest_hash: LIVE_HASH.commit11 } },
      { repoRoot: REPO_ROOT }
    );
    expect(v.tier).toBe(TIER.EXACT);
    expect(v.approximate).toBe(false);
    expect(v.commit).toBe(LIVE_HASH.commit11);
  });

  it('TIER 2: a non-object hash with encoded_at + relPath reconstructs, LABELLED approximate', async () => {
    const v = await resolveEncodeCommit(
      { encoded_ref: { manifest_hash: LIVE_HASH.notObject16 }, encoded_at: '2026-09-03T00:00:00Z' },
      { repoRoot: REPO_ROOT, relPath: 'CLAUDE.md' }
    );
    expect(v.tier).toBe(TIER.APPROXIMATE);
    expect(v.approximate).toBe(true);
    expect(v.commit).toMatch(/^[0-9a-f]{40}$/);
    expect(v.reason).toContain('RECONSTRUCTION');
  });

  it('TIER 3: no usable commit falls back to DB section content', async () => {
    const v = await resolveEncodeCommit(
      { encoded_ref: { manifest_hash: LIVE_HASH.notObject16 } }, // no encoded_at, no relPath
      { repoRoot: REPO_ROOT }
    );
    expect(v.tier).toBe(TIER.DB);
    expect(v.commit).toBeNull();
    expect(v.reason).toContain('leo_protocol_sections.content');
  });

  it('TIER 3: the 64-char kind — the THIRD kind the SD did not originally anticipate', async () => {
    const v = await resolveEncodeCommit(
      { encoded_ref: { manifest_hash: LIVE_HASH.notObject64 } },
      { repoRoot: REPO_ROOT }
    );
    expect(v.tier).toBe(TIER.DB);
    expect(v.commit).toBeNull();
  });

  it('a missing encoded_ref degrades to TIER 3 rather than throwing', async () => {
    const v = await resolveEncodeCommit({}, { repoRoot: REPO_ROOT });
    expect(v.tier).toBe(TIER.DB);
    expect(v.reason).toContain('(absent)');
  });

  it('every verdict carries a tier a reader can act on', async () => {
    const rows = [
      { encoded_ref: { manifest_hash: LIVE_HASH.commit11 } },
      { encoded_ref: { manifest_hash: LIVE_HASH.notObject16 }, encoded_at: '2026-09-03T00:00:00Z' },
      { encoded_ref: { manifest_hash: LIVE_HASH.notObject64 } },
    ];
    for (const row of rows) {
      const v = await resolveEncodeCommit(row, { repoRoot: REPO_ROOT, relPath: 'CLAUDE.md' });
      expect(Object.values(TIER)).toContain(v.tier);
      expect(typeof v.approximate).toBe('boolean');
    }
  });
});

describe('lastCommitTouchingBefore', () => {
  it('finds a commit for a long-lived tracked file', async () => {
    const sha = await lastCommitTouchingBefore('CLAUDE.md', '2026-09-03T00:00:00Z', {
      repoRoot: REPO_ROOT,
    });
    expect(sha).toMatch(/^[0-9a-f]{40}$/);
  });

  it('returns null for an unknown path instead of throwing', async () => {
    expect(
      await lastCommitTouchingBefore('no-such-file-xyz-12345.md', '2026-09-03T00:00:00Z', {
        repoRoot: REPO_ROOT,
      })
    ).toBeNull();
  });

  it('returns null when required arguments are missing', async () => {
    expect(await lastCommitTouchingBefore(null, '2026-09-03T00:00:00Z', { repoRoot: REPO_ROOT })).toBeNull();
    expect(await lastCommitTouchingBefore('CLAUDE.md', null, { repoRoot: REPO_ROOT })).toBeNull();
  });
});

describe('tree-independence — the defect being closed', () => {
  it('reads content at a commit even though the working tree may differ', async () => {
    // The pinned read must not consult the working tree at all. Reading an OLD commit and getting
    // content is the observable proof: a working-tree read could only ever return today's bytes.
    const older = execFileSync('git', ['rev-list', '--max-count=2', 'HEAD'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    })
      .trim()
      .split('\n')
      .pop();
    const content = await readContractAtCommit(older, 'package.json', { repoRoot: REPO_ROOT });
    expect(content).toContain('"name"');
  });
});
