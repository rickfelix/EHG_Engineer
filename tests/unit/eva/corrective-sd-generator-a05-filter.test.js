/**
 * Tests for A05 source-class filter
 * SD-LEO-INFRA-FILTER-CORRECTIVE-GENERATOR-001
 */

import { describe, it, expect, vi, beforeAll } from 'vitest';

vi.mock('dotenv', () => ({ config: vi.fn(), default: { config: vi.fn() } }));
vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn(() => ({})) }));

let classifySourceSD, isSourceSDA05Suppressed;

beforeAll(async () => {
  const mod = await import('../../../scripts/eva/corrective-sd-generator.mjs');
  classifySourceSD = mod.classifySourceSD;
  isSourceSDA05Suppressed = mod.isSourceSDA05Suppressed;
});

describe('classifySourceSD', () => {
  it('CLI bugfix: returns cli_validation', () => {
    const sd = {
      sd_type: 'bugfix',
      title: 'Fix CLI parser dependency lookup',
      description: 'preflight validation parser fix',
      scope: 'child-sd-preflight.js validation logic',
      key_changes: [{ change: 'fix parser lookup', impact: 'preflight returns correct verdict' }],
    };
    expect(classifySourceSD(sd)).toBe('cli_validation');
  });

  it('Bugfix with single readonly keyword: returns readonly_bugfix', () => {
    const sd = {
      sd_type: 'bugfix',
      title: 'Fix off-by-one in array slice',
      description: 'array slice off-by-one fix',
      scope: 'helper indexing',
      key_changes: [{ change: 'index off-by-one', impact: 'corrected slice' }],
    };
    expect(classifySourceSD(sd)).toBe('readonly_bugfix');
  });

  it('Documentation SD: returns documentation', () => {
    expect(classifySourceSD({ sd_type: 'documentation', title: 'docs', description: '', scope: '', key_changes: [] }))
      .toBe('documentation');
  });

  it('Feature SD with backend writes: returns null (allow A05)', () => {
    const sd = {
      sd_type: 'feature',
      title: 'Add user preferences API',
      description: 'persist preferences and emit lifecycle events on update',
      scope: 'API insert/update + event publishing',
      key_changes: [{ change: 'persist prefs', impact: 'emit user.updated event' }],
    };
    expect(classifySourceSD(sd)).toBeNull();
  });

  it('Database migration SD: returns null (allow A05)', () => {
    const sd = {
      sd_type: 'database',
      title: 'Add columns for new feature',
      description: 'schema migration for ventures',
      scope: 'migration: add new columns; insert seed data',
      key_changes: [{ change: 'migration up', impact: 'schema evolution' }],
    };
    expect(classifySourceSD(sd)).toBeNull();
  });

  it('Null/empty source: returns null', () => {
    expect(classifySourceSD(null)).toBeNull();
    expect(classifySourceSD(undefined)).toBeNull();
    expect(classifySourceSD({})).toBeNull();
  });

  it('Bugfix with write keywords (e.g. emit fix): returns null - not suppressed', () => {
    const sd = {
      sd_type: 'bugfix',
      title: 'Fix event emission on stage completion',
      description: 'publish event after persist; broadcast lifecycle update',
      scope: 'webhook + emit fix',
      key_changes: [],
    };
    expect(classifySourceSD(sd)).toBeNull();
  });
});

describe('isSourceSDA05Suppressed', () => {
  function makeSupabase(returnRow, throwError = false) {
    return {
      from: () => ({
        select: () => ({
          or: () => ({
            limit: () => ({
              maybeSingle: async () => {
                if (throwError) throw new Error('db down');
                return returnRow ? { data: returnRow, error: null } : { data: null, error: null };
              },
            }),
          }),
        }),
      }),
    };
  }

  it('Returns suppress=true for CLI bugfix source SD', async () => {
    const sb = makeSupabase({
      id: 'uuid-1', sd_key: 'SD-X', sd_type: 'bugfix',
      title: 'CLI parser preflight fix', description: 'validation', scope: 'check',
      key_changes: [{ change: 'parser fix' }],
    });
    const r = await isSourceSDA05Suppressed('SD-X', sb);
    expect(r.suppress).toBe(true);
    expect(r.reason).toBe('cli_validation');
    expect(r.sourceSdKey).toBe('SD-X');
  });

  it('Returns suppress=false for feature SD with writes', async () => {
    const sb = makeSupabase({
      id: 'uuid-2', sd_key: 'SD-Y', sd_type: 'feature',
      title: 'Add API endpoint', description: 'persist data and emit lifecycle event',
      scope: 'insert/update + publish',
      key_changes: [{ change: 'persist' }, { change: 'emit' }],
    });
    const r = await isSourceSDA05Suppressed('SD-Y', sb);
    expect(r.suppress).toBe(false);
    expect(r.reason).toBeNull();
  });

  it('Returns suppress=false on null sourceSdId (conservative default)', async () => {
    const sb = makeSupabase(null);
    const r = await isSourceSDA05Suppressed(null, sb);
    expect(r.suppress).toBe(false);
  });

  it('Returns suppress=false when source SD lookup fails (conservative default)', async () => {
    const sb = makeSupabase(null, true);
    const r = await isSourceSDA05Suppressed('SD-MISSING', sb);
    expect(r.suppress).toBe(false);
  });

  it('Returns suppress=false when source SD not found in DB', async () => {
    const sb = makeSupabase(null);
    const r = await isSourceSDA05Suppressed('SD-NOTFOUND', sb);
    expect(r.suppress).toBe(false);
  });
});
