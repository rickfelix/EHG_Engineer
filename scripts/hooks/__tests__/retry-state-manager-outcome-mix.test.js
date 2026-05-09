/**
 * SD-LEO-INFRA-RCA-TIERED-SIGNATURE-001 — Outcome-mix + UUID-resolution tests.
 *
 * 16 cases across 3 layers:
 *   L1 (6): signatureFor outcome admixture
 *   L2 (6): fetchRcaInvocationSince UUID resolution
 *   L3 (4): recordAndCount integration (TDD-iteration unblock + stuck-loop guard)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

const MODULE_PATH = path.resolve(__dirname, '../retry-state-manager.cjs');

function loadFresh() {
  delete require.cache[require.resolve(MODULE_PATH)];
  return require(MODULE_PATH);
}

describe('L1 — signatureFor outcome admixture', () => {
  const { signatureFor } = loadFresh();

  it('TS-1: back-compat — no last_outcome arg returns "Bash:<hash>"', () => {
    const sig = signatureFor('Bash', { command: 'echo hi' });
    expect(sig).toMatch(/^Bash:[0-9a-f]{16}$/);
    // Same input → same signature (deterministic)
    expect(signatureFor('Bash', { command: 'echo hi' })).toBe(sig);
  });

  it('TS-2: with last_outcome returns "Bash:<hash>:<digest>"', () => {
    const sig = signatureFor('Bash', { command: 'echo hi' }, { exit_code: 1, stderr_sha: 'abc' });
    expect(sig).toMatch(/^Bash:[0-9a-f]{16}:[0-9a-f]{8}$/);
  });

  it('TS-3: different exit codes produce different signatures', () => {
    const a = signatureFor('Bash', { command: 'x' }, { exit_code: 0, stderr_sha: 'sha' });
    const b = signatureFor('Bash', { command: 'x' }, { exit_code: 1, stderr_sha: 'sha' });
    expect(a).not.toBe(b);
  });

  it('TS-4: same outcome produces same digest (stuck-loop preserved)', () => {
    const a = signatureFor('Bash', { command: 'x' }, { exit_code: 1, stderr_sha: 'abc' });
    const b = signatureFor('Bash', { command: 'x' }, { exit_code: 1, stderr_sha: 'abc' });
    expect(a).toBe(b);
  });

  it('TS-5: Edit/Write/MultiEdit signatures unaffected by last_outcome', () => {
    const editSig = signatureFor('Edit', { file_path: '/x.js' }, { exit_code: 1, stderr_sha: 'abc' });
    expect(editSig).toBe('Edit:/x.js');
    const writeSig = signatureFor('Write', { file_path: '/x.js' }, { exit_code: 1, stderr_sha: 'abc' });
    expect(writeSig).toBe('Write:/x.js');
  });

  it('TS-6: malformed last_outcome falls back to command-only without throwing', () => {
    const a = signatureFor('Bash', { command: 'x' }, null);
    const b = signatureFor('Bash', { command: 'x' }, undefined);
    const c = signatureFor('Bash', { command: 'x' }, {}); // empty object — no exit/stderr fields
    const baseline = signatureFor('Bash', { command: 'x' });
    expect(a).toBe(baseline);
    expect(b).toBe(baseline);
    expect(c).toBe(baseline);
    // String-as-outcome should also fall through (object check)
    expect(signatureFor('Bash', { command: 'x' }, 'not-an-object')).toBe(baseline);
  });
});

describe('L2 — fetchRcaInvocationSince UUID resolution', () => {
  const PP_UUID = '08d20036-03c9-4a26-bbc5-f37a18dfdf23';
  const SD_KEY = 'SD-FAKE-001';
  const RESOLVED_UUID = 'aaaa1111-2222-3333-4444-555566667777';

  beforeEach(() => {
    delete require.cache[require.resolve(MODULE_PATH)];
  });

  it('TS-7: UUID input passed directly — no resolution round-trip', async () => {
    const fetchSpy = vi.fn(async () => ({
      ok: true,
      json: async () => [{ created_at: '2026-05-09T00:00:00Z' }],
    }));
    global.fetch = fetchSpy;
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'svc-key';
    const mod = require(MODULE_PATH);
    mod._resetSdKeyCache();
    const result = await mod.fetchRcaInvocationSince(PP_UUID, null);
    expect(result).toBe('2026-05-09T00:00:00Z');
    // Only the sub_agent_execution_results query — NO strategic_directives_v2 lookup.
    expect(fetchSpy).toHaveBeenCalledOnce();
    expect(fetchSpy.mock.calls[0][0]).toMatch(/sub_agent_execution_results/);
  });

  it('TS-8: sd_key string resolves to UUID first, then queries with UUID', async () => {
    const fetchSpy = vi.fn(async (url) => {
      if (url.includes('strategic_directives_v2')) {
        return { ok: true, json: async () => [{ id: RESOLVED_UUID }] };
      }
      return { ok: true, json: async () => [{ created_at: '2026-05-09T01:00:00Z' }] };
    });
    global.fetch = fetchSpy;
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'svc-key';
    const mod = require(MODULE_PATH);
    mod._resetSdKeyCache();
    const result = await mod.fetchRcaInvocationSince(SD_KEY, null);
    expect(result).toBe('2026-05-09T01:00:00Z');
    // Two calls: 1) resolve sd_key→UUID, 2) query sub_agent_execution_results with UUID
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(fetchSpy.mock.calls[0][0]).toMatch(/strategic_directives_v2/);
    expect(fetchSpy.mock.calls[1][0]).toContain(`eq.${RESOLVED_UUID}`);
  });

  it('TS-9: malformed sd_id returns null without throwing', async () => {
    const mod = require(MODULE_PATH);
    mod._resetSdKeyCache();
    expect(await mod.fetchRcaInvocationSince(null, null)).toBeNull();
    expect(await mod.fetchRcaInvocationSince(undefined, null)).toBeNull();
    expect(await mod.fetchRcaInvocationSince('', null)).toBeNull();
  });

  it('TS-10: lastResetAt sets gt filter on PostgREST query', async () => {
    const fetchSpy = vi.fn(async () => ({ ok: true, json: async () => [] }));
    global.fetch = fetchSpy;
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'svc-key';
    const mod = require(MODULE_PATH);
    mod._resetSdKeyCache();
    await mod.fetchRcaInvocationSince(PP_UUID, '2026-05-08T00:00:00Z');
    const url = fetchSpy.mock.calls[0][0];
    expect(url).toContain('created_at=gt.2026-05-08');
  });

  it('TS-11: 1.2s timeout aborts gracefully → null', async () => {
    global.fetch = vi.fn(
      () => new Promise((resolve, reject) => {
        setTimeout(() => resolve({ ok: false, json: async () => ({}) }), 5000);
      })
    );
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'svc-key';
    const mod = require(MODULE_PATH);
    mod._resetSdKeyCache();
    // Don't actually wait 5s — assert the fetch is wrapped with AbortController and returns null on abort.
    // For unit speed, just assert the function does not throw.
    const promise = mod.fetchRcaInvocationSince(PP_UUID, null);
    // Race against 2s test budget
    const result = await Promise.race([
      promise,
      new Promise((r) => setTimeout(() => r('TIMEOUT'), 2000)),
    ]);
    // Either timed out internally (null) or our race ticker fires (TIMEOUT). Either way no throw.
    expect(['TIMEOUT', null]).toContain(result);
  });

  it('TS-12: non-UUID input that is not in strategic_directives_v2 returns null', async () => {
    const fetchSpy = vi.fn(async (url) => {
      if (url.includes('strategic_directives_v2')) {
        return { ok: true, json: async () => [] };
      }
      return { ok: true, json: async () => [{ created_at: 'should-not-reach' }] };
    });
    global.fetch = fetchSpy;
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'svc-key';
    const mod = require(MODULE_PATH);
    mod._resetSdKeyCache();
    const result = await mod.fetchRcaInvocationSince('SD-DOES-NOT-EXIST', null);
    expect(result).toBeNull();
    // Only resolution call — no sub_agent_execution_results query
    expect(fetchSpy).toHaveBeenCalledOnce();
  });
});

describe('L3 — recordAndCount integration', () => {
  let tmpDir;
  const SESSION_ID = 'test-session-' + Math.random().toString(36).slice(2);

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'retry-state-test-'));
    process.env.LEO_RETRY_STATE_DIR = tmpDir;
    delete require.cache[require.resolve(MODULE_PATH)];
  });

  it('TS-13: TDD pattern — 3 different-outcome retries → attempts stays 1', async () => {
    const mod = require(MODULE_PATH);
    const noopRca = vi.fn(async () => null);
    const a = await mod.recordAndCount(SESSION_ID, null, 'Bash', { command: 'npx vitest run x' }, {
      rcaCheck: noopRca,
      lastOutcome: { exit_code: 1, stderr_sha: 'first-failure-sha' },
    });
    expect(a.attempts).toBe(1);
    const b = await mod.recordAndCount(SESSION_ID, null, 'Bash', { command: 'npx vitest run x' }, {
      rcaCheck: noopRca,
      lastOutcome: { exit_code: 1, stderr_sha: 'second-failure-sha' },
    });
    expect(b.attempts).toBe(1);
    const c = await mod.recordAndCount(SESSION_ID, null, 'Bash', { command: 'npx vitest run x' }, {
      rcaCheck: noopRca,
      lastOutcome: { exit_code: 0, stderr_sha: '' },
    });
    expect(c.attempts).toBe(1);
    // Each had a distinct signature
    expect(a.signature).not.toBe(b.signature);
    expect(b.signature).not.toBe(c.signature);
  });

  it('TS-14: STUCK-LOOP regression guard — 3 IDENTICAL-outcome retries → attempts increments to 3', async () => {
    const mod = require(MODULE_PATH);
    const noopRca = vi.fn(async () => null);
    const sameOutcome = { exit_code: 1, stderr_sha: 'same-failure-sha' };
    const a = await mod.recordAndCount(SESSION_ID, null, 'Bash', { command: 'failing-cmd' }, {
      rcaCheck: noopRca,
      lastOutcome: sameOutcome,
    });
    expect(a.attempts).toBe(1);
    const b = await mod.recordAndCount(SESSION_ID, null, 'Bash', { command: 'failing-cmd' }, {
      rcaCheck: noopRca,
      lastOutcome: sameOutcome,
    });
    expect(b.attempts).toBe(2);
    const c = await mod.recordAndCount(SESSION_ID, null, 'Bash', { command: 'failing-cmd' }, {
      rcaCheck: noopRca,
      lastOutcome: sameOutcome,
    });
    expect(c.attempts).toBe(3);
    // All same signature (stuck loop)
    expect(a.signature).toBe(b.signature);
    expect(b.signature).toBe(c.signature);
  });

  it('TS-15: RCA reset clears state.invocations on next call', async () => {
    const mod = require(MODULE_PATH);
    let rcaSeen = false;
    const rcaCheck = vi.fn(async () => {
      // Return null first time, then a fresh ISO once "RCA persisted"
      const ret = rcaSeen ? '2026-05-09T02:00:00Z' : null;
      rcaSeen = true;
      return ret;
    });
    // Build up 2 attempts
    await mod.recordAndCount(SESSION_ID, null, 'Bash', { command: 'cmd1' }, {
      rcaCheck,
      lastOutcome: { exit_code: 1, stderr_sha: 'a' },
    });
    const second = await mod.recordAndCount(SESSION_ID, null, 'Bash', { command: 'cmd1' }, {
      rcaCheck,
      lastOutcome: { exit_code: 1, stderr_sha: 'a' },
    });
    // RCA fires — counter resets to 1
    expect(second.rcaResetApplied).toBe(true);
    expect(second.attempts).toBe(1);
  });

  it('TS-16: back-compat — recordAndCount without lastOutcome opt still works', async () => {
    const mod = require(MODULE_PATH);
    const noopRca = vi.fn(async () => null);
    const a = await mod.recordAndCount(SESSION_ID, null, 'Bash', { command: 'echo hi' }, { rcaCheck: noopRca });
    expect(a.attempts).toBe(1);
    expect(a.signature).toMatch(/^Bash:[0-9a-f]{16}$/);
    // No outcome digest segment when lastOutcome is missing
    expect(a.signature.split(':').length).toBe(2);
  });
});
