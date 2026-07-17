import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import {
  compareReadings, buildOversightLoopRow, OVERSIGHT_LOOP_KEY, EVIDENCE_FRESHNESS_SECONDS,
} from '../../../lib/oversight/coordinator-health-recompute.mjs';
import { PREDICATE_TYPES, validateClosurePredicate } from '../../../lib/loop-governance/closure-engine.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));

describe('TS-4 S4 recompute comparison (fail-loud)', () => {
  it('identical readings pass; divergence alarms; unavailable fields alarm (never null-coalesced)', () => {
    const ok = compareReadings({ in_flight: 5, draft_unclaimed: 3 }, { in_flight: 5, draft_unclaimed: 3 });
    expect(ok.recompute_ok).toBe(true);
    const div = compareReadings({ in_flight: 5, draft_unclaimed: 3 }, { in_flight: 7, draft_unclaimed: 3 });
    expect(div.recompute_ok).toBe(false);
    expect(div.divergences[0]).toMatchObject({ field: 'in_flight', probe: 5, raw: 7, reason: 'diverged' });
    const missing = compareReadings({ in_flight: 5 }, { in_flight: 5, draft_unclaimed: 3 });
    expect(missing.recompute_ok).toBe(false);
    expect(missing.divergences[0].reason).toBe('unavailable');
  });

  it('the recompute module never imports the supabase-js write path (different-code-path guard)', () => {
    const src = readFileSync(path.join(HERE, '../../../lib/oversight/coordinator-health-recompute.mjs'), 'utf8');
    expect(src).not.toMatch(/@supabase\/supabase-js/);
    expect(src).not.toMatch(/createClient\(/);
    expect(src).toMatch(/pgClient\.query/); // raw SQL path is the only compute path
  });
});

describe('TS-5 S5 oversight loop registration row', () => {
  it('uses the canonical predicate taxonomy with ITEM-2 freshness decay + provenance', () => {
    const row = buildOversightLoopRow();
    expect(row.loop_key).toBe(OVERSIGHT_LOOP_KEY);
    expect(row.predicate_type).toBe(PREDICATE_TYPES.EDGE_FRESHNESS);
    expect(row.closure_predicate.window_seconds).toBe(EVIDENCE_FRESHNESS_SECONDS); // decay: stale reading reverts CLOSE
    expect(row.closure_predicate.authorized_writer).toBe('adam-coordinator-health.mjs'); // provenance: maker/checker
    expect(row.closure_predicate.evidence_table).toBe('codebase_health_snapshots');
    expect(row.closure_predicate.evidence_filter.dimension).toBe('adam_coordinator_health');
  });
  it('passes the closure-engine registration validator (machine-checkable predicate)', () => {
    const verdict = validateClosurePredicate(buildOversightLoopRow());
    expect(verdict.valid).toBe(true);
    expect(verdict.reasons).toEqual([]);
  });
});
