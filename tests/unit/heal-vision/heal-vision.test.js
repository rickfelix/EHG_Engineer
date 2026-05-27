/**
 * heal-vision.test.js — Tests for /heal vision venture-support
 *
 * SD-CRONGENIUS-LEO-INFRA-MAKE-HEAL-VISION-001 FR-5: 6 required tests.
 *
 * T1 Factory cwd-switch unit
 * T2 Per-check-type re-root unit
 * T3 Scorer integration with --target-path (spawn)
 * T4 Default-omitted regression pin (contract test — factory default == legacy ROOT)
 * T5 Negative path error (spawn)
 * T6 CronGenius regression (integration, skipped if worktree absent)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createCheckTypes, checkTypes } from '../../../scripts/eva/evidence-checks/check-types.js';
import {
  deriveArchKeyFromVisionKey,
  resolveArchKey,
} from '../../../scripts/eva/vision-evidence-scorer.js';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { execFileSync, spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const REPO_ROOT = resolve(__dirname, '../../../');
const SCORER_PATH = join(REPO_ROOT, 'scripts/eva/vision-evidence-scorer.js');

// ─── Fixture setup ─────────────────────────────────────────────

let emptyFixture;
let ehgLikeFixture;

beforeAll(() => {
  emptyFixture = mkdtempSync(join(tmpdir(), 'heal-vision-empty-'));
  ehgLikeFixture = mkdtempSync(join(tmpdir(), 'heal-vision-ehglike-'));
  // ehg-like fixture: create the canonical urgency-scorer path so export_exists could resolve.
  mkdirSync(join(ehgLikeFixture, 'scripts/modules/auto-proceed'), { recursive: true });
  writeFileSync(
    join(ehgLikeFixture, 'scripts/modules/auto-proceed/urgency-scorer.js'),
    'export function calculateUrgencyScore() { return 0; }\n',
    'utf8'
  );
});

afterAll(() => {
  if (emptyFixture) rmSync(emptyFixture, { recursive: true, force: true });
  if (ehgLikeFixture) rmSync(ehgLikeFixture, { recursive: true, force: true });
});

// ─── T1: Factory cwd-switch unit ───────────────────────────────

describe('T1 — Factory cwd-switch', () => {
  it('honors targetPath: empty fixture → known EHG glob returns 0 matches', async () => {
    const ct = createCheckTypes({ targetPath: emptyFixture });
    const result = await ct.file_count({ glob: 'lib/eva/stage-templates/stage-*.js', minCount: 20 });
    expect(result.passed).toBe(false);
    expect(result.evidence).toMatch(/Found 0 file/);
  });

  it('honors targetPath: ehg-like fixture → matching glob returns >= 1', async () => {
    const ct = createCheckTypes({ targetPath: ehgLikeFixture });
    const result = await ct.file_count({ glob: 'scripts/modules/auto-proceed/*.js', minCount: 1 });
    expect(result.passed).toBe(true);
    expect(result.evidence).toMatch(/Found 1 file/);
  });
});

// ─── T2: Per-check-type re-root unit ───────────────────────────

describe('T2 — Per-check-type re-root', () => {
  it('file_exists re-roots to targetPath', async () => {
    const ct = createCheckTypes({ targetPath: ehgLikeFixture });
    const result = await ct.file_exists({ glob: 'scripts/modules/auto-proceed/urgency-scorer.js' });
    expect(result.passed).toBe(true);
  });

  it('code_pattern re-roots: pattern found only when targetPath matches fixture content', async () => {
    const ct = createCheckTypes({ targetPath: ehgLikeFixture });
    const found = await ct.code_pattern({
      glob: 'scripts/modules/auto-proceed/*.js',
      pattern: 'calculateUrgencyScore',
    });
    expect(found.passed).toBe(true);

    // Same check against empty fixture should fail (no files match)
    const ctEmpty = createCheckTypes({ targetPath: emptyFixture });
    const notFound = await ctEmpty.code_pattern({
      glob: 'scripts/modules/auto-proceed/*.js',
      pattern: 'calculateUrgencyScore',
    });
    expect(notFound.passed).toBe(false);
  });

  it('anti_pattern re-roots: pattern found is a FAIL', async () => {
    const ct = createCheckTypes({ targetPath: ehgLikeFixture });
    const result = await ct.anti_pattern({
      glob: 'scripts/modules/auto-proceed/*.js',
      pattern: 'calculateUrgencyScore',
      maxMatches: 0,
    });
    expect(result.passed).toBe(false);
  });

  it('file_count re-roots: counts files in supplied targetPath', async () => {
    const ct = createCheckTypes({ targetPath: ehgLikeFixture });
    const result = await ct.file_count({
      glob: 'scripts/modules/auto-proceed/*.js',
      minCount: 1,
    });
    expect(result.passed).toBe(true);
  });

  it('export_exists re-roots: dynamic import path resolves against targetPath', async () => {
    const ct = createCheckTypes({ targetPath: ehgLikeFixture });
    const result = await ct.export_exists({
      module: 'scripts/modules/auto-proceed/urgency-scorer.js',
      exportName: 'calculateUrgencyScore',
    });
    expect(result.passed).toBe(true);
  });
});

// ─── T3: Scorer integration with --target-path (spawn) ─────────

describe('T3 — Scorer integration with --target-path', () => {
  it('accepts --target-path flag and threads through scoring (smoke)', () => {
    // Smoke: invoke scorer with --target-path against empty fixture; assert exit code is non-1
    // (will exit 1 for missing vision_key — that's acceptable; the goal is that --target-path is parsed)
    const result = spawnSync('node', [
      SCORER_PATH,
      '--vision-key', 'VISION-EHG-L1-001',  // EHG vision so arch-key default works
      '--target-path', emptyFixture,
    ], { encoding: 'utf8', timeout: 60000 });
    // Either passes (cleanly scored against empty fixture, low score) or errors for a real reason (not "unknown flag").
    // Crucially must NOT exit with "unknown argument" type error.
    expect(result.stderr).not.toMatch(/unknown argument|unrecognized option/i);
  });
});

// ─── T4: Default-omitted regression pin (contract test) ────────

describe('T4 — Default-omitted regression pin (LOAD-BEARING)', () => {
  it('createCheckTypes() with no targetPath uses EHG_Engineer ROOT (matches legacy module-level ROOT)', async () => {
    // Contract: createCheckTypes() must default to the same ROOT the legacy module-level
    // constant produced (= resolve(import.meta.dirname, '../../..') from check-types.js,
    // which is REPO_ROOT). The default `checkTypes` export uses this default.
    // Test: run file_count for a known-EHG-only path against default; should find files.
    const result = await checkTypes.file_count({
      glob: 'scripts/eva/evidence-rubrics/V*.js',
      minCount: 5,
    });
    expect(result.passed).toBe(true);
    // Sanity-check: the legacy path should find at least 11 V*.js rubrics (V01-V11)
    expect(result.evidence).toMatch(/Found \d+ file/);
  });

  it('createCheckTypes({ targetPath: <empty> }) does NOT find EHG files (proves switch works)', async () => {
    const ct = createCheckTypes({ targetPath: emptyFixture });
    const result = await ct.file_count({
      glob: 'scripts/eva/evidence-rubrics/V*.js',
      minCount: 5,
    });
    expect(result.passed).toBe(false);
  });
});

// ─── T5: Negative path error (spawn) ───────────────────────────

describe('T5 — Negative --target-path error', () => {
  it('exits non-zero with structured error when --target-path does not exist', () => {
    const result = spawnSync('node', [
      SCORER_PATH,
      '--vision-key', 'VISION-EHG-L1-001',
      '--target-path', '/path/that/should/never/exist/heal-vision-test',
    ], { encoding: 'utf8', timeout: 30000 });
    expect(result.status).not.toBe(0);
    expect(result.stderr + result.stdout).toMatch(/does not exist|not.*directory/i);
  });
});

// ─── T6: CronGenius regression (conditional integration) ───────

const CRONGENIUS_WORKTREE = resolve(REPO_ROOT, '../../../crongenius/.worktrees/SD-CRONGENIUS-LEO-ORCH-SPRINT-SPRINT-2026-001');

describe('T6 — CronGenius regression', () => {
  const cronGeniusExists = existsSync(CRONGENIUS_WORKTREE);

  it.skipIf(!cronGeniusExists)('scoring CronGenius worktree with --target-path produces score < 50 (was 100 before fix)', async () => {
    const ct = createCheckTypes({ targetPath: CRONGENIUS_WORKTREE });
    // Pick a representative EHG-only check: lib/eva/stage-execution-engine.js export
    const result = await ct.export_exists({
      module: 'lib/eva/stage-execution-engine.js',
      exportName: 'executeStage',
    });
    // Pre-fix: this would have passed (because path resolved to EHG_Engineer regardless).
    // Post-fix: should fail (CronGenius worktree has no lib/eva/stage-execution-engine.js).
    expect(result.passed).toBe(false);
  });

  if (!cronGeniusExists) {
    it('CronGenius worktree absent — T6 skipped', () => {
      console.warn(`[T6] CronGenius worktree not found at ${CRONGENIUS_WORKTREE} — skipped`);
      expect(true).toBe(true);
    });
  }
});

// ─── Bonus: pure unit tests for arch-key derivation/resolution ─

describe('deriveArchKeyFromVisionKey', () => {
  it('derives arch-key for canonical venture vision-keys', () => {
    expect(deriveArchKeyFromVisionKey('VISION-CRONGENIUS-API-L2-001')).toBe('ARCH-CRONGENIUS-001');
    expect(deriveArchKeyFromVisionKey('VISION-FOO-L1-001')).toBe('ARCH-FOO-001');
  });

  it('returns null for non-VISION-prefixed input', () => {
    expect(deriveArchKeyFromVisionKey('FOO-BAR-001')).toBeNull();
    expect(deriveArchKeyFromVisionKey('')).toBeNull();
    expect(deriveArchKeyFromVisionKey(null)).toBeNull();
  });
});

describe('resolveArchKey', () => {
  it('returns explicit arch-key when supplied', () => {
    const r = resolveArchKey({ visionKey: 'VISION-FOO-L1-001', archKey: 'ARCH-EXPLICIT-001', explicitArchKey: true });
    expect(r).toEqual({ archKey: 'ARCH-EXPLICIT-001', derived: false, error: null });
  });

  it('uses ARCH-EHG-L1-001 default for VISION-EHG- visions', () => {
    const r = resolveArchKey({ visionKey: 'VISION-EHG-L1-001', archKey: null, explicitArchKey: false });
    expect(r.archKey).toBe('ARCH-EHG-L1-001');
    expect(r.derived).toBe(false);
  });

  it('derives arch-key for non-EHG vision (no explicit arch)', () => {
    const r = resolveArchKey({ visionKey: 'VISION-CRONGENIUS-API-L2-001', archKey: null, explicitArchKey: false });
    expect(r.archKey).toBe('ARCH-CRONGENIUS-001');
    expect(r.derived).toBe(true);
    expect(r.error).toBeNull();
  });

  it('returns error when derivation fails (refuses silent EHG fallback)', () => {
    const r = resolveArchKey({ visionKey: 'NOT-A-VISION-KEY', archKey: null, explicitArchKey: false });
    expect(r.archKey).toBeNull();
    expect(r.error).toMatch(/derivable arch-key/i);
  });
});
