/**
 * SD-LEO-INFRA-DIRECTION-BLIND-KILL-001 -- migration-shape tests.
 *
 * The migration is chairman-gated (SECURITY-DEFINER RPCs governing venture lifecycle-stage
 * transitions) and cannot be self-applied by a worker session -- these tests prove the SQL TEXT
 * satisfies the two-sided contract: forward crossings of a kill/promotion gate still hard-require
 * an approved chairman decision; rollbacks out of that gate require cited provenance instead,
 * never a fabricated approval. Pattern mirrors
 * tests/unit/reject-path-venture-kill-migration-shape.test.js.
 */
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const MIGRATION_PATH = 'database/chairman-gated/20260830_direction_aware_kill_gate_and_honest_rollback_audit.sql';

describe('direction-aware kill-gate migration -- shape and two-sided contract', () => {
  let sql;
  let sqlNoComments;
  test('setup: read the migration', () => {
    sql = readFileSync(path.join(ROOT, MIGRATION_PATH), 'utf8');
    expect(sql.length).toBeGreaterThan(0);
    sqlNoComments = sql
      .split('\n')
      .map((line) => line.replace(/--.*$/, ''))
      .join('\n');
  });

  test('advance_venture_stage() gains the new backward-compatible p_rollback_provenance trailing param', () => {
    expect(sql).toMatch(
      /CREATE OR REPLACE FUNCTION public\.advance_venture_stage\(p_venture_id uuid, p_from_stage integer, p_to_stage integer, p_transition_type text DEFAULT 'normal'::text, p_rollback_provenance text DEFAULT NULL::text\)/
    );
  });

  test('fn_advance_venture_stage() signature is unchanged -- no new parameter added', () => {
    expect(sql).toMatch(
      /CREATE OR REPLACE FUNCTION public\.fn_advance_venture_stage\(p_venture_id uuid, p_from_stage integer, p_to_stage integer, p_handoff_data jsonb DEFAULT '\{\}'::jsonb, p_idempotency_key uuid DEFAULT NULL::uuid\)/
    );
  });

  describe('advance_venture_stage()', () => {
    let body;
    test('setup: isolate function body', () => {
      const fnMatch = sqlNoComments.match(
        /CREATE OR REPLACE FUNCTION public\.advance_venture_stage[\s\S]*?\$function\$;/
      );
      expect(fnMatch).not.toBeNull();
      body = fnMatch[0];
    });

    test('side (a) forward: gate_type IN (kill,promotion) forward crossing still hard-requires the approved decision, unchanged', () => {
      expect(body).toMatch(/v_is_forward_cross := p_to_stage > p_from_stage;/);
      expect(body).toMatch(/IF v_gate_type IN \('kill', 'promotion'\) THEN/);
      expect(body).toMatch(/IF v_is_forward_cross THEN/);
      expect(body).toMatch(/status = 'approved'/);
      expect(body).toMatch(/'error', 'gate_not_approved'/);
    });

    test('side (b) rollback: backward move requires non-empty p_rollback_provenance, never a fabricated approval', () => {
      expect(body).toMatch(/v_is_rollback := p_to_stage < p_from_stage;/);
      expect(body).toMatch(/ELSIF v_is_rollback THEN/);
      expect(body).toMatch(
        /IF p_rollback_provenance IS NULL OR length\(trim\(p_rollback_provenance\)\) = 0 THEN/
      );
      expect(body).toMatch(/'error', 'rollback_provenance_required'/);
      // The rollback branch must NOT touch chairman_decisions / require approval.
      const rollbackBranch = body.slice(
        body.indexOf('ELSIF v_is_rollback THEN'),
        body.indexOf('END IF;', body.indexOf('ELSIF v_is_rollback THEN'))
      );
      expect(rollbackBranch).not.toMatch(/chairman_decisions/);
      expect(rollbackBranch).not.toMatch(/gate_not_approved/);
    });

    test('transition_type is derived server-side from actual direction, not trusted verbatim from the caller', () => {
      expect(body).toMatch(
        /v_effective_transition_type := CASE WHEN v_is_rollback THEN 'rollback' ELSE COALESCE\(NULLIF\(p_transition_type, ''\), 'normal'\) END;/
      );
    });

    test('rollback_provenance is threaded into the audit row handoff_data', () => {
      expect(body).toMatch(/'rollback_provenance', p_rollback_provenance/);
    });
  });

  describe('fn_advance_venture_stage()', () => {
    let body;
    test('setup: isolate function body', () => {
      const fnMatch = sqlNoComments.match(
        /CREATE OR REPLACE FUNCTION public\.fn_advance_venture_stage[\s\S]*?\$function\$;/
      );
      expect(fnMatch).not.toBeNull();
      body = fnMatch[0];
    });

    test('side (a) forward: gate_type IN (kill,promotion) forward crossing still hard-requires the approved decision, unchanged', () => {
      expect(body).toMatch(/v_is_forward_cross := p_to_stage > p_from_stage;/);
      expect(body).toMatch(/IF v_gate_type IN \('kill', 'promotion'\) THEN/);
      expect(body).toMatch(/IF v_is_forward_cross THEN/);
      expect(body).toMatch(/'error', 'gate_blocked'/);
    });

    test('side (b) rollback: reuses the EXISTING p_handoff_data parameter for provenance -- no new parameter', () => {
      expect(body).toMatch(
        /v_rollback_provenance := p_handoff_data->>'rollback_provenance';/
      );
      expect(body).toMatch(/ELSIF v_is_rollback THEN/);
      expect(body).toMatch(
        /IF v_rollback_provenance IS NULL OR length\(trim\(v_rollback_provenance\)\) = 0 THEN/
      );
      expect(body).toMatch(/'error', 'rollback_provenance_required'/);
    });

    test('transition_type is now derived from actual direction -- pre-fix hardcoded literal \'normal\' is gone', () => {
      expect(body).toMatch(
        /v_effective_transition_type := CASE WHEN v_is_rollback THEN 'rollback' ELSE 'normal' END;/
      );
      // The INSERT itself must reference the derived variable, not a bare 'normal' literal.
      const insertMatch = body.match(/INSERT INTO venture_stage_transitions[\s\S]*?ON CONFLICT DO NOTHING;/);
      expect(insertMatch).not.toBeNull();
      expect(insertMatch[0]).toMatch(/v_effective_transition_type/);
      expect(insertMatch[0]).not.toMatch(/,\s*'normal',/);
    });

    test('review_mode gate is documented as out-of-scope and left textually unchanged (still direction-blind by design)', () => {
      expect(sql).toMatch(/UNCHANGED \(out of scope, see this file's header\): review_mode gate remains direction-blind\./);
      expect(body).toMatch(/IF v_review_mode = 'review' THEN/);
    });

    test('24->25 product_review block is documented as already direction-safe and left unchanged', () => {
      expect(sql).toMatch(/UNCHANGED \(already direction-safe, see this file's header\): hardcodes the exact forward pair\./);
      expect(body).toMatch(/IF p_from_stage = 24 AND p_to_stage = 25 THEN/);
    });
  });

  test('zero remaining direction-blind gate_type IN (kill,promotion) predicates outside a directional IF/ELSIF split', () => {
    // Every gate_type IN ('kill','promotion') occurrence must be immediately followed (within a
    // short window) by a direction check -- proves no bare, unconditional kill-gate branch survived.
    const gateChecks = [...sqlNoComments.matchAll(/IF v_gate_type IN \('kill', 'promotion'\) THEN/g)];
    expect(gateChecks.length).toBe(2); // one per function
    for (const match of gateChecks) {
      const windowStart = match.index;
      const window = sqlNoComments.slice(windowStart, windowStart + 400);
      expect(window).toMatch(/IF v_is_forward_cross THEN/);
    }
  });

  test('chairman-gated ceremony header is present (staged, not applied, @approved-by placeholder)', () => {
    expect(sql).toContain('STAGED, NOT APPLIED');
    expect(sql).toContain('@approved-by: PENDING');
  });

  test('out-of-scope AltifyAI rollback execution is documented, not silently dropped', () => {
    expect(sql).toContain('POST-CHAIRMAN-APPLY production');
    expect(sql).toContain('explicitly out of scope for this worker session');
  });

  test('migration classifies TIER-2 (chairman-gated) via the shared classifier', async () => {
    const { classifyMigration } = await import('../../scripts/lib/migration-tier-classifier.mjs');
    const result = await classifyMigration(sql);
    expect(result.tier).toBe(2);
  });
});
