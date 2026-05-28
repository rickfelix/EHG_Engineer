import { describe, it, expect, beforeEach } from 'vitest';
import { resolveCanonicalAppName, normalizeAppName, clearCache } from '../../lib/repo-paths.js';

// Minimal stub mirroring the supabase chain used by resolveCanonicalAppName:
//   supabase.from('applications').select('name, status').eq('status','active') -> { data, error }
function stubSupabase(rows, { error = null } = {}) {
  return {
    from() {
      return {
        select() {
          return {
            eq() {
              return Promise.resolve({ data: rows, error });
            },
          };
        },
      };
    },
  };
}

describe('SD-LEO-INFRA-VENTURE-REPO-AWARE-001 — resolveCanonicalAppName', () => {
  beforeEach(() => clearCache());

  describe('null / empty / platform passthrough (FR-3 casing fix)', () => {
    it('null/undefined fall back to constraint-valid "EHG_Engineer" (NOT lowercase "EHG_engineer")', async () => {
      expect(await resolveCanonicalAppName(null)).toBe('EHG_Engineer');
      expect(await resolveCanonicalAppName(undefined)).toBe('EHG_Engineer');
      expect(await resolveCanonicalAppName('')).toBe('EHG_Engineer');
    });

    it('platform values pass through unchanged without needing the registry', async () => {
      expect(await resolveCanonicalAppName('EHG')).toBe('EHG');
      expect(await resolveCanonicalAppName('EHG_Engineer')).toBe('EHG_Engineer');
    });

    it('normalizes platform case/separator variants to canonical form', async () => {
      expect(await resolveCanonicalAppName('ehg')).toBe('EHG');
      expect(await resolveCanonicalAppName('EHG_ENGINEER')).toBe('EHG_Engineer');
      expect(await resolveCanonicalAppName('ehg_engineer')).toBe('EHG_Engineer');
    });
  });

  describe('DB-first registry resolution (case/separator-insensitive)', () => {
    const apps = [
      { name: 'CronGenius', status: 'active' },
      { name: 'CommitCraft AI', status: 'active' },
    ];

    it('canonicalizes a registered venture to its applications.name', async () => {
      expect(await resolveCanonicalAppName('crongenius', stubSupabase(apps))).toBe('CronGenius');
      expect(await resolveCanonicalAppName('CRON-GENIUS', stubSupabase(apps))).toBe('CronGenius');
      expect(await resolveCanonicalAppName('CronGenius', stubSupabase(apps))).toBe('CronGenius');
    });

    it('matches across separator drift (display name vs slug)', async () => {
      expect(await resolveCanonicalAppName('commitcraft-ai', stubSupabase(apps))).toBe('CommitCraft AI');
      expect(await resolveCanonicalAppName('commitcraft_ai', stubSupabase(apps))).toBe('CommitCraft AI');
    });

    it('returns the input UNCHANGED for an unregistered app (no silent platform fallback)', async () => {
      expect(await resolveCanonicalAppName('BogusUnregistered', stubSupabase(apps))).toBe('BogusUnregistered');
    });

    it('falls through to the registry mirror when the DB query errors', async () => {
      // commitcraft-ai is APP005 in applications/registry.json (the file fallback tier)
      const errored = stubSupabase(null, { error: { message: 'db down' } });
      expect(await resolveCanonicalAppName('commitcraft-ai', errored)).toBe('commitcraft-ai');
    });
  });

  describe('JS/SQL normalize parity (pins the trigger contract)', () => {
    // The migration trigger uses regexp_replace(lower(x), \'[^a-z0-9]\', \'\', \'g\').
    // normalizeAppName MUST collapse the same way so a value accepted in JS is accepted in SQL.
    it('normalizeAppName = lowercase + strip non-alphanumeric', () => {
      expect(normalizeAppName('CronGenius')).toBe('crongenius');
      expect(normalizeAppName('cron-genius')).toBe('crongenius');
      expect(normalizeAppName('Cron Genius')).toBe('crongenius');
      expect(normalizeAppName('CommitCraft AI')).toBe('commitcraftai');
      expect(normalizeAppName('EHG_Engineer')).toBe('ehgengineer');
    });
  });
});
