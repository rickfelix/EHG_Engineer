/**
 * Unit tests for AUTO-PROCEED Resolver
 *
 * Part of SD-LEO-ENH-AUTO-PROCEED-001-02
 *
 * Tests the precedence order: CLI > env > session > global > default
 */

import { vi, describe, it, expect, afterEach } from 'vitest';

// Mock resolveOwnSession before importing the module under test.
// The production code now uses resolveOwnSession() instead of direct Supabase
// chain queries (from().select().eq().order().limit().single()).
const mockResolveOwnSession = vi.fn();
vi.mock('../../../lib/resolve-own-session.js', () => ({
  resolveOwnSession: (...args) => mockResolveOwnSession(...args),
  getOwnSessionId: vi.fn().mockReturnValue('test-session-mock')
}));

// Also mock terminal-identity to prevent filesystem access
vi.mock('../../../lib/terminal-identity.js', () => ({
  getTerminalId: vi.fn().mockReturnValue('win-cc-test-99999')
}));

import {
  parseCliFlags,
  parseEnvVar,
  readFromSession,
  writeToSession,
  resolveAutoProceed,
  createHandoffMetadata,
  getChainOrchestrators,
  setChainOrchestrators,
  RESOLUTION_SOURCES,
  DEFAULT_AUTO_PROCEED
} from '../../../scripts/modules/handoff/auto-proceed-resolver.js';

