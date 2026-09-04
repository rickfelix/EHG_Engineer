/**
 * SD-LEO-ORCH-CAPA-RECORD-TRUTH-002-E -- per-field audit triggers on 4
 * previously-unaudited tables (quick_fixes, claude_sessions, feedback,
 * chairman_ratifications) plus 3 CHECK constraints pairing quick_fixes'
 * disposition with its required target/status.
 *
 * Hermetic source-assertions on the migration file (no DB connection) --
 * mirrors tests/unit/database/claim-sd-claim-switch-clobber-guard.test.js.
 * Live trigger-firing/actor-resolution behavior (TS-1, TS-2, TS-4, TS-5, TS-6
 * from the PRD) requires a live DB and is out of scope for this hermetic tier
 * -- covered separately by an integration script per the TESTING sub-agent's
 * PLAN-TO-EXEC evidence (row 65dd914d-9f7a-402c-bafd-d5a109ab566b).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const migration = readFileSync(
  path.resolve(
    process.cwd(),
    'database/migrations',
    '20260904_capa_002e_audit_triggers_and_disposition_constraints.sql'
  ),
  'utf8'
);

describe('SD-LEO-ORCH-CAPA-RECORD-TRUTH-002-E: audit_trigger_generic()', () => {
  const fnBodyOnly = migration.slice(
    migration.indexOf('AS $function$'),
    migration.indexOf('$function$;')
  );

  it('uses to_jsonb extraction exclusively, never a direct NEW.col/OLD.col reference to a table-specific column', () => {
    expect(fnBodyOnly).toMatch(/v_new := to_jsonb\(NEW\)/);
    expect(fnBodyOnly).toMatch(/v_old := to_jsonb\(OLD\)/);
    // No bare NEW.<col> or OLD.<col> reference to any actor-ish column (would
    // runtime-error on a table missing that column) -- only NEW/OLD as whole
    // record args to to_jsonb() and TG_OP/TG_TABLE_NAME are permitted. Scoped
    // to the function body only -- the header comment prose legitimately
    // mentions NEW.created_by/NEW.updated_by when explaining why the existing
    // governance_audit_trigger() function could not be reused.
    expect(fnBodyOnly).not.toMatch(/NEW\.(created_by|updated_by|disposed_by|verified_by)/);
    expect(fnBodyOnly).not.toMatch(/OLD\.(created_by|updated_by|disposed_by|verified_by)/);
  });

  it('resolves changed_by via an 8-candidate COALESCE with a SYSTEM fallback', () => {
    const fnBody = migration.slice(
      migration.indexOf('v_changed_by := COALESCE('),
      migration.indexOf(');', migration.indexOf('v_changed_by := COALESCE('))
    );
    for (const col of [
      'disposed_by', 'verified_by', 'triaged_by', 'assigned_to',
      'promoted_by', 'scribe_seat', 'created_by', 'session_id', 'claiming_session_id',
    ]) {
      expect(fnBody).toMatch(new RegExp(`->>'${col}'`));
    }
    expect(fnBody).toMatch(/'SYSTEM'/);
  });

  it('writes to governance_audit_log with table_name, record_id, operation, both value snapshots, and changed_by', () => {
    expect(migration).toMatch(/INSERT INTO public\.governance_audit_log \(/);
    expect(migration).toMatch(/table_name, record_id, operation, old_values, new_values, changed_by, changed_at/);
  });

  it('never lets a governance_audit_log write failure abort the caller (ROOT-FIX-TRG doctrine)', () => {
    // public.feedback has live, permissive anon-role INSERT policies
    // (20260802_bound_anon_feedback_ingress.sql) while governance_audit_log
    // has had no anon INSERT policy since the 2025-12-17 hardening -- an
    // unguarded trigger would abort a legitimate anon feedback submission.
    // SECURITY sub-agent finding SEC-1 (row d896818a-9fa4-4791-90d8-1613f25027a0).
    const insertIdx = fnBodyOnly.indexOf('INSERT INTO public.governance_audit_log');
    const guardedBlock = fnBodyOnly.slice(
      fnBodyOnly.lastIndexOf('BEGIN', insertIdx),
      fnBodyOnly.indexOf('END;', insertIdx)
    );
    expect(guardedBlock).toMatch(/EXCEPTION WHEN OTHERS THEN/);
    expect(guardedBlock).toMatch(/RAISE WARNING/);
    expect(guardedBlock).toMatch(/SQLERRM/);
  });

  it('is SECURITY DEFINER, or the audit write it just wrapped in EXCEPTION WHEN OTHERS would silently swallow every anon/authenticated write', () => {
    // governance_audit_log has RLS with only a {service_role} INSERT policy.
    // Without SECURITY DEFINER, the function runs as INVOKER, so an anon
    // feedback INSERT's audit write gets RLS-denied and eaten by the SEC-1
    // guard above -- defeating audit coverage for exactly the untrusted
    // actors it exists to cover. Independent adversarial review CRITICAL
    // finding.
    const fnHeader = migration.slice(
      migration.indexOf('CREATE OR REPLACE FUNCTION public.audit_trigger_generic()'),
      migration.indexOf('AS $function$')
    );
    expect(fnHeader).toMatch(/SECURITY DEFINER/);
    expect(fnHeader).toMatch(/SET search_path TO 'public', 'extensions'/);
  });
});

describe('SD-LEO-ORCH-CAPA-RECORD-TRUTH-002-E: trigger attachment', () => {
  it('attaches idempotent INSERT/UPDATE/DELETE triggers to quick_fixes and feedback', () => {
    for (const table of ['quick_fixes', 'feedback']) {
      expect(migration).toMatch(new RegExp(`DROP TRIGGER IF EXISTS audit_${table} ON public\\.${table};`));
      const idx = migration.indexOf(`CREATE TRIGGER audit_${table}`);
      expect(idx).toBeGreaterThan(-1);
      const stmt = migration.slice(idx, migration.indexOf(';', idx) + 1);
      expect(stmt).toMatch(/AFTER INSERT OR UPDATE OR DELETE/);
      expect(stmt).toMatch(new RegExp(`ON public\\.${table}`));
      expect(stmt).toMatch(/FOR EACH ROW EXECUTE FUNCTION public\.audit_trigger_generic\(\)/);
    }
  });

  it('splits claude_sessions into an unfiltered INSERT/DELETE trigger and a WHEN-filtered UPDATE trigger, never a blanket AFTER UPDATE', () => {
    // Table receives a heartbeat UPDATE on nearly every fleet tick (measured
    // live: 5.9M updates already on this table) -- an unfiltered AFTER
    // UPDATE trigger would grow governance_audit_log unboundedly on pure
    // liveness noise. Independent adversarial review CRITICAL finding.
    expect(migration).toMatch(/DROP TRIGGER IF EXISTS audit_claude_sessions ON public\.claude_sessions;/);
    const insDelIdx = migration.indexOf('CREATE TRIGGER audit_claude_sessions\n');
    expect(insDelIdx).toBeGreaterThan(-1);
    const insDelStmt = migration.slice(insDelIdx, migration.indexOf(';', insDelIdx) + 1);
    expect(insDelStmt).toMatch(/AFTER INSERT OR DELETE ON public\.claude_sessions/);
    expect(insDelStmt).not.toMatch(/UPDATE/);

    expect(migration).toMatch(/DROP TRIGGER IF EXISTS audit_claude_sessions_update ON public\.claude_sessions;/);
    const updIdx = migration.indexOf('CREATE TRIGGER audit_claude_sessions_update');
    expect(updIdx).toBeGreaterThan(-1);
    const updStmt = migration.slice(updIdx, migration.indexOf('EXECUTE FUNCTION public.audit_trigger_generic();', updIdx));
    expect(updStmt).toMatch(/AFTER UPDATE ON public\.claude_sessions/);
    expect(updStmt).toMatch(/WHEN \(/);
    for (const col of ['sd_key', 'status', 'released_at', 'current_phase']) {
      expect(updStmt).toMatch(new RegExp(`OLD\\.${col} IS DISTINCT FROM NEW\\.${col}`));
    }
    // heartbeat/telemetry churn columns must NOT be in the WHEN filter
    expect(updStmt).not.toMatch(/heartbeat_at/);
    expect(updStmt).not.toMatch(/current_tool/);
  });

  it('attaches an INSERT-only trigger to chairman_ratifications, documenting why UPDATE/DELETE are omitted', () => {
    expect(migration).toMatch(/DROP TRIGGER IF EXISTS audit_chairman_ratifications ON public\.chairman_ratifications;/);
    const idx = migration.indexOf('CREATE TRIGGER audit_chairman_ratifications');
    const stmt = migration.slice(idx, migration.indexOf(';', idx) + 1);
    expect(stmt).toMatch(/AFTER INSERT ON public\.chairman_ratifications/);
    expect(stmt).not.toMatch(/UPDATE OR DELETE/);
    expect(migration).toMatch(/CHAIRMAN_RATIFICATIONS IS INSERT-ONLY BY DESIGN/);
  });
});

describe('SD-LEO-ORCH-CAPA-RECORD-TRUTH-002-E: backfill ordering and completeness', () => {
  // Scoped to executable SQL only (after the opening BEGIN;) -- the header
  // comment prose also mentions 'legacy_grandfathered' by name, and anchoring
  // on the whole-file text would pass by matching that prose instead of the
  // real ALTER statement, which is the bug the TESTING sub-agent found in an
  // earlier version of this test (row 2f817664-9aad-48d1-8405-9152910b5cc1).
  const executableSql = migration.slice(migration.indexOf('\nBEGIN;'));

  it('widens the disposition enum to include legacy_grandfathered before it is used', () => {
    const widenIdx = executableSql.indexOf('ADD CONSTRAINT quick_fixes_disposition_check');
    const firstUseIdx = executableSql.indexOf("SET disposition = 'legacy_grandfathered'");
    expect(widenIdx).toBeGreaterThan(-1);
    expect(firstUseIdx).toBeGreaterThan(widenIdx);
    // and the widened CHECK clause itself must actually list the new value
    const alterStmt = executableSql.slice(widenIdx, executableSql.indexOf(');', widenIdx));
    expect(alterStmt).toMatch(/'legacy_grandfathered'/);
  });

  it('reclassifies the 2 SD-superseded duplicate_of rows before the duplicate_of_id backfill target check', () => {
    expect(migration).toMatch(/'QF-20260728-471', 'QF-20260801-736'/);
    expect(migration).toMatch(/SET disposition = 'premise_resolved'/);
  });

  it('backfills duplicate_of_id for exactly the 3 rows with a verified live QF target', () => {
    expect(migration).toMatch(/duplicate_of_id = 'QF-20260801-785'[\s\S]*?id = 'QF-20260728-209'/);
    expect(migration).toMatch(/duplicate_of_id = 'QF-20260719-986'[\s\S]*?id = 'QF-20260727-004'/);
    expect(migration).toMatch(/duplicate_of_id = 'QF-20260818-249'[\s\S]*?id = 'QF-20260727-372'/);
  });

  it('backfills all 16 historical closed/disposition-null rows (2 evidence-supported + 14 grandfathered)', () => {
    const evidenceSupported = ['QF-20260727-705', 'QF-20260719-281'];
    const grandfathered = [
      'QF-20260719-635', 'QF-20260610-257', 'QF-20260611-506', 'QF-20260711-624',
      'QF-20260714-549', 'QF-20260611-977', 'QF-20260719-464', 'QF-20260726-405',
      'QF-20260807-444', 'QF-20260808-403', 'QF-20260903-052', 'QF-20260824-216',
      'QF-20260824-315', 'QF-20260713-422',
    ];
    expect(evidenceSupported.length + grandfathered.length).toBe(16);
    for (const id of evidenceSupported.concat(grandfathered)) {
      expect(migration).toContain(`'${id}'`);
    }
    expect(migration).toMatch(/WHERE id = 'QF-20260727-705' AND status = 'closed' AND disposition IS NULL/);
    expect(migration).toMatch(/WHERE id = 'QF-20260719-281' AND status = 'closed' AND disposition IS NULL/);
  });

  it('never fabricates a specific disposition for the 14 unsupported rows -- uses the honest grandfather value and preserves original notes untouched', () => {
    const block = migration.slice(
      migration.indexOf("SET disposition = 'legacy_grandfathered'"),
      migration.indexOf('AND status = \'closed\' AND disposition IS NULL;', migration.indexOf("SET disposition = 'legacy_grandfathered'")) + 60
    );
    expect(block).not.toMatch(/verification_notes\s*=/); // original notes column is never overwritten
    expect(block).toMatch(/reason = COALESCE\(reason, ''\) \|\|/); // reason is appended-to, not replaced
  });
});

describe('SD-LEO-ORCH-CAPA-RECORD-TRUTH-002-E: CHECK constraints added after backfill, via NOT VALID + VALIDATE', () => {
  const constraints = [
    { name: 'quick_fixes_duplicate_of_pairing', clause: /disposition IS DISTINCT FROM 'duplicate_of' OR duplicate_of_id IS NOT NULL/ },
    { name: 'quick_fixes_promoted_target_pairing', clause: /disposition IS DISTINCT FROM 'promoted' OR escalated_to_sd_id IS NOT NULL OR resolution_sd_id IS NOT NULL/ },
    { name: 'quick_fixes_closed_requires_disposition', clause: /status IS DISTINCT FROM 'closed' OR disposition IS NOT NULL/ },
  ];

  it.each(constraints)('adds $name as NOT VALID guarded by a conrelid-scoped existence check, then VALIDATEs it', ({ name, clause }) => {
    // pg_constraint names are unique per-relation, not globally -- an
    // unscoped conname-only check could match a same-named constraint on a
    // different table and skip the ADD. Independent adversarial review INFO
    // finding.
    const existsIdx = migration.indexOf(`conname = '${name}'`);
    expect(existsIdx).toBeGreaterThan(-1);
    const existsClause = migration.slice(migration.lastIndexOf('IF NOT EXISTS', existsIdx), migration.indexOf(')', existsIdx + name.length + 20));
    expect(existsClause).toMatch(/conrelid = 'public\.quick_fixes'::regclass/);
    const idx = migration.indexOf(`ADD CONSTRAINT ${name}`);
    expect(idx).toBeGreaterThan(-1);
    const stmt = migration.slice(idx, migration.indexOf('NOT VALID', idx) + 'NOT VALID'.length);
    expect(stmt).toMatch(clause);
    expect(migration).toMatch(new RegExp(`ALTER TABLE quick_fixes VALIDATE CONSTRAINT ${name};`));
  });

  it('places every CHECK constraint block after the full backfill block', () => {
    const lastBackfillIdx = migration.lastIndexOf("'legacy_grandfathered'");
    const firstConstraintIdx = migration.indexOf('quick_fixes_duplicate_of_pairing');
    expect(firstConstraintIdx).toBeGreaterThan(lastBackfillIdx);
  });
});
