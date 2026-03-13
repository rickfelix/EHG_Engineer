import { describe, it, expect, vi, beforeEach } from 'vitest';
import { join } from 'path';
import { parse } from 'acorn';

// Mock fs/promises
vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
  readdir: vi.fn(),
  stat: vi.fn()
}));

import { readFile, readdir } from 'fs/promises';
import {
  scan,
  analyzeFile,
  computeCompositeScore,
  calculateCyclomaticComplexity,
  countFunctions,
  METRIC_WEIGHTS,
  COMPLEXITY_CEILING,
  LOC_CEILING,
  DENSITY_CEILING
} from '../../../scripts/eva/health-dimensions/complexity-scorer.mjs';

// Helper: parse code to AST
function parseCode(code) {
  return parse(code, {
    ecmaVersion: 'latest',
    sourceType: 'module',
    allowReturnOutsideFunction: true
  });
}

describe('complexity-scorer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('calculateCyclomaticComplexity', () => {
    it('returns 1 for empty function (base path)', () => {
      const ast = parseCode('function empty() {}');
      expect(calculateCyclomaticComplexity(ast)).toBe(1);
    });

    it('counts if statements', () => {
      const ast = parseCode('function f(x) { if (x) { return 1; } return 0; }');
      // base(1) + if(1) = 2
      expect(calculateCyclomaticComplexity(ast)).toBe(2);
    });

    it('counts nested if statements', () => {
      const ast = parseCode('function f(x, y) { if (x) { if (y) { return 1; } } return 0; }');
      // base(1) + if(1) + if(1) = 3
      expect(calculateCyclomaticComplexity(ast)).toBe(3);
    });

    it('counts logical operators && and ||', () => {
      const ast = parseCode('function f(a, b, c) { if (a && b || c) { return 1; } }');
      // base(1) + if(1) + &&(1) + ||(1) = 4
      expect(calculateCyclomaticComplexity(ast)).toBe(4);
    });

    it('counts for/while/do-while loops', () => {
      const ast = parseCode(`
        function f(arr) {
          for (let i = 0; i < arr.length; i++) {}
          while (true) { break; }
          do {} while (false);
        }
      `);
      // base(1) + for(1) + while(1) + do-while(1) = 4
      expect(calculateCyclomaticComplexity(ast)).toBe(4);
    });

    it('counts switch cases (excluding default)', () => {
      const ast = parseCode(`
        function f(x) {
          switch(x) {
            case 1: return 'a';
            case 2: return 'b';
            default: return 'c';
          }
        }
      `);
      // base(1) + case(1) + case(1) = 3 (default not counted)
      expect(calculateCyclomaticComplexity(ast)).toBe(3);
    });

    it('counts ternary expressions', () => {
      const ast = parseCode('const x = true ? 1 : 0;');
      // base(1) + ternary(1) = 2
      expect(calculateCyclomaticComplexity(ast)).toBe(2);
    });

    it('counts catch clauses', () => {
      const ast = parseCode('try { throw 1; } catch(e) { console.log(e); }');
      // base(1) + catch(1) = 2
      expect(calculateCyclomaticComplexity(ast)).toBe(2);
    });

    it('counts nullish coalescing ??', () => {
      const ast = parseCode('const x = a ?? b;');
      // base(1) + ??(1) = 2
      expect(calculateCyclomaticComplexity(ast)).toBe(2);
    });

    it('handles complex real-world function', () => {
      const ast = parseCode(`
        function process(items) {
          if (!items) return null;
          for (const item of items) {
            if (item.type === 'a' || item.type === 'b') {
              try {
                item.process();
              } catch (e) {
                if (e.retry) continue;
              }
            }
          }
        }
      `);
      // base(1) + if(1) + for-of(1) + if(1) + ||(1) + catch(1) + if(1) = 7
      expect(calculateCyclomaticComplexity(ast)).toBe(7);
    });
  });

  describe('countFunctions', () => {
    it('counts function declarations', () => {
      const ast = parseCode('function a() {} function b() {}');
      expect(countFunctions(ast)).toBe(2);
    });

    it('counts arrow functions', () => {
      const ast = parseCode('const a = () => {}; const b = x => x;');
      expect(countFunctions(ast)).toBe(2);
    });

    it('counts function expressions', () => {
      const ast = parseCode('const a = function() {}; const b = function named() {};');
      expect(countFunctions(ast)).toBe(2);
    });

    it('counts nested functions', () => {
      const ast = parseCode('function outer() { function inner() { return () => {}; } }');
      // outer + inner + arrow = 3
      expect(countFunctions(ast)).toBe(3);
    });

    it('returns 0 for code with no functions', () => {
      const ast = parseCode('const x = 1; const y = 2;');
      expect(countFunctions(ast)).toBe(0);
    });
  });

  describe('computeCompositeScore', () => {
    it('returns 100 for minimal complexity', () => {
      const score = computeCompositeScore({ cyclomatic: 0, loc: 0, function_count: 0 });
      expect(score).toBe(100);
    });

    it('returns 0 for maximum complexity', () => {
      const score = computeCompositeScore({
        cyclomatic: COMPLEXITY_CEILING,
        loc: LOC_CEILING,
        function_count: LOC_CEILING * DENSITY_CEILING
      });
      expect(score).toBe(0);
    });

    it('returns intermediate score for moderate complexity', () => {
      const score = computeCompositeScore({
        cyclomatic: COMPLEXITY_CEILING / 2,
        loc: LOC_CEILING / 2,
        function_count: 10
      });
      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThan(100);
    });

    it('weights are correct (sum to 1.0)', () => {
      const sum = Object.values(METRIC_WEIGHTS).reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(1.0);
    });

    it('cyclomatic has highest weight', () => {
      expect(METRIC_WEIGHTS.cyclomatic).toBeGreaterThan(METRIC_WEIGHTS.loc);
      expect(METRIC_WEIGHTS.cyclomatic).toBeGreaterThan(METRIC_WEIGHTS.function_density);
    });

    it('caps scores at 0 (no negative)', () => {
      const score = computeCompositeScore({
        cyclomatic: COMPLEXITY_CEILING * 5,
        loc: LOC_CEILING * 5,
        function_count: 9999
      });
      expect(score).toBe(0);
    });
  });

  describe('analyzeFile', () => {
    it('analyzes a simple JS file', async () => {
      readFile.mockResolvedValue('function hello() { if (true) { return 1; } return 0; }');

      const result = await analyzeFile('/fake/file.js');
      expect(result).not.toBeNull();
      expect(result.cyclomatic).toBe(2); // base + if
      expect(result.function_count).toBe(1);
      expect(result.loc).toBeGreaterThan(0);
    });

    it('returns null for unparseable files', async () => {
      readFile.mockResolvedValue('this is not valid javascript {{{}}}}');

      const result = await analyzeFile('/fake/bad.js');
      expect(result).toBeNull();
    });

    it('handles ESM modules', async () => {
      readFile.mockResolvedValue(`
        import { readFile } from 'fs/promises';
        export async function load() { return await readFile('test'); }
      `);

      const result = await analyzeFile('/fake/module.mjs');
      expect(result).not.toBeNull();
      expect(result.function_count).toBe(1);
    });

    it('handles CJS modules', async () => {
      readFile.mockResolvedValue(`
        const fs = require('fs');
        module.exports = function() { return fs.readFileSync('test'); };
      `);

      const result = await analyzeFile('/fake/module.cjs');
      expect(result).not.toBeNull();
      expect(result.function_count).toBe(1);
    });

    it('excludes comment-only lines from LOC', async () => {
      readFile.mockResolvedValue([
        '// This is a comment',
        'const x = 1;',
        '// Another comment',
        'const y = 2;',
        ''
      ].join('\n'));

      const result = await analyzeFile('/fake/file.js');
      expect(result.loc).toBe(2); // Only non-comment, non-empty lines
    });

    it('returns null for read errors', async () => {
      readFile.mockRejectedValue(new Error('ENOENT'));

      const result = await analyzeFile('/fake/missing.js');
      expect(result).toBeNull();
    });
  });

  describe('scan', () => {
    it('returns score 100 when no files found', async () => {
      readdir.mockRejectedValue({ code: 'ENOENT' });

      const result = await scan('/fake/root');
      expect(result.score).toBe(100);
      expect(result.finding_count).toBe(0);
    });

    it('scans files and computes scores', async () => {
      // Mock readdir to return a simple file listing
      readdir.mockImplementation(async (dir, opts) => {
        if (dir.endsWith('lib')) {
          return [{ name: 'utils.js', isDirectory: () => false }];
        }
        throw { code: 'ENOENT' };
      });

      readFile.mockResolvedValue('function f(x) { if (x > 0) { return x; } return 0; }');

      const result = await scan('/fake/root', { config: {} });
      expect(result.score).toBeGreaterThan(0);
      expect(result.score).toBeLessThanOrEqual(100);
      expect(result.metadata.modules_scanned).toBe(1);
    });

    it('detects threshold breaches', async () => {
      // Create a complex file that will breach threshold
      const complexCode = `
        function complex(a, b, c, d, e) {
          ${Array(30).fill('if (a) { b++; }').join('\n')}
          for (let i = 0; i < 10; i++) {
            while (c) {
              if (d && e || a) {
                try { b(); } catch(err) { if (err.retry) continue; }
              }
            }
          }
        }
      `;

      readdir.mockImplementation(async (dir, opts) => {
        if (dir.endsWith('lib')) {
          return [{ name: 'complex.js', isDirectory: () => false }];
        }
        throw { code: 'ENOENT' };
      });

      readFile.mockResolvedValue(complexCode);

      const result = await scan('/fake/root', {
        config: { threshold_critical: 80, threshold_warning: 90 }
      });

      const breaches = result.findings.filter(f => f.strategy === 'threshold_breach');
      expect(breaches.length).toBeGreaterThanOrEqual(1);
    });

    it('includes hotspots in metadata', async () => {
      readdir.mockImplementation(async (dir, opts) => {
        if (dir.endsWith('lib')) {
          return [
            { name: 'a.js', isDirectory: () => false },
            { name: 'b.js', isDirectory: () => false }
          ];
        }
        throw { code: 'ENOENT' };
      });

      readFile.mockResolvedValue('function f() { return 1; }');

      const result = await scan('/fake/root', { config: { hotspot_count: 5 } });
      expect(result.metadata.hotspots).toBeDefined();
      expect(result.metadata.hotspots.length).toBeLessThanOrEqual(5);
    });

    it('tracks parse errors in metadata', async () => {
      readdir.mockImplementation(async (dir, opts) => {
        if (dir.endsWith('lib')) {
          return [{ name: 'bad.js', isDirectory: () => false }];
        }
        throw { code: 'ENOENT' };
      });

      readFile.mockResolvedValue('this is {{{{ not valid }}}} javascript');

      const result = await scan('/fake/root', { config: {} });
      expect(result.metadata.parse_errors).toBeGreaterThanOrEqual(1);
    });
  });
});
