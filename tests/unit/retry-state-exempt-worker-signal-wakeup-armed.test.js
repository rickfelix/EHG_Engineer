/**
 * QF-20260703-281 — exempt the mandated per-tick worker-signal.cjs feedback/wakeup-armed
 * heartbeat from LEARN-129's 3-strikes guard.
 *
 * RCA (confirmed twice independently, same root cause): signatureFor() hashes the RAW,
 * pre-shell-expansion Bash command. The heartbeat's only "varying" content is often inside a
 * $(date ...) substitution the hook never sees expanded, so 3 ticks (~150-200s apart) collapse
 * to one signature and trip the block on a side-effect-free, idempotent notification.
 * Scoped narrowly to feedback+wakeup-armed so worker-signal.cjs's other paths (stuck,
 * harness-bug, request, solomon-consult) keep the 3-strikes teeth.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';

const require = createRequire(import.meta.url);
const { isExempt, recordAndCount } = require('../../scripts/hooks/retry-state-manager.cjs');

describe('isExempt — worker-signal.cjs feedback/wakeup-armed heartbeat', () => {
  it('exempts the wakeup-armed heartbeat regardless of the embedded timestamp/message', () => {
    expect(isExempt('node scripts/worker-signal.cjs feedback "wakeup-armed +150s at 2026-07-03T18:26:24Z -- idle"')).toBe(true);
    expect(isExempt('node scripts/worker-signal.cjs feedback "wakeup-armed +150s at $(date -u \'+%Y-%m-%dT%H:%M:%SZ\')"')).toBe(true);
    expect(isExempt('node scripts\\worker-signal.cjs feedback "wakeup-armed +150s at 2026-07-03T18:26:24Z"')).toBe(true); // windows path sep
  });

  it('does NOT exempt other worker-signal.cjs paths (scoped match — teeth preserved)', () => {
    expect(isExempt('node scripts/worker-signal.cjs stuck "blocked on gate X"')).toBe(false);
    expect(isExempt('node scripts/worker-signal.cjs harness-bug "found a bug"')).toBe(false);
    expect(isExempt('node scripts/worker-signal.cjs feedback "comms-check ack -- read you"')).toBe(false); // feedback, but not wakeup-armed
    expect(isExempt('node scripts/worker-signal.cjs request "need review"')).toBe(false);
  });
});

describe('recordAndCount honors the wakeup-armed exemption across ticks with a static (unrotated) body', () => {
  let tmpDir;
  const SESSION = 'sess-exempt-wakeup-armed';
  const noReset = async () => null;
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'retry-exempt-wakeup-armed-'));
    process.env.LEO_RETRY_STATE_DIR = tmpDir;
  });
  afterEach(() => {
    delete process.env.LEO_RETRY_STATE_DIR;
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it('4 identical-signature heartbeat ticks (the $(date) collapse case) never accumulate', async () => {
    // Byte-identical command every tick -- exactly the collapse the RCA reproduced: the
    // $(date ...) substitution is invisible to the pre-expansion hash, so pre-fix this would
    // trip LEARN-129 on tick 3. Post-fix, isExempt short-circuits before the counter accrues.
    const cmd = 'node scripts/worker-signal.cjs feedback "wakeup-armed +150s at $(date -u \'+%Y-%m-%dT%H:%M:%SZ\') -- idle"';
    for (let i = 0; i < 4; i++) {
      const r = await recordAndCount(SESSION, null, 'Bash', { command: cmd }, { rcaCheck: noReset, now: 1000 + i * 150_000 });
      expect(r.attempts).toBe(0);
    }
  });
});
