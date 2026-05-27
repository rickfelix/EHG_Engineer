/**
 * Unit tests for scripts/eva-support/_internal/dispatcher.js — SD-EVA-SUPPORT-CLI-SKILL-ORCH-001-C
 * FR-4 dispatcher middleware.
 *
 * Covers:
 *   - Six sub-flow handlers still routable via getHandler (regression guard).
 *   - dispatch() with _skipRelatedSDs=true preserves the legacy 6-flow behavior verbatim.
 *   - dispatch() with EVA_SD_READER_ENABLED=true prepends "Related SDs:" prefix.
 *   - dispatch() with EVA_SD_READER_ENABLED=false (flag OFF) leaves reply untouched.
 *   - buildRelatedSDsPrefix() with empty inputs returns null.
 *   - buildRelatedSDsPrefix() composes valid prefix from sds + blockers.
 *   - Middleware exception in fetchRelatedSDsContext falls through to handler result (defensive).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const DISPATCHER_PATH = resolve(HERE, '../../../scripts/eva-support/_internal/dispatcher.js');

describe('dispatcher.js — static source invariants', () => {
  const source = readFileSync(DISPATCHER_PATH, 'utf8');

  it('FR-4: imports the existing 6 sub-flow handlers (regression guard)', () => {
    expect(source).toMatch(/import research from/);
    expect(source).toMatch(/import decision from/);
    expect(source).toMatch(/import draft from/);
    expect(source).toMatch(/import actionPrep from/);
    expect(source).toMatch(/import platform from/);
    expect(source).toMatch(/import pureHuman from/);
  });

  it('FR-4: FLOW_HANDLERS contains exactly the 6 documented flows', () => {
    const handlersMatch = source.match(/FLOW_HANDLERS\s*=\s*\{([\s\S]+?)\}/);
    expect(handlersMatch).toBeTruthy();
    const block = handlersMatch[1];
    expect(block).toMatch(/\bresearch\b/);
    expect(block).toMatch(/\bdecision\b/);
    expect(block).toMatch(/\bdraft\b/);
    expect(block).toMatch(/\baction_prep\b/);
    expect(block).toMatch(/\bplatform\b/);
    expect(block).toMatch(/\bpure_human\b/);
  });

  it('FR-4: middleware single change point — only dispatch() and a helper are added', () => {
    // Sanity: source size is roughly the original (~36 LOC) + middleware (~80 LOC).
    expect(source.length).toBeGreaterThan(2000);
    expect(source.length).toBeLessThan(8000);
    // No per-sub-flow modifications referenced.
    expect(source).not.toMatch(/research\s*=\s*async/);
    expect(source).not.toMatch(/decision\s*=\s*async/);
  });

  it('FR-4: "Related SDs:" prefix string literal exists exactly once outside comments', () => {
    // The literal in lines.push('Related SDs:') is the prefix string. Strip
    // comments and assert the array literal appears exactly once. (Comments
    // referencing the string for documentation purposes are fine.)
    const sourceNoComments = source
      .replace(/\/\*[\s\S]*?\*\//g, '') // block comments
      .replace(/\/\/.*$/gm, '');         // line comments
    const literalMatches = sourceNoComments.match(/['"]Related SDs:['"]/g) || [];
    expect(literalMatches.length).toBe(1);
  });

  it('T1 boundary: source does NOT import child_process / spawn', () => {
    expect(source).not.toMatch(/from\s+['"]child_process['"]/);
    expect(source).not.toMatch(/from\s+['"]execa['"]/);
    expect(source).not.toMatch(/spawn\s*\(/);
  });
});

describe('dispatcher.js — buildRelatedSDsPrefix()', () => {
  it('returns null when both sds and blockers are empty', async () => {
    const { buildRelatedSDsPrefix } = await import('../../../scripts/eva-support/_internal/dispatcher.js');
    expect(buildRelatedSDsPrefix({ sds: [], blockers: [] })).toBeNull();
    expect(buildRelatedSDsPrefix({})).toBeNull();
    expect(buildRelatedSDsPrefix()).toBeNull();
  });

  it('composes prefix from sds only', async () => {
    const { buildRelatedSDsPrefix } = await import('../../../scripts/eva-support/_internal/dispatcher.js');
    const prefix = buildRelatedSDsPrefix({
      sds: [{ sd_key: 'SD-FOO-001', status: 'draft', progress: 0 }],
      blockers: [],
    });
    expect(prefix).toContain('Related SDs:');
    expect(prefix).toContain('SD-FOO-001 | draft | 0%');
    expect(prefix.endsWith('\n\n')).toBe(true);
  });

  it('composes prefix from blockers only', async () => {
    const { buildRelatedSDsPrefix } = await import('../../../scripts/eva-support/_internal/dispatcher.js');
    const prefix = buildRelatedSDsPrefix({
      sds: [],
      blockers: [{ sd_key: 'SD-BAR-002', blocker_reason: 'rejected handoff' }],
    });
    expect(prefix).toContain('SD-BAR-002 | BLOCKER | rejected handoff');
  });

  it('de-duplicates an SD that appears in both sds and blockers (sds wins)', async () => {
    const { buildRelatedSDsPrefix } = await import('../../../scripts/eva-support/_internal/dispatcher.js');
    const prefix = buildRelatedSDsPrefix({
      sds: [{ sd_key: 'SD-DUPE', status: 'in_progress', progress: 50 }],
      blockers: [{ sd_key: 'SD-DUPE', blocker_reason: 'should be deduped' }],
    });
    const occurrences = (prefix.match(/SD-DUPE/g) || []).length;
    expect(occurrences).toBe(1);
    expect(prefix).toContain('SD-DUPE | in_progress | 50%');
    expect(prefix).not.toContain('should be deduped');
  });
});

describe('dispatcher.js — dispatch() middleware behavior', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('_skipRelatedSDs=true: legacy behavior preserved (no prefix injection)', async () => {
    vi.doMock('../../../scripts/eva-support/research.js', () => ({
      default: async () => ({ reply: 'original research reply', decision_log_entry: {}, db_persisted: false }),
    }));
    const { dispatch } = await import('../../../scripts/eva-support/_internal/dispatcher.js');
    const result = await dispatch('research', { id: 'task-1' }, { _skipRelatedSDs: true });
    expect(result.reply).toBe('original research reply');
    expect(result.related_sds_context).toBeUndefined();
  });

  it('flag OFF: dispatch() returns reply unchanged (no Related SDs: prefix)', async () => {
    vi.stubEnv('EVA_SD_READER_ENABLED', 'false');
    vi.doMock('../../../scripts/eva-support/research.js', () => ({
      default: async () => ({ reply: 'baseline reply', decision_log_entry: {}, db_persisted: false }),
    }));
    vi.doMock('../../../lib/eva-support/sd-decision-log-writer.js', () => ({
      writeAuditRow: vi.fn(async () => ({ inserted: true, row: { task_id: 'x', sequence: 1 } })),
    }));
    const { dispatch } = await import('../../../scripts/eva-support/_internal/dispatcher.js');
    const result = await dispatch('research', { id: 'task-2' });
    expect(result.reply).toBe('baseline reply');
    expect(result.reply).not.toContain('Related SDs:');
  });

  it('flag ON with matches: dispatch() prepends Related SDs: prefix', async () => {
    vi.stubEnv('EVA_SD_READER_ENABLED', 'true');
    vi.doMock('../../../scripts/eva-support/research.js', () => ({
      default: async () => ({ reply: 'core reply text', decision_log_entry: {}, db_persisted: false }),
    }));
    vi.doMock('../../../lib/eva-support/sd-reader.js', () => ({
      getActiveSDs: async () => ({
        flag_enabled: true,
        sds: [{ sd_key: 'SD-MATCH-001', status: 'draft', current_phase: 'LEAD', priority: 'high', progress: 25, target_application: 'EHG_Engineer', title: 'demo' }],
        audit_row_id: null,
      }),
    }));
    vi.doMock('../../../lib/eva-support/sd-blocker-surface.js', () => ({
      getBlockedSDs: async () => ({ flag_enabled: true, blockers: [] }),
    }));
    const { dispatch } = await import('../../../scripts/eva-support/_internal/dispatcher.js');
    const result = await dispatch('research', { id: 'task-3' });
    expect(result.reply).toMatch(/^Related SDs:\n {2}SD-MATCH-001 \| draft \| 25%\n\ncore reply text$/);
    expect(result.related_sds_context.flag_enabled).toBe(true);
    expect(result.related_sds_context.sds).toHaveLength(1);
  });

  it('middleware exception is swallowed — handler reply preserved', async () => {
    vi.stubEnv('EVA_SD_READER_ENABLED', 'true');
    vi.doMock('../../../scripts/eva-support/research.js', () => ({
      default: async () => ({ reply: 'safe reply', decision_log_entry: {}, db_persisted: false }),
    }));
    vi.doMock('../../../lib/eva-support/sd-reader.js', () => ({
      getActiveSDs: async () => { throw new Error('simulated reader failure'); },
    }));
    const { dispatch } = await import('../../../scripts/eva-support/_internal/dispatcher.js');
    const result = await dispatch('research', { id: 'task-4' });
    expect(result.reply).toBe('safe reply');
    expect(result.reply).not.toContain('Related SDs:');
  });

  it('getHandler exposes all 6 sub-flows by name (regression guard)', async () => {
    const { getHandler, FLOW_HANDLERS } = await import('../../../scripts/eva-support/_internal/dispatcher.js');
    expect(typeof getHandler('research')).toBe('function');
    expect(typeof getHandler('decision')).toBe('function');
    expect(typeof getHandler('draft')).toBe('function');
    expect(typeof getHandler('action_prep')).toBe('function');
    expect(typeof getHandler('platform')).toBe('function');
    expect(typeof getHandler('pure_human')).toBe('function');
    expect(Object.keys(FLOW_HANDLERS)).toHaveLength(6);
  });

  it('getHandler throws on unknown flow', async () => {
    const { getHandler } = await import('../../../scripts/eva-support/_internal/dispatcher.js');
    expect(() => getHandler('unknown_flow')).toThrowError(/Unknown flow: unknown_flow/);
  });
});
