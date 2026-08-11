/**
 * QF-20260728-468 — --advisory must not be actioned-and-replied-to-Adam when its own sender is a
 * confirmed NON-ADAM role (e.g. Solomon). Two independent legs used to be uncorrelated: the reply
 * always targets the CURRENT live Adam (resolveAdamReplyTarget, FR-1), and actioned_at is always
 * stamped on whatever row --advisory names, regardless of who sent it. Passing a Solomon advisory id
 * therefore delivered correctly to Adam while silently retiring the Solomon row unread — reproduced
 * 2026-07-28 (827b6a2e passed instead of 472027ac).
 *
 * The fix must REFUSE (not warn) on a confirmed cross-role sender, while leaving two adjacent,
 * already-shipped behaviours untouched:
 *   - FR-1's retargeting: a STALE Adam sender_session legitimately differs from the resolved live
 *     Adam target, and that must still be allowed through (checking ROLE, not literal id equality).
 *   - QF-20260727-380 (B): a null/non-UUID sender (cron-emitted Adam advisories) must still be
 *     repliable, unblocked by this guard.
 *
 * deliverReplyOrExit is not exported (it needs a live DB/env), so — matching the existing
 * coordinator-ack-adam-reply-ordering.test.js convention — this asserts the guard's placement and
 * subject in the source rather than shelling out to the live CLI.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(path.resolve(__dirname, '../../scripts/coordinator-ack-adam.cjs'), 'utf8');

const idx = (needle) => SRC.indexOf(needle);
const helper = SRC.slice(idx('async function deliverReplyOrExit'), idx('async function main()'));

describe('QF-20260728-468: refuse a cross-role --advisory sender before delivering/stamping', () => {
  it('checks the sender role BEFORE resolving the reply target and BEFORE any delivery', () => {
    const guardIdx = helper.indexOf("senderRole !== 'adam'");
    const resolveIdx = helper.indexOf('resolveAdamReplyTarget');
    const sendIdx = helper.indexOf('sendCoordinatorReply(supabase');
    expect(guardIdx).toBeGreaterThan(-1);
    expect(resolveIdx).toBeGreaterThan(-1);
    expect(sendIdx).toBeGreaterThan(-1);
    expect(guardIdx).toBeLessThan(resolveIdx);
    expect(guardIdx).toBeLessThan(sendIdx);
  });

  it('refuses (process.exit) rather than merely warning, on a confirmed non-adam sender', () => {
    const block = helper.slice(helper.indexOf("senderRole !== 'adam'"), helper.indexOf("senderRole !== 'adam'") + 700);
    expect(block).toMatch(/console\.error\(/);
    expect(block).toMatch(/process\.exit\(1\)/);
    expect(block).not.toMatch(/console\.warn/);
  });

  it('checks ROLE, not literal id equality against the resolved target — so FR-1 retargeting still works', () => {
    // A stale-but-real Adam sender_session must NOT trip this guard just because it differs from
    // the live-Adam target resolved a few lines later. Only a role fetched from claude_sessions
    // that resolves to something OTHER than 'adam' may refuse.
    expect(helper).toMatch(/senderRow\s*&&\s*senderRow\.metadata\s*&&\s*senderRow\.metadata\.role/);
    expect(helper).not.toMatch(/originator\s*!==\s*adamSession/);
  });

  it('is gated on isFullUuid(originator) — a null/non-UUID sender is unchanged (QF-20260727-380 (B))', () => {
    const guardGateIdx = helper.indexOf('if (isFullUuid(originator)) {');
    const roleCheckIdx = helper.indexOf("senderRole !== 'adam'");
    expect(guardGateIdx).toBeGreaterThan(-1);
    expect(guardGateIdx).toBeLessThan(roleCheckIdx);
  });

  it('fails open when the role lookup finds no row (no destructured .error branch to force a refusal)', () => {
    const lookupIdx = helper.indexOf("from('claude_sessions')");
    expect(lookupIdx).toBeGreaterThan(-1);
    // senderRole is derived via `senderRow && senderRow.metadata && senderRow.metadata.role`, which
    // is falsy (undefined) for a missing row/error — the `senderRole && senderRole !== 'adam'` guard
    // then short-circuits false, i.e. allowed through, not refused.
    expect(helper).toMatch(/const senderRole = senderRow && senderRow\.metadata && senderRow\.metadata\.role;/);
  });

  it('names both parties in the refusal message: the wrong-role sender and its id', () => {
    const block = helper.slice(helper.indexOf("senderRole !== 'adam'"), helper.indexOf("senderRole !== 'adam'") + 500);
    expect(block).toMatch(/\$\{senderRole\}/);
    expect(block).toMatch(/\$\{originator\}/);
  });
});
