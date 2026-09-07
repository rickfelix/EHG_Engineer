// QF-20260906-231 — /claim release could strip ANOTHER seat's claim: resolveOwnSession
// strategy 4 (heartbeat fallback, no session filter) was called by claim.md's release/switch
// blocks and by claim-command.js's claimStatus() WITHOUT requireDeterministic:true, so when
// env/marker/terminal all missed, the resolved "own session" was silently whichever seat
// heartbeated most recently. Fix: pass requireDeterministic:true everywhere a claim decision
// (mutating or displayed) is made, so an undeterminable identity REFUSES instead of guessing.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

vi.mock('../../../lib/resolve-own-session.js', () => ({ resolveOwnSession: vi.fn() }));
vi.mock('../../../lib/supabase-client.js', () => ({ createSupabaseServiceClient: vi.fn(() => ({})) }));

const { resolveOwnSession } = await import('../../../lib/resolve-own-session.js');
const { claimStatus } = await import('../../../lib/commands/claim-command.js');

describe('claimStatus (QF-20260906-231) — fails closed on an undeterminable identity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('requests requireDeterministic:true from resolveOwnSession', async () => {
    resolveOwnSession.mockResolvedValue({ data: null, source: 'no_deterministic_identity' });
    await claimStatus();
    expect(resolveOwnSession).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ requireDeterministic: true })
    );
  });

  it('REGRESSION: never prints another session\'s claim status when identity is undeterminable', async () => {
    // Simulates the exact bug report: env unset, marker absent, a fresher foreign session
    // present — with requireDeterministic:true, resolveOwnSession now returns data:null
    // instead of the foreign session's row.
    resolveOwnSession.mockResolvedValue({ data: null, source: 'no_deterministic_identity' });
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await claimStatus();
    const output = logSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(output).not.toMatch(/Current Session Claim Status/);
    expect(output).toMatch(/identity deterministically/);
    logSpy.mockRestore();
  });

  it('still displays status normally for a deterministically-resolved session', async () => {
    resolveOwnSession.mockResolvedValue({
      data: { session_id: 'sess-real', sd_key: 'SD-REAL-001', status: 'active', track: 'A' },
      source: 'env_var',
    });
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await claimStatus();
    const output = logSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(output).toMatch(/Current Session Claim Status/);
    expect(output).toMatch(/sess-real/);
    logSpy.mockRestore();
  });

  it('surfaces conflicts/demotedMatches instead of silently returning nothing', async () => {
    resolveOwnSession.mockResolvedValue({
      data: null,
      source: 'ambiguous',
      conflicts: [{ session_id: 'sess-a' }, { session_id: 'sess-b' }],
    });
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await claimStatus();
    const output = logSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(output).toMatch(/Conflicts/);
    expect(output).toMatch(/sess-a/);
    logSpy.mockRestore();
  });
});

describe('.claude/skills/claim.md (QF-20260906-231) — source-pin', () => {
  const src = fs.readFileSync(path.join(REPO_ROOT, '.claude/skills/claim.md'), 'utf8');

  it('the /claim switch release snippet requests requireDeterministic:true', () => {
    const switchSection = src.slice(src.indexOf('### /claim switch'), src.indexOf('### /claim release'));
    expect(switchSection).toMatch(/requireDeterministic:\s*true/);
    expect(switchSection).toMatch(/if \(!data\)/);
  });

  it('the /claim release own-claim snippet requests requireDeterministic:true', () => {
    const releaseSection = src.slice(src.indexOf('### /claim release'));
    expect(releaseSection).toMatch(/requireDeterministic:\s*true/);
    expect(releaseSection).toMatch(/if \(!data\)/);
  });

  it('REGRESSION: neither snippet calls releaseClaim without first checking the resolved data', () => {
    // The bug was `if (data) await releaseClaim(...)` with no requireDeterministic — a truthy
    // `data` could still be the WRONG (foreign) session. Both blocks must gate on requireDeterministic.
    const occurrences = src.match(/requireDeterministic:\s*true/g) || [];
    expect(occurrences.length).toBeGreaterThanOrEqual(2);
  });
});
