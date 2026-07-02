import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('node:child_process', () => ({ execSync: vi.fn() }));

const mockCreateClient = vi.fn();
vi.mock('@supabase/supabase-js', () => ({ createClient: (...args) => mockCreateClient(...args) }));

import { execSync } from 'node:child_process';
import {
  bucketizeError,
  extractFailures,
  bucketize,
  csvEscape,
  formatCsv,
  formatJson,
  parseArgs,
  runPrOnly,
} from '../../../scripts/audit-test-failures.mjs';

function makeSupabase(rows, error = null) {
  const builder = {
    select: () => builder,
    eq: () => builder,
    order: () => builder,
    limit: () => Promise.resolve({ data: rows, error }),
  };
  return { from: () => builder };
}

describe('bucketizeError', () => {
  it('classifies cannot-find-module', () => {
    expect(bucketizeError("Error: Cannot find module './missing'").bucket).toBe('cannot-find-module');
    expect(bucketizeError('Failed to resolve module: foo').bucket).toBe('cannot-find-module');
    expect(bucketizeError('ERR_MODULE_NOT_FOUND').bucket).toBe('cannot-find-module');
  });

  it('classifies must-be-set', () => {
    expect(bucketizeError('SUPABASE_URL must be set').bucket).toBe('must-be-set');
    expect(bucketizeError('Environment variable SUPABASE_KEY not set').bucket).toBe('must-be-set');
    expect(bucketizeError('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required').bucket).toBe('must-be-set');
  });

  it('classifies econnrefused', () => {
    expect(bucketizeError('connect ECONNREFUSED 127.0.0.1:5432').bucket).toBe('econnrefused');
    expect(bucketizeError('Error: ETIMEDOUT').bucket).toBe('econnrefused');
    expect(bucketizeError('connection refused').bucket).toBe('econnrefused');
  });

  it('classifies mock-mismatch', () => {
    expect(bucketizeError('expected mock to have been called').bucket).toBe('mock-mismatch');
    expect(bucketizeError('expected 2 calls, got 1').bucket).toBe('mock-mismatch');
    expect(bucketizeError('spy was called with [foo]').bucket).toBe('mock-mismatch');
  });

  it('classifies real-assertion-failure', () => {
    expect(bucketizeError('AssertionError: expected 1 to equal 2').bucket).toBe('real-assertion-failure');
    expect(bucketizeError('expected "foo" to match /bar/').bucket).toBe('real-assertion-failure');
    expect(bucketizeError('expected obj toEqual {x: 1}').bucket).toBe('real-assertion-failure');
  });

  it('falls back to other for unknown patterns', () => {
    expect(bucketizeError('something random went wrong').bucket).toBe('other');
    expect(bucketizeError('').bucket).toBe('other');
    expect(bucketizeError(null).bucket).toBe('other');
    expect(bucketizeError(undefined).bucket).toBe('other');
  });

  it('returns recommended action for each bucket', () => {
    expect(bucketizeError('Cannot find module x').action).toMatch(/manual triage/i);
    expect(bucketizeError('SUPABASE_URL must be set').action).toMatch(/lazyServiceClient|sentinel/);
    expect(bucketizeError('ECONNREFUSED').action).toMatch(/HAS_REAL_DB|sentinel/);
  });

  it('priority order: env-var crash takes precedence over assertion phrasing', () => {
    // A phrase that contains both signals should land in the more specific bucket.
    const both = 'expected SUPABASE_URL must be set, got undefined';
    expect(bucketizeError(both).bucket).toBe('must-be-set');
  });
});

describe('extractFailures', () => {
  it('reads vitest 1.x testResults[] shape', () => {
    const json = {
      testResults: [
        {
          name: '/repo/tests/foo.test.js',
          assertionResults: [
            { status: 'passed', fullName: 'foo > a' },
            { status: 'failed', fullName: 'foo > b', failureMessages: ['line1\nline2'] },
          ],
        },
      ],
    };
    const out = extractFailures(json);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      file: '/repo/tests/foo.test.js',
      test: 'foo > b',
      error: 'line1\nline2',
    });
  });

  it('reads vitest 3.x files[] shape (flat tests)', () => {
    const json = {
      files: [
        {
          filepath: '/repo/tests/bar.test.js',
          tasks: [
            { type: 'test', name: 'pass', result: { state: 'pass' } },
            {
              type: 'test',
              name: 'fail',
              result: {
                state: 'fail',
                errors: [{ stack: 'stack-trace-1', message: 'msg' }],
              },
            },
          ],
        },
      ],
    };
    const out = extractFailures(json);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      file: '/repo/tests/bar.test.js',
      test: 'fail',
      error: 'stack-trace-1',
    });
  });

  it('reads vitest 3.x files[] shape with nested tasks (describe)', () => {
    const json = {
      files: [
        {
          filepath: '/repo/tests/nested.test.js',
          tasks: [
            {
              type: 'suite',
              name: 'group',
              tasks: [
                {
                  type: 'test',
                  name: 'inner',
                  result: { state: 'fail', errors: [{ message: 'inner err' }] },
                },
              ],
            },
          ],
        },
      ],
    };
    const out = extractFailures(json);
    expect(out).toHaveLength(1);
    expect(out[0].test).toBe('inner');
    expect(out[0].error).toBe('inner err');
  });

  it('returns empty array for clean run', () => {
    expect(extractFailures({ testResults: [] })).toEqual([]);
    expect(extractFailures({ files: [] })).toEqual([]);
    expect(extractFailures({})).toEqual([]);
  });

  it('handles missing fields gracefully (returns "unknown")', () => {
    const json = {
      testResults: [{ assertionResults: [{ status: 'failed' }] }],
    };
    const out = extractFailures(json);
    expect(out[0].file).toBe('unknown');
    expect(out[0].test).toBe('unknown');
    expect(out[0].error).toBe('');
  });
});

