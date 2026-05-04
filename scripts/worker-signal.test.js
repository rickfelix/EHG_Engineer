// Tests for SD-LEO-INFRA-TWO-WAY-COORDINATOR-001 / FR-2
// scripts/worker-signal.cjs — type validation, redaction (M1), body slice (M2), CLI parsing

import { describe, it, expect } from 'vitest';
import { redact, parseArgs, REDACTION_PATTERNS, SIGNAL_TYPES, SEVERITIES, BODY_HARD_CAP } from './worker-signal.cjs';

describe('WS-1: redact strips AWS access keys', () => {
  it('replaces AKIA pattern with REDACTED:AWS_KEY', () => {
    const out = redact('Got error AKIAIOSFODNN7EXAMPLE while accessing S3');
    expect(out).toBe('Got error [REDACTED:AWS_KEY] while accessing S3');
  });
});

describe('WS-2: redact strips GitHub tokens', () => {
  it('replaces ghp_ classic, gho_, ghu_, ghs_, ghr_ tokens', () => {
    const samples = ['ghp_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'gho_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', 'ghs_cccccccccccccccccccccccccccccccccccc'];
    for (const s of samples) {
      expect(redact('token: ' + s + ' end')).toBe('token: [REDACTED:GH_TOKEN] end');
    }
  });
});

describe('WS-3: redact strips provider keys (sk-...)', () => {
  it('replaces sk- prefixed keys', () => {
    const out = redact('OpenAI sk-abcdefghijklmnopqrstuvwxyz1234567890 used');
    expect(out).toContain('[REDACTED:PROVIDER_KEY]');
    expect(out).not.toContain('sk-abcdefghi');
  });
});

describe('WS-4: redact strips JWT-shaped strings', () => {
  it('replaces 3-segment base64-url tokens', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
    const out = redact('jwt=' + jwt);
    expect(out).toBe('jwt=[REDACTED:JWT]');
  });
});

describe('WS-5: redact strips password=... patterns', () => {
  it('handles both password= and password: forms', () => {
    expect(redact('url?password=secret123&user=foo')).toContain('[REDACTED:PASSWORD]');
    expect(redact('config password: hunter2')).toContain('[REDACTED:PASSWORD]');
  });
});

describe('WS-6: redact strips Postgres connection strings with creds', () => {
  it('replaces postgres://user:pass@host pattern', () => {
    const out = redact('connect to postgresql://admin:s3cr3t@db.example.com:5432/mydb');
    expect(out).toContain('[REDACTED:PG_CONN_STRING]');
    expect(out).not.toContain('s3cr3t');
  });
});

describe('WS-7: redact is idempotent on clean input', () => {
  it('leaves non-secret strings untouched', () => {
    const clean = 'No secrets here, just a normal description of an issue.';
    expect(redact(clean)).toBe(clean);
  });
});

describe('WS-8: parseArgs extracts positional + flags', () => {
  it('handles --severity and --reason flags', () => {
    const argv = ['node', 'worker-signal.cjs', 'stuck', 'gate failure', '--severity', 'high', '--reason', 'manual'];
    const { flags, positional } = parseArgs(argv);
    expect(positional).toEqual(['stuck', 'gate failure']);
    expect(flags.severity).toBe('high');
    expect(flags.reason).toBe('manual');
  });
});

describe('WS-9: parseArgs --help flag', () => {
  it('detects --help and -h', () => {
    expect(parseArgs(['node', 'x', '--help']).flags.help).toBe(true);
    expect(parseArgs(['node', 'x', '-h']).flags.help).toBe(true);
  });
});

describe('WS-10: type vocabulary fixed at 8 types + severity at 4 levels', () => {
  it('exposes documented vocabularies and BODY_HARD_CAP=4096', () => {
    expect(SIGNAL_TYPES).toEqual(['stuck', 'need-sweep', 'prd-ambiguous', 'gate-bug', 'spec-conflict', 'harness-bug', 'feedback', 'other']);
    expect(SEVERITIES).toEqual(['low', 'medium', 'high', 'critical']);
    expect(BODY_HARD_CAP).toBe(4096);
    // Sanity: redaction patterns count
    expect(REDACTION_PATTERNS).toHaveLength(6);
  });
});

describe('WS-11: redact handles non-string input gracefully', () => {
  it('returns input unchanged for non-string', () => {
    expect(redact(null)).toBe(null);
    expect(redact(undefined)).toBe(undefined);
    expect(redact(123)).toBe(123);
  });
});

describe('WS-12: redact + slice round-trip respects 4096 cap', () => {
  it('redaction preserves cap budget', () => {
    const big = 'AKIAIOSFODNN7EXAMPLE '.repeat(500); // 10500 chars total before redaction
    const redacted = redact(big);
    const sliced = redacted.slice(0, BODY_HARD_CAP);
    expect(sliced.length).toBeLessThanOrEqual(BODY_HARD_CAP);
    expect(sliced).toContain('[REDACTED:AWS_KEY]');
    expect(sliced).not.toContain('AKIAIOSFODNN7');
  });
});
