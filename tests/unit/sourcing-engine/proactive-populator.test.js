/**
 * SD-LEO-INFRA-SOURCING-ENGINE-PROACTIVE-POPULATOR-001 — pure unit tests.
 * Corpus enumeration + dedup (FR-1), classify+route via the shipped router (FR-2), the per-lane/
 * per-rung report (FR-5), and the HARD-SAFEGUARDED staged-write: dry-run by default, writes only when
 * apply AND chairman-approved, never promotes, idempotent, dormant-safe (FR-3/FR-4).
 */
import { describe, it, expect } from 'vitest';
import {
  corpusSourceType,
  buildCorpus,
  classifyCandidate,
  routeCorpus,
  buildReport,
  stageCorpus,
} from '../../../lib/sourcing-engine/proactive-populator.js';

describe('corpusSourceType — maps to a live-allowed roadmap_wave_items.source_type', () => {
  it('todoist_todo -> todoist, youtube_playlist -> youtube, else brainstorm', () => {
    expect(corpusSourceType({ source_pool: 'todoist_todo' })).toBe('todoist');
    expect(corpusSourceType({ source_pool: 'youtube_playlist' })).toBe('youtube');
    expect(corpusSourceType({ source_pool: 'estate_corpus' })).toBe('brainstorm');
    expect(corpusSourceType({})).toBe('brainstorm');
  });
});

describe('buildCorpus — enumerate 4 sources, dedup by (source_type, source_id) (FR-1)', () => {
  it('merges the 4 sources and dedups the same intake item', () => {
    const corpus = buildCorpus({
      ledger: [{ id: 'L1', source_pool: 'todoist_todo', title: 'A' }, { id: 'L1', source_pool: 'todoist_todo', title: 'A dup' }],
      wave6: [{ id: 'W1', source_type: 'youtube', source_id: 'yt-1', title: 'W', item_disposition: 'pending' }],
      deferred: [{ id: 'D1', sd_key: 'SD-D', title: 'Deferred thing' }],
      backlog: [{ id: 'B1', title: 'Backlog thing' }],
    });
    // L1 appears twice but same (todoist, L1) -> collapses to 1; total = 1 + 1 + 1 + 1 = 4
    expect(corpus).toHaveLength(4);
    expect(corpus.filter((c) => c.corpus === 'conversion_ledger')).toHaveLength(1);
    expect(corpus.find((c) => c.corpus === 'wave6').alreadyStaged).toBe(true);
    expect(corpus.find((c) => c.corpus === 'deferred_v2').sdKeyHint).toBe('SD-D');
  });

  it('skips items with no source_id', () => {
    expect(buildCorpus({ backlog: [{ title: 'no id' }] })).toHaveLength(0);
  });
});

describe('classifyCandidate — risk-keyword -> authority / needsOutcome (FR-2)', () => {
  it('credential/auth/payment text -> chairman authority', () => {
    expect(classifyCandidate({ title: 'Rotate the Stripe API key' }).authority).toBe('credential');
    expect(classifyCandidate({ title: 'Fix RLS on ventures' }).authority).toBe('credential');
  });
  it('revenue/venture/operational text -> needsOutcome', () => {
    expect(classifyCandidate({ title: 'Take a real dollar from a live customer' }).needsOutcome).toBe(true);
    expect(classifyCandidate({ title: 'distance-to-broke gauge' }).needsOutcome).toBe(true);
  });
  it('ordinary build text -> neither (residual belt-ready)', () => {
    const c = classifyCandidate({ title: 'Refactor the gate pipeline' });
    expect(c.authority).toBeUndefined();
    expect(c.needsOutcome).toBeUndefined();
  });
});

