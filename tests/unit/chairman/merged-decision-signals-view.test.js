// QF-20260816-456 — the merged chairman_all_decision_signals migration.
//
// WHAT THESE TESTS CAN AND CANNOT PROVE. Like its two superseded predecessors, this migration is
// TIER-2 and is never applied by the builder, so no test here proves the merged view returns
// correct rows from an assertion alone. That was verified separately, live, inside a rolled-back
// transaction: row count 1047 -> 1047 (stable), a real ratified-hold row rendered status='held'
// with a self-explaining title, a real decided row surfaced its actual decided_by instead of NULL,
// and security_invoker=on survived. See the PR body for the full transcript.
//
// What these tests DO pin is that the merge actually carries BOTH predecessors' fixes forward —
// which is the entire point of merging rather than picking one — so a future edit cannot silently
// drop one side's contribution while leaving the other intact.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { routeDecision } from '../../../lib/chairman/decision-queue.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const MIGRATION = path.join(root, 'database/chairman-gated/20260817_chairman_all_decision_signals_merged.sql');
const DOWN = path.join(root, 'database/chairman-gated/20260817_chairman_all_decision_signals_merged_DOWN.sql');
const CONTROL = path.join(root, 'database/chairman-gated/20260817_chairman_all_decision_signals_merged_CONTROL.sql');
const FILE_A = path.join(root, 'database/chairman-gated/20260803_chairman_queue_truthful_render.sql');
const FILE_B = path.join(root, 'database/chairman-gated/20260803_chairman_source4_rework.sql');

const sql = fs.readFileSync(MIGRATION, 'utf8');
const statement = sql.slice(sql.indexOf('CREATE OR REPLACE VIEW public.chairman_all_decision_signals'), sql.indexOf('COMMIT;'));

/** Branch 4 only (chairman_decisions) — the branch both rivals touched. */
const branch4 = (() => {
  const anchor = statement.indexOf('FROM chairman_decisions cd');
  return statement.slice(statement.lastIndexOf('UNION ALL', anchor), statement.indexOf('UNION ALL', anchor + 1) === -1 ? statement.length : statement.indexOf('UNION ALL', statement.indexOf('flag_review')));
})();

/** Branch 3 only (venture_decisions, decision IS NOT NULL) — the second HELD-status site. */
const branch3 = (() => {
  const notNullIdx = statement.indexOf('WHERE vd.decision IS NOT NULL');
  const start = statement.lastIndexOf('UNION ALL', notNullIdx);
  return statement.slice(start, notNullIdx);
})();

describe('MERGE-1: File A survives — HELD rendering for parked decisions', () => {
  it('branch 4 checks the ratified-hold marker for title, priority, and status', () => {
    expect(branch4).toMatch(/cd\.brief_data->'hold'->>'ratified' = 'true'/);
    expect((branch4.match(/cd\.brief_data->'hold'->>'ratified' = 'true'/g) || []).length).toBe(3);
  });

  it('branch 4 title explains a hold with the unpark trigger, not a bare label', () => {
    expect(branch4).toMatch(/HELD until: /);
    expect(branch4).toMatch(/unpark_trigger/);
    expect(branch4).toMatch(/trigger NOT RECORDED/);
  });

  it('branch 4 status resolves held for both a ratified park and a bare decision=pause', () => {
    expect(branch4).toMatch(/THEN 'held'::text/);
    expect(branch4).toMatch(/WHEN cd\.decision::text = 'pause'::text THEN 'held'::text/);
  });

  it('branch 4 no longer buckets pause into the same rejected array as kill', () => {
    expect(branch4).not.toMatch(/ARRAY\['kill'[^\]]*'pause'/);
  });

  it('branch 3 (venture_decisions) carries the identical pause -> held fix', () => {
    expect(branch3).toMatch(/WHEN vd\.decision = 'pause'::text THEN 'held'::text/);
    expect(branch3).not.toMatch(/ARRAY\['kill'[^\]]*'pause'/);
  });
});

describe('MERGE-2: File B survives — honest decided_at/decided_by and blocking-based priority', () => {
  it('decided_at is conditional, not aliased from created_at', () => {
    expect(branch4).not.toMatch(/cd\.created_at AS decided_at/);
    expect(branch4).toMatch(/cd\.decided_by IS NOT NULL/);
    expect(branch4).toMatch(/cd\.status <> 'pending'::text/);
  });

  it('projects the uuid decider column, not the legacy text actor column', () => {
    expect(branch4).toMatch(/cd\.decided_by_user_id AS decided_by/);
    expect(branch4).not.toMatch(/^\s+cd\.decided_by,\s*$/m);
  });

  it('priority is blocking-based, not an unconditional critical literal', () => {
    expect(branch4).toMatch(/COALESCE\(cd\.blocking, false\) THEN 'critical'::text/);
    expect(branch4).not.toMatch(/^\s+'critical'::text AS priority,\s*$/m);
  });
});

