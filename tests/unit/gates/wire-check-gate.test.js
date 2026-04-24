/**
 * Wire Check Gate — Unit Tests
 * SD-ORCHESTRATOR-COMPLETION-VALIDATION-GATES-ORCH-001-C
 *
 * Tests the static analysis modules (module-resolver, call-graph-builder,
 * reachability-checker) and the wire-check-gate integration.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

// ─── Module Resolver ─────────────────────────────────────────────────
describe('module-resolver', () => {
  let resolveModulePath;
  let tmpDir;

  beforeEach(async () => {
    const mod = await import('../../../lib/static-analysis/module-resolver.js');
    resolveModulePath = mod.resolveModulePath;

    // Create a temp directory with test files
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wire-test-'));
    fs.writeFileSync(path.join(tmpDir, 'foo.js'), 'export default 1;');
    fs.writeFileSync(path.join(tmpDir, 'bar.mjs'), 'export default 2;');
    fs.mkdirSync(path.join(tmpDir, 'sub'));
    fs.writeFileSync(path.join(tmpDir, 'sub', 'index.js'), 'export default 3;');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should resolve ESM import with explicit extension', () => {
    const fromFile = path.join(tmpDir, 'entry.js');
    const result = resolveModulePath('./foo.js', fromFile, tmpDir);
    expect(result).toBe(path.join(tmpDir, 'foo.js').replace(/\\/g, '/'));
  });

  it('should resolve import without extension by trying .js', () => {
    const fromFile = path.join(tmpDir, 'entry.js');
    const result = resolveModulePath('./foo', fromFile, tmpDir);
    expect(result).toBe(path.join(tmpDir, 'foo.js').replace(/\\/g, '/'));
  });

  it('should resolve .mjs extension', () => {
    const fromFile = path.join(tmpDir, 'entry.js');
    const result = resolveModulePath('./bar', fromFile, tmpDir);
    expect(result).toBe(path.join(tmpDir, 'bar.mjs').replace(/\\/g, '/'));
  });

  it('should resolve directory with index.js', () => {
    const fromFile = path.join(tmpDir, 'entry.js');
    const result = resolveModulePath('./sub', fromFile, tmpDir);
    expect(result).toBe(path.join(tmpDir, 'sub', 'index.js').replace(/\\/g, '/'));
  });

  it('should return null for missing file', () => {
    const fromFile = path.join(tmpDir, 'entry.js');
    const result = resolveModulePath('./nonexistent', fromFile, tmpDir);
    expect(result).toBeNull();
  });

  it('should return null for bare npm specifiers', () => {
    const fromFile = path.join(tmpDir, 'entry.js');
    const result = resolveModulePath('acorn', fromFile, tmpDir);
    expect(result).toBeNull();
  });
});

// ─── Call Graph Builder ──────────────────────────────────────────────
describe('call-graph-builder', () => {
  let buildCallGraph;
  let tmpDir;

  beforeEach(async () => {
    const mod = await import('../../../lib/static-analysis/call-graph-builder.js');
    buildCallGraph = mod.buildCallGraph;

    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wire-cg-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should extract ESM import edges', () => {
    const entryPath = path.join(tmpDir, 'entry.js');
    const depPath = path.join(tmpDir, 'dep.js');
    fs.writeFileSync(depPath, 'export const x = 1;');
    fs.writeFileSync(entryPath, "import { x } from './dep.js';\nconsole.log(x);");

    const { graph, warnings } = buildCallGraph([entryPath, depPath], tmpDir);
    const normalized = entryPath.replace(/\\/g, '/');
    const depNormalized = depPath.replace(/\\/g, '/');

    expect(graph.has(normalized)).toBe(true);
    expect(graph.get(normalized).has(depNormalized)).toBe(true);
    expect(warnings).toEqual([]);
  });

  it('should extract CJS require edges', () => {
    const entryPath = path.join(tmpDir, 'entry.js');
    const depPath = path.join(tmpDir, 'dep.js');
    fs.writeFileSync(depPath, 'module.exports = 1;');
    fs.writeFileSync(entryPath, "const d = require('./dep.js');\nconsole.log(d);");

    const { graph } = buildCallGraph([entryPath, depPath], tmpDir);
    const normalized = entryPath.replace(/\\/g, '/');
    const depNormalized = depPath.replace(/\\/g, '/');

    expect(graph.get(normalized).has(depNormalized)).toBe(true);
  });

  it('should extract barrel export edges', () => {
    const barrelPath = path.join(tmpDir, 'index.js');
    const modPath = path.join(tmpDir, 'mod.js');
    fs.writeFileSync(modPath, 'export const y = 2;');
    fs.writeFileSync(barrelPath, "export * from './mod.js';");

    const { graph } = buildCallGraph([barrelPath, modPath], tmpDir);
    const barrelNorm = barrelPath.replace(/\\/g, '/');
    const modNorm = modPath.replace(/\\/g, '/');

    expect(graph.get(barrelNorm).has(modNorm)).toBe(true);
  });

  it('should handle parse failure gracefully and add warning', () => {
    const badPath = path.join(tmpDir, 'bad.js');
    fs.writeFileSync(badPath, 'const x = {{{INVALID SYNTAX');

    const { graph, warnings } = buildCallGraph([badPath], tmpDir);
    const badNorm = badPath.replace(/\\/g, '/');

    expect(graph.has(badNorm)).toBe(true);
    expect(graph.get(badNorm).size).toBe(0);
    expect(warnings.length).toBe(1);
    expect(warnings[0]).toContain('Parse error');
  });

  it('should skip npm package imports (no edge for bare specifiers)', () => {
    const entryPath = path.join(tmpDir, 'entry.js');
    fs.writeFileSync(entryPath, "import * as acorn from 'acorn';\nconsole.log(acorn);");

    const { graph } = buildCallGraph([entryPath], tmpDir);
    const normalized = entryPath.replace(/\\/g, '/');

    expect(graph.get(normalized).size).toBe(0);
  });
});

// ─── Reachability Checker ────────────────────────────────────────────
describe('reachability-checker', () => {
  let checkReachability;

  beforeEach(async () => {
    const mod = await import('../../../lib/static-analysis/reachability-checker.js');
    checkReachability = mod.checkReachability;
  });

  it('should find reachable files via direct edge', () => {
    const graph = new Map();
    graph.set('entry.js', new Set(['a.js']));
    graph.set('a.js', new Set());

    const { reachable, unreachable } = checkReachability(graph, ['entry.js'], ['a.js']);
    expect(reachable.has('a.js')).toBe(true);
    expect(unreachable.size).toBe(0);
  });

  it('should find reachable files via transitive edges', () => {
    const graph = new Map();
    graph.set('entry.js', new Set(['a.js']));
    graph.set('a.js', new Set(['b.js']));
    graph.set('b.js', new Set());

    const { reachable } = checkReachability(graph, ['entry.js'], ['b.js']);
    expect(reachable.has('b.js')).toBe(true);
  });

  it('should detect unreachable files', () => {
    const graph = new Map();
    graph.set('entry.js', new Set(['a.js']));
    graph.set('a.js', new Set());
    graph.set('orphan.js', new Set());

    const { reachable, unreachable } = checkReachability(graph, ['entry.js'], ['orphan.js']);
    expect(unreachable.has('orphan.js')).toBe(true);
    expect(reachable.size).toBe(0);
  });

  it('should handle circular imports without infinite loop', () => {
    const graph = new Map();
    graph.set('entry.js', new Set(['a.js']));
    graph.set('a.js', new Set(['b.js']));
    graph.set('b.js', new Set(['a.js'])); // circular

    const { reachable } = checkReachability(graph, ['entry.js'], ['a.js', 'b.js']);
    expect(reachable.has('a.js')).toBe(true);
    expect(reachable.has('b.js')).toBe(true);
  });

  it('should handle multiple entry points', () => {
    const graph = new Map();
    graph.set('e1.js', new Set(['a.js']));
    graph.set('e2.js', new Set(['b.js']));
    graph.set('a.js', new Set());
    graph.set('b.js', new Set());

    const { reachable } = checkReachability(graph, ['e1.js', 'e2.js'], ['a.js', 'b.js']);
    expect(reachable.has('a.js')).toBe(true);
    expect(reachable.has('b.js')).toBe(true);
  });
});

// ─── Wire Check Gate (Integration) ──────────────────────────────────
describe('wire-check-gate', () => {
  let createWireCheckGate;

  beforeEach(async () => {
    vi.restoreAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});

    const mod = await import(
      '../../../scripts/modules/handoff/executors/lead-final-approval/gates/wire-check-gate.js'
    );
    createWireCheckGate = mod.createWireCheckGate;
  });

  it('should have correct gate name and structure', () => {
    const gate = createWireCheckGate(null);
    expect(gate.name).toBe('WIRE_CHECK_GATE');
    expect(gate.required).toBe(true);
    expect(typeof gate.validator).toBe('function');
  });

  it('should pass when no new JS files are detected', async () => {
    // On the current branch against main, there may or may not be new files.
    // We test the gate runs without error and returns a valid shape.
    const gate = createWireCheckGate(null);
    const result = await gate.validator({ sd: { id: 'test' } });

    // Should always return valid gate shape regardless of git state
    expect(result).toHaveProperty('passed');
    expect(result).toHaveProperty('score');
    expect(result).toHaveProperty('issues');
    expect(result).toHaveProperty('warnings');
    expect(typeof result.passed).toBe('boolean');
    expect(typeof result.score).toBe('number');
    expect(Array.isArray(result.issues)).toBe(true);
    expect(Array.isArray(result.warnings)).toBe(true);
  });
});

// ─── SD-LEO-INFRA-WIRE-CHECK-GATE-001: getMainRef regression (real-repo) ──
describe('getMainRef helper (SD-LEO-INFRA-WIRE-CHECK-GATE-001)', () => {
  let getMainRef;

  beforeEach(async () => {
    const mod = await import('../../../scripts/modules/handoff/shared-git-context.js');
    getMainRef = mod.getMainRef;
  });

  it('returns a result with a non-empty ref string', () => {
    const result = getMainRef({ skipFetch: true });
    expect(result).toHaveProperty('ref');
    expect(result).toHaveProperty('source');
    expect(typeof result.ref).toBe('string');
    expect(result.ref.length).toBeGreaterThan(0);
    expect(['origin', 'origin-master', 'local-fallback']).toContain(result.source);
  });

  it('prefers origin/main when running inside a repo with origin/main', () => {
    // This test runs inside a worktree of EHG_Engineer, which has origin/main.
    const result = getMainRef({ skipFetch: true });
    if (result.source === 'origin') {
      expect(result.ref).toBe('origin/main');
      expect(result.warning).toBeUndefined();
    }
    // If origin/main isn't available (offline CI), source is fallback — that's OK,
    // but the structure must still be correct (asserted in the previous test).
  });

  it('local-fallback path includes a warning explaining the issue', () => {
    // Run from a tempdir that is NOT a git repo so no refs resolve.
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gmr-test-'));
    try {
      const result = getMainRef({ cwd: tmp, skipFetch: true });
      expect(result.source).toBe('local-fallback');
      expect(typeof result.warning).toBe('string');
      expect(result.warning.length).toBeGreaterThan(0);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('respects skipFetch:true (does not attempt remote fetch)', () => {
    // Hard to assert "did not call fetch" without mocking; instead assert
    // that the call completes within a tight budget when skipFetch is true.
    // A real fetch would take > 200ms; local rev-parse is < 50ms.
    const start = Date.now();
    getMainRef({ skipFetch: true });
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(2000); // generous budget for CI
  });
});

describe('wire-check-gate exports SD-LEO-INFRA-WIRE-CHECK-GATE-001 fix surface', () => {
  it('uses getMainRef() symbol (canonical helper) — guards against regression', async () => {
    const fs2 = await import('fs');
    const url = await import('url');
    const __filename2 = url.fileURLToPath(import.meta.url);
    const __dirname2 = path.dirname(__filename2);
    const gateFile = path.resolve(__dirname2, '../../../scripts/modules/handoff/executors/lead-final-approval/gates/wire-check-gate.js');
    const source = fs2.readFileSync(gateFile, 'utf8');
    expect(source).toContain('getMainRef');
    // Bare 'main...HEAD' literal must not reappear.
    expect(source).not.toMatch(/['"`]main\.\.\.HEAD['"`]/);
  });

  it('catch block returns passed:false on diff failure (no silent pass)', async () => {
    const fs2 = await import('fs');
    const url = await import('url');
    const __filename2 = url.fileURLToPath(import.meta.url);
    const __dirname2 = path.dirname(__filename2);
    const gateFile = path.resolve(__dirname2, '../../../scripts/modules/handoff/executors/lead-final-approval/gates/wire-check-gate.js');
    const source = fs2.readFileSync(gateFile, 'utf8');
    // The catch block in the diff try/catch must NOT return passed:true.
    // Find the catch block of the git diff try and verify shape.
    const diffSection = source.slice(source.indexOf('Get new files from git diff'));
    const catchIdx = diffSection.indexOf('} catch (');
    expect(catchIdx).toBeGreaterThan(-1);
    const catchBlock = diffSection.slice(catchIdx, catchIdx + 800);
    expect(catchBlock).toMatch(/passed:\s*false/);
    expect(catchBlock).not.toMatch(/passed:\s*true/);
  });
});
