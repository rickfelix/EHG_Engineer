import { describe, it, expect } from 'vitest';
import { scanForSecrets, assertSanitized, SanitizationViolation } from './sanitization-checker.mjs';

// Test fixtures are assembled at runtime via concat to avoid tripping the
// repo's pre-commit secret-scanner on static source text. The assembled
// strings still match our own regex patterns at runtime — that is the point.
const SK = 'sk' + '-';
const PREFIX_ANT = SK + 'ant-';
const PREFIX_PROJ = SK + 'proj-';
const PREFIX_SVCACCT = SK + 'svcacct-';
const PREFIX_AKIA = 'AK' + 'IA';
const PREFIX_GHP = 'gh' + 'p_';
const PREFIX_PAT = 'github' + '_pat_';
const PREFIX_XOXB = 'xo' + 'xb-';
const PREFIX_XOXP = 'xo' + 'xp-';
const PREFIX_STRIPE_SK = 's' + 'k_live_';
const PREFIX_STRIPE_PK = 'p' + 'k_live_';
const PREFIX_GOOG = 'AI' + 'za';
const PREFIX_SG = 'S' + 'G.';
const PAYLOAD = 'A'.repeat(24);
const LONG_PAYLOAD = 'A'.repeat(36);
const FINE_GRAINED_PAYLOAD = 'A'.repeat(82);
const GOOG_PAYLOAD = 'A'.repeat(35);
const SG_PAYLOAD = 'A'.repeat(22) + '.' + 'B'.repeat(43);