describe('bucketize integration', () => {
  it('counts failures per category', () => {
    const failures = [
      { file: 'a.js', test: 't1', error: 'Cannot find module x' },
      { file: 'b.js', test: 't2', error: 'SUPABASE_URL must be set' },
      { file: 'c.js', test: 't3', error: 'connect ECONNREFUSED' },
      { file: 'd.js', test: 't4', error: 'expected 1 to equal 2' },
      { file: 'e.js', test: 't5', error: 'random' },
    ];
    const { rows, byCategory } = bucketize(failures);
    expect(rows).toHaveLength(5);
    expect(byCategory).toEqual({
      'cannot-find-module': 1,
      'must-be-set': 1,
      'econnrefused': 1,
      'real-assertion-failure': 1,
      'other': 1,
    });
  });

  it('truncates excerpt to 200 chars', () => {
    const longLine = 'x'.repeat(500);
    const { rows } = bucketize([{ file: 'a.js', test: 't', error: longLine }]);
    expect(rows[0].error_message_excerpt.length).toBe(200);
  });

  it('takes only the first line of the error for excerpt', () => {
    const { rows } = bucketize([{ file: 'a.js', test: 't', error: 'first\nsecond\nthird' }]);
    expect(rows[0].error_message_excerpt).toBe('first');
  });
});

describe('csvEscape (RFC 4180)', () => {
  it('passes simple fields unchanged', () => {
    expect(csvEscape('foo')).toBe('foo');
    expect(csvEscape('foo bar')).toBe('foo bar');
  });

  it('quotes and doubles internal quotes', () => {
    expect(csvEscape('he said "hi"')).toBe('"he said ""hi"""');
  });

  it('quotes fields with commas', () => {
    expect(csvEscape('a, b, c')).toBe('"a, b, c"');
  });

  it('quotes fields with newlines and CRs', () => {
    expect(csvEscape('line1\nline2')).toBe('"line1\nline2"');
    expect(csvEscape('with\rcarriage')).toBe('"with\rcarriage"');
  });

  it('handles null/undefined as empty', () => {
    expect(csvEscape(null)).toBe('');
    expect(csvEscape(undefined)).toBe('');
  });

  it('round-trip safe via re-parse', () => {
    // Adversarial: every problematic char in one cell.
    const adversarial = 'x,"y",z\nq';
    const escaped = csvEscape(adversarial);
    // Strip outer quotes, undouble inner quotes — should match input.
    const inner = escaped.slice(1, -1).replace(/""/g, '"');
    expect(inner).toBe(adversarial);
  });
});

describe('formatCsv', () => {
  it('emits header + one line per row', () => {
    const rows = [
      { file: 'a.js', error_category: 'other', error_message_excerpt: 'x', recommended_action: 'y' },
      { file: 'b.js', error_category: 'must-be-set', error_message_excerpt: 'y', recommended_action: 'z' },
    ];
    const csv = formatCsv(rows);
    const lines = csv.split('\n');
    expect(lines[0]).toBe('file,error_category,error_message_excerpt,recommended_action');
    expect(lines).toHaveLength(3);
    expect(lines[1]).toBe('a.js,other,x,y');
  });

  it('escapes adversarial cells (RFC 4180 multi-line)', () => {
    const rows = [{
      file: 'a,b.js',
      error_category: 'other',
      error_message_excerpt: 'has "quotes"',
      recommended_action: 'multi\nline',
    }];
    const csv = formatCsv(rows);
    // Cell with embedded newline legally crosses physical lines per RFC 4180.
    // Strip header and any trailing blank line; the rest is the single record.
    const headerIdx = csv.indexOf('\n');
    const record = csv.slice(headerIdx + 1).replace(/\n$/, '');
    expect(record).toBe('"a,b.js",other,"has ""quotes""","multi\nline"');
  });
});

