/**
 * Regression: complete-quick-fix.js must terminate deterministically on success.
 *
 * QF-20260529-852 / RCA c6a002d5: the CLI wrapper only exited on failure
 * (completeQuickFix().catch(exit 1)) and relied on event-loop drain for success.
 * The orchestrator transitively opens background handles (the supabase-js client's
 * default background-refresh setInterval, idle sockets) that outlive all awaited
 * work, so after the quick_fixes row was written to "completed" and the promise
 * resolved, the process hung to the external ~2-min timeout. Fix: symmetric
 * process.exit(0) on the resolve path.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

const wrapperPath = fileURLToPath(new URL('../../scripts/complete-quick-fix.js', import.meta.url));
const orchestratorPath = fileURLToPath(
  new URL('../../scripts/modules/complete-quick-fix/orchestrator.js', import.meta.url)
);

describe('complete-quick-fix — deterministic, non-hanging exit wiring', () => {
  const wrapperSrc = readFileSync(wrapperPath, 'utf8');
  const orchestratorSrc = readFileSync(orchestratorPath, 'utf8');

  it('sets a deterministic success exit code with a non-hanging unref() fallback', () => {
    expect(wrapperSrc).toMatch(/process\.exitCode\s*=\s*0/);
    expect(wrapperSrc).toMatch(/\.unref\(\)/);
  });

  it('still exits non-zero on failure', () => {
    expect(wrapperSrc).toMatch(/\.catch\([\s\S]*?process\.exit\(1\)/);
  });

  it('disables the supabase auth refresh timer on the CLI client (root cause)', () => {
    expect(orchestratorSrc).toMatch(/autoRefreshToken:\s*false/);
  });
});

// Behavioral proof: spawn the real CLI against an already-completed QF (a fast,
// side-effect-free path that returns early) and assert the process TERMINATES.
// Pre-fix this hangs on the lingering supabase refresh timer; post-fix it exits 0.
// DB-gated: skips cleanly without service-role creds (e.g. CI without secrets).
const hasCreds = !!(
  process.env.SUPABASE_SERVICE_ROLE_KEY &&
  (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL)
);

describe.skipIf(!hasCreds)('complete-quick-fix CLI — terminates on success (no hang)', () => {
  let completedId = null;

  beforeAll(async () => {
    try {
      const { createClient } = await import('@supabase/supabase-js');
      const sb = createClient(
        process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
      );
      const { data } = await sb
        .from('quick_fixes')
        .select('id')
        .eq('status', 'completed')
        .order('completed_at', { ascending: false })
        .limit(1);
      completedId = data?.[0]?.id || null;
    } catch {
      completedId = null;
    }
  });

  it('exits 0 within 45s on an already-completed QF (would hang pre-fix)', async () => {
    if (!completedId) return; // no fixture in this DB — skip cleanly
    const result = await new Promise((resolve) => {
      const child = spawn(
        process.execPath,
        [
          wrapperPath,
          completedId,
          '--non-interactive',
          '--allow-stale-branch',
          '--reason',
          'regression: QF-20260529-852 exit-0 on resolve',
        ],
        { stdio: 'ignore' }
      );
      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        resolve({ code: null, timedOut: true });
      }, 45000);
      child.on('close', (code) => {
        clearTimeout(timer);
        resolve({ code, timedOut: false });
      });
      child.on('error', () => {
        clearTimeout(timer);
        resolve({ code: -1, timedOut: false, errored: true });
      });
    });

    expect(result.timedOut).toBe(false); // core anti-hang assertion
    expect(result.code).toBe(0); // success path → deterministic exit 0
  }, 60000);
});
