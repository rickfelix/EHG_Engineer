// SD-LEO-INFRA-CHAIRMAN-DECISION-VIEW-001 — the staged Source-4 rework.
//
// WHAT THESE TESTS CAN AND CANNOT PROVE, stated up front so a green run is never mistaken for more
// than it is. The migration is TIER-2 and is never applied by the builder, so no test here proves
// the rewritten view returns correct rows. That was verified separately, read-only against live
// inside a rolled-back transaction: parse+typecheck OK, 894 rows new vs 894 live (identical),
// decided_at 232 of 658 populated where it was previously all 658 aliased, priority medium=421 /
// critical=237 where it was previously critical=658.
//
// What these tests DO pin is the shape of the staged SQL and the consumer contract that explains
// why decision_type must not change — so the reasoning behind the non-goal is executable rather
// than only written in a comment somebody can overrule.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { routeDecision } from '../../../lib/chairman/decision-queue.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const MIGRATION = path.join(root, 'database/chairman-gated/20260803_chairman_source4_rework.sql');
const ROLLBACK = path.join(root, 'database/chairman-gated/20260803_source4_rework_ROLLBACK.sql');

const sql = fs.readFileSync(MIGRATION, 'utf8');
const statement = sql.slice(sql.lastIndexOf('CREATE OR REPLACE VIEW public.chairman_all_decision_signals'));

/** The Source-4 branch only — so an assertion cannot be satisfied by a sibling that shares a literal. */
const source4 = (() => {
  const anchor = statement.indexOf('FROM (chairman_decisions cd');
  return statement.slice(statement.lastIndexOf('UNION ALL', anchor), statement.indexOf('UNION ALL', anchor));
})();

describe('TS-1: the title carries the real subject', () => {
  it('projects cd.summary and the real subtype', () => {
    expect(source4).toMatch(/cd\.summary/);
    expect(source4).toMatch(/cd\.decision_type/);
  });

  it('no longer synthesizes a Chairman Approval title', () => {
    expect(source4).not.toMatch(/concat\('Stage ', cd\.lifecycle_stage, ' Chairman Approval'\)/);
  });

  it('renders a placeholder rather than an empty title when summary is NULL', () => {
    // 22 of 658 rows have no summary; a bare cd.summary would render them blank, which is a
    // different flavour of the same "subjectless" complaint this SD exists to fix.
    expect(source4).toMatch(/COALESCE\(left\(cd\.summary, 120\), '\(no summary\)'\)/);
  });
});

describe('TS-2: decided_at is honest', () => {
  it('is no longer aliased from created_at', () => {
    expect(source4).not.toMatch(/cd\.created_at AS decided_at/);
  });

  // TWO-SIDED ON PURPOSE. Asserting only that the alias is gone would pass on a projection that
  // hardcodes NULL for every row, which silently discards the 232 rows that genuinely have a
  // decider. Both directions or the assertion is worthless.
  it('populates only where a decision was actually recorded, and NULLs the rest', () => {
    expect(source4).toMatch(/cd\.decided_by IS NOT NULL/);
    expect(source4).toMatch(/cd\.status <> 'pending'::text/);
    expect(source4).toMatch(/ELSE NULL::timestamp with time zone END AS decided_at/);
  });

  it('projects the uuid decider, not the text actor name', () => {
    // cd.decided_by is TEXT holding names like monitoring_agent; the union column is uuid.
    // Projecting it fails with "UNION types uuid and text cannot be matched" — found by validating
    // against live, not by reading the SQL.
    expect(source4).toMatch(/cd\.decided_by_user_id AS decided_by/);
    expect(source4).not.toMatch(/^\s+cd\.decided_by,\s*$/m);
  });
});

describe('TS-3: priority follows blocking', () => {
  it('is derived from cd.blocking rather than hardcoded critical', () => {
    expect(source4).toMatch(/CASE WHEN COALESCE\(cd\.blocking, false\) THEN 'critical'::text/);
  });

  it('does not project a bare critical literal as the whole expression', () => {
    expect(source4).not.toMatch(/^\s+'critical'::text AS priority,\s*$/m);
  });
});

describe('TS-4: THE GUARD — the routing key survives, and the reason is executable', () => {
  it('still projects chairman_approval as decision_type', () => {
    expect(source4).toMatch(/'chairman_approval'::text AS decision_type/);
  });

  // This is the test that stops a future reader from "finishing" the SD. The SD text literally asks
  // for rows to stop being relabeled as chairman_approval; a comment saying don't is not
  // enforcement. Here is what crossing that line actually costs:
  it('routeDecision resolves chairman_approval but CANNOT route a raw subtype', async () => {
    const writers = { chairmanDecide: async () => ({ ok: true }) };
    const routed = await routeDecision(
      { decisionType: 'chairman_approval', id: 'abc', decision: 'approve', rationale: 'r' }, writers);
    expect(routed.writer).toBe('chairmanDecide');
    expect(routed.error).toBeUndefined();

    for (const raw of ['session_question', 'framing_escalation', 'stage_gate', 'review']) {
      const broken = await routeDecision({ decisionType: raw, id: 'abc', decision: 'approve' }, writers);
      expect(broken.error, `${raw} must be unroutable`).toMatch(/unknown decision_type/);
      expect(broken.writer).toBeUndefined();
    }
  });
});

describe('TS-5: no collateral damage', () => {
  it('keeps all seven source branches', () => {
    expect((statement.match(/UNION ALL/g) || []).length).toBe(6); // 6 joins => 7 branches
  });

  // Losing security_invoker would make the view run with DEFINER privileges and silently bypass
  // RLS for every querying user. pg_class.reloptions is {security_invoker=on} live; the migration
  // states it explicitly rather than relying on CREATE OR REPLACE to retain reloptions.
  it('states security_invoker explicitly in BOTH the migration and its rollback', () => {
    expect(statement).toMatch(/WITH \(security_invoker = on\) AS/);
    expect(fs.readFileSync(ROLLBACK, 'utf8')).toMatch(/WITH \(security_invoker = on\) AS/);
  });

  it('targets chairman_all_decision_signals, NOT the wrapper', () => {
    // Targeting chairman_unified_decisions with a seven-branch UNION would destroy the wrapper's
    // session_question / harness_backlog / demo-venture filters.
    expect(statement).toMatch(/CREATE OR REPLACE VIEW public\.chairman_all_decision_signals/);
    expect(statement).not.toMatch(/CREATE OR REPLACE VIEW public\.chairman_unified_decisions/);
  });
});

describe('TS-6: the migration cannot be auto-applied', () => {
  it('lives outside every auto-scanned migration directory', () => {
    expect(MIGRATION).toContain('chairman-gated');
    for (const scanned of ['database/migrations', 'database/manual-updates', 'supabase/migrations']) {
      expect(fs.existsSync(path.join(root, scanned, path.basename(MIGRATION)))).toBe(false);
    }
  });

  it('carries no approved-by attestation, so the chairman gate cannot be satisfied by the file alone', () => {
    expect(sql).not.toMatch(/^-- @approved-by:/m);
  });

  it('ships a rollback carrying the pre-change definition', () => {
    const rb = fs.readFileSync(ROLLBACK, 'utf8');
    expect(rb).toMatch(/cd\.created_at AS decided_at/);      // the pre-change projection
    expect(rb).toMatch(/Chairman Approval/);                  // the pre-change title
    expect((rb.match(/UNION ALL/g) || []).length).toBe(6);
  });
});
