/**
 * Unit tests for Stitch Adapter
 * SD-LEO-FIX-GOOGLE-STITCH-PIPELINE-001-C
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Supabase
const mockMaybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
const mockSingle = vi.fn();
const mockLimit = vi.fn(() => ({ single: mockSingle }));
const mockEq3 = vi.fn(() => ({ maybeSingle: mockMaybeSingle, single: mockSingle }));
const mockEq2 = vi.fn(() => ({ eq: mockEq3, maybeSingle: mockMaybeSingle, single: mockSingle }));
const mockEq1 = vi.fn(() => ({ eq: mockEq2 }));
const mockSelect = vi.fn(() => ({ limit: mockLimit, eq: mockEq1 }));
const mockInsert = vi.fn().mockResolvedValue({ error: null });
const mockFrom = vi.fn(() => ({ select: mockSelect, insert: mockInsert }));

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ from: mockFrom })),
}));
vi.mock('dotenv', () => ({ default: { config: vi.fn() }, config: vi.fn() }));

process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';

const { provision, exportScreens, tasteGateProvision, healthCheck, logStitchEvent, setClientLoader } = await import('../../../../lib/eva/bridge/stitch-adapter.js');

describe('stitch-adapter', () => {
  const mockClient = {
    createProject: vi.fn(),
    listScreens: vi.fn(),
    exportScreenHtml: vi.fn(),
    healthCheck: vi.fn(),
    getGenerationBudget: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    setClientLoader(async () => mockClient);
    // Default: no existing project (idempotency check returns null)
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });
  });

  function setStitchEnabled(enabled) {
    mockSingle.mockResolvedValue({
      data: { taste_gate_config: { stitch_enabled: enabled } },
    });
  }

  describe('logStitchEvent', () => {
    it('logs success events to console.log', () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const entry = logStitchEvent({ event: 'test', ventureId: 'v1', stage: 15, status: 'success' });
      expect(entry.event).toBe('test');
      expect(entry.venture_id).toBe('v1');
      expect(entry.status).toBe('success');
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('"event":"test"'));
      spy.mockRestore();
    });

    it('logs error events to console.error', () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const entry = logStitchEvent({ event: 'test', ventureId: 'v1', stage: 15, status: 'error', error: 'fail' });
      expect(entry.error).toBe('fail');
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('"status":"error"'));
      spy.mockRestore();
    });
  });

  describe('provision', () => {
    it('returns unavailable when stitch is disabled', async () => {
      setStitchEnabled(false);
      const result = await provision('v1', {}, {});
      expect(result.status).toBe('unavailable');
      expect(result.reason).toBe('stitch_disabled');
      expect(mockClient.createProject).not.toHaveBeenCalled();
    });

    it('calls createProject and returns success when enabled', async () => {
      setStitchEnabled(true);
      mockClient.createProject.mockResolvedValue({ project_id: 'p1', url: 'http://stitch/p1' });
      const result = await provision('v1', {}, {}, { ventureName: 'Test' });
      expect(result.status).toBe('success');
      expect(result.project_id).toBe('p1');
      expect(mockClient.createProject).toHaveBeenCalledWith({ name: 'Test', ventureId: 'v1' });
    });

    it('returns unavailable on createProject failure', async () => {
      setStitchEnabled(true);
      mockClient.createProject.mockRejectedValue(new Error('API down'));
      const result = await provision('v1', {}, {});
      expect(result.status).toBe('unavailable');
      expect(result.reason).toBe('provision_failed');
      expect(result.error).toBe('API down');
    });
  });

  describe('exportScreens', () => {
    it('returns unavailable when stitch is disabled', async () => {
      setStitchEnabled(false);
      const result = await exportScreens('v1', 'p1');
      expect(result.status).toBe('unavailable');
    });

    it('returns unavailable when no screens exist', async () => {
      setStitchEnabled(true);
      mockClient.listScreens.mockResolvedValue([]);
      const result = await exportScreens('v1', 'p1');
      expect(result.status).toBe('unavailable');
      expect(result.reason).toBe('no_screens');
    });

    it('exports screens successfully', async () => {
      setStitchEnabled(true);
      mockClient.listScreens.mockResolvedValue([{ screen_id: 's1', name: 'Home' }]);
      mockClient.exportScreenHtml.mockResolvedValue('<html>test</html>');
      const result = await exportScreens('v1', 'p1');
      expect(result.status).toBe('success');
      expect(result.screens).toHaveLength(1);
    });
  });

  describe('tasteGateProvision', () => {
    it('returns unavailable when stitch is disabled', async () => {
      setStitchEnabled(false);
      const result = await tasteGateProvision('v1', {}, {});
      expect(result.status).toBe('unavailable');
    });

    it('provisions successfully when enabled', async () => {
      setStitchEnabled(true);
      mockClient.createProject.mockResolvedValue({ project_id: 'p2', url: 'http://stitch/p2' });
      const result = await tasteGateProvision('v1', {}, {}, { ventureName: 'V', stage: 12 });
      expect(result.status).toBe('success');
    });
  });

  describe('healthCheck', () => {
    it('returns unhealthy when stitch is disabled', async () => {
      setStitchEnabled(false);
      const result = await healthCheck();
      expect(result.healthy).toBe(false);
      expect(result.reason).toBe('stitch_disabled');
    });
  });
});
