/**
 * Characterization tests for lib/static-analysis primitives.
 * SD-LEO-INFRA-OUTBOUND-SINK-CONFORMANCE-001 (FR-2, TS-4).
 *
 * WHY THIS FILE EXISTS: buildCallGraph / checkReachability / resolveModulePath had
 * ZERO direct test coverage, yet two LIVE merge-blocking gates depend on them —
 * scripts/modules/handoff/executors/exec-to-plan/gates/wire-check-advisory.js and
 * .../lead-final-approval/gates/wire-check-gate.js. Both call them STRICTLY
 * POSITIONALLY and both read `warnings.length` into their returned payload. So
 * before extending the primitives we pin present-day behavior, including the exact
 * warning strings and the function arities. Any future extension that changes
 * default behavior breaks these tests loudly instead of silently loosening a gate.
 *
 * DETERMINISM (TR-5): CI is ubuntu-latest, development is win32. Every assertion
 * is on SORTED repo-relative POSIX paths — never absolute paths (Windows
 * drive-letter casing varies with cwd) and never Set identity (readdirSync order
 * is not filesystem-guaranteed).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildCallGraph } from '../../../lib/static-analysis/call-graph-builder.js';
import { checkReachability } from '../../../lib/static-analysis/reachability-checker.js';
import { resolveModulePath } from '../../../lib/static-analysis/module-resolver.js';

/** Normalize an absolute path to a sorted-comparable POSIX path relative to the fixture root. */
function rel(root, abs) {
  return path.relative(root, abs).replace(/\\/g, '/');
}

/** Serialize a graph deterministically: sorted keys, sorted edge arrays, relative POSIX paths. */
function serializeGraph(root, graph) {
  const out = {};
  for (const [file, edges] of graph) {
    out[rel(root, file)] = [...edges].map((e) => rel(root, e)).sort();
  }
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
}

let ROOT;
const FILES = {};

beforeAll(() => {
  ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'cgb-char-'));
  const w = (relPath, src) => {
    const abs = path.join(ROOT, relPath);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, src, 'utf8');
    FILES[relPath] = abs.replace(/\\/g, '/');
    return FILES[relPath];
  };

  // Static ESM import + a bare npm specifier (bare must NOT become an edge).
  w('entry.js', "import './barrel.js';\nimport 'acorn';\nimport './leaf-a.js';\n");
  // Barrel re-export forms: export * from and export { x } from.
  w('barrel.js', "export * from './leaf-b.js';\nexport { thing } from './leaf-c.js';\n");
  w('leaf-a.js', 'export const a = 1;\n');
  w('leaf-b.js', 'export const b = 2;\n');
  w('leaf-c.js', 'export const thing = 3;\n');
  // CJS require with a string literal.
  w('cjs-consumer.cjs', "const x = require('./leaf-a.js');\nmodule.exports = x;\n");
  // Literal dynamic import() — resolves to a real edge.
  w('dyn-literal.js', "export async function go() { return import('./leaf-b.js'); }\n");
  // NON-literal dynamic import() — must produce a CAUTION warning and NO edge.
  w('dyn-variable.js', 'export async function go(spec) { return import(spec); }\n');
  // Unparseable source — must produce a Parse error warning.
  w('broken.js', 'export const = ;;;\n');
  // Directory import resolving through index.js.
  w('pkg/index.js', 'export const p = 4;\n');
  w('dir-import.js', "import './pkg';\n");
});

afterAll(() => {
  if (ROOT) fs.rmSync(ROOT, { recursive: true, force: true });
});

