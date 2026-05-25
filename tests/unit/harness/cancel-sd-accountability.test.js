// QF-20260525-211 (A1/A2): accountability guards for cancel-sd.js.
//   A1 — every cancellation writes an audit_log row (event_type=sd_cancelled), so the
//        cancellation is visible to the audit stream (not only in cancellation_reason).
//   A2 — the claude_sessions release is VERIFIED: a genuine error is fatal (process.exit)
//        rather than warn-and-swallow, so a dangling claim can no longer silently survive
//        and feed the stale-session-sweep CLAIM_FIX churn.
// Static source assertions (matches cancel-sd-script.test.js convention); CI-runnable, no DB.

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');
const scriptPath = path.join(repoRoot, 'scripts/cancel-sd.js');
const src = fs.readFileSync(scriptPath, 'utf-8');

describe('QF-20260525-211 (A1): cancel-sd.js writes an audit_log row', () => {
  it('inserts into audit_log', () => {
    expect(src).toMatch(/from\(['"]audit_log['"]\)\s*\n?\s*\.insert\(/);
  });

  it('uses event_type sd_cancelled on the strategic_directive entity', () => {
    expect(src).toMatch(/event_type:\s*['"]sd_cancelled['"]/);
    expect(src).toMatch(/entity_type:\s*['"]strategic_directive['"]/);
  });

  it('records the reason and the prior claiming session in the audit row', () => {
    const idx = src.indexOf("event_type: 'sd_cancelled'");
    expect(idx).toBeGreaterThan(0);
    const block = src.slice(idx, idx + 500);
    expect(block).toMatch(/reason/);
    expect(block).toMatch(/prior_claiming_session/);
  });

  it('audit write happens AFTER the SD is cancelled (so it records a real transition)', () => {
    const cancelLogIdx = src.indexOf('cancelled (status=cancelled, current_phase=CANCELLED)');
    const auditIdx = src.indexOf("event_type: 'sd_cancelled'");
    expect(cancelLogIdx).toBeGreaterThan(0);
    expect(auditIdx).toBeGreaterThan(cancelLogIdx);
  });
});

describe('QF-20260525-211 (A2): claude_sessions release is verified, not fire-and-forget', () => {
  it('a release error is fatal (process.exit), not a swallowed warning', () => {
    const idx = src.indexOf('release for ${claimedSessionId.slice(0, 8)} FAILED');
    expect(idx).toBeGreaterThan(0);
    const block = src.slice(idx - 100, idx + 400);
    expect(block).toMatch(/process\.exit\(1\)/);
  });

  it('uses .select() to verify the affected rows (distinguishes error from already-released)', () => {
    expect(src).toMatch(/const\s*\{\s*data:\s*releasedRows,\s*error:\s*csErr\s*\}\s*=\s*await supabase/);
    expect(src).toMatch(/\.select\(['"]session_id['"]\)/);
  });

  it('does not treat zero affected rows as a failure (holder may have already moved on)', () => {
    expect(src).toMatch(/already released/);
  });

  it('regression-pin: the old non-fatal "(non-fatal)" swallow on the SESSION release is gone', () => {
    // the audit write is intentionally non-fatal; the SESSION release must NOT be.
    const sessionIdx = src.indexOf("from('claude_sessions')");
    const sessionBlock = src.slice(sessionIdx, sessionIdx + 700);
    expect(sessionBlock).not.toMatch(/release for \$\{claimedSessionId\.slice\(0, 8\)\} failed \(non-fatal\)/);
  });
});
