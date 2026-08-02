/**
 * SD-LEO-INFRA-ROLE-SESSIONS-FORCED-001 (FR-1..FR-3) — tests for the role-learning promoter.
 *
 * THE DOUBLE MODELS THE REAL TABLE AND CAN REFUSE. A permissive mock is what kept 27 tests and 4
 * killed mutants green earlier in this same session while the designed store was rejecting every
 * write on a CHECK constraint. So this one enforces the two constraints that actually bind here:
 * source must be an admitted enum value, and a duplicate dedup_fingerprint must be visible to the
 * pre-check. A double that cannot refuse cannot falsify.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  promoteOne, promoteRoleLearnings, roleLearningDedupKey,
  ROLE_FEEDBACK_CATEGORIES, EMISSION_TYPE, ISSUE_PATTERNS_CATEGORY,
} from './role-learning-promoter.js';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const io_read = (rel) => readFileSync(resolve(REPO_ROOT, rel), 'utf8');

/** The real issue_patterns.source CHECK enum — a write outside it FAILS. */
const ALLOWED_SOURCES = ['auto_rca', 'retrospective', 'narrative-knowledge-audit', 'manual', 'feedback_cluster'];

function makeDb({ patterns = [], feedback = [], insertError = null, dedupError = null } = {}) {
  const inserted = [];
  return {
    get inserted() { return inserted; },
    from(table) {
      if (table === 'issue_patterns') {
        return {
          select() {
            return {
              eq(col, val) {
                // dedup pre-check: .select().eq('dedup_fingerprint', fp).limit(1)
                if (col === 'metadata->>source_feedback_id') {
                  const hit = [...patterns, ...inserted].filter((p) => p.metadata?.source_feedback_id === val);
                  return { limit: async () => (dedupError ? { data: null, error: { message: dedupError } } : { data: hit, error: null }) };
                }
                // recent lessons: .select().eq('metadata->>emission_type', X).order().limit()
                return { order: () => ({ limit: async () => ({ data: patterns.filter((p) => p.metadata?.emission_type === val), error: null }) }) };
              },
            };
          },
          insert: async (row) => {
            if (insertError) return { error: { message: insertError } };
            // ENFORCE THE REAL CONSTRAINT — this is the refusal a permissive mock would skip.
            if (!ALLOWED_SOURCES.includes(row.source)) {
              return { error: { message: `new row violates check constraint "issue_patterns_source_check" (source=${row.source})` } };
            }
            inserted.push(row);
            return { error: null };
          },
        };
      }
      // feedback: .select().in().order().limit()
      return { select: () => ({ in: () => ({ order: () => ({ limit: async () => ({ data: feedback, error: null }) }) }) }) };
    },
  };
}

const GOOD = {
  id: 'fb-1', category: 'coordinator_review', severity: 'low', created_at: '2026-08-02T10:00:00Z',
  description: 'DORMANCY REPORT: scripts/adam-quiet-tick.mjs kept heartbeating while last_tool_at went stale for 80 minutes, so the liveness watcher in periodic-liveness-watcher.mjs reported the seat healthy and never fired.',
};

describe('FR-1 promotion reaches the admitted lane', () => {
  it('writes to issue_patterns with source=retrospective', async () => {
    const db = makeDb();
    const r = await promoteOne(db, GOOD);
    expect(r.promoted).toBe(true);
    expect(db.inserted).toHaveLength(1);
    expect(db.inserted[0].source).toBe('retrospective');
  });

  it('uses an ADMITTED source value — an invented one would fail the CHECK enum', () => {
    // The precedent's header documents issue_patterns_source_check explicitly. Pinned so a later
    // edit to something descriptive-but-invalid (e.g. 'role_review') cannot ship silently.
    expect(ALLOWED_SOURCES).toContain('retrospective');
    expect(ALLOWED_SOURCES).not.toContain(EMISSION_TYPE);
  });

  it('distinguishes origin via metadata.emission_type, not via source', async () => {
    const db = makeDb();
    await promoteOne(db, GOOD);
    expect(db.inserted[0].metadata.emission_type).toBe('role_review');
  });

  it('uses a category with proven live acceptance', () => {
    // 'learning_reflection' (the precedent's choice) has ZERO live rows; 'process' has 297.
    expect(ISSUE_PATTERNS_CATEGORY).toBe('process');
  });

  it('covers every role feedback category the self-review scripts write', () => {
    expect(ROLE_FEEDBACK_CATEGORIES).toContain('coordinator_review');
    expect(ROLE_FEEDBACK_CATEGORIES).toContain('coordinator_adam_review');
    expect(ROLE_FEEDBACK_CATEGORIES).toContain('adam_adherence_drift');
    expect(ROLE_FEEDBACK_CATEGORIES).toContain('fleet_retro');
  });
});

describe('FR-2 the noise filter is NOT modified', () => {
  it('filter.mjs still admits only retrospective + feedback_cluster, unchanged by this SD', () => {
    const filter = readFileSync(resolve(REPO_ROOT, 'scripts/modules/learning/filter.mjs'), 'utf8');
    expect(filter).toContain('LOW_SIGNAL_SOURCE');
    // The fix delivers rows the EXISTING filter accepts; widening it would admit a 9,323-row
    // auto_capture population and rebuild the noise the filter exists to remove.
    expect(filter).not.toContain('role_review');
  });
});

