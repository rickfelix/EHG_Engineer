/**
 * Unit + integration tests for e2e-demo-recorder.
 * SD-LEO-WIRING-VERIFICATION-FRAMEWORK-ORCH-001-E (TS-1, TS-3, TS-6, TS-7)
 *
 * Uses fixtures (no DB, no network) — runnable in CI without local supabase.
 */

import { describe, it, expect } from 'vitest';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  parseArgs,
  aggregateStatus,
  truncate,
  runDetector,
  validateArgs,
  statusToExitCode
} from '../../scripts/wiring-validators/e2e-demo-recorder.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_PASSING = resolve(__dirname, 'fixtures', 'sample-sd-passing.json');
const FIXTURE_FAILING = resolve(__dirname, 'fixtures', 'sample-sd-failing.json');
const RECORDER = resolve(__dirname, '..', '..', 'scripts', 'wiring-validators', 'e2e-demo-recorder.js');

function runRecorder(args, opts = {}) {
  return new Promise((resolve) => {
    const child = spawn('node', [RECORDER, ...args], {
      env: { ...process.env, ...opts.env },
      cwd: opts.cwd
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', d => { stdout += d.toString(); });
    child.stderr.on('data', d => { stderr += d.toString(); });
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

describe('parseArgs', () => {
  it('parses sd_key positional', () => {
    const a = parseArgs(['node', 'recorder.js', 'SD-X-001']);
    expect(a.sd_key).toBe('SD-X-001');
    expect(a.target_env).toBe('dev');
  });

  it('parses --target-env=prod', () => {
    const a = parseArgs(['node', 'recorder.js', 'SD-X', '--target-env=prod']);
    expect(a.target_env).toBe('prod');
    expect(a.confirm_prod).toBe(false);
  });

  it('parses --target-env prod (space form)', () => {
    const a = parseArgs(['node', 'recorder.js', 'SD-X', '--target-env', 'prod']);
    expect(a.target_env).toBe('prod');
  });

  it('parses --confirm-prod flag', () => {
    const a = parseArgs(['node', 'recorder.js', 'SD-X', '--target-env=prod', '--confirm-prod']);
    expect(a.confirm_prod).toBe(true);
  });

  it('parses --fixture path', () => {
    const a = parseArgs(['node', 'recorder.js', '--fixture', '/tmp/x.json']);
    expect(a.fixture).toBe('/tmp/x.json');
    expect(a.sd_key).toBe(null);
  });

  it('throws on unknown flag', () => {
    expect(() => parseArgs(['node', 'recorder.js', '--bogus'])).toThrow(/Unknown flag/);
  });
});

describe('aggregateStatus', () => {
  it('returns skipped for empty steps', () => {
    expect(aggregateStatus([])).toBe('skipped');
  });
  it('returns passed when all match', () => {
    expect(aggregateStatus([{ match_result: 'passed' }, { match_result: 'passed' }])).toBe('passed');
  });
  it('returns failed when any failed', () => {
    expect(aggregateStatus([{ match_result: 'passed' }, { match_result: 'failed' }])).toBe('failed');
  });
  it('returns partial when only partials/skips and no failures', () => {
    expect(aggregateStatus([{ match_result: 'passed' }, { match_result: 'partial' }])).toBe('partial');
    expect(aggregateStatus([{ match_result: 'passed' }, { match_result: 'skipped' }])).toBe('partial');
  });
  it('failed beats partial', () => {
    expect(aggregateStatus([{ match_result: 'failed' }, { match_result: 'partial' }])).toBe('failed');
  });
});

describe('validateArgs', () => {
  it('passes for valid sd_key + dev target', () => {
    expect(validateArgs({ sd_key: 'SD-X', target_env: 'dev', confirm_prod: false })).toEqual({ valid: true });
  });
  it('passes for fixture mode', () => {
    expect(validateArgs({ sd_key: null, fixture: '/x.json', target_env: 'dev', confirm_prod: false })).toEqual({ valid: true });
  });
  it('passes when help requested even with no other args', () => {
    expect(validateArgs({ help: true })).toEqual({ valid: true });
  });
  it('fails when missing sd_key and fixture', () => {
    const r = validateArgs({ sd_key: null, target_env: 'dev', confirm_prod: false });
    expect(r.valid).toBe(false);
    expect(r.exit_code).toBe(3);
  });
  it('fails on invalid target_env', () => {
    const r = validateArgs({ sd_key: 'SD-X', target_env: 'production', confirm_prod: false });
    expect(r.valid).toBe(false);
    expect(r.error).toContain('--target-env must be one of');
  });
  it('fails on prod without confirm-prod', () => {
    const r = validateArgs({ sd_key: 'SD-X', target_env: 'prod', confirm_prod: false });
    expect(r.valid).toBe(false);
    expect(r.error).toContain('--confirm-prod');
  });
  it('passes on prod with confirm-prod', () => {
    expect(validateArgs({ sd_key: 'SD-X', target_env: 'prod', confirm_prod: true })).toEqual({ valid: true });
  });
});

describe('statusToExitCode', () => {
  it('maps passed -> 0', () => { expect(statusToExitCode('passed')).toBe(0); });
  it('maps skipped -> 2', () => { expect(statusToExitCode('skipped')).toBe(2); });
  it('maps failed -> 1', () => { expect(statusToExitCode('failed')).toBe(1); });
  it('maps partial -> 1', () => { expect(statusToExitCode('partial')).toBe(1); });
});

describe('truncate', () => {
  it('returns input unchanged when under limit', () => {
    expect(truncate('hello', 100)).toBe('hello');
  });
  it('appends marker when over limit', () => {
    const r = truncate('x'.repeat(50), 10);
    expect(r).toContain('[truncated]');
    expect(r.startsWith('x'.repeat(10))).toBe(true);
  });
  it('handles non-string input', () => {
    expect(truncate(null, 10)).toBe('');
    expect(truncate(42, 10)).toBe('42');
  });
});

describe('runDetector with fixtures', () => {
  it('produces passed envelope for sample-sd-passing fixture', async () => {
    const result = await runDetector(
      { fixture: FIXTURE_PASSING },
      { supabase: null }
    );
    expect(result.check_type).toBe('e2e_demo');
    expect(result.sd_key).toBe('SD-FIXTURE-PASSING-001');
    expect(result.status).toBe('passed');
    expect(result.signals_detected).toEqual([]);
    expect(result.evidence.steps).toHaveLength(3);
    expect(result.evidence.steps.every(s => s.match_result === 'passed')).toBe(true);
  }, 30000);

  it('produces failed envelope for sample-sd-failing fixture', async () => {
    const result = await runDetector(
      { fixture: FIXTURE_FAILING },
      { supabase: null }
    );
    expect(result.status).toBe('failed');
    expect(result.signals_detected).toContain(2);
    expect(result.evidence.steps).toHaveLength(2);
    expect(result.evidence.steps[0].match_result).toBe('passed');
    expect(result.evidence.steps[1].match_result).toBe('failed');
    expect(result.evidence.steps[1].delta).toBeDefined();
  }, 30000);

  it('returns skipped envelope when smoke_test_steps empty', async () => {
    const result = await runDetector(
      { fixture: FIXTURE_PASSING },
      { supabase: null }
    );
    // Override by passing custom fixture inline
    const r2 = await runDetector(
      { fixture: undefined },
      { supabase: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { sd_key: 'X', smoke_test_steps: [] }, error: null }) }) }) }) } }
    );
    // Stub-style mock SD with empty steps
    expect(r2.status).toBe('skipped');
    expect(r2.evidence.note).toBe('no_smoke_steps_declared');
  });
});

