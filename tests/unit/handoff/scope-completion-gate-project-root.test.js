/**
 * SD-MAN-INFRA-COMPLETION-PROBES-CROSS-001 (FR-6, TS-7, TS-13): coverage for
 * scope-completion-gate.js's per-SD project root resolution. Before this SD,
 * PROJECT_ROOT was a single module-level constant computed once — a venture SD's
 * deliverable, which exists only in that venture's own repo, always read as
 * "missing" because every check ran against EHG_Engineer's worktree.
 */
import { describe, it, expect, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  checkDeliverable,
  grepRecursive,
  resolveProjectRoot,
  LEGACY_PROJECT_ROOT,
} from '../../../scripts/modules/handoff/gates/scope-completion-gate.js';

function makeFixtureRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scope-gate-fixture-'));
  fs.mkdirSync(path.join(dir, 'lib'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'lib', 'venture-only.js'), 'export function ventureOnlyFn() {}\n');
  return dir;
}

describe('checkDeliverable / grepRecursive: per-call projectRoot (TS-7)', () => {
  it('a deliverable that exists ONLY in a venture fixture repo is found when projectRoot points there, missing when it does not', () => {
    const ventureRoot = makeFixtureRepo();
    try {
      const deliverable = { name: 'lib/venture-only.js', type: 'file', checkPattern: 'lib/venture-only.js' };

      const foundResult = checkDeliverable(deliverable, ventureRoot);
      expect(foundResult.status).toBe('found');

      // Same deliverable, no projectRoot override -> checked against LEGACY_PROJECT_ROOT
      // (this EHG_Engineer worktree), where the venture-only fixture file does not exist.
      const missingResult = checkDeliverable(deliverable);
      expect(missingResult.status).toBe('missing');
    } finally {
      fs.rmSync(ventureRoot, { recursive: true, force: true });
    }
  });

  it('grepRecursive resolves a found function against the passed projectRoot, not LEGACY_PROJECT_ROOT', () => {
    const ventureRoot = makeFixtureRepo();
    try {
      const result = grepRecursive(path.join(ventureRoot, 'lib'), 'ventureOnlyFn', ventureRoot);
      expect(result).toBe(path.join('lib', 'venture-only.js'));
    } finally {
      fs.rmSync(ventureRoot, { recursive: true, force: true });
    }
  });
});

describe('resolveProjectRoot (TS-13)', () => {
  it('uses the resolved repoPath when resolveGateRepoContext resolves successfully', async () => {
    const supabase = {}; // unused by the injected mock below
    const originalModule = await import('../../../lib/repo-paths.js');
    const spy = vi.spyOn(originalModule, 'resolveGateRepoContext').mockResolvedValue({ resolved: true, repoPath: '/ventures/some-repo' });
    try {
      const root = await resolveProjectRoot({ target_application: 'SomeVenture' }, supabase);
      expect(root).toBe('/ventures/some-repo');
    } finally {
      spy.mockRestore();
    }
  });

  it('falls back to LEGACY_PROJECT_ROOT when resolution is unresolvable', async () => {
    const originalModule = await import('../../../lib/repo-paths.js');
    const spy = vi.spyOn(originalModule, 'resolveGateRepoContext').mockResolvedValue({ resolved: false, repoPath: null });
    try {
      const root = await resolveProjectRoot({ target_application: 'zzz-nonexistent' }, {});
      expect(root).toBe(LEGACY_PROJECT_ROOT);
    } finally {
      spy.mockRestore();
    }
  });

  it('falls back to LEGACY_PROJECT_ROOT when resolution throws (never propagates the error)', async () => {
    const originalModule = await import('../../../lib/repo-paths.js');
    const spy = vi.spyOn(originalModule, 'resolveGateRepoContext').mockRejectedValue(new Error('db down'));
    try {
      const root = await resolveProjectRoot({ target_application: 'SomeVenture' }, {});
      expect(root).toBe(LEGACY_PROJECT_ROOT);
    } finally {
      spy.mockRestore();
    }
  });

  it('an EHG_Engineer platform SD resolves to LEGACY_PROJECT_ROOT-equivalent (byte-identical for the platform-majority case)', async () => {
    const root = await resolveProjectRoot({ target_application: 'EHG_Engineer', metadata: {} }, {});
    // Both LEGACY_PROJECT_ROOT (git rev-parse --show-toplevel) and resolveGateRepoContext's
    // platform path (ENGINEER_ROOT, module-location-derived) point at this same worktree.
    expect(fs.realpathSync(root)).toBe(fs.realpathSync(LEGACY_PROJECT_ROOT));
  });
});
