// QF-20260704-452: the security:secret-scan check's SUPABASE_SERVICE_ROLE_KEY=,
// ANTHROPIC_API_KEY=, and OPENAI_API_KEY= patterns matched a bare assignment with no
// value, false-flagging documented .env.example template declarations (empty values)
// as hardcoded secrets and blocking venture P2 auto-merge. Fixed by requiring a
// non-empty value token (\S+) after the assignment.
import { describe, it, expect } from 'vitest';
import { SECRET_PATTERNS } from '../../../scripts/venture-conformance-check.js';

function matchesAny(content) {
  return SECRET_PATTERNS.some((p) => p.test(content));
}

describe('venture-conformance-check — SECRET_PATTERNS empty-value false-positive fix', () => {
  it('does not flag an empty-value .env.example template declaration (the reported bug)', () => {
    expect(matchesAny('SUPABASE_SERVICE_ROLE_KEY=')).toBe(false);
    expect(matchesAny('ANTHROPIC_API_KEY=')).toBe(false);
    expect(matchesAny('OPENAI_API_KEY=')).toBe(false);
  });

  it('still flags a real value for the same variables', () => {
    expect(matchesAny('SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiJ9.abc123')).toBe(true);
    expect(matchesAny('ANTHROPIC_API_KEY=sk-ant-abc123def456')).toBe(true);
    expect(matchesAny('OPENAI_API_KEY=sk-abc123def456ghi789')).toBe(true);
  });

  it('treats a whitespace-only value as still empty', () => {
    expect(matchesAny('SUPABASE_SERVICE_ROLE_KEY=   ')).toBe(false);
  });

  it('still catches a real secret pasted into any file, including .env.example (no wholesale file exemption)', () => {
    expect(matchesAny('sk-' + 'a'.repeat(24))).toBe(true);
    expect(matchesAny('ghp_' + 'a'.repeat(36))).toBe(true);
    expect(matchesAny('-----BEGIN RSA PRIVATE KEY-----')).toBe(true);
  });

  it('leaves the 3 value-shaped patterns unaffected by this change', () => {
    expect(SECRET_PATTERNS[1].source).toBe('sk-[a-zA-Z0-9]{20,}');
    expect(SECRET_PATTERNS[2].source).toBe('ghp_[a-zA-Z0-9]{36}');
    expect(SECRET_PATTERNS[5].source).toBe('BEGIN (RSA|DSA|EC|OPENSSH) PRIVATE KEY');
  });
});