describe('formatJson', () => {
  it('emits structured shape with totals + by_category + failures', () => {
    const rows = [{ file: 'a.js', error_category: 'other', error_message_excerpt: 'x', recommended_action: 'y' }];
    const byCategory = { other: 1 };
    const json = JSON.parse(formatJson(rows, byCategory));
    expect(json.total_failed).toBe(1);
    expect(json.by_category).toEqual({ other: 1 });
    expect(json.failures).toEqual(rows);
  });
});

describe('parseArgs', () => {
  it('defaults to csv format, no summary, file-fallback primary', () => {
    const opts = parseArgs([]);
    expect(opts.format).toBe('csv');
    expect(opts.summary).toBe(false);
    expect(opts.noDb).toBe(true);
    expect(opts.help).toBe(false);
    expect(opts.resultsPath).toBe('test-results.json');
  });

  it('accepts --format=json and --format json equally', () => {
    expect(parseArgs(['--format=json']).format).toBe('json');
    expect(parseArgs(['--format', 'json']).format).toBe('json');
  });

  it('accepts --by-category in both forms', () => {
    expect(parseArgs(['--by-category=must-be-set']).byCategory).toBe('must-be-set');
    expect(parseArgs(['--by-category', 'must-be-set']).byCategory).toBe('must-be-set');
  });

  it('rejects invalid format', () => {
    expect(parseArgs(['--format=xml'])._error).toMatch(/format/);
  });

  it('rejects unknown argument', () => {
    expect(parseArgs(['--bogus'])._error).toMatch(/unknown/);
  });

  it('rejects missing value for --format', () => {
    expect(parseArgs(['--format'])._error).toMatch(/requires a value/);
    expect(parseArgs(['--format', '--summary'])._error).toMatch(/requires a value/);
  });

  it('--help short and long forms', () => {
    expect(parseArgs(['--help']).help).toBe(true);
    expect(parseArgs(['-h']).help).toBe(true);
  });

  it('accepts --pr-only flag (default false)', () => {
    expect(parseArgs(['--pr-only']).prOnly).toBe(true);
    expect(parseArgs([]).prOnly).toBe(false);
  });

  it('accepts --branch in both forms, defaults to main', () => {
    expect(parseArgs([]).branch).toBe('main');
    expect(parseArgs(['--branch=develop']).branch).toBe('develop');
    expect(parseArgs(['--branch', 'develop']).branch).toBe('develop');
  });
});

describe('runPrOnly (--pr-only wiring, SD-LEO-FIX-COVERAGE-BASELINE-REGRESSION-001)', () => {
  let savedUrl;
  let savedKey;

  beforeEach(() => {
    vi.clearAllMocks();
    savedUrl = process.env.SUPABASE_URL;
    savedKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  });

  afterEach(() => {
    // Mutate keys in place (never reassign process.env wholesale) so the
    // live `env` binding audit-test-failures.mjs captured at import time
    // keeps seeing the same object.
    if (savedUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = savedUrl;
    if (savedKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = savedKey;
  });

  it('returns exit code 2 when Supabase env vars are missing', async () => {
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const code = await runPrOnly({ testResults: [] }, { branch: 'main', format: 'json' });
    expect(code).toBe(2);
  });

  it('passes cleanly on cold start (no baseline snapshot yet)', async () => {
    process.env.SUPABASE_URL = 'https://example.test';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
    mockCreateClient.mockReturnValue(makeSupabase([]));
    const code = await runPrOnly({ testResults: [] }, { branch: 'main', format: 'json' });
    expect(code).toBe(0);
  });

  it('flags a genuine regression: new failure in a file the PR changed', async () => {
    process.env.SUPABASE_URL = 'https://example.test';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
    mockCreateClient.mockReturnValue(makeSupabase([
      { findings: [{ branch: 'main', failed_count: 0, failed_test_ids: [] }], scanned_at: 't' },
    ]));
    execSync.mockImplementation(() => 'src/changed.js\n');
    const json = {
      testResults: [{ name: 'src/changed.js', assertionResults: [{ status: 'failed', fullName: 'broke it' }] }],
    };
    const code = await runPrOnly(json, { branch: 'main', format: 'json' });
    expect(code).toBe(1);
  });

  it('does NOT flag a pre-existing failure in a file the PR did not touch (the false-positive class this SD fixes)', async () => {
    process.env.SUPABASE_URL = 'https://example.test';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
    mockCreateClient.mockReturnValue(makeSupabase([
      { findings: [{ branch: 'main', failed_count: 1, failed_test_ids: ['src/unrelated.js::flaky'] }], scanned_at: 't' },
    ]));
    execSync.mockImplementation(() => 'src/some-other-file.js\n');
    const json = {
      testResults: [{ name: 'src/unrelated.js', assertionResults: [{ status: 'failed', fullName: 'flaky' }] }],
    };
    const code = await runPrOnly(json, { branch: 'main', format: 'json' });
    expect(code).toBe(0);
  });
});
