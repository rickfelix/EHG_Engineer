/**
 * SD-LEO-INFRA-MINUS-DISPOSITION-RAILS-001 FR-6.
 * Repo-wide census (dynamic-import-aware) confirming zero NEW production call sites for
 * lib/error-triggered-sub-agent-invoker.js — DESIGN-only status.
 */
import { describe, it, expect } from 'vitest';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  parseGrepOutput,
  classifyMatches,
  isTestFilePath,
  censusInvokerReferences
} from '../../lib/rca/invoker-production-census.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');

describe('isTestFilePath', () => {
  it('recognizes tests/ directory paths', () => {
    expect(isTestFilePath('tests/integration/error-triggered-invocation.integration.test.js')).toBe(true);
  });

  it('recognizes .test.js / .spec.js suffix even outside tests/', () => {
    expect(isTestFilePath('lib/foo.test.js')).toBe(true);
    expect(isTestFilePath('lib/foo.spec.ts')).toBe(true);
  });

  it('does not flag a normal production path', () => {
    expect(isTestFilePath('lib/rca/rca-orchestrator.js')).toBe(false);
  });
});

describe('parseGrepOutput / classifyMatches', () => {
  it('parses static import statements as import-like', () => {
    const output = "lib/handoff/preflight-auto-invoke.js:10:import { x } from '../error-triggered-sub-agent-invoker.js';\n";
    const matches = parseGrepOutput(output);
    expect(matches).toHaveLength(1);
    expect(matches[0].file).toBe('lib/handoff/preflight-auto-invoke.js');
  });

  it('parses dynamic import() as import-like (the pre-existing pin is blind to this)', () => {
    const output = "scripts/new-caller.js:42:const mod = await import('../lib/error-triggered-sub-agent-invoker.js');\n";
    const matches = parseGrepOutput(output);
    expect(matches).toHaveLength(1);
    expect(matches[0].file).toBe('scripts/new-caller.js');
  });

  it('parses require() as import-like', () => {
    const output = "scripts/legacy.cjs:7:const invoker = require('../lib/error-triggered-sub-agent-invoker.js');\n";
    const matches = parseGrepOutput(output);
    expect(matches).toHaveLength(1);
  });

  it('does NOT count a bare doc-comment mention as import-like', () => {
    const output = 'docs/reference/something.md:3:See lib/error-triggered-sub-agent-invoker.js for the breaker config.\n';
    const matches = parseGrepOutput(output);
    expect(matches).toHaveLength(0);
  });

  it('classifies a test-file match separately from a production match', () => {
    const matches = [
      { file: 'tests/integration/error-triggered-invocation.integration.test.js', line: 1, content: '' },
      { file: 'lib/some-production-caller.js', line: 1, content: '' }
    ];
    const { productionMatches, testMatches } = classifyMatches(matches);
    expect(testMatches).toHaveLength(1);
    expect(productionMatches).toHaveLength(1);
    expect(productionMatches[0].file).toBe('lib/some-production-caller.js');
  });
});

describe('censusInvokerReferences — injectable exec (unit, no real git call)', () => {
  it('returns empty result on git-grep "no matches" (exit code 1), not an error', () => {
    const execFn = () => { const e = new Error('no matches'); e.status = 1; throw e; };
    const result = censusInvokerReferences('/fake/repo', execFn);
    expect(result.matches).toEqual([]);
    expect(result.productionMatches).toEqual([]);
  });

  it('propagates a genuine git-grep failure (non-1 exit code)', () => {
    const execFn = () => { const e = new Error('git not found'); e.status = 127; throw e; };
    expect(() => censusInvokerReferences('/fake/repo', execFn)).toThrow(/git not found/);
  });

  it('separates production from test matches from real grep-shaped output', () => {
    const execFn = () => [
      "tests/integration/error-triggered-invocation.integration.test.js:12:import { invoke } from '../../lib/error-triggered-sub-agent-invoker.js';",
      'lib/rca/rca-orchestrator.js:5:// unrelated comment mentioning error-triggered-sub-agent-invoker.js in passing'
    ].join('\n');
    const result = censusInvokerReferences('/fake/repo', execFn);
    expect(result.testMatches).toHaveLength(1);
    expect(result.productionMatches).toHaveLength(0); // the comment line is not import-like
  });
});

describe('censusInvokerReferences — REAL repo census (FR-6 acceptance evidence)', () => {
  it('confirms zero production call sites in the actual repo as of this SD', () => {
    const result = censusInvokerReferences(REPO_ROOT);
    // The known, expected importer is the pre-existing integration test.
    expect(result.productionMatches).toEqual([]);
  });
});
