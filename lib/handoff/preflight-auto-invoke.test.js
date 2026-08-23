/**
 * SD-LEO-INFRA-HANDOFF-PREFLIGHT-AUTO-001 — FR-2 (flag-gated OFF by default).
 * Covers TS-3 (flag unset -> never fires), TS-4 (malformed flag -> never
 * fires), TS-7 (static import boundary away from
 * lib/error-triggered-sub-agent-invoker.js), and the bounded-invocation
 * contract that TS-9 (orchestrator-level: mixed issue class -> zero attempts)
 * relies on at the HandoffOrchestrator.resolveMissingAgentsForAutoInvoke layer.
 */

import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { AUTO_INVOKE_FLAG, isAutoInvokeEnabled, autoInvokeMissingSubAgents } from './preflight-auto-invoke.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('isAutoInvokeEnabled (TS-3 / TS-4, fail-closed)', () => {
  it('TS-3: flag unset -> disabled', () => {
    expect(isAutoInvokeEnabled({})).toBe(false);
  });

  it('TS-4: malformed/unrecognized flag values -> disabled', () => {
    expect(isAutoInvokeEnabled({ [AUTO_INVOKE_FLAG]: '1' })).toBe(false);
    expect(isAutoInvokeEnabled({ [AUTO_INVOKE_FLAG]: 'yes' })).toBe(false);
    expect(isAutoInvokeEnabled({ [AUTO_INVOKE_FLAG]: 'TRUE' })).toBe(false);
    expect(isAutoInvokeEnabled({ [AUTO_INVOKE_FLAG]: '' })).toBe(false);
  });

  it('only the literal string "true" enables it', () => {
    expect(isAutoInvokeEnabled({ [AUTO_INVOKE_FLAG]: 'true' })).toBe(true);
  });

  it('SECURITY regression: an inherited/polluted Object.prototype value cannot flip this on', () => {
    Object.prototype[AUTO_INVOKE_FLAG] = 'true';
    try {
      expect(isAutoInvokeEnabled({})).toBe(false);
    } finally {
      delete Object.prototype[AUTO_INVOKE_FLAG];
    }
  });
});

describe('autoInvokeMissingSubAgents (bounded invocation)', () => {
  it('attempts exactly one invocation per missing code, no retry loop', async () => {
    const executeSubAgentFn = vi.fn().mockResolvedValue({ verdict: 'PASS' });
    const out = await autoInvokeMissingSubAgents({
      missing: ['TESTING', 'SECURITY'],
      sdId: 'SD-T-001',
      handoffType: 'EXEC-TO-PLAN',
      executeSubAgentFn
    });
    expect(executeSubAgentFn).toHaveBeenCalledTimes(2);
    expect(out.attempted).toEqual(['TESTING', 'SECURITY']);
    expect(out.results).toEqual([
      { code: 'TESTING', verdict: 'PASS', error: null },
      { code: 'SECURITY', verdict: 'PASS', error: null }
    ]);
  });

  it('captures per-agent errors without aborting the remaining agents', async () => {
    const executeSubAgentFn = vi.fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({ verdict: 'PASS' });
    const out = await autoInvokeMissingSubAgents({
      missing: ['TESTING', 'SECURITY'],
      sdId: 'SD-T-001',
      handoffType: 'EXEC-TO-PLAN',
      executeSubAgentFn
    });
    expect(out.results[0]).toEqual({ code: 'TESTING', verdict: null, error: 'boom' });
    expect(out.results[1]).toEqual({ code: 'SECURITY', verdict: 'PASS', error: null });
  });

  it('empty/absent missing list makes zero invocation attempts', async () => {
    const executeSubAgentFn = vi.fn();
    const out = await autoInvokeMissingSubAgents({ missing: [], sdId: 'SD-T-001', handoffType: 'EXEC-TO-PLAN', executeSubAgentFn });
    expect(executeSubAgentFn).not.toHaveBeenCalled();
    expect(out).toEqual({ attempted: [], results: [] });
  });
});

const IMPORT_STATEMENT_RE = /^\s*import\b[^;\n]*from\s+['"][^'"]*error-triggered-sub-agent-invoker[^'"]*['"]/m;

describe('TS-7: architecture boundary — static import isolation', () => {
  it('never has an import statement pulling in lib/error-triggered-sub-agent-invoker.js (a doc-comment MAY name it to explain the exclusion — only a real import statement fails this)', () => {
    const source = readFileSync(join(__dirname, 'preflight-auto-invoke.js'), 'utf-8');
    expect(source).not.toMatch(IMPORT_STATEMENT_RE);
  });

  it('the orchestrator call site also has no import statement for the error-pattern-triggered invoker', () => {
    const source = readFileSync(
      join(__dirname, '..', '..', 'scripts', 'modules', 'handoff', 'HandoffOrchestrator.js'),
      'utf-8'
    );
    expect(source).not.toMatch(IMPORT_STATEMENT_RE);
    expect(source).toMatch(/from ['"]\.\.\/\.\.\/\.\.\/lib\/sub-agent-executor\.js['"]/);
  });
});
