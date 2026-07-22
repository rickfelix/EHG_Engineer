/**
 * SD-LEO-INFRA-LEO-LAUNCHER-SHELL-001-A — fleet panel route unit tests.
 * Calls the exported handler directly with mock req/res (no supertest, no live DB) --
 * the injected req.app.locals.supabase seam mirrors server/routes/ventures.js's own pattern.
 */
import { describe, it, expect, vi } from 'vitest';

// loadStore is mocked to an empty store (no FS); buildNamedAccountChips is the REAL pure
// function (via importActual) so the route genuinely renders exactly 3 named chips.
vi.mock('../../../lib/fleet/account-capacity-gauge.cjs', async (importActual) => {
  const actual = await importActual();
  return { ...actual, loadStore: vi.fn(() => ({})) };
});

const { getFleetPanel } = await import('../../../server/routes/fleet-panel.js');

function mockRes() {
  const res = {};
  res.json = vi.fn(() => res);
  return res;
}

function mockReq(supabase) {
  return { app: { locals: { supabase } } };
}

describe('GET /api/fleet-panel', () => {
  it('returns structured sessions/accountChips/attentionStrip for populated sessions', async () => {
    const supabase = {
      from: vi.fn((table) => {
        if (table === 'v_active_sessions') {
          return {
            select: () => ({
              order: () => Promise.resolve({
                data: [{
                  session_id: 'abc-123',
                  sd_key: 'SD-TEST-001',
                  computed_status: 'active',
                  heartbeat_age_human: '5s ago',
                  metadata: {
                    fleet_identity: { callsign: 'Golf-3', color: 'blue', role: 'worker' },
                    model: 'sonnet',
                    effort: 'xhigh',
                  },
                }],
                error: null,
              }),
            }),
          };
        }
        if (table === 'claude_sessions') {
          return { select: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }) };
        }
        return { select: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }) };
      }),
    };

    const req = mockReq(supabase);
    const res = mockRes();
    await getFleetPanel(req, res);

    expect(res.json).toHaveBeenCalledTimes(1);
    const payload = res.json.mock.calls[0][0];
    expect(payload.sessions).toHaveLength(1);
    expect(payload.sessions[0]).toMatchObject({
      session_id: 'abc-123',
      callsign: 'Golf-3',
      color: 'blue',
      role: 'worker',
      model_effort: 'sonnet/xhigh',
      status: 'active',
    });
    // FR-1/FR-2: exactly 3 named-account chips render (empty store → all wkPct null).
    expect(Array.isArray(payload.accountChips)).toBe(true);
    expect(payload.accountChips).toHaveLength(3);
    expect(payload.accountChips.map((c) => c.name)).toEqual(['Deep Soul', 'Rick Felix', 'CodeStreet']);
    expect(payload.accountChips.every((c) => c.wkPct === null)).toBe(true);
    expect(Array.isArray(payload.attentionStrip)).toBe(true);
  });

  it('degrades missing model/effort metadata to a placeholder, never a crash', async () => {
    const supabase = {
      from: vi.fn((table) => {
        if (table === 'v_active_sessions') {
          return {
            select: () => ({
              order: () => Promise.resolve({
                data: [{
                  session_id: 'no-meta-session',
                  sd_key: null,
                  computed_status: 'idle',
                  heartbeat_age_human: '1m ago',
                  metadata: {},
                }],
                error: null,
              }),
            }),
          };
        }
        return { select: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }) };
      }),
    };

    const req = mockReq(supabase);
    const res = mockRes();
    await getFleetPanel(req, res);

    const payload = res.json.mock.calls[0][0];
    expect(payload.sessions[0].model_effort).toBe('--/--');
    expect(payload.sessions[0].callsign).toBeNull();
  });

  it('returns an empty attentionStrip array (not an error) when zero sessions are flagged', async () => {
    const supabase = {
      from: vi.fn((table) => {
        if (table === 'v_active_sessions') {
          return { select: () => ({ order: () => Promise.resolve({ data: [], error: null }) }) };
        }
        if (table === 'claude_sessions') {
          return { select: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }) };
        }
        return { select: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }) };
      }),
    };

    const req = mockReq(supabase);
    const res = mockRes();
    await getFleetPanel(req, res);

    const payload = res.json.mock.calls[0][0];
    expect(payload.attentionStrip).toEqual([]);
    expect(payload.sessions).toEqual([]);
  });
});
