/**
 * Regression tests for SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-127 FR-1 + FR-2.
 *
 * Covers:
 *   - EXCLUSION_PATTERNS skip canonical test/spec paths (FR-1)
 *   - Barrel re-export files are reachable transitively (FR-2 AC-1)
 *   - Dynamic import() with literal specifier resolves edges (FR-2 AC-3 literal path)
 *   - Dynamic import() with non-literal specifier emits CAUTION warning (FR-2 AC-3)
 *   - Negative control: genuinely unreachable orphan file stays unreachable (FR-6 AC-3)
 *
 * Addresses PAT-AUTO-855d11b1 (4 occurrences): WIRE_CHECK_GATE false-positives
 * on co-located tests and barrel-re-exported modules.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { buildCallGraph } from '../../../lib/static-analysis/call-graph-builder.js';
import { checkReachability } from '../../../lib/static-analysis/reachability-checker.js';
import {
  EXCLUSION_PATTERNS,
  KNOWN_DYNAMIC_PATTERNS,
  isExcludedFromWireCheck
} from '../../../scripts/modules/handoff/executors/lead-final-approval/gates/wire-check-gate.js';

describe('EXCLUSION_PATTERNS (FR-1)', () => {
  it('matches canonical .test.ext patterns across js/mjs/cjs/jsx/tsx', () => {
    for (const ext of ['js', 'mjs', 'cjs', 'jsx', 'tsx']) {
      expect(isExcludedFromWireCheck(`scripts/x/bar.test.${ext}`)).toBe(true);
      expect(isExcludedFromWireCheck(`lib/something.spec.${ext}`)).toBe(true);
    }
  });

  it('matches __tests__/ and top-level tests/ directories', () => {
    expect(isExcludedFromWireCheck('scripts/__tests__/helper.js')).toBe(true);
    expect(isExcludedFromWireCheck('tests/unit/handoff/foo.js')).toBe(true);
  });

  // SD-MAN-INFRA-WIRE-CHECK-GATE-001: extend coverage to singular test/ and nested tests/
  it('matches top-level singular test/ directory (TS-3 canonical extension)', () => {
    expect(isExcludedFromWireCheck('test/unit/bias-detection.test.js')).toBe(true);
    expect(isExcludedFromWireCheck('test/eva/experiments/chairman-report.test.js')).toBe(true);
  });

  it('matches nested tests/ directories below lib/ or scripts/ (TS-5 nested coverage)', () => {
    expect(isExcludedFromWireCheck('scripts/archive/one-time/tests/test-aegis-adapters.js')).toBe(true);
    expect(isExcludedFromWireCheck('lib/feature/tests/util.js')).toBe(true);
  });

  it('matches nested singular test/ directories (TS-6 nested singular)', () => {
    expect(isExcludedFromWireCheck('scripts/module/test/helper.js')).toBe(true);
  });

  it('does NOT match production files with test-like substrings (TS-7 risk guard)', () => {
    // Production files named like `test-helpers.js` or `.test-fixtures.js` must NOT be excluded —
    // the PRD risk section explicitly forbids this over-match.
    expect(isExcludedFromWireCheck('scripts/x/test-helpers.js')).toBe(false);
    expect(isExcludedFromWireCheck('lib/testing/foo.js')).toBe(false);
    expect(isExcludedFromWireCheck('scripts/mytest.js')).toBe(false);
    // SD-MAN-INFRA-WIRE-CHECK-GATE-001 guardrails: directory name must be exactly
    // `test` or `tests` — close substrings must not trigger the extended pattern.
    expect(isExcludedFromWireCheck('scripts/integration-test-setup.js')).toBe(false);
    expect(isExcludedFromWireCheck('lib/tester/foo.js')).toBe(false);
  });

  it('exports EXCLUSION_PATTERNS as a regex list (per TR-2 declarative requirement)', () => {
    expect(Array.isArray(EXCLUSION_PATTERNS)).toBe(true);
    expect(EXCLUSION_PATTERNS.length).toBeGreaterThan(0);
    for (const pattern of EXCLUSION_PATTERNS) {
      expect(pattern).toBeInstanceOf(RegExp);
    }
  });

  // QF-20260511-960 / feedback 39219c66: cross-session false-positives on
  // scripts/one-off/ files committed locally by sibling sessions. By convention
  // every file in scripts/one-off/ has an underscore prefix and no permanent
  // entry point, so the directory is exempt from wire-check reachability.
  describe('scripts/one-off/ exclusion (QF-20260511-960)', () => {
    it('matches typical underscore-prefixed one-off scripts', () => {
      expect(isExcludedFromWireCheck('scripts/one-off/_check-205-foo.mjs')).toBe(true);
      expect(isExcludedFromWireCheck('scripts/one-off/_verify-qf-205-bar.cjs')).toBe(true);
      expect(isExcludedFromWireCheck('scripts/one-off/_apply-migration.mjs')).toBe(true);
      expect(isExcludedFromWireCheck('scripts/one-off/_amend-prd-sd-leo-feat.mjs')).toBe(true);
    });

    it('does NOT match other scripts/ paths', () => {
      expect(isExcludedFromWireCheck('scripts/handoff.js')).toBe(false);
      expect(isExcludedFromWireCheck('scripts/sd-next.js')).toBe(false);
      expect(isExcludedFromWireCheck('scripts/modules/foo.js')).toBe(false);
      // Lookalike directories that share the "one-off" substring must NOT match.
      expect(isExcludedFromWireCheck('scripts/one-offsite/foo.js')).toBe(false);
      expect(isExcludedFromWireCheck('lib/one-off/foo.js')).toBe(false);
    });
  });

  // QF-20260524-430 / feedback 9e61167f: the EVA stage-template tree is loaded only
  // via runtime dynamic import() + readdirSync, so static reachability cannot trace it.
  describe('KNOWN_DYNAMIC_PATTERNS — lib/eva/stage-templates dynamic-load tree (9e61167f)', () => {
    it('excludes stage templates and analysis-steps under lib/eva/stage-templates/', () => {
      expect(isExcludedFromWireCheck('lib/eva/stage-templates/stage-16.js')).toBe(true);
      expect(isExcludedFromWireCheck('lib/eva/stage-templates/analysis-steps/stage-16-positioning-brief.js')).toBe(true);
      expect(isExcludedFromWireCheck('lib/eva/stage-templates/index.js')).toBe(true);
    });

    it('does NOT over-match lookalike paths or other lib/eva files (boundary-safe)', () => {
      expect(isExcludedFromWireCheck('lib/eva/stage-templates-foo/x.js')).toBe(false);
      expect(isExcludedFromWireCheck('lib/eva/stage-registry.js')).toBe(false);
      expect(isExcludedFromWireCheck('lib/eva/stage-execution-worker.js')).toBe(false);
    });

    it('still checks ordinary new lib/ and scripts/ files (no loss of real coverage)', () => {
      expect(isExcludedFromWireCheck('lib/governance/resolve-feedback.js')).toBe(false);
      expect(isExcludedFromWireCheck('scripts/handoff.js')).toBe(false);
    });

    it('exports KNOWN_DYNAMIC_PATTERNS as a non-empty regex list', () => {
      expect(Array.isArray(KNOWN_DYNAMIC_PATTERNS)).toBe(true);
      expect(KNOWN_DYNAMIC_PATTERNS.length).toBeGreaterThan(0);
      for (const p of KNOWN_DYNAMIC_PATTERNS) expect(p).toBeInstanceOf(RegExp);
    });
  });
});

describe('call-graph-builder barrel re-export resolution (FR-2 AC-1)', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wire-check-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeFile(rel, contents) {
    const abs = path.join(tmpDir, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, contents, 'utf8');
    return abs.replace(/\\/g, '/');
  }

  it('resolves export * from re-exports transitively (barrel pattern)', () => {
    const entry = writeFile('entry.js', `import './index.js';\n`);
    const index = writeFile('index.js', `export * from './foo.js';\n`);
    const foo = writeFile('foo.js', `export const x = 1;\n`);
    const { graph } = buildCallGraph([entry, index, foo], tmpDir);
    const { reachable, unreachable } = checkReachability(graph, [entry], [foo]);
    expect(reachable.has(foo)).toBe(true);
    expect(unreachable.size).toBe(0);
  });

  it('resolves export { named } from re-exports', () => {
    const entry = writeFile('entry.js', `import './index.js';\n`);
    const index = writeFile('index.js', `export { bar } from './bar.js';\n`);
    const bar = writeFile('bar.js', `export const bar = 1;\n`);
    const { graph } = buildCallGraph([entry, index, bar], tmpDir);
    const { reachable } = checkReachability(graph, [entry], [bar]);
    expect(reachable.has(bar)).toBe(true);
  });
});

describe('call-graph-builder dynamic import resolution (FR-2 AC-3)', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wire-check-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeFile(rel, contents) {
    const abs = path.join(tmpDir, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, contents, 'utf8');
    return abs.replace(/\\/g, '/');
  }

  it('resolves string-literal dynamic import() as an edge', () => {
    const entry = writeFile('entry.js', `async function load() { await import('./handler.js'); }\nload();\n`);
    const handler = writeFile('handler.js', `export default () => 1;\n`);
    const { graph } = buildCallGraph([entry, handler], tmpDir);
    const { reachable } = checkReachability(graph, [entry], [handler]);
    expect(reachable.has(handler)).toBe(true);
  });

  it('emits a CAUTION warning for non-literal dynamic imports, does not crash', () => {
    const entry = writeFile('entry.js', `async function load(name) { await import(name); }\nload('x');\n`);
    const { warnings } = buildCallGraph([entry], tmpDir);
    expect(warnings.some(w => w.includes('non-literal dynamic import'))).toBe(true);
  });
});

describe('call-graph-builder negative control (FR-6 AC-3)', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wire-check-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeFile(rel, contents) {
    const abs = path.join(tmpDir, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, contents, 'utf8');
    return abs.replace(/\\/g, '/');
  }

  it('genuinely unreachable orphan file stays unreachable', () => {
    const entry = writeFile('entry.js', `console.log('hi');\n`);
    const orphan = writeFile('orphan.js', `export const x = 1;\n`);
    const { graph } = buildCallGraph([entry, orphan], tmpDir);
    const { reachable, unreachable } = checkReachability(graph, [entry], [orphan]);
    expect(reachable.has(orphan)).toBe(false);
    expect(unreachable.has(orphan)).toBe(true);
  });
});
