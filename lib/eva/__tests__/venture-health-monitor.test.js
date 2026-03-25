import { describe, it, expect, vi, beforeEach } from 'vitest';
import { checkVentureHealth, monitorVenture, buildHistoryEntry, resetAllStates } from '../bridge/venture-health-monitor.js';
import { processHealthResult, getVentureState, CONSECUTIVE_FAILURE_THRESHOLD } from '../bridge/health-alert-manager.js';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

beforeEach(() => {
  mockFetch.mockReset();
  resetAllStates();
});

describe('checkVentureHealth', () => {
  it('returns healthy for 200 response', async () => {
    mockFetch.mockResolvedValueOnce({ status: 200, statusText: 'OK' });
    const result = await checkVentureHealth('https://app.example.com');
    expect(result.healthy).toBe(true);
    expect(result.statusCode).toBe(200);
    expect(result.responseTime).toBeGreaterThanOrEqual(0);
    expect(result.error).toBeNull();
  });

  it('returns unhealthy for 500 response', async () => {
    mockFetch.mockResolvedValueOnce({ status: 500, statusText: 'Internal Server Error' });
    const result = await checkVentureHealth('https://app.example.com');
    expect(result.healthy).toBe(false);
    expect(result.statusCode).toBe(500);
    expect(result.error).toContain('500');
  });

  it('returns unhealthy on timeout', async () => {
    mockFetch.mockImplementationOnce(() => new Promise((_, reject) => {
      const err = new Error('aborted');
      err.name = 'AbortError';
      setTimeout(() => reject(err), 10);
    }));
    const result = await checkVentureHealth('https://app.example.com', 5);
    expect(result.healthy).toBe(false);
    expect(result.statusCode).toBeNull();
    expect(result.error).toContain('Timeout');
  });

  it('returns unhealthy on network error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    const result = await checkVentureHealth('https://app.example.com');
    expect(result.healthy).toBe(false);
    expect(result.error).toContain('ECONNREFUSED');
  });

  it('treats 301 redirect as healthy', async () => {
    mockFetch.mockResolvedValueOnce({ status: 301, statusText: 'Moved' });
    const result = await checkVentureHealth('https://app.example.com');
    expect(result.healthy).toBe(true);
  });
});

describe('processHealthResult (alert state machine)', () => {
  it('no alert on first healthy check', () => {
    const result = processHealthResult('v1', true);
    expect(result.alert).toBeNull();
    expect(result.createSD).toBe(false);
  });

  it('alerts on first failure (state transition)', () => {
    processHealthResult('v2', true); // establish healthy
    const result = processHealthResult('v2', false);
    expect(result.alert).toBe('failure');
    expect(result.stateTransition).toContain('unhealthy');
  });

  it('does NOT alert on repeated failures (deduplication)', () => {
    processHealthResult('v3', true);
    processHealthResult('v3', false); // first failure -> alert
    const result = processHealthResult('v3', false); // second failure -> no alert
    expect(result.alert).toBeNull();
    expect(result.consecutiveFailures).toBe(2);
  });

  it('alerts on recovery', () => {
    processHealthResult('v4', true);
    processHealthResult('v4', false); // go unhealthy
    const result = processHealthResult('v4', true); // recover
    expect(result.alert).toBe('recovery');
    expect(result.stateTransition).toBe('unhealthy -> healthy');
  });

  it('creates SD after 3 consecutive failures', () => {
    processHealthResult('v5', true);
    processHealthResult('v5', false); // 1
    processHealthResult('v5', false); // 2
    const result = processHealthResult('v5', false); // 3
    expect(result.createSD).toBe(true);
    expect(result.consecutiveFailures).toBe(3);
  });

  it('does NOT create duplicate SDs', () => {
    processHealthResult('v6', true);
    processHealthResult('v6', false); // 1
    processHealthResult('v6', false); // 2
    processHealthResult('v6', false); // 3 -> createSD=true
    const result = processHealthResult('v6', false); // 4 -> createSD=false
    expect(result.createSD).toBe(false);
  });

  it('resets consecutive failures on recovery', () => {
    processHealthResult('v7', false);
    processHealthResult('v7', false);
    processHealthResult('v7', true); // recover
    const state = getVentureState('v7');
    expect(state.consecutiveFailures).toBe(0);
  });

  it('exports CONSECUTIVE_FAILURE_THRESHOLD', () => {
    expect(CONSECUTIVE_FAILURE_THRESHOLD).toBe(3);
  });
});

describe('monitorVenture', () => {
  it('calls onAlert callback on failure', async () => {
    mockFetch.mockResolvedValueOnce({ status: 200, statusText: 'OK' });
    await monitorVenture('v-cb1', 'https://ok.example.com'); // establish healthy

    mockFetch.mockResolvedValueOnce({ status: 500, statusText: 'Error' });
    const onAlert = vi.fn();
    await monitorVenture('v-cb1', 'https://ok.example.com', { onAlert });
    expect(onAlert).toHaveBeenCalledOnce();
    expect(onAlert.mock.calls[0][1]).toBe('failure');
  });

  it('calls onCreateSD after threshold', async () => {
    mockFetch.mockResolvedValue({ status: 500, statusText: 'Error' });
    const onCreateSD = vi.fn();
    // Need initial healthy state
    mockFetch.mockResolvedValueOnce({ status: 200, statusText: 'OK' });
    await monitorVenture('v-cb2', 'https://down.example.com');
    mockFetch.mockResolvedValue({ status: 500, statusText: 'Error' });
    await monitorVenture('v-cb2', 'https://down.example.com', { onCreateSD });
    await monitorVenture('v-cb2', 'https://down.example.com', { onCreateSD });
    await monitorVenture('v-cb2', 'https://down.example.com', { onCreateSD });
    expect(onCreateSD).toHaveBeenCalledOnce();
  });
});

describe('buildHistoryEntry', () => {
  it('creates structured history entry', () => {
    const entry = buildHistoryEntry(
      { healthy: true, statusCode: 200, responseTime: 150, error: null },
      { alert: null, consecutiveFailures: 0 }
    );
    expect(entry.timestamp).toBeTruthy();
    expect(entry.healthy).toBe(true);
    expect(entry.statusCode).toBe(200);
    expect(entry.responseTime).toBe(150);
    expect(entry.alert).toBeNull();
  });
});
