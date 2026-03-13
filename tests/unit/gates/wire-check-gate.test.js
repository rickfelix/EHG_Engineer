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
    expect(gate.required).toBe(false);
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