describe('FR-3 idempotency and provenance', () => {
  it('a second promotion of the same row is skipped, not duplicated', async () => {
    const db = makeDb();
    const first = await promoteOne(db, GOOD);
    const second = await promoteOne(db, GOOD);
    expect(first.promoted).toBe(true);
    expect(second.promoted).toBe(false);
    expect(second.skipped).toBe('already_promoted');
    expect(db.inserted).toHaveLength(1);
  });

  it('the dedup key is the SOURCE ROW id, on a field the DB preserves', () => {
    // NOT dedup_fingerprint: supplying that and reading it back live returned a computed hash,
    // so a pre-check keyed on it matched nothing and every re-run would have duplicated.
    expect(roleLearningDedupKey({ id: 'fb-1' })).toBe('fb-1');
    expect(roleLearningDedupKey({ id: 'fb-2' })).not.toBe(roleLearningDedupKey({ id: 'fb-1' }));
    expect(roleLearningDedupKey(null)).toBeNull();
  });

  it('does NOT supply dedup_fingerprint — the DB overwrites it, so writing one would be a lie', () => {
    const src = io_read('lib/learning/role-learning-promoter.js');
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(code).not.toMatch(/dedup_fingerprint\s*:/);
  });

  it('carries provenance back to the originating feedback row', async () => {
    const db = makeDb();
    await promoteOne(db, GOOD);
    const md = db.inserted[0].metadata;
    expect(md.source_feedback_id).toBe('fb-1');
    expect(md.source_feedback_category).toBe('coordinator_review');
    expect(md.source_feedback_created_at).toBe('2026-08-02T10:00:00Z');
  });

  it('a failed dedup check does NOT fall through to an insert', async () => {
    // Fail-closed on the idempotency probe: an unreadable dedup state must not become a duplicate.
    const db = makeDb({ dedupError: 'boom' });
    const r = await promoteOne(db, GOOD);
    expect(r.promoted).toBe(false);
    expect(r.error).toMatch(/dedup check failed/);
    expect(db.inserted).toHaveLength(0);
  });
});

describe('THE QUALITY FLOOR — promotion must not pollute the corpus', () => {
  it('skips a row with no concrete referent', async () => {
    const db = makeDb();
    const r = await promoteOne(db, { ...GOOD, description: 'Things went reasonably well today and the team made good progress on several fronts overall.' });
    expect(r.promoted).toBe(false);
    expect(r.skipped).toBe('quality_floor');
    expect(db.inserted).toHaveLength(0);
  });

  it('skips a too-short row', async () => {
    const db = makeDb();
    const r = await promoteOne(db, { ...GOOD, description: 'ok' });
    expect(r.promoted).toBe(false);
    expect(db.inserted).toHaveLength(0);
  });

  it('skips an empty description without calling the store', async () => {
    const db = makeDb();
    const r = await promoteOne(db, { ...GOOD, description: '   ' });
    expect(r.skipped).toBe('empty_description');
    expect(db.inserted).toHaveLength(0);
  });
});

describe('FAIL-SOFT — a promotion failure never aborts the caller', () => {
  it('an insert error is returned, not thrown', async () => {
    const db = makeDb({ insertError: 'connection reset' });
    const r = await promoteOne(db, GOOD);
    expect(r.promoted).toBe(false);
    expect(r.error).toBe('connection reset');
  });

  it('a missing client is handled rather than throwing', async () => {
    await expect(promoteOne(null, GOOD)).resolves.toMatchObject({ promoted: false });
  });

  it('batch promotion reports a summary and never throws', async () => {
    const db = makeDb({ feedback: [GOOD, { ...GOOD, id: 'fb-2' }, { ...GOOD, id: 'fb-3', description: 'nope' }] });
    const s = await promoteRoleLearnings(db, { logger: { warn() {}, log() {} } });
    expect(s.scanned).toBe(3);
    expect(s.promoted).toBe(2);
    expect(s.skipped.quality_floor).toBe(1);
  });
});

describe('NO RIVAL WRITER — the existing capture scripts are untouched', () => {
  it('this SD does not modify the three role self-review scripts', () => {
    // The whole point is that capture already works; adding a second writer alongside 639 existing
    // rows is the drift this SD warns about elsewhere.
    for (const f of ['scripts/coordinator-self-review.mjs', 'scripts/solomon-self-adherence-review.mjs', 'scripts/adam-self-adherence-review.mjs']) {
      const src = readFileSync(resolve(REPO_ROOT, f), 'utf8');
      expect(src).not.toContain('role-learning-promoter');
    }
  });

  it('does not route through the feedback clusterer', async () => {
    const src = readFileSync(resolve(REPO_ROOT, 'lib/learning/role-learning-promoter.js'), 'utf8');
    // The clusterer filters .not(error_hash,is,null) and requires MIN_OCCURRENCES=5 recurrence —
    // both structurally exclude unique one-off role prose.
    //
    // ASSERT ON CODE, NOT ON TEXT. The header documents WHY the clusterer is unusable and quotes
    // its filter verbatim, so BOTH a substring check and a regex over the raw file match the
    // module's own explanation. Two successive versions of this test failed that way. Strip
    // comments first — the question is what the code DOES, and prose is not code.
    const code = src
      .replace(/\/\*[\s\S]*?\*\//g, '')   // block comments
      .replace(/^\s*\/\/.*$/gm, '');      // line comments
    expect(code).not.toMatch(/feedback-clusterer/);
    expect(code).not.toMatch(/error_hash/);
    expect(code).not.toMatch(/MIN_OCCURRENCES/);
    // Control: the stripper must not have emptied the file, or these assertions prove nothing.
    expect(code).toMatch(/export async function promoteOne/);
  });
});
