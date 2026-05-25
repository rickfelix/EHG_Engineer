/**
 * SD-FDBK-REFAC-ADOPT-RESOLVESESSIONID-CASCADE-001 — model-tracking session-id resolution.
 *
 * getModelInfo() now accepts an OPTIONAL resolved sessionId (supplied by main() from the
 * canonical lib/hooks/session-id.cjs cascade). The no-arg path preserves the prior
 * env-based behavior for backward compatibility.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const HOOK_PATH = path.resolve(__dirname, '../model-tracking.cjs');

function loadHook() {
  delete require.cache[require.resolve(HOOK_PATH)];
  return require(HOOK_PATH);
}

describe('model-tracking getModelInfo session-id resolution', () => {
  const orig = process.env.CLAUDE_SESSION_ID;
  beforeEach(() => { delete process.env.CLAUDE_SESSION_ID; });
  afterEach(() => { if (orig === undefined) delete process.env.CLAUDE_SESSION_ID; else process.env.CLAUDE_SESSION_ID = orig; });

  it('uses the explicit resolved sessionId when provided (FR-1 / AC-1)', () => {
    const { getModelInfo } = loadHook();
    expect(getModelInfo('abc123').session_id).toBe('abc123');
  });

  it("falls back to 'unknown' with no arg and no env (backward-compatible no-arg behavior)", () => {
    const { getModelInfo } = loadHook();
    expect(getModelInfo().session_id).toBe('unknown');
  });

  it('falls back to CLAUDE_SESSION_ID env with no arg (unchanged legacy path)', () => {
    process.env.CLAUDE_SESSION_ID = 'env-sess-9';
    const { getModelInfo } = loadHook();
    expect(getModelInfo().session_id).toBe('env-sess-9');
  });

  it('an explicit sessionId takes precedence over the env var', () => {
    process.env.CLAUDE_SESSION_ID = 'env-sess-9';
    const { getModelInfo } = loadHook();
    expect(getModelInfo('explicit-1').session_id).toBe('explicit-1');
  });

  it('still returns model_id and a timestamp (no behavioral regression)', () => {
    const { getModelInfo } = loadHook();
    const info = getModelInfo('s1');
    expect(typeof info.model_id).toBe('string');
    expect(typeof info.timestamp).toBe('string');
  });
});