describe('MERGE-3: the merge adds one thing neither predecessor had alone', () => {
  it('a ratified hold softens priority even when blocking=true (or B\'s priority fix regresses)', () => {
    // Without this override, a parked-but-blocking row would render 'critical' forever — the exact
    // "already-decided row reads critical" defect class File B's own header measured (114 rows).
    const priorityBlock = branch4.slice(branch4.indexOf('AS priority') - 400, branch4.indexOf('AS priority'));
    expect(priorityBlock).toMatch(/ratified'\s*=\s*'true'\s*THEN\s*'normal'::text/s);
  });
});

describe('MERGE-4: THE GUARD — decision_type stays the routing key', () => {
  it('branch 4 still projects chairman_approval as decision_type', () => {
    expect(branch4).toMatch(/'chairman_approval'::text AS decision_type/);
  });

  it('the real subtype reaches the title, not the routing column', () => {
    expect(branch4).toMatch(/cd\.decision_type/);
    expect(branch4).toMatch(/cd\.summary/);
  });

  it('routeDecision resolves chairman_approval but cannot route a raw subtype', async () => {
    const writers = { chairmanDecide: async () => ({ ok: true }) };
    const routed = await routeDecision(
      { decisionType: 'chairman_approval', id: 'abc', decision: 'approve', rationale: 'r' }, writers);
    expect(routed.writer).toBe('chairmanDecide');
    expect(routed.error).toBeUndefined();

    const broken = await routeDecision({ decisionType: 'portfolio_review', id: 'abc', decision: 'approve' }, writers);
    expect(broken.error).toMatch(/unknown decision_type/);
    expect(broken.writer).toBeUndefined();
  });
});

describe('MERGE-5: no collateral damage', () => {
  it('keeps all seven source branches', () => {
    expect((statement.match(/UNION ALL/g) || []).length).toBe(6); // 6 joins => 7 branches
  });

  it('states security_invoker explicitly in the migration', () => {
    expect(statement).toMatch(/WITH \(security_invoker = on\) AS/);
  });

  it('targets chairman_all_decision_signals, not the wrapper', () => {
    expect(statement).toMatch(/CREATE OR REPLACE VIEW public\.chairman_all_decision_signals/);
    expect(statement).not.toMatch(/CREATE OR REPLACE VIEW public\.chairman_unified_decisions/);
  });
});

describe('MERGE-6: staging discipline', () => {
  it('lives outside every auto-scanned migration directory', () => {
    expect(MIGRATION).toContain('chairman-gated');
    for (const scanned of ['database/migrations', 'database/manual-updates', 'supabase/migrations']) {
      expect(fs.existsSync(path.join(root, scanned, path.basename(MIGRATION)))).toBe(false);
    }
  });

  it('carries no approved-by attestation', () => {
    expect(sql).not.toMatch(/^-- @approved-by:/m);
  });

  it('ships a DOWN file with the exact pre-merge definition (all three original defects present)', () => {
    const down = fs.readFileSync(DOWN, 'utf8');
    expect(down).toMatch(/cd\.created_at AS decided_at/);
    expect(down).toMatch(/'critical'::text AS priority/);
    expect(down).toMatch(/concat\('Stage ', cd\.lifecycle_stage, ' Chairman Approval'\)/);
    expect((down.match(/UNION ALL/g) || []).length).toBe(6);
  });

  it('ships a CONTROL file with all four checks and no hardcoded row-count literal', () => {
    const control = fs.readFileSync(CONTROL, 'utf8');
    expect(control).toMatch(/check_1_row_count_stable/);
    expect(control).toMatch(/check_2_ratified_hold_renders_held/);
    expect(control).toMatch(/check_3_ratified_hold_title_explains_itself/);
    expect(control).toMatch(/check_4_decided_row_shows_real_decider/);
    // pre_count is a bind parameter, not a literal — a hardcoded number would go stale by ceremony time.
    expect(control).toMatch(/:pre_count/);
  });
});

describe('MERGE-7: both rivals point at their successor', () => {
  it('File A is marked superseded-by this migration', () => {
    expect(fs.readFileSync(FILE_A, 'utf8')).toMatch(/SUPERSEDED-BY: database\/chairman-gated\/20260817_chairman_all_decision_signals_merged\.sql/);
  });

  it('File B is marked superseded-by this migration', () => {
    expect(fs.readFileSync(FILE_B, 'utf8')).toMatch(/SUPERSEDED-BY: database\/chairman-gated\/20260817_chairman_all_decision_signals_merged\.sql/);
  });
});
