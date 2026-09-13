// QF-20260912-006: create-quick-fix.js auto-claimed the creating WORKER seat at mint time even
// when that seat already held a claim (an SD, or another open QF) -- QF-20260912-509's specimen:
// Alpha minted it while holding SD-LEO-FIX-POST-WRITE-HANG-001, the row landed claim-locked and
// invisible to every other seat's open-QF poll, and stayed that way for hours. This extends the
// QF-20260704-143 role-session unclaimed-queue behavior to a busy worker seat. shouldAutoClaimQf
// is the pure decision the fix hinges on -- unit-tested directly (fixture coverage per the QF's
// own fix-shape item c). The wiring around it is verified with static-pattern assertions, same
// convention as create-quick-fix-role-session-no-claim.test.js (avoids mocking the full Supabase
// chain for a top-level CLI script).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { shouldAutoClaimQf } from '../../../scripts/create-quick-fix.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(__dirname, '../../../scripts/create-quick-fix.js');

describe('shouldAutoClaimQf (QF-20260912-006 fix-shape item c fixtures)', () => {
  it('a worker already holding an SD/QF claim, no override: QF lands unclaimed', () => {
    expect(shouldAutoClaimQf({ isRoleSession: false, existingClaimKey: 'SD-LEO-FIX-POST-WRITE-HANG-001', claimOverride: false })).toBe(false);
    expect(shouldAutoClaimQf({ isRoleSession: false, existingClaimKey: 'QF-20260912-150', claimOverride: false })).toBe(false);
  });

  it('a free worker (no existing claim): QF is claimed, same as today', () => {
    expect(shouldAutoClaimQf({ isRoleSession: false, existingClaimKey: null, claimOverride: false })).toBe(true);
  });

  it('a role session (coordinator/Adam/Solomon): unchanged -- never auto-claims, even with --claim', () => {
    expect(shouldAutoClaimQf({ isRoleSession: true, existingClaimKey: null, claimOverride: false })).toBe(false);
    expect(shouldAutoClaimQf({ isRoleSession: true, existingClaimKey: null, claimOverride: true })).toBe(false);
  });

  it('a busy worker WITH the --claim override: claims anyway (the one explicit switch path)', () => {
    expect(shouldAutoClaimQf({ isRoleSession: false, existingClaimKey: 'SD-SOME-OTHER-001', claimOverride: true })).toBe(true);
  });
});

describe('QF-20260912-006: wiring -- the busy-seat check sits between the role check and the claim branch, --claim overrides via claim_sd', () => {
  const code = fs.readFileSync(SRC, 'utf8');

  const ROLE_CHECK_RE = /creatorMeta\.is_coordinator === true \|\| creatorMeta\.role === 'adam' \|\| creatorMeta\.role === 'solomon'/;
  const BUSY_CHECK_RE = /if \(!shouldAutoClaimQf\(\{\s*isRoleSession,\s*existingClaimKey,\s*claimOverride\s*\}\)\)/;
  const RPC_CLAIM_RE = /supabase\.rpc\(\s*['"]claim_sd['"]/;
  const RAW_UPDATE_RE = /\.update\(\{\s*claiming_session_id:\s*creatorSessionId/;

  it('queries the creator seat claude_sessions.sd_key and an open quick_fixes row it already claims', () => {
    expect(code).toMatch(/\.from\(\s*['"]claude_sessions['"]\s*\)\.select\(\s*['"]sd_key['"]/);
    expect(code).toMatch(/\.from\(\s*['"]quick_fixes['"]\s*\)\.select\(\s*['"]id['"]\s*\)\.eq\(\s*['"]claiming_session_id['"],\s*creatorSessionId\s*\)\.eq\(\s*['"]status['"],\s*['"]open['"]/);
  });

  it('the busy-seat decision runs after the role check and before the liveness fence / claim branch', () => {
    const roleM = code.match(ROLE_CHECK_RE);
    const busyM = code.match(BUSY_CHECK_RE);
    const rpcM = code.match(RPC_CLAIM_RE);
    const rawM = code.match(RAW_UPDATE_RE);
    expect(roleM?.index).toBeGreaterThanOrEqual(0);
    expect(busyM?.index).toBeGreaterThanOrEqual(0);
    expect(roleM.index).toBeLessThan(busyM.index);
    expect(busyM.index).toBeLessThan(rpcM.index);
    expect(busyM.index).toBeLessThan(rawM.index);
  });

  it('a busy-seat match returns early (printNextSteps, no claim/worktree) naming --claim as the override', () => {
    const busyCheckStart = code.search(BUSY_CHECK_RE);
    const nextChunk = code.slice(busyCheckStart, busyCheckStart + 600);
    expect(nextChunk).toMatch(/return printNextSteps\(qfId, false, null\)/);
    expect(nextChunk).toMatch(/queued unclaimed/);
    expect(nextChunk).toMatch(/--claim/);
  });

  it('the --claim override claims via the claim_sd RPC, never the raw update', () => {
    expect(code).toMatch(/arg === ['"]--claim['"]/);
    expect(code).toMatch(/options\.claimOverride = true/);
    expect(code).toMatch(RPC_CLAIM_RE);
    const rpcBlockStart = code.search(RPC_CLAIM_RE);
    const rpcBlockEnd = code.indexOf('} else {', rpcBlockStart);
    const rpcBlock = code.slice(rpcBlockStart, rpcBlockEnd);
    expect(rpcBlock).not.toMatch(RAW_UPDATE_RE);
  });
});