describe('AUTO-PROCEED Resolver', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('parseCliFlags', () => {
    it('should return enabled when --auto-proceed flag is present', () => {
      const result = parseCliFlags(['node', 'script.js', '--auto-proceed']);
      expect(result.value).toBe(true);
      expect(result.source).toBe(RESOLUTION_SOURCES.CLI);
    });

    it('should return disabled when --no-auto-proceed flag is present', () => {
      const result = parseCliFlags(['node', 'script.js', '--no-auto-proceed']);
      expect(result.value).toBe(false);
      expect(result.source).toBe(RESOLUTION_SOURCES.CLI);
    });

    it('should prefer --no-auto-proceed over --auto-proceed (conservative)', () => {
      const result = parseCliFlags(['node', 'script.js', '--auto-proceed', '--no-auto-proceed']);
      expect(result.value).toBe(false);
      expect(result.source).toBe(RESOLUTION_SOURCES.CLI);
    });

    it('should return null when no flags are present', () => {
      const result = parseCliFlags(['node', 'script.js']);
      expect(result.value).toBe(null);
      expect(result.source).toBe(null);
    });
  });

  describe('parseEnvVar', () => {
    const originalEnv = process.env.AUTO_PROCEED;

    afterEach(() => {
      if (originalEnv === undefined) {
        delete process.env.AUTO_PROCEED;
      } else {
        process.env.AUTO_PROCEED = originalEnv;
      }
    });

    it('should return enabled for truthy values', () => {
      const truthyValues = ['1', 'true', 'TRUE', 'True', 'yes', 'YES', 'on', 'enabled'];

      for (const value of truthyValues) {
        process.env.AUTO_PROCEED = value;
        const result = parseEnvVar();
        expect(result.value).toBe(true);
        expect(result.source).toBe(RESOLUTION_SOURCES.ENV);
      }
    });

    it('should return disabled for falsy values', () => {
      const falsyValues = ['0', 'false', 'FALSE', 'False', 'no', 'NO', 'off', 'disabled'];

      for (const value of falsyValues) {
        process.env.AUTO_PROCEED = value;
        const result = parseEnvVar();
        expect(result.value).toBe(false);
        expect(result.source).toBe(RESOLUTION_SOURCES.ENV);
      }
    });

    it('should return null for unset env var', () => {
      delete process.env.AUTO_PROCEED;
      const result = parseEnvVar();
      expect(result.value).toBe(null);
      expect(result.source).toBe(null);
    });

    it('should return null for unrecognized values', () => {
      process.env.AUTO_PROCEED = 'maybe';
      const result = parseEnvVar();
      expect(result.value).toBe(null);
      expect(result.source).toBe(null);
    });
  });

  describe('readFromSession', () => {
    it('should return session value when present', async () => {
      mockResolveOwnSession.mockResolvedValueOnce({
        data: {
          session_id: 'test-session-123',
          metadata: { auto_proceed: true }
        },
        source: 'env_var'
      });

      const mockSupabase = {};
      const result = await readFromSession(mockSupabase);
      expect(result.value).toBe(true);
      expect(result.source).toBe(RESOLUTION_SOURCES.SESSION);
      expect(result.sessionId).toBe('test-session-123');
    });

    it('should return null when no active session exists', async () => {
      mockResolveOwnSession.mockResolvedValueOnce({
        data: null,
        source: 'error'
      });

      const mockSupabase = {};
      const result = await readFromSession(mockSupabase);
      expect(result.value).toBe(null);
      expect(result.source).toBe(null);
    });

    it('should return null when session has no auto_proceed metadata', async () => {
      mockResolveOwnSession.mockResolvedValueOnce({
        data: {
          session_id: 'test-session-456',
          metadata: {}
        },
        source: 'env_var'
      });

      const mockSupabase = {};
      const result = await readFromSession(mockSupabase);
      expect(result.value).toBe(null);
      expect(result.sessionId).toBe('test-session-456');
    });
  });

  describe('writeToSession', () => {
    it('should successfully write to session', async () => {
      const mockSupabase = {
        from: () => ({
          upsert: () => Promise.resolve({ error: null })
        })
      };

      const result = await writeToSession(mockSupabase, true, 'existing-session');
      expect(result.success).toBe(true);
      expect(result.sessionId).toBe('existing-session');
    });

    it('should create new session ID if not provided', async () => {
      const mockSupabase = {
        from: () => ({
          upsert: () => Promise.resolve({ error: null })
        })
      };

      const result = await writeToSession(mockSupabase, false);
      expect(result.success).toBe(true);
      expect(result.sessionId).toMatch(/^session_\d+$/);
    });

    it('should handle write errors gracefully', async () => {
      const mockSupabase = {
        from: () => ({
          upsert: () => Promise.resolve({ error: { message: 'Database error' } })
        })
      };

      const result = await writeToSession(mockSupabase, true);
      expect(result.success).toBe(false);
      expect(result.sessionId).toBe(null);
    });
  });

  describe('resolveAutoProceed', () => {
    const originalEnv = process.env.AUTO_PROCEED;

    afterEach(() => {
      if (originalEnv === undefined) {
        delete process.env.AUTO_PROCEED;
      } else {
        process.env.AUTO_PROCEED = originalEnv;
      }
    });

    it('should prefer CLI over all other sources', async () => {
      process.env.AUTO_PROCEED = 'false';

      const result = await resolveAutoProceed({
        args: ['node', 'test', '--auto-proceed'],
        supabase: {},
        persist: false,
        verbose: false
      });

      expect(result.autoProceed).toBe(true);
      expect(result.source).toBe(RESOLUTION_SOURCES.CLI);
    });

    it('should prefer env over session/database', async () => {
      process.env.AUTO_PROCEED = 'true';

      const result = await resolveAutoProceed({
        args: ['node', 'test'],
        supabase: {},
        persist: false,
        verbose: false
      });

      expect(result.autoProceed).toBe(true);
      expect(result.source).toBe(RESOLUTION_SOURCES.ENV);
    });

    it('should fall back to session when CLI and env not set', async () => {
      delete process.env.AUTO_PROCEED;

      // Mock readFromSession (called via resolveOwnSession)
      mockResolveOwnSession.mockResolvedValueOnce({
        data: {
          session_id: 's1',
          metadata: { auto_proceed: true }
        },
        source: 'env_var'
      });

      const result = await resolveAutoProceed({
        args: ['node', 'test'],
        supabase: {},
        persist: false,
        verbose: false
      });

      expect(result.autoProceed).toBe(true);
      expect(result.source).toBe(RESOLUTION_SOURCES.SESSION);
    });

    it('should use default when no source provides value', async () => {
      delete process.env.AUTO_PROCEED;

      // Mock readFromSession returning no auto_proceed
      mockResolveOwnSession.mockResolvedValueOnce({
        data: {
          session_id: 's1',
          metadata: {}
        },
        source: 'env_var'
      });

      const mockSupabase = {
        rpc: () => Promise.resolve({ data: [], error: null }),
        from: () => ({
          upsert: () => Promise.resolve({ error: null })
        })
      };

      const result = await resolveAutoProceed({
        args: ['node', 'test'],
        supabase: mockSupabase,
        persist: false,
        verbose: false
      });

      expect(result.autoProceed).toBe(DEFAULT_AUTO_PROCEED);
      expect(result.source).toBe(RESOLUTION_SOURCES.DEFAULT);
    });
  });

  describe('createHandoffMetadata', () => {
    it('should create metadata object with correct fields', () => {
      const metadata = createHandoffMetadata(true, RESOLUTION_SOURCES.CLI);

      expect(metadata.autoProceed).toBe(true);
      expect(metadata.autoProceedSource).toBe(RESOLUTION_SOURCES.CLI);
      expect(metadata.autoProceedResolvedAt).toBeDefined();
      expect(new Date(metadata.autoProceedResolvedAt).getTime()).toBeGreaterThan(0);
    });
  });

  describe('Constants', () => {
    it('should export correct resolution sources', () => {
      expect(RESOLUTION_SOURCES.CLI).toBe('cli');
      expect(RESOLUTION_SOURCES.ENV).toBe('env');
      expect(RESOLUTION_SOURCES.SESSION).toBe('session');
      expect(RESOLUTION_SOURCES.GLOBAL).toBe('global');
      expect(RESOLUTION_SOURCES.DEFAULT).toBe('default');
    });

    it('should have default as true (ON by default per documentation)', () => {
      expect(DEFAULT_AUTO_PROCEED).toBe(true);
    });
  });

  // SD-LEO-ENH-AUTO-PROCEED-001-05: Orchestrator Chaining Tests
  describe('getChainOrchestrators', () => {
    it('should return chain_orchestrators value when present in session', async () => {
      mockResolveOwnSession.mockResolvedValueOnce({
        data: {
          session_id: 'test-session-123',
          metadata: { auto_proceed: true, chain_orchestrators: true }
        },
        source: 'env_var'
      });

      const mockSupabase = {};
      const result = await getChainOrchestrators(mockSupabase);
      expect(result.chainOrchestrators).toBe(true);
      expect(result.sessionId).toBe('test-session-123');
    });

    it('should default to true when chain_orchestrators not set (automation by default)', async () => {
      mockResolveOwnSession.mockResolvedValueOnce({
        data: {
          session_id: 'test-session-456',
          metadata: { auto_proceed: true }
        },
        source: 'env_var'
      });

      const mockSupabase = {};
      const result = await getChainOrchestrators(mockSupabase);
      // DEFAULT_CHAIN_ORCHESTRATORS is true (SD-MAN-GEN-CORRECTIVE-VISION-GAP-013)
      expect(result.chainOrchestrators).toBe(true);
      expect(result.sessionId).toBe('test-session-456');
    });

    it('should default to false when no active session exists', async () => {
      mockResolveOwnSession.mockResolvedValueOnce({
        data: null,
        source: 'error'
      });

      const mockSupabase = {};
      const result = await getChainOrchestrators(mockSupabase);
      expect(result.chainOrchestrators).toBe(false);
      expect(result.sessionId).toBe(null);
    });

    it('should default to false on database error', async () => {
      mockResolveOwnSession.mockRejectedValueOnce(new Error('Database error'));

      const mockSupabase = {};
      const result = await getChainOrchestrators(mockSupabase);
      expect(result.chainOrchestrators).toBe(false);
      expect(result.sessionId).toBe(null);
    });
  });

  describe('setChainOrchestrators', () => {
    it('should successfully set chain_orchestrators in session', async () => {
      mockResolveOwnSession.mockResolvedValueOnce({
        data: {
          session_id: 'existing-session',
          metadata: { auto_proceed: true }
        },
        source: 'env_var'
      });

      const mockSupabase = {
        from: () => ({
          upsert: () => Promise.resolve({ error: null })
        })
      };

      const result = await setChainOrchestrators(mockSupabase, true);
      expect(result.success).toBe(true);
      expect(result.sessionId).toBe('existing-session');
    });

    it('should preserve existing metadata when setting chain_orchestrators', async () => {
      mockResolveOwnSession.mockResolvedValueOnce({
        data: {
          session_id: 'test-session',
          metadata: { auto_proceed: true, other_setting: 'value' }
        },
        source: 'env_var'
      });

      let upsertedData = null;
      const mockSupabase = {
        from: () => ({
          upsert: (data) => {
            upsertedData = data;
            return Promise.resolve({ error: null });
          }
        })
      };

      await setChainOrchestrators(mockSupabase, true);
      expect(upsertedData.metadata.auto_proceed).toBe(true);
      expect(upsertedData.metadata.other_setting).toBe('value');
      expect(upsertedData.metadata.chain_orchestrators).toBe(true);
    });

    it('should handle write errors gracefully', async () => {
      mockResolveOwnSession.mockResolvedValueOnce({
        data: { session_id: 's1', metadata: {} },
        source: 'env_var'
      });

      const mockSupabase = {
        from: () => ({
          upsert: () => Promise.resolve({ error: { message: 'Database error' } })
        })
      };

      const result = await setChainOrchestrators(mockSupabase, true);
      expect(result.success).toBe(false);
      expect(result.sessionId).toBe(null);
    });

    it('should create new session if none exists', async () => {
      mockResolveOwnSession.mockResolvedValueOnce({
        data: null,
        source: 'error'
      });

      const mockSupabase = {
        from: () => ({
          upsert: () => Promise.resolve({ error: null })
        })
      };

      const result = await setChainOrchestrators(mockSupabase, true);
      expect(result.success).toBe(true);
      expect(result.sessionId).toMatch(/^session_\d+$/);
    });
  });
});
