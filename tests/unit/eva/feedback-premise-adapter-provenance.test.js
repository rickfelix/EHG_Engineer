/**
 * SD-LEO-INFRA-CORRECTION-DELIVERY-PATH-001-E
 * TS-1 / TS-2 / TS-4 — provenance carry-through and surfacing.
 *
 * Fixtures (mockSb/noGit/gitWithFix/NOW) mirror tests/unit/eva/feedback-premise-adapter.test.js
 * so the verdict matrix is driven exactly as the existing suite drives it.
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  feedbackToPremiseDescriptor,
  checkFeedbackPremiseLiveness,
} from '../../../lib/eva/feedback-premise-adapter.js';

const NOW = Date.parse('2026-06-23T00:00:00Z');

function mockSb({ handoffs = [], completed = [] } = {}) {
  return {
    from(table) {
      if (table === 'sd_phase_handoffs') {
        return { select: () => ({ eq: () => ({ gte: () => {
          const b = { order: () => b, range: () => Promise.resolve({ data: handoffs, error: null }) };
          return b;
        } }) }) };
      }
      if (table === 'strategic_directives_v2') {
        return { select: () => ({ eq: () => ({ gte: () => ({ or: () => ({ limit: () => Promise.resolve({ data: completed, error: null }) }) }) }) }) };
      }
      return null;
    },
  };
}
const noGit = () => '';
const gitWithFix = () => 'abc1234 fix(SD-LEO-INFRA-AUTO-REFILL-READ-DB-ACTIVATION-FLAG-001): read DB flag';

const PROVENANCE = {
  measured_at: '2026-06-22T23:35:00.000Z',
  git_sha: 'abc123def4567890',
  git_ref: 'main',
  timezone: 'America/New_York',
};

describe('feedbackToPremiseDescriptor — provenance carry-through (FR-2)', () => {
  it('lifts measurement provenance off feedback.metadata onto the descriptor', () => {
    const d = feedbackToPremiseDescriptor({
      id: 'fb-1',
      title: 'A measured claim',
      description: 'see scripts/sourcing-engine/refill-cron.mjs',
      metadata: { ...PROVENANCE, dedup_hash: 'x'.repeat(64) },
    });
    expect(d.measurement_provenance).toEqual({
      measured_at: PROVENANCE.measured_at,
      git_sha: PROVENANCE.git_sha,
      git_ref: PROVENANCE.git_ref,
      timezone: PROVENANCE.timezone,
    });
  });

  it('returns null provenance for LEGACY rows recorded before stamping existed', () => {
    const d = feedbackToPremiseDescriptor({ id: 'fb-2', title: 'Legacy row', description: 'no metadata at all' });
    expect(d.measurement_provenance).toBeNull();
  });

  it('returns null when metadata exists but carries no provenance keys', () => {
    const d = feedbackToPremiseDescriptor({ id: 'fb-3', title: 'Other metadata', description: 'x', metadata: { dedup_hash: 'y' } });
    expect(d.measurement_provenance).toBeNull();
  });

  it('is total on a missing row (no regression to the existing contract)', () => {
    expect(feedbackToPremiseDescriptor().measurement_provenance).toBeNull();
  });
});

describe('TS-1 / TS-4 — provenance is INERT to the verdict (TR-3)', () => {
  it('TS-1: STALE — a provenance-stamped claim whose state has advanced still refuses', async () => {
    const fb = {
      id: 'fb-1',
      title: 'AUTO-REFILL-CRON-ENV-GATE-VS-DB-FLAG-DIVERGENCE',
      description: 'refill-cron.mjs gates its ACTION on env var SOURCING_AUTO_REFILL_V1, see scripts/sourcing-engine/refill-cron.mjs',
      category: null,
      metadata: { ...PROVENANCE },
    };
    const v = await checkFeedbackPremiseLiveness(fb, { supabase: mockSb(), git: gitWithFix, nowMs: NOW });
    expect(v.status).toBe('STALE');
    expect(v.recommendation).toBe('ARCHIVE');
  });

  it('TS-4 regression: a FRESH provenance-carrying measurement still reads LIVE', async () => {
    const fb = {
      id: 'fb-2',
      title: 'Some other bug',
      description: 'see scripts/whatever.js',
      category: null,
      metadata: { ...PROVENANCE },
    };
    const v = await checkFeedbackPremiseLiveness(fb, { supabase: mockSb(), git: noGit, nowMs: NOW });
    expect(v.status).toBe('LIVE');
  });

  it('TS-4: verdicts are IDENTICAL with and without provenance — it is evidence, not an input', async () => {
    const base = {
      id: 'fb-3',
      title: 'AUTO-REFILL-CRON-ENV-GATE-VS-DB-FLAG-DIVERGENCE',
      description: 'see scripts/sourcing-engine/refill-cron.mjs',
      category: null,
    };
    const withProv = await checkFeedbackPremiseLiveness({ ...base, metadata: { ...PROVENANCE } }, { supabase: mockSb(), git: gitWithFix, nowMs: NOW });
    const withoutProv = await checkFeedbackPremiseLiveness(base, { supabase: mockSb(), git: gitWithFix, nowMs: NOW });
    expect(withProv.status).toBe(withoutProv.status);
    expect(withProv.recommendation).toBe(withoutProv.recommendation);
  });
});

/**
 * TS-2 (AC-2, tightened). scripts/create-quick-fix.js is a non-injectable CLI entrypoint
 * (it constructs a real Supabase client at import time), so its existing gate test
 * (tests/unit/feedback/create-quick-fix-liveness-gate.test.js) asserts by STATIC SOURCE
 * INSPECTION rather than execution. This follows that same idiom.
 *
 * WHY THIS MATTERS: the bare "surfaces a STALE verdict" behavior ALREADY existed and was
 * ALREADY tested, so AC-2 as originally worded validated no new work. These assertions
 * are written so they FAIL against the pre-change source — they require the provenance
 * to be selected and printed.
 */