describe('production-safety gate (TS-6) — process-level', () => {
  it('refuses to run with --target-env=prod and no --confirm-prod', async () => {
    const r = await runRecorder(['SD-X', '--target-env=prod'], { env: { SUPABASE_URL: 'x', SUPABASE_SERVICE_ROLE_KEY: 'x' } });
    expect(r.code).toBe(3);
    expect(r.stderr).toContain('--confirm-prod');
  }, 15000);

  it('emits help on --help', async () => {
    const r = await runRecorder(['--help']);
    expect(r.code).toBe(0);
    expect(r.stderr).toContain('Usage:');
  }, 15000);

  it('exits 3 on missing sd_key', async () => {
    const r = await runRecorder([]);
    expect(r.code).toBe(3);
    expect(r.stderr).toContain('sd_key positional argument is required');
  }, 15000);

  it('exits 3 on bad --target-env value', async () => {
    const r = await runRecorder(['SD-X', '--target-env=production']);
    expect(r.code).toBe(3);
    expect(r.stderr).toContain('--target-env must be one of');
  }, 15000);
});

describe('end-to-end fixture run via CLI (TS-1, TS-3)', () => {
  it('CLI run with --fixture passing yields exit 0 + valid envelope', async () => {
    const r = await runRecorder(['--fixture', FIXTURE_PASSING]);
    expect(r.code).toBe(0);
    const envelope = JSON.parse(r.stdout);
    expect(envelope.status).toBe('passed');
    expect(envelope.evidence.steps).toHaveLength(3);
    expect(envelope.envelope_schema_version).toBe(1);
  }, 30000);

  it('CLI run with --fixture failing yields exit 1 + signals_detected', async () => {
    const r = await runRecorder(['--fixture', FIXTURE_FAILING]);
    expect(r.code).toBe(1);
    const envelope = JSON.parse(r.stdout);
    expect(envelope.status).toBe('failed');
    expect(envelope.signals_detected).toContain(2);
  }, 30000);
});
