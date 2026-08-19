/**
 * QF-20260808-127 — the fleet-dashboard heartbeat-aging alert (AGING signal + STALE_WARNING
 * coordination message) previously flagged any session past the staleness threshold using only
 * v_active_sessions.sd_key (a claude_sessions-side mirror), with no cross-check against the
 * AUTHORITATIVE claim surface (strategic_directives_v2.claiming_session_id). Measured incident:
 * a released claim (mirror lagged) still read as "has not heartbeated on <SD>" 45min later.
 * selectAgingWorkers() now cross-checks ownership via an injected isClaimedByFn before including
 * a session in the aging set.
 */
import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { selectAgingWorkers } = require('../../scripts/fleet-dashboard.cjs');

const session = (overrides) => ({
  session_id: 's1',
  tty: 'tty1',
  sd_key: 'SD-LEO-INFRA-EXAMPLE-001',
  heartbeat_age_seconds: 200,
  heartbeat_age_human: '3m ago',
  ...overrides,
});

describe('selectAgingWorkers() — authoritative claim cross-check (QF-20260808-127)', () => {
  it('excludes a session below the stale-warning threshold regardless of claim state', async () => {
    const isClaimedByFn = vi.fn().mockResolvedValue(true);
    const out = await selectAgingWorkers([session({ heartbeat_age_seconds: 50 })], 180, isClaimedByFn);
    expect(out).toEqual([]);
    expect(isClaimedByFn).not.toHaveBeenCalled();
  });

  it('includes a session past threshold that still authoritatively holds the SD claim', async () => {
    const isClaimedByFn = vi.fn().mockResolvedValue(true);
    const s = session();
    const out = await selectAgingWorkers([s], 180, isClaimedByFn);
    expect(out).toEqual([s]);
    expect(isClaimedByFn).toHaveBeenCalledWith('SD-LEO-INFRA-EXAMPLE-001', 's1');
  });

  it('EXCLUDES a session past threshold whose SD claim was released (mirror stale, authoritative surface clear)', async () => {
    const isClaimedByFn = vi.fn().mockResolvedValue(false);
    const out = await selectAgingWorkers([session()], 180, isClaimedByFn);
    expect(out).toEqual([]);
  });

  it('does not guard a QF-id session (out of this QF measured scope) — included without an ownership call', async () => {
    const isClaimedByFn = vi.fn().mockResolvedValue(false);
    const s = session({ sd_key: 'QF-20260808-127' });
    const out = await selectAgingWorkers([s], 180, isClaimedByFn);
    expect(out).toEqual([s]);
    expect(isClaimedByFn).not.toHaveBeenCalled();
  });

  it('includes a session with a null sd_key without invoking the ownership check', async () => {
    const isClaimedByFn = vi.fn();
    const s = session({ sd_key: null });
    const out = await selectAgingWorkers([s], 180, isClaimedByFn);
    expect(out).toEqual([s]);
    expect(isClaimedByFn).not.toHaveBeenCalled();
  });
});
