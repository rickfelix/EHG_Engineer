/**
 * Tests for Venture Research Service (CLI Port)
 * SD-LEO-FEAT-SERVICE-PORTS-001
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  verifyBackendConnection,
  createResearchSession,
  getResearchSession,
  listResearchSessions,
  pollResearchSession,
  getLatestResearchSession,
  createMockResearchSession,
  _internal,
} from '../../../lib/eva/services/venture-research.js';

// Save original fetch
const originalFetch = globalThis.fetch;

beforeEach(() => {
  vi.clearAllMocks();
  _internal.mockSessions.clear();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('verifyBackendConnection', () => {
  it('returns unavailable in mock mode', async () => {
    const result = await verifyBackendConnection({ useMock: true });
    expect(result.available).toBe(false);
    expect(result.error).toContain('Mock mode');
  });

  it('returns available when health check succeeds', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ status: 'ok' }),
    });

    const result = await verifyBackendConnection({ useMock: false });
    expect(result.available).toBe(true);
  });

  it('returns unavailable when health check fails', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      statusText: 'Service Unavailable',
    });

    const result = await verifyBackendConnection({ useMock: false });
    expect(result.available).toBe(false);
    expect(result.error).toContain('503');
  });

  it('returns unavailable on network error', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('fetch failed'));

    const result = await verifyBackendConnection({ useMock: false });
    expect(result.available).toBe(false);
    expect(result.error).toContain('fetch failed');
  });
});

describe('createResearchSession', () => {
  it('returns mock session in mock mode', async () => {
    const result = await createResearchSession(
      { venture_id: 'v-1', session_type: 'quick' },
      { useMock: true, logger: { info: vi.fn() } },
    );

    expect(result.id).toMatch(/^mock-/);
    expect(result.venture_id).toBe('v-1');
    expect(result.session_type).toBe('quick');
    expect(result.status).toBe('pending');
    expect(result.progress).toBe(0);
  });

  it('calls API and returns session data', async () => {
    const mockSession = { id: 'session-1', status: 'pending', progress: 0 };
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(mockSession),
    });

    const result = await createResearchSession(
      { venture_id: 'v-1', session_type: 'deep' },
      { useMock: false, apiUrl: 'http://test:8000/api/research' },
    );

    expect(result).toEqual(mockSession);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'http://test:8000/api/research/sessions',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('throws on 501 (not implemented)', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 501,
    });

    await expect(
      createResearchSession(
        { venture_id: 'v-1', session_type: 'quick' },
        { useMock: false },
      ),
    ).rejects.toThrow('not fully implemented');
  });
});

describe('getResearchSession', () => {
  it('returns simulated progress for mock sessions', async () => {
    const mockSession = createMockResearchSession({ venture_id: 'v-1', session_type: 'quick' });

    // Immediately checking should show low progress
    const result = await getResearchSession(mockSession.id);
    expect(result.id).toBe(mockSession.id);
    expect(result.progress).toBeGreaterThanOrEqual(0);
    expect(result.activity_log).toBeDefined();
  });

  it('fetches from API for real sessions', async () => {
    const mockData = { id: 'real-1', status: 'running', progress: 50 };
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockData),
    });

    const result = await getResearchSession('real-1', {
      apiUrl: 'http://test:8000/api/research',
    });

    expect(result).toEqual(mockData);
  });

  it('normalizes results_summary from backend', async () => {
    const rawData = {
      id: 'real-1',
      status: 'completed',
      results_summary: {
        market_sizing: { market_size: { tam: 100, sam: 50, som: 10 }, confidence: 0.9, sources: [] },
        competitive: { competitive_metrics: { competitive_intensity: 'HIGH' }, competitors: [], moat_opportunities: [] },
      },
    };
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(rawData),
    });

    const result = await getResearchSession('real-1');
    expect(result.results_summary.market_sizing.tam).toBe(100);
    expect(result.results_summary.competitive.intensity).toBe(9); // HIGH maps to 9
  });
});

describe('listResearchSessions', () => {
  it('fetches sessions from API', async () => {
    const mockList = [{ id: 's-1' }, { id: 's-2' }];
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockList),
    });

    const result = await listResearchSessions('v-1', { apiUrl: 'http://test:8000/api/research' });
    expect(result).toHaveLength(2);
  });
});

describe('getLatestResearchSession', () => {
  it('returns null when no sessions exist', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([]),
    });

    const result = await getLatestResearchSession('v-1');
    expect(result).toBeNull();
  });

  it('returns most recent session sorted by created_at', async () => {
    const sessions = [
      { id: 'older', created_at: '2026-01-01T00:00:00Z' },
      { id: 'newer', created_at: '2026-02-01T00:00:00Z' },
    ];
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(sessions),
    });

    const result = await getLatestResearchSession('v-1');
    expect(result.id).toBe('newer');
  });
});

describe('pollResearchSession', () => {
  it('returns completed session immediately', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: 's-1', status: 'completed', progress: 100 }),
    });

    const result = await pollResearchSession('s-1', {
      interval: 10,
      maxAttempts: 3,
    });

    expect(result.status).toBe('completed');
  });

  it('throws on failed session', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: 's-1', status: 'failed', progress: 0 }),
    });

    await expect(
      pollResearchSession('s-1', { interval: 10, maxAttempts: 3 }),
    ).rejects.toThrow('Research session failed');
  });

  it('calls onProgress callback', async () => {
    let callCount = 0;
    globalThis.fetch = vi.fn().mockImplementation(() => {
      callCount++;
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          id: 's-1',
          status: callCount >= 2 ? 'completed' : 'running',
          progress: callCount >= 2 ? 100 : 50,
        }),
      });
    });

    const onProgress = vi.fn();
    await pollResearchSession('s-1', { interval: 10, maxAttempts: 5, onProgress });

    expect(onProgress).toHaveBeenCalled();
  });
});

describe('normalizeResearchResults (internal)', () => {
  const { normalizeResearchResults } = _internal;

  it('returns empty object for null/undefined input', () => {
    expect(normalizeResearchResults(null)).toEqual({});
    expect(normalizeResearchResults(undefined)).toEqual({});
  });

  it('flattens nested market_size', () => {
    const raw = { market_sizing: { market_size: { tam: 100, sam: 50, som: 10 }, confidence: 0.8, sources: ['a'] } };
    const result = normalizeResearchResults(raw);
    expect(result.market_sizing.tam).toBe(100);
    expect(result.market_sizing.confidence).toBe(0.8);
  });

  it('maps string intensity to number', () => {
    const raw = { competitive: { competitive_metrics: { competitive_intensity: 'LOW' }, competitors: [], moat_opportunities: [] } };
    const result = normalizeResearchResults(raw);
    expect(result.competitive.intensity).toBe(3);
  });

  it('extracts risks from object format', () => {
    const raw = { strategic_fit: { risks: { overall_risk: 'High', resource_risk: 'Medium' }, opportunities: [] } };
    const result = normalizeResearchResults(raw);
    expect(result.strategic_fit.risks).toContain('Overall risk: High');
    expect(result.strategic_fit.risks).toContain('Resource risk: Medium');
  });
});

describe('createMockResearchSession', () => {
  it('creates a session with mock- prefix', () => {
    const session = createMockResearchSession({ venture_id: 'v-1', session_type: 'quick' });
    expect(session.id).toMatch(/^mock-/);
    expect(session.results_summary).toBeDefined();
    expect(session.results_summary.market_sizing).toBeDefined();
  });
});