describe('routeCorpus + buildReport — differentiated lanes (FR-2/FR-5)', () => {
  const corpus = buildCorpus({
    backlog: [
      { id: 'b1', title: 'Add RLS to payments table' },     // chairman-gated
      { id: 'b2', title: 'Take a real dollar live revenue' }, // outcome-gated
      { id: 'b3', title: 'Refactor the router' },             // belt-ready
    ],
  });

  it('routes each candidate and the report tallies per lane', () => {
    const routed = routeCorpus(corpus, { existing: [], inFlight: [] });
    const report = buildReport(routed);
    expect(report.total).toBe(3);
    expect(report.by_lane['chairman-gated']).toBe(1);
    expect(report.by_lane['outcome-gated']).toBe(1);
    expect(report.by_lane['belt-ready']).toBe(1);
    expect(report.samples.length).toBeGreaterThan(0);
  });

  it('dedup matches an existing SD by title (>=2-token shipped router)', () => {
    const dupCorpus = buildCorpus({ backlog: [{ id: 'b9', title: 'Calibrate the gates cohort' }] });
    const routed = routeCorpus(dupCorpus, { existing: [{ sd_key: 'SD-EXIST', title: 'Calibrate the gates cohort' }] });
    expect(routed[0].lane).toBe('dedup');
    expect(routed[0].dedup_match_sd_key).toBe('SD-EXIST');
  });
});

describe('stageCorpus — HARD safeguards: dry-run default, chairman-gated, never promotes (FR-3/FR-4)', () => {
  const routed = [
    { corpus: 'harness_backlog', source_type: 'brainstorm', source_id: 'b1', title: 'X', lane: 'belt-ready' },
    { corpus: 'wave6', source_type: 'youtube', source_id: 'w1', title: 'Y', lane: 'belt-ready', alreadyStaged: true },
  ];
  const fakeDb = (insertErr) => { const inserted = []; return { inserted, from: () => ({ insert: (row) => { if (!insertErr) inserted.push(row); return Promise.resolve(insertErr ? { error: insertErr } : { error: null }); } }) }; };

  it('DRY-RUN by default (apply omitted): counts, writes nothing', async () => {
    const db = fakeDb();
    const res = await stageCorpus(db, routed, { waveId: 'wave-1', lanePresent: false });
    expect(res.dry_run).toBe(true);
    expect(res.staged).toBe(1); // the non-alreadyStaged one would-stage
    expect(res.skipped).toBe(1); // wave6 already staged
    expect(db.inserted).toHaveLength(0);
  });

  it('apply WITHOUT chairman-approval stays dry-run (writes nothing)', async () => {
    const db = fakeDb();
    const res = await stageCorpus(db, routed, { apply: true, chairmanApproved: false, waveId: 'wave-1', lanePresent: false });
    expect(res.dry_run).toBe(true);
    expect(db.inserted).toHaveLength(0);
  });

  it('apply AND chairman-approved stages at item_disposition=pending, NEVER sets promoted_to_sd_key', async () => {
    const db = fakeDb();
    const res = await stageCorpus(db, routed, { apply: true, chairmanApproved: true, waveId: 'wave-1', lanePresent: true });
    expect(res.dry_run).toBe(false);
    expect(db.inserted).toHaveLength(1);
    const row = db.inserted[0];
    expect(row.item_disposition).toBe('pending');
    expect(row).not.toHaveProperty('promoted_to_sd_key');
    expect(row.metadata.sourced_by).toBe('proactive-populator');
    expect(row.lane).toBe('belt-ready'); // lanePresent -> lane stamped
  });

  it('idempotent: a 23505 unique-violation is treated as already-staged (skipped, not an error)', async () => {
    const db = fakeDb({ code: '23505', message: 'duplicate key' });
    const res = await stageCorpus(db, routed, { apply: true, chairmanApproved: true, waveId: 'wave-1', lanePresent: true });
    expect(res.errors).toHaveLength(0);
    expect(res.skipped).toBeGreaterThanOrEqual(1);
  });

  it('no wave => forced dry-run (never inserts an orphan)', async () => {
    const db = fakeDb();
    const res = await stageCorpus(db, routed, { apply: true, chairmanApproved: true, waveId: null, lanePresent: true });
    expect(res.dry_run).toBe(true);
    expect(db.inserted).toHaveLength(0);
  });
});
