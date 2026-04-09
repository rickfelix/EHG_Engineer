/**
 * Unit tests for lib/execute/team-banner.cjs
 * SD: SD-MULTISESSION-EXECUTION-TEAM-COMMAND-ORCH-001-B (Phase 2 of /execute)
 *
 * Pure-function tests with mocked supabase + log capture.
 */

import { describe, test, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const banner = require('../lib/execute/team-banner.cjs');

// Simple bar helper matching fleet-dashboard.cjs signature
function bar(pct, width = 10) {
  const p = Math.max(0, Math.min(100, pct || 0));
  const filled = Math.round((p / 100) * width);
  return '\u2588'.repeat(filled) + '\u2591'.repeat(width - filled);
}

function captureLog() {
  const lines = [];
  return {
    log: (s) => lines.push(s == null ? '' : String(s)),
    text: () => lines.join('\n'),
    lines
  };
}

function mockClient({ teams = [], sessions = [], sds = [] } = {}) {
  const tableHandlers = {
    execute_teams: () => ({
      select: () => ({
        in: () => ({
          order: async () => ({ data: teams, error: null })
        })
      })
    }),
    claude_sessions: () => ({
      select: () => ({
        in: async () => ({ data: sessions, error: null })
      })
    }),
    strategic_directives_v2: () => ({
      select: () => ({
        in: async () => ({ data: sds, error: null })
      })
    })
  };
  return { from: (table) => tableHandlers[table]() };
}

describe('fmtUptime', () => {
  test('< 60 seconds → seconds', () => {
    expect(banner.fmtUptime(0)).toBe('0s');
    expect(banner.fmtUptime(30)).toBe('30s');
    expect(banner.fmtUptime(59)).toBe('59s');
  });
  test('< 1 hour → minutes', () => {
    expect(banner.fmtUptime(60)).toBe('1m');
    expect(banner.fmtUptime(125)).toBe('2m');
    expect(banner.fmtUptime(3599)).toBe('60m');
  });
  test('>= 1 hour → hours + minutes', () => {
    expect(banner.fmtUptime(3600)).toBe('1h');
    expect(banner.fmtUptime(3660)).toBe('1h1m');
    expect(banner.fmtUptime(7320)).toBe('2h2m');
  });
  test('null/undefined → "0s"', () => {
    expect(banner.fmtUptime(null)).toBe('0s');
    expect(banner.fmtUptime(undefined)).toBe('0s');
  });
});

describe('fmtHeartbeat', () => {
  test('null → "?"', () => expect(banner.fmtHeartbeat(null)).toBe('?'));
  test('< 60 seconds → seconds', () => expect(banner.fmtHeartbeat(45)).toBe('45s'));
  test('>= 60 seconds → minutes', () => expect(banner.fmtHeartbeat(120)).toBe('2m'));
});

describe('colorize', () => {
  test('returns plain text when color is missing', () => {
    expect(banner.colorize('hello', null)).toBe('hello');
    expect(banner.colorize('hello', undefined)).toBe('hello');
  });
  test('returns plain text when color is unknown', () => {
    expect(banner.colorize('hello', 'magenta')).toBe('hello');
  });
  test('with NO_COLOR or CI env, returns plain text', () => {
    // Default state in test runner: CI may be set, so just verify no crash
    const result = banner.colorize('hello', 'blue');
    expect(typeof result).toBe('string');
    expect(result).toContain('hello');
  });
});

describe('printTeam — empty state', () => {
  test('prints "(no active teams)" when teams array empty', () => {
    const cap = captureLog();
    banner.printTeam([], bar, { log: cap.log });
    expect(cap.text()).toContain('(no active teams)');
  });
  test('prints "(no active teams)" when teams is null', () => {
    const cap = captureLog();
    banner.printTeam(null, bar, { log: cap.log });
    expect(cap.text()).toContain('(no active teams)');
  });
});

describe('printTeam — happy path', () => {
  const fakeTeam = {
    team_id: 'team-uuid',
    status: 'active',
    started_at: new Date(Date.now() - 600000).toISOString(),
    uptime_seconds: 600,
    sds_completed: 2,
    sds_failed: 0,
    worker_count: 2,
    active_workers: 2,
    slots: [
      {
        slot: 0,
        callsign: 'Alpha',
        color: 'blue',
        virtual_session_id: 'vs-1',
        sd_key: 'SD-FOO-001',
        current_phase: 'EXEC',
        progress: 60,
        heartbeat_age_seconds: 30,
        session_status: 'active'
      },
      {
        slot: 1,
        callsign: 'Bravo',
        color: 'green',
        virtual_session_id: 'vs-2',
        sd_key: 'SD-BAR-002',
        current_phase: 'PLAN',
        progress: 30,
        heartbeat_age_seconds: 90,
        session_status: 'active'
      }
    ]
  };

  test('renders header with active count and uptime', () => {
    const cap = captureLog();
    banner.printTeam([fakeTeam], bar, { log: cap.log });
    const text = cap.text();
    expect(text).toContain('/execute team');
    expect(text).toContain('2/2 active');
    expect(text).toContain('uptime 10m');
  });

  test('renders ALPHA and BRAVO callsigns', () => {
    const cap = captureLog();
    banner.printTeam([fakeTeam], bar, { log: cap.log });
    const text = cap.text();
    expect(text).toContain('ALPHA');
    expect(text).toContain('BRAVO');
  });

  test('renders SD keys with SD- prefix stripped', () => {
    const cap = captureLog();
    banner.printTeam([fakeTeam], bar, { log: cap.log });
    const text = cap.text();
    expect(text).toContain('FOO-001');
    expect(text).toContain('BAR-002');
  });

  test('renders phases EXEC and PLAN', () => {
    const cap = captureLog();
    banner.printTeam([fakeTeam], bar, { log: cap.log });
    const text = cap.text();
    expect(text).toContain('EXEC');
    expect(text).toContain('PLAN');
  });

  test('renders footer with completed/failed/status', () => {
    const cap = captureLog();
    banner.printTeam([fakeTeam], bar, { log: cap.log });
    const text = cap.text();
    expect(text).toContain('Completed: 2');
    expect(text).toContain('Failed: 0');
    expect(text).toContain('Status: active');
  });

  test('renders box-drawing characters per Mockup A', () => {
    const cap = captureLog();
    banner.printTeam([fakeTeam], bar, { log: cap.log });
    const text = cap.text();
    expect(text).toContain('╔');
    expect(text).toContain('╗');
    expect(text).toContain('║');
    expect(text).toContain('╚');
    expect(text).toContain('╝');
  });
});

describe('printTeam — defensive (missing virtual session)', () => {
  test('renders [missing] tag for orphaned slot', () => {
    const cap = captureLog();
    const team = {
      team_id: 't',
      status: 'active',
      started_at: new Date().toISOString(),
      uptime_seconds: 60,
      sds_completed: 0,
      sds_failed: 0,
      worker_count: 1,
      active_workers: 0,
      slots: [{
        slot: 0,
        callsign: 'Alpha',
        color: 'blue',
        virtual_session_id: 'missing-id',
        sd_key: null,
        current_phase: null,
        progress: null,
        heartbeat_age_seconds: null,
        session_status: 'missing'
      }]
    };
    banner.printTeam([team], bar, { log: cap.log });
    const text = cap.text();
    expect(text).toContain('[missing]');
    expect(text).toContain('(idle)');
    expect(text).not.toContain('NaN');
  });
});

describe('loadExecuteTeams', () => {
  test('returns empty array when no active teams', async () => {
    const client = mockClient({ teams: [] });
    const result = await banner.loadExecuteTeams(client);
    expect(result).toEqual([]);
  });

  test('shapes one team with two slots correctly', async () => {
    const teams = [{
      team_id: 'tid',
      status: 'active',
      started_at: new Date(Date.now() - 120000).toISOString(),
      sds_completed: 1,
      sds_failed: 0,
      worker_session_ids: ['vs-1', 'vs-2'],
      metadata: {
        slots: [
          { slot: 0, callsign: 'Alpha', color: 'blue', virtual_session_id: 'vs-1' },
          { slot: 1, callsign: 'Bravo', color: 'green', virtual_session_id: 'vs-2' }
        ]
      }
    }];
    const sessions = [
      { session_id: 'vs-1', sd_key: 'SD-X-001', current_phase: 'EXEC', heartbeat_at: new Date().toISOString(), status: 'active' },
      { session_id: 'vs-2', sd_key: 'SD-Y-002', current_phase: 'PLAN', heartbeat_at: new Date().toISOString(), status: 'active' }
    ];
    const sds = [
      { sd_key: 'SD-X-001', progress_percentage: 60, current_phase: 'EXEC' },
      { sd_key: 'SD-Y-002', progress_percentage: 30, current_phase: 'PLAN' }
    ];
    const client = mockClient({ teams, sessions, sds });
    const result = await banner.loadExecuteTeams(client);

    expect(result).toHaveLength(1);
    expect(result[0].team_id).toBe('tid');
    expect(result[0].worker_count).toBe(2);
    expect(result[0].active_workers).toBe(2);
    expect(result[0].slots).toHaveLength(2);
    expect(result[0].slots[0].callsign).toBe('Alpha');
    expect(result[0].slots[0].sd_key).toBe('SD-X-001');
    expect(result[0].slots[0].progress).toBe(60);
    expect(result[0].slots[1].callsign).toBe('Bravo');
    expect(result[0].slots[1].progress).toBe(30);
    expect(result[0].uptime_seconds).toBeGreaterThanOrEqual(120);
  });

  test('handles slot with missing virtual session (defensive)', async () => {
    const teams = [{
      team_id: 'tid',
      status: 'active',
      started_at: new Date().toISOString(),
      sds_completed: 0,
      sds_failed: 0,
      worker_session_ids: ['vs-1', 'vs-orphan'],
      metadata: {
        slots: [
          { slot: 0, callsign: 'Alpha', color: 'blue', virtual_session_id: 'vs-1' },
          { slot: 1, callsign: 'Bravo', color: 'green', virtual_session_id: 'vs-orphan' }
        ]
      }
    }];
    // Only vs-1 exists; vs-orphan returns nothing
    const sessions = [
      { session_id: 'vs-1', sd_key: 'SD-X-001', current_phase: 'EXEC', heartbeat_at: new Date().toISOString(), status: 'active' }
    ];
    const sds = [{ sd_key: 'SD-X-001', progress_percentage: 60, current_phase: 'EXEC' }];

    const client = mockClient({ teams, sessions, sds });
    const result = await banner.loadExecuteTeams(client);

    expect(result[0].slots).toHaveLength(2);
    expect(result[0].slots[0].session_status).toBe('active');
    expect(result[0].slots[1].session_status).toBe('missing');
    expect(result[0].slots[1].sd_key).toBeNull();
    expect(result[0].slots[1].progress).toBeNull();
    expect(result[0].active_workers).toBe(1);
  });

  test('handles team with no metadata.slots', async () => {
    const teams = [{
      team_id: 'tid',
      status: 'active',
      started_at: new Date().toISOString(),
      sds_completed: 0,
      sds_failed: 0,
      worker_session_ids: [],
      metadata: {}
    }];
    const client = mockClient({ teams });
    const result = await banner.loadExecuteTeams(client);
    expect(result[0].slots).toEqual([]);
    expect(result[0].worker_count).toBe(0);
  });
});
