/**
 * Unit tests for the process.env feature-flag lint extractors.
 * SD-LEO-INFRA-ACTIVATE-FEATURE-FLAG-001 (FR-4).
 */
import { describe, it, expect } from 'vitest';
import { stripComments, extractEnvFlags, loadAllowlist } from '../../scripts/lint/process-env-feature-flag-lint.mjs';

describe('extractEnvFlags', () => {
  it('detects names ending in feature-flag-shaped suffixes', () => {
    const f = extractEnvFlags("const a = process.env.COORD_ADAM_REVIEW_V1; const b = process.env.SEARCH_ENABLED;");
    expect(f.has('COORD_ADAM_REVIEW_V1')).toBe(true);
    expect(f.has('SEARCH_ENABLED')).toBe(true);
  });

  it('detects a read compared to on/off even if the name is not shaped', () => {
    const f = extractEnvFlags("if (process.env.SOME_MODE === 'on') run();");
    expect(f.has('SOME_MODE')).toBe(true);
  });

  it('detects _REVIEW_EVERY (numeric threshold flag)', () => {
    const f = extractEnvFlags("const n = parseInt(process.env.COORD_REVIEW_EVERY || '8', 10);");
    expect(f.has('COORD_REVIEW_EVERY')).toBe(true);
  });

  it('ignores plain credentials/config env reads', () => {
    const f = extractEnvFlags("const url = process.env.SUPABASE_URL; const id = process.env.CLAUDE_SESSION_ID;");
    expect(f.has('SUPABASE_URL')).toBe(false);
    expect(f.has('CLAUDE_SESSION_ID')).toBe(false);
  });

  it('does not detect reads inside comments', () => {
    expect(extractEnvFlags("// process.env.OLD_FLAG_V1 was removed").has('OLD_FLAG_V1')).toBe(false);
    expect(extractEnvFlags("/* process.env.BLOCK_FLAG_V2 */").has('BLOCK_FLAG_V2')).toBe(false);
  });
});

describe('stripComments', () => {
  it('removes block and line comments', () => {
    expect(stripComments('a /* x */ b')).not.toMatch(/x/);
    expect(stripComments('a // tail\nb')).not.toMatch(/tail/);
  });
});

describe('loadAllowlist', () => {
  it('returns the project baseline allowlist with the registered flags', () => {
    const allow = loadAllowlist();
    expect(allow.COORD_ADAM_REVIEW_V1).toBeTruthy();
    expect(allow.COORD_REVIEW_EVERY).toBeTruthy();
    expect(allow.FLAG_GOVERNANCE_REVIEW_V1).toBeTruthy();
  });
});
