/**
 * SD-LEO-INFRA-GR-SECURITY-BASELINE-PROSE-FALSE-BLOCK-001 — GR-SECURITY-BASELINE detector.
 *
 * Proves the BLOCKING guardrail now requires a REAL security signal (a concrete mechanism
 * keyword, a real credential-TYPE compound, or a metadata signal) instead of a bare
 * conceptual prose word — so a pure-JS SD that merely DISCUSSES a concept (UI "design
 * tokens", a CI "secret", "the auth flow") is no longer false-blocked, while every genuine
 * security scope STILL blocks (gate not weakened). Mirrors the sibling
 * tests/unit/governance/gr-migration-prose-detector.test.js.
 */
import { describe, it, expect } from 'vitest';
import { check } from '../../../lib/governance/guardrail-registry.js';

const sec = (sdData) => check(sdData).violations.find((v) => v.guardrail === 'GR-SECURITY-BASELINE');

describe('GR-SECURITY-BASELINE — bare prose word no longer false-blocks (FR-1)', () => {
  it.each([
    ['manage design tokens for the UI theme', 'UI design tokens'],
    ['the lexer emits tokens for each statement', 'parse/lexer tokens'],
    ['add a token bucket rate limiter', 'token bucket (rate limiting)'],
    ['store the GitHub Actions secret for CI', 'CI secret in tooling prose'],
    ['the secret to fast lookups is a hash map', 'idiomatic "secret"'],
    ['document the auth flow for operators', 'bare "auth" in a doc SD'],
    ['refine the GR-SECURITY-BASELINE keyword filter so a bare prose word no longer false-blocks', 'pure governance prose'],
  ])('PASSES pure-JS/governance prose: %s (%s)', (scope) => {
    expect(sec({ scope, metadata: {} })).toBeUndefined();
  });
});

describe('GR-SECURITY-BASELINE — genuine security scope STILL blocks (FR-1, gate not weakened)', () => {
  it.each([
    ['add oauth login to the app', 'oauth'],
    ['issue a jwt on sign-in', 'jwt'],
    ['enforce row-level-security on tenants', 'row-level-security'],
    ['add authentication to the login flow', 'authentication'],
    ['implement rbac authorization', 'authorization + rbac'],
    ['store API credentials in the vault', 'credentials'],
    ['harden password hashing', 'password'],
    ['add field-level encryption', 'encryption'],
    ['issue an api-key for the worker', 'api-key'],
    ['rotate the auth token', 'auth token compound'],
    ['validate the bearer token', 'bearer token compound'],
    ['refresh the session token', 'session token compound'],
    ['store the client secret', 'client secret compound'],
    ['rotate the secret key', 'secret-key compound'],
    ['require mfa for admins', 'mfa'],
    ['add csrf protection', 'csrf'],
  ])('BLOCKS genuine security scope: %s (%s)', (scope) => {
    expect(sec({ scope, metadata: {} })).toBeDefined();
  });

  it('BLOCKS on an explicit metadata.touches_security flag even with pure prose', () => {
    expect(sec({ scope: 'pure prose with no security word', metadata: { touches_security: true } })).toBeDefined();
  });
  it('BLOCKS on metadata.touches_auth / touches_credentials', () => {
    expect(sec({ scope: 'pure prose', metadata: { touches_auth: true } })).toBeDefined();
    expect(sec({ scope: 'pure prose', metadata: { touches_credentials: true } })).toBeDefined();
  });
  it('BLOCKS a governed_files[] entry under an auth/security path or a *.pem/*.key file', () => {
    expect(sec({ scope: 'pure prose', metadata: { governed_files: ['src/auth/login.js'] } })).toBeDefined();
    expect(sec({ scope: 'pure prose', metadata: { governed_files: ['config/server.key'] } })).toBeDefined();
  });
});

describe('GR-SECURITY-BASELINE — dot patterns now match only real separators (FR-2)', () => {
  it.each([
    ['migrate to row.level.security', 'literal-dot spelling'],
    ['enforce row-level-security', 'hyphen spelling'],
    ['document row level security', 'space spelling'],
    ['rotate the api.key', 'api.key literal dot'],
    ['issue an api key', 'api key space'],
    ['generate an apikey', 'apikey no separator'],
  ])('BLOCKS real separator spelling: %s (%s)', (scope) => {
    expect(sec({ scope, metadata: {} })).toBeDefined();
  });
  it.each([
    ['the rowXlevelYsecurity helper function', 'arbitrary-char row.level.security'],
    ['call the apiZkey() utility', 'arbitrary-char api.key'],
  ])('PASSES arbitrary-character forms the unescaped dot used to match: %s (%s)', (scope) => {
    expect(sec({ scope, metadata: {} })).toBeUndefined();
  });
});

describe('GR-SECURITY-BASELINE — attestation bypass unchanged & strict', () => {
  it('PASSES a genuine security SD when security_reviewed is attested', () => {
    expect(sec({ scope: 'add oauth login', metadata: { security_reviewed: true } })).toBeUndefined();
  });
  it('PASSES a genuine security SD when threat_model is set', () => {
    expect(sec({ scope: 'enforce row-level-security', metadata: { threat_model: true } })).toBeUndefined();
  });
  it('does NOT bypass on a non-true attestation value (must be strict ===true)', () => {
    expect(sec({ scope: 'add oauth login', metadata: { security_reviewed: 'true' } })).toBeDefined();
  });
});