describe('TS-2 — the STALE refusal surfaces the measurement provenance', () => {
  const src = fs.readFileSync(
    path.resolve(process.cwd(), 'scripts/create-quick-fix.js'),
    'utf8',
  );

  it('fetches metadata on the liveness re-check select (else provenance is stripped before use)', () => {
    // Scope to the LIVENESS RE-FETCH specifically — the one keyed by
    // resolvedFeedbackIds. create-quick-fix.js selects from `feedback` in more than
    // one place, so an unanchored .from('feedback').select() match hits the wrong site.
    // Pre-change this select was: 'id, title, description, category, severity'.
    const freshIdx = src.indexOf('freshFb');
    expect(freshIdx).toBeGreaterThan(-1);
    const fetchBlock = src.slice(freshIdx, freshIdx + 700);
    expect(fetchBlock).toMatch(/resolvedFeedbackIds/);
    const selectMatch = fetchBlock.match(/\.from\('feedback'\)\.select\('([^']*)'\)/);
    expect(selectMatch).not.toBeNull();
    expect(selectMatch[1]).toMatch(/\bmetadata\b/);
  });

  it('prints measured_at and the measured-against ref inside the STALE_PREMISE block', () => {
    const start = src.indexOf('[STALE_PREMISE]');
    expect(start).toBeGreaterThan(-1);
    const block = src.slice(start, start + 2800);
    expect(block).toMatch(/measured_at/);
    expect(block).toMatch(/measured against/);
    expect(block).toMatch(/git_sha|git_ref/);
  });

  it('computes the age through the EXISTING UTC normalizer, not a fourth local copy (FR-3)', () => {
    expect(src).toMatch(/import\s*\{\s*normalizeToUTC\s*\}\s*from/);
    const start = src.indexOf('[STALE_PREMISE]');
    const block = src.slice(start, start + 2800);
    expect(block).toMatch(/normalizeToUTC\(/);
    // A bare Date.parse on the provenance timestamp would reintroduce the
    // four-hour-shift bug class for any naive value.
    expect(block).not.toMatch(/Date\.parse\(prov\.measured_at\)/);
  });

  it('still gates BEFORE the quick_fixes insert (pre-existing behavior preserved)', () => {
    // Same regexes as tests/unit/feedback/create-quick-fix-liveness-gate.test.js —
    // the INSERT specifically, not merely a read of the same table (create-quick-fix.js
    // reads quick_fixes earlier for dedup, which a bare .from() match would hit first).
    const gateM = src.match(/\[STALE_PREMISE\]\s+feedback/);
    const insertM = src.match(/\.from\(\s*['"]quick_fixes['"]\s*\)\s*\r?\n?\s*\.insert\(/);
    expect(gateM?.index).toBeGreaterThanOrEqual(0);
    expect(insertM?.index).toBeGreaterThanOrEqual(0);
    expect(gateM.index).toBeLessThan(insertM.index);
  });
});
