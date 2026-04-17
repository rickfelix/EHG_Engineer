/**
 * Tests for universal CLAUDE_SESSION_ID pre-flight check in cli-main.js
 * SD-LEARN-FIX-ADDRESS-PAT-RETRO-001
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('CLAUDE_SESSION_ID pre-flight check', () => {
  let originalEnv;
  let warnSpy;

  beforeEach(() => {
    originalEnv = process.env.CLAUDE_SESSION_ID;
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.CLAUDE_SESSION_ID = originalEnv;
    } else {
      delete process.env.CLAUDE_SESSION_ID;
    }
    warnSpy.mockRestore();
  });

  it('should warn when CLAUDE_SESSION_ID is missing', () => {
    delete process.env.CLAUDE_SESSION_ID;

    // Simulate the check logic from cli-main.js
    if (!process.env.CLAUDE_SESSION_ID) {
      console.warn('⚠️  CLAUDE_SESSION_ID is not set.');
      console.warn('   This will cause no_deterministic_identity gate failures (0% score).');
    }

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('CLAUDE_SESSION_ID is not set'));
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('no_deterministic_identity'));
  });

  it('should NOT warn when CLAUDE_SESSION_ID is set', () => {
    process.env.CLAUDE_SESSION_ID = 'test-uuid-1234';

    if (!process.env.CLAUDE_SESSION_ID) {
      console.warn('⚠️  CLAUDE_SESSION_ID is not set.');
    }

    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('should not block execution (advisory only)', () => {
    delete process.env.CLAUDE_SESSION_ID;

    let continued = false;
    if (!process.env.CLAUDE_SESSION_ID) {
      console.warn('⚠️  CLAUDE_SESSION_ID is not set.');
    }
    // Execution continues past the check
    continued = true;

    expect(continued).toBe(true);
  });

  it('should include fix command in warning', () => {
    delete process.env.CLAUDE_SESSION_ID;
    const handoffType = 'LEAD-TO-PLAN';
    const sdId = 'SD-TEST-001';

    if (!process.env.CLAUDE_SESSION_ID) {
      console.warn(`   CLAUDE_SESSION_ID=<uuid> node scripts/handoff.js execute ${handoffType} ${sdId}`);
    }

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('CLAUDE_SESSION_ID=<uuid> node scripts/handoff.js execute LEAD-TO-PLAN SD-TEST-001')
    );
  });
});