describe('scanForSecrets', () => {
  it('returns [] for clean text', () => {
    expect(scanForSecrets('hello world')).toEqual([]);
  });

  it('detects Anthropic API keys', () => {
    const hits = scanForSecrets('token: ' + PREFIX_ANT + 'abcdefghijklmnopqrst123');
    expect(hits.find(h => h.kind === 'anthropic_api_key')).toBeTruthy();
  });

  it('detects OpenAI keys without confusing them with Anthropic', () => {
    const hits = scanForSecrets('key=' + SK + 'ABCDEFGHIJKLMNOPQRSTUV12');
    expect(hits.find(h => h.kind === 'openai_api_key')).toBeTruthy();
    expect(hits.find(h => h.kind === 'anthropic_api_key')).toBeFalsy();
  });

  it('detects OpenAI project-scoped keys (sk-proj-)', () => {
    const hits = scanForSecrets(PREFIX_PROJ + PAYLOAD);
    expect(hits.find(h => h.kind === 'openai_api_key')).toBeTruthy();
  });

  it('detects OpenAI service-account keys (sk-svcacct-)', () => {
    const hits = scanForSecrets(PREFIX_SVCACCT + PAYLOAD);
    expect(hits.find(h => h.kind === 'openai_api_key')).toBeTruthy();
  });

  it('detects AWS access keys', () => {
    const hits = scanForSecrets(PREFIX_AKIA + 'IOSFODNN7EXAMPLE');
    expect(hits.find(h => h.kind === 'aws_access_key')).toBeTruthy();
  });

  it('detects classic GitHub PATs (ghp_)', () => {
    const hits = scanForSecrets(PREFIX_GHP + LONG_PAYLOAD);
    expect(hits.find(h => h.kind === 'github_token')).toBeTruthy();
  });

  it('detects GitHub fine-grained PATs (github_pat_)', () => {
    const hits = scanForSecrets(PREFIX_PAT + FINE_GRAINED_PAYLOAD);
    expect(hits.find(h => h.kind === 'github_fine_grained_pat')).toBeTruthy();
  });

  it('detects PEM private-key blocks', () => {
    const hits = scanForSecrets('-----BEGIN RSA PRIVATE KEY-----');
    expect(hits.find(h => h.kind === 'private_key_block')).toBeTruthy();
  });

  it('detects JWT tokens', () => {
    const hits = scanForSecrets('eyJabcdefgh.eyJijklmnop.signaturepart12');
    expect(hits.find(h => h.kind === 'jwt_token')).toBeTruthy();
  });

  it('detects JWT tokens whose middle segment contains hyphens (real base64url)', () => {
    const hits = scanForSecrets('eyJhbGciOiJI.eyJzdWItcw-AB.signaturepart12');
    expect(hits.find(h => h.kind === 'jwt_token')).toBeTruthy();
  });

  it('detects Slack bot tokens (xoxb-)', () => {
    const hits = scanForSecrets(PREFIX_XOXB + '12345-67890-' + PAYLOAD);
    expect(hits.find(h => h.kind === 'slack_token')).toBeTruthy();
  });

  it('detects Slack user tokens (xoxp-)', () => {
    const hits = scanForSecrets(PREFIX_XOXP + '12345-67890-' + PAYLOAD);
    expect(hits.find(h => h.kind === 'slack_token')).toBeTruthy();
  });

  it('detects Stripe live secret keys (sk_live_)', () => {
    const hits = scanForSecrets(PREFIX_STRIPE_SK + PAYLOAD);
    expect(hits.find(h => h.kind === 'stripe_live_key')).toBeTruthy();
  });

  it('detects Stripe live publishable keys (pk_live_)', () => {
    const hits = scanForSecrets(PREFIX_STRIPE_PK + PAYLOAD);
    expect(hits.find(h => h.kind === 'stripe_live_key')).toBeTruthy();
  });

  it('does not match Stripe test keys (sk_test_/pk_test_)', () => {
    const hits = scanForSecrets('sk' + '_test_' + PAYLOAD);
    expect(hits.find(h => h.kind === 'stripe_live_key')).toBeFalsy();
  });

  it('detects Google API keys (AIza-prefixed, 39 chars total)', () => {
    const hits = scanForSecrets(PREFIX_GOOG + GOOG_PAYLOAD);
    expect(hits.find(h => h.kind === 'google_api_key')).toBeTruthy();
  });

  it('detects SendGrid API keys (SG.{x}.{y})', () => {
    const hits = scanForSecrets(PREFIX_SG + SG_PAYLOAD);
    expect(hits.find(h => h.kind === 'sendgrid_api_key')).toBeTruthy();
  });

  it('detects postgres connection strings with embedded passwords', () => {
    const hits = scanForSecrets('postgres' + '://user:hunter2@host:5432/db');
    expect(hits.find(h => h.kind === 'postgres_conn_with_password')).toBeTruthy();
  });

  it('detects postgresql:// scheme variant with embedded passwords', () => {
    const hits = scanForSecrets('postgres' + 'ql://admin:s3cret@10.0.0.1:5432/prod');
    expect(hits.find(h => h.kind === 'postgres_conn_with_password')).toBeTruthy();
  });

  it('does not match passwordless postgres URIs (no password = no leak)', () => {
    const hits = scanForSecrets('postgres' + '://localhost:5432/devdb');
    expect(hits.find(h => h.kind === 'postgres_conn_with_password')).toBeFalsy();
  });

  it('serializes objects before scanning', () => {
    const hits = scanForSecrets({ nested: { token: PREFIX_ANT + 'abcdefghijklmnopqrst123' } });
    expect(hits.find(h => h.kind === 'anthropic_api_key')).toBeTruthy();
  });
});

describe('assertSanitized', () => {
  const CLEAN = {
    input: { question: 'what is 2+2?' },
    v1_output: { answer: '4' },
    validator_result: { passed: true },
    captured_at: '2026-04-25T12:00:00Z',
    sanitized: true,
  };

  it('passes on a clean fixture', () => {
    expect(assertSanitized(CLEAN, 'fix-001.json').ok).toBe(true);
  });

  it('throws SanitizationViolation when input contains a key', () => {
    const dirty = { ...CLEAN, input: { auth: 'Bearer ' + PREFIX_ANT + 'abcdefghijklmnopqrst123' } };
    expect(() => assertSanitized(dirty, 'fix-002.json')).toThrow(SanitizationViolation);
  });

  it('throws when v1_output contains a key', () => {
    const dirty = { ...CLEAN, v1_output: { leaked: PREFIX_AKIA + 'IOSFODNN7EXAMPLE' } };
    expect(() => assertSanitized(dirty, 'fix-003.json')).toThrow(/aws_access_key/);
  });

  it('throws when validator_result.details contains a key', () => {
    const dirty = { ...CLEAN, validator_result: { passed: true, details: 'echoed: ' + PREFIX_GHP + 'B'.repeat(36) } };
    expect(() => assertSanitized(dirty, 'fix-004.json')).toThrow(/github_token/);
  });
});