describe('buildCallGraph — characterization of present-day behavior', () => {
  it('pins the resolved edge set as a golden sorted snapshot', () => {
    const inputs = [
      FILES['entry.js'], FILES['barrel.js'], FILES['leaf-a.js'], FILES['leaf-b.js'],
      FILES['leaf-c.js'], FILES['cjs-consumer.cjs'], FILES['dyn-literal.js'],
      FILES['dir-import.js'], FILES['pkg/index.js'],
    ];
    const { graph } = buildCallGraph(inputs, ROOT);

    expect(serializeGraph(ROOT, graph)).toEqual({
      'barrel.js': ['leaf-b.js', 'leaf-c.js'],
      'cjs-consumer.cjs': ['leaf-a.js'],
      'dir-import.js': ['pkg/index.js'],
      'dyn-literal.js': ['leaf-b.js'],
      'entry.js': ['barrel.js', 'leaf-a.js'],
      'leaf-a.js': [],
      'leaf-b.js': [],
      'leaf-c.js': [],
      'pkg/index.js': [],
    });
  });

  it('resolves a LITERAL dynamic import to an edge and emits no warning', () => {
    const { graph, warnings } = buildCallGraph([FILES['dyn-literal.js']], ROOT);
    expect([...graph.get(FILES['dyn-literal.js'])].map((e) => rel(ROOT, e))).toEqual(['leaf-b.js']);
    expect(warnings).toEqual([]);
  });

  it('emits the exact CAUTION warning for a NON-literal dynamic import and adds no edge', () => {
    const { graph, warnings } = buildCallGraph([FILES['dyn-variable.js']], ROOT);
    expect([...graph.get(FILES['dyn-variable.js'])]).toEqual([]);
    // Both live consumers read warnings.length, so pin count AND text.
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toBe(
      `${FILES['dyn-variable.js']}: non-literal dynamic import() detected — reachability may be incomplete (CAUTION)`,
    );
  });

  it('emits a Parse error warning for unparseable source, still registering an empty edge set', () => {
    const { graph, warnings } = buildCallGraph([FILES['broken.js']], ROOT);
    expect(graph.has(FILES['broken.js'])).toBe(true);
    expect([...graph.get(FILES['broken.js'])]).toEqual([]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/^Parse error in .*broken\.js: /);
  });

  it('emits a Could-not-read warning for a missing path, still registering an empty edge set', () => {
    const missing = path.join(ROOT, 'does-not-exist.js').replace(/\\/g, '/');
    const { graph, warnings } = buildCallGraph([missing], ROOT);
    expect(graph.has(missing)).toBe(true);
    expect([...graph.get(missing)]).toEqual([]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/^Could not read .*does-not-exist\.js: /);
  });

  it('does not create edges for bare npm specifiers', () => {
    const { graph } = buildCallGraph([FILES['entry.js']], ROOT);
    const edges = [...graph.get(FILES['entry.js'])].map((e) => rel(ROOT, e)).sort();
    expect(edges).toEqual(['barrel.js', 'leaf-a.js']);
    expect(edges.some((e) => e.includes('acorn'))).toBe(false);
  });

  it('pins arity — the live gates call these strictly positionally', () => {
    // Guards against a future extension turning a positional param into an options bag.
    expect(buildCallGraph.length).toBe(2);
    expect(checkReachability.length).toBe(3);
    expect(resolveModulePath.length).toBe(3);
  });
});

describe('checkReachability — characterization of present-day behavior', () => {
  it('partitions targets into reachable and unreachable via BFS from entry points', () => {
    const inputs = [
      FILES['entry.js'], FILES['barrel.js'], FILES['leaf-a.js'],
      FILES['leaf-b.js'], FILES['leaf-c.js'], FILES['dyn-literal.js'],
    ];
    const { graph } = buildCallGraph(inputs, ROOT);
    const { reachable, unreachable } = checkReachability(
      graph,
      [FILES['entry.js']],
      [FILES['leaf-b.js'], FILES['leaf-c.js'], FILES['dyn-literal.js']],
    );

    // Sorted arrays, never Set identity (TR-5).
    expect([...reachable].map((p) => rel(ROOT, p)).sort()).toEqual(['leaf-b.js', 'leaf-c.js']);
    expect([...unreachable].map((p) => rel(ROOT, p)).sort()).toEqual(['dyn-literal.js']);
  });

  it('terminates on a cycle rather than looping forever', () => {
    const cycleRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cgb-cycle-'));
    try {
      const a = path.join(cycleRoot, 'a.js');
      const b = path.join(cycleRoot, 'b.js');
      fs.writeFileSync(a, "import './b.js';\n", 'utf8');
      fs.writeFileSync(b, "import './a.js';\n", 'utf8');
      const { graph } = buildCallGraph([a.replace(/\\/g, '/'), b.replace(/\\/g, '/')], cycleRoot);
      const { reachable } = checkReachability(graph, [a.replace(/\\/g, '/')], [b.replace(/\\/g, '/')]);
      expect([...reachable].map((p) => rel(cycleRoot, p))).toEqual(['b.js']);
    } finally {
      fs.rmSync(cycleRoot, { recursive: true, force: true });
    }
  });

  it('reports a target as unreachable when no entry point leads to it', () => {
    const { graph } = buildCallGraph([FILES['leaf-a.js'], FILES['leaf-b.js']], ROOT);
    const { reachable, unreachable } = checkReachability(graph, [FILES['leaf-a.js']], [FILES['leaf-b.js']]);
    expect([...reachable]).toEqual([]);
    expect([...unreachable].map((p) => rel(ROOT, p))).toEqual(['leaf-b.js']);
  });
});

describe('resolveModulePath — characterization of present-day behavior', () => {
  it('returns null for bare npm specifiers', () => {
    expect(resolveModulePath('acorn', FILES['entry.js'], ROOT)).toBeNull();
  });

  it('returns null for a file:// URL specifier — the pathToFileURL idiom is unresolved today', () => {
    // Pinned deliberately: FR-2 extension (c) changes THIS, and only behind an opt-in flag.
    const url = `file:///${FILES['leaf-a.js']}`;
    expect(resolveModulePath(url, FILES['entry.js'], ROOT)).toBeNull();
  });

  it('resolves a relative specifier lacking an extension', () => {
    const resolved = resolveModulePath('./leaf-a', FILES['entry.js'], ROOT);
    expect(rel(ROOT, resolved)).toBe('leaf-a.js');
  });

  it('resolves a directory specifier through its index file', () => {
    const resolved = resolveModulePath('./pkg', FILES['dir-import.js'], ROOT);
    expect(rel(ROOT, resolved)).toBe('pkg/index.js');
  });

  it('returns null when nothing matches', () => {
    expect(resolveModulePath('./nope', FILES['entry.js'], ROOT)).toBeNull();
  });
});
