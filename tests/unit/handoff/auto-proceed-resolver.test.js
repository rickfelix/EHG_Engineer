/**
 * Unit tests for AUTO-PROCEED Resolver
 *
 * Part of SD-LEO-ENH-AUTO-PROCEED-001-02
 *
 * Tests the precedence order: CLI > env > session > database > default
 */

// Jest provides describe, it, expect, beforeEach, afterEach globally
import {
  parseCliFlags,
  parseEnvVar,
  readFromSession,
  writeToSession,
  resolveAutoProceed,
  createHandoffMetadata,
  RESOLUTION_SOURCES,
  DEFAULT_AUTO_PROCEED
} from '../../../scripts/modules/handoff/auto-proceed-resolver.js';

describe('AUTO-PROCEED Resolver', () => {
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
      const mockSupabase = {
        from: () => ({
          select: () => ({
            eq: () => ({
              order: () => ({
                limit: () => ({
                  single: () => Promise.resolve({
                    data: {
                      session_id: 'test-session-123',
                      metadata: { auto_proceed: true }
                    },
                    error: null
                  })
                })
              })
            })
          })
        })
      };

      const result = await readFromSession(mockSupabase);
      expect(result.value).toBe(true);
      expect(result.source).toBe(RESOLUTION_SOURCES.SESSION);
      expect(result.sessionId).toBe('test-session-123');
    });

    it('should return null when no active session exists', async () => {
      const mockSupabase = {
        from: () => ({
          select: () => ({
            eq: () => ({
              order: () => ({
                limit: () => ({
                  single: () => Promise.resolve({
                    data: null,
                    error: { code: 'PGRST116', message: 'no rows' }
                  })
                })
              })
            })
          })
        })
      };

      const result = await readFromSession(mockSupabase);
      expect(result.value).toBe(null);
      expect(result.source).toBe(null);
    });

    it('should return null when session has no auto_proceed metadata', async () => {
      const mockSupabase = {
        from: () => ({
          select: () => ({
            eq: () => ({
              order: () => ({
                limit: () => ({
                  single: () => Promise.resolve({
                    data: {
                      session_id: 'test-session-456',
                      metadata: {}
                    },
                    error: null
                  })
                })
              })
            })
          })
        })
      };

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
      const mockSupabase = {
        from: () => ({
          select: () => ({
            eq: () => ({
              order: () => ({
                limit: () => ({
                  single: () => Promise.resolve({
                    data: { session_id: 's1', metadata: { auto_proceed: false } },
                    error: null
                  })
                })
              })
            })
          })
        })
      };

      const result = await resolveAutoProceed({
        args: ['node', 'test', '--auto-proceed'],
        supabase: mockSupabase,
        persist: false,
        verbose: false
      });

      expect(result.autoProceed).toBe(true);
      expect(result.source).toBe(RESOLUTION_SOURCES.CLI);
    });

    it('should prefer env over session/database', async () => {
      process.env.AUTO_PROCEED = 'true';
      const mockSupabase = {
        from: () => ({
          select: () => ({
            eq: () => ({
              order: () => ({
                limit: () => ({
                  single: () => Promise.resolve({
                    data: { session_id: 's1', metadata: { auto_proceed: false } },
                    error: null
                  })
                })
              })
            })
          })
        })
      };

      const result = await resolveAutoProceed({
        args: ['node', 'test'],
        supabase: mockSupabase,
        persist: false,
        verbose: false
      });

      expect(result.autoProceed).toBe(true);
      expect(result.source).toBe(RESOLUTION_SOURCES.ENV);
    });

    it('should fall back to session when CLI and env not set', async () => {
      delete process.env.AUTO_PROCEED;
      const mockSupabase = {
        from: () => ({
          select: () => ({
            eq: () => ({
              order: () => ({
                limit: () => ({
                  single: () => Promise.resolve({
                    data: { session_id: 's1', metadata: { auto_proceed: true } },
                    error: null
                  })
                })
              })
            })
          })
        })
      };

      const result = await resolveAutoProceed({
        args: ['node', 'test'],
        supabase: mockSupabase,
        persist: false,
        verbose: false
      });

      expect(result.autoProceed).toBe(true);
      expect(result.source).toBe(RESOLUTION_SOURCES.SESSION);
    });

    it('should use default when no source provides value', async () => {
      delete process.env.AUTO_PROCEED;
      const mockSupabase = {
        from: () => ({
          select: () => ({
            eq: () => ({
              order: () => ({
                limit: () => ({
                  single: () => Promise.resolve({
                    data: { session_id: 's1', metadata: {} },
                    error: null
                  })
                })
              })
            })
          }),
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
      expect(RESOLUTION_SOURCES.DATABASE).toBe('database');
      expect(RESOLUTION_SOURCES.DEFAULT).toBe('default');
    });

    it('should have default as false (conservative)', () => {
      expect(DEFAULT_AUTO_PROCEED).toBe(false);
    });
  });
});
