/**
 * QF-20260905-317: the PRE-SEND Solomon-consult block (SD-LEO-INFRA-ADAM-PRE-SEND-001) used to run
 * BEFORE the alreadyAnswered dedup check, so a resend of an already-answered correlation still
 * inserted a fresh consult row on Solomon every attempt — measured as 4 consult rows on Solomon for
 * one intended ruling relay (session_coordination correlations e4f3c6a5, 7c707d6b, d2ddd42b,
 * 1e6975f5, 19:45:34-19:48:34Z on 2026-09-05). Fix: run dedup first, so a deduped resend returns
 * before ever reaching the consult call.
 *
 * SOURCE PIN, not a live run — same rationale as adam-advisory-target-role-order.test.js: main() is
 * not exported and require.main-guarded, so a full send cannot be exercised without mocking the
 * entire gate chain (out of this Tier-1 QF's scope). This pins the one structural fact the fix
 * depends on: the dedup check's call site precedes the consult block's call site, and neither is
 * duplicated.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = readFileSync(join(process.cwd(), 'scripts', 'adam-advisory.cjs'), 'utf8');

describe('QF-20260905-317: dedup check runs before the pre-send-consult block', () => {
  const dedupCallIdx = SRC.indexOf('if (replyTo && (await alreadyAnswered(supabase, replyTo,');
  const consultGateIdx = SRC.indexOf("if ((process.env.ADAM_PRE_SEND_CONSULT || 'on') !== 'off' && peerArg !== 'solomon')");

  it('both call sites exist exactly once (moved, not duplicated)', () => {
    expect(SRC.split('if (replyTo && (await alreadyAnswered(supabase, replyTo,').length - 1).toBe(1);
    expect(SRC.split("if ((process.env.ADAM_PRE_SEND_CONSULT || 'on') !== 'off' && peerArg !== 'solomon')").length - 1).toBe(1);
  });

  it('the dedup check precedes the pre-send-consult gate', () => {
    expect(dedupCallIdx).toBeGreaterThan(-1);
    expect(consultGateIdx).toBeGreaterThan(-1);
    expect(dedupCallIdx).toBeLessThan(consultGateIdx);
  });

  it('a deduped resend returns before the consult gate is ever reached (return sits between the two)', () => {
    const between = SRC.slice(dedupCallIdx, consultGateIdx);
    expect(between).toMatch(/return;/);
  });
});
