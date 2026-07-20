/**
 * SD-LEO-INFRA-DISTILL-REFINE-RECONCILE-001 — institution reconciliation + precision guard.
 *
 * Pins the precision-first discipline (RISK R1, governing): the `already_institutionalized`
 * disposition — which excludes an item from the chairman review queue — can ONLY survive at
 * >= INSTITUTION_CONFIDENCE_FLOOR AND with a verifiable section pointer; anything weaker
 * degrades to `novel` (surface, never silently drop). Also pins: token mode never emits the
 * disposition (RISK R2), the enqueue gate excludes reconciled-out items while failing open
 * on unknown (FR-3), and no Solomon seam is introduced (FR-4).
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  INSTITUTION_CONFIDENCE_FLOOR,
  enforceInstitutionDiscipline,
  tokenReconcile,
} from '../../../lib/integrations/refine-reconcile.js';
import { loadTopWaveItems } from '../../../scripts/eva-distill-brainstorm.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '../../..');

describe('enforceInstitutionDiscipline — precision-first (RISK R1)', () => {
  const base = { item_index: 1, status: 'already_institutionalized', matched_section_id: '611', matched_section_title: 'Solomon Role Contract' };

  it('keeps a strong, pointered institution match (>= floor + section id)', () => {
    const r = enforceInstitutionDiscipline({ ...base, confidence: INSTITUTION_CONFIDENCE_FLOOR });
    expect(r.status).toBe('already_institutionalized');
    expect(r.matched_section_id).toBe('611');
  });

  it('degrades a 60-84 confidence match to novel + institution_note (never suppressed)', () => {
    const r = enforceInstitutionDiscipline({ ...base, confidence: 70 });
    expect(r.status).toBe('novel');
    expect(r.institution_note.downgraded_from).toBe('already_institutionalized');
    expect(r.institution_note.candidate_section_id).toBe('611'); // preserved for spot-check
  });

  it('degrades a pointerless match to novel even at high confidence', () => {
    const r = enforceInstitutionDiscipline({ item_index: 2, status: 'already_institutionalized', confidence: 95, matched_section_id: null });
    expect(r.status).toBe('novel');
    expect(r.institution_note.reason).toMatch(/pointer/);
  });

  it('is a no-op for non-institution dispositions (already_done, novel, in_progress)', () => {
    for (const status of ['already_done', 'novel', 'in_progress', 'partially_done']) {
      const r = enforceInstitutionDiscipline({ item_index: 3, status, confidence: 50 });
      expect(r.status).toBe(status);
    }
  });

  it('floor is strictly higher than the already_done floor (60)', () => {
    expect(INSTITUTION_CONFIDENCE_FLOOR).toBeGreaterThan(60);
  });
});

describe('tokenReconcile — never emits already_institutionalized (RISK R2)', () => {
  function stubSupabase(sds) {
    const builder = {
      select: () => builder, in: () => builder, order: () => builder,
      limit: () => Promise.resolve({ data: sds, error: null }),
    };
    return { from: () => builder };
  }

  it('token mode only produces SD-based dispositions, never the institution one', async () => {
    const sds = [{ id: 'u1', sd_key: 'SD-X-001', title: 'deep architecture review cadence', status: 'completed', key_changes: [] }];
    const items = [{ title: 'deep architecture review' }, { title: 'flaky RCA triage' }];
    const results = await tokenReconcile(items, { supabase: stubSupabase(sds) });
    for (const r of results) {
      expect(r.status).not.toBe('already_institutionalized');
      expect(['novel', 'already_done', 'in_progress', 'partially_done']).toContain(r.status);
    }
  });
});

describe('loadTopWaveItems — standing enqueue gate (FR-3)', () => {
  function stubSupabase(rows) {
    // SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 9: loadTopWaveItems now routes
    // through fetchAllPaginated, whose terminal call is .range() — chain not()/order() and
    // resolve from range() instead of the formerly-terminal not().
    const builder = {
      select: () => builder,
      not: () => builder,
      order: () => builder,
      range: () => Promise.resolve({ data: rows, error: null }),
    };
    return { from: () => builder };
  }
  const mk = (id, score, disposition) => ({
    id, wave_id: 'w', source_type: 's', source_id: 's', title: id,
    metadata: { refine_composite_score: score, ...(disposition ? { refine_disposition: disposition } : {}) },
    item_disposition: 'selected',
  });

  it('excludes already_done and already_institutionalized from the novel-work top-N', async () => {
    const rows = [
      mk('novelA', 90, { status: 'novel' }),
      mk('doneB', 95, { status: 'already_done', matched_sd_key: 'SD-Y-001' }),
      mk('instC', 99, { status: 'already_institutionalized', matched_section_id: '611' }),
      mk('novelD', 80, null), // no disposition at all — fail-open
    ];
    const top = await loadTopWaveItems(stubSupabase(rows), 20);
    const ids = top.map(r => r.id);
    expect(ids).toContain('novelA');
    expect(ids).toContain('novelD');       // unknown/absent disposition FAILS OPEN (surfaces)
    expect(ids).not.toContain('doneB');
    expect(ids).not.toContain('instC');
  });

  it('an unrecognized disposition status still surfaces (fail-open, never fail-closed)', async () => {
    const rows = [mk('weird', 70, { status: 'something_new' })];
    const top = await loadTopWaveItems(stubSupabase(rows), 20);
    expect(top.map(r => r.id)).toContain('weird');
  });
});

describe('FR-4 non-goal — no Solomon seam in reconcile', () => {
  it('refine-reconcile.js wires no solomon-consult SEAM (imports/calls, not comments)', () => {
    const raw = fs.readFileSync(path.join(REPO, 'lib/integrations/refine-reconcile.js'), 'utf8');
    // Strip comments so the FR-4 non-goal documentation ("no solomon_consult seam here")
    // does not itself trip the guard — we check executable seams only.
    const code = raw
      .replace(/\/\*[\s\S]*?\*\//g, '')          // block comments
      .replace(/(^|[^:])\/\/.*$/gm, '$1');        // line comments (not URLs)
    expect(code).not.toMatch(/import[^;]*solomon/i);          // no solomon module import
    expect(code).not.toMatch(/solomon[-_]?consult\s*\(/i);    // no solomon-consult call
    expect(code).not.toMatch(/kind:\s*['"]solomon/i);         // no solomon_consult kind write
  });
});
