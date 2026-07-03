/**
 * Integration pins for the Adam self-adherence review.
 * SD-LEO-INFRA-AUTOMATED-RECURRING-ADAM-001 — FR-3/FR-5/FR-6.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  runSelfAdherenceReview, sourceRemediation, recordAdherence, resolveFacts,
} from '../../scripts/adam-self-adherence-review.mjs';

/** Mock supabase: records inserts; session_coordination count returns `signals`. */
function makeSb({ signals = 3, failLedger = false } = {}) {
  const inserts = { adam_adherence_ledger: [], feedback: [] };
  return {
    inserts,
    from(table) {
      const b = { _t: table, _op: null, _payload: null };
      b.insert = (row) => { b._op = 'insert'; b._payload = row; return b; };
      b.select = () => b; b.gte = () => b; b.eq = () => b; b.in = () => b;
      b.single = () => {
        if (b._op === 'insert') {
          if (b._t === 'adam_adherence_ledger' && failLedger) return Promise.resolve({ data: null, error: { message: 'ledger insert failed' } });
          const id = `${b._t}-${inserts[b._t].length + 1}`; inserts[b._t].push({ ...b._payload, id }); return Promise.resolve({ data: { id }, error: null });
        }
        return Promise.resolve({ data: null, error: null });
      };
      b.then = (res) => res({ count: b._t === 'session_coordination' ? signals : null, error: null });
      return b;
    },
  };
}

describe('runSelfAdherenceReview (FR-3/FR-6)', () => {
  it('--dry-run performs NO DB writes', async () => {
    const sb = makeSb();
    const r = await runSelfAdherenceReview(sb, { dryRun: true });
    expect(r.dryRun).toBe(true);
    expect(sb.inserts.adam_adherence_ledger).toHaveLength(0);
    expect(sb.inserts.feedback).toHaveLength(0);
  });

  it('a real run ledgers one row per probe (run_id grouped), unknowns => no remediation', async () => {
    const sb = makeSb();
    const r = await runSelfAdherenceReview(sb, { runId: 'run-1' });
    // SD-LEO-INFRA-UPSCALE-ADAM-PROJECT-MANAGEMENT-DISCIPLINE-001-C: pm_board is the 8th probe;
    // runSelfAdherenceReview records EVERY bar (pass/fail/unknown), one ledger row per probe run.
    expect(sb.inserts.adam_adherence_ledger).toHaveLength(8);
    expect(sb.inserts.adam_adherence_ledger.every((row) => row.run_id === 'run-1')).toBe(true);
    // current resolvers leave most facts null => unknown => no fail => no remediation
    expect(r.remediationRef).toBeNull();
    expect(sb.inserts.feedback).toHaveLength(0);
  });
});

describe('sourceRemediation — PROPOSE-ONLY (FR-3/FR-5)', () => {
  it('sources a single feedback flag for the coordinator (never builds) and returns its id', async () => {
    const sb = makeSb();
    const failed = [{ probe: 'propose_only', duty: 'd', verdict: 'fail', detail: 'a build exists' }];
    const ref = await sourceRemediation(sb, 'run-x', failed);
    expect(sb.inserts.feedback).toHaveLength(1);
    const row = sb.inserts.feedback[0];
    expect(row.category).toBe('adam_adherence_drift');
    expect(row.type).toBe('issue');
    expect(row.source_type).toBe('manual_capture'); // satisfies feedback_source_type_check
    expect(row.severity).toBe('high'); // propose_only failure escalates severity
    expect(ref).toBe(row.id);
  });
});

describe('recordAdherence (FR-3)', () => {
  it('writes a ledger row with verdict + remediation_ref; fail-soft on error (returns null)', async () => {
    const ok = makeSb();
    const id = await recordAdherence(ok, 'run-y', { probe: 'sourcing_cadence', duty: 'd', verdict: 'fail', detail: 'x' }, 'fb-9');
    expect(id).toBeTruthy();
    expect(ok.inserts.adam_adherence_ledger[0].remediation_ref).toBe('fb-9');
    const bad = makeSb({ failLedger: true });
    const nullId = await recordAdherence(bad, 'run-z', { probe: 'p', duty: 'd', verdict: 'pass', detail: 'x' });
    expect(nullId).toBeNull(); // fail-soft: ledger write failure does not throw
  });
});

describe('CONST-002 propose-only / no-build GUARD (FR-5)', () => {
  it('the review module has NO build/author/PR/handoff path — remediation is feedback-insert only', () => {
    const src = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../scripts/adam-self-adherence-review.mjs'), 'utf8');
    // No build/author/merge surfaces:
    for (const forbidden of ['handoff.js', 'gh pr', 'git commit', 'leo-create-sd', 'add-prd-to-database', 'apply-migration', 'execSync', 'child_process']) {
      expect(src).not.toContain(forbidden);
    }
    // Remediation writes ONLY to feedback (sourcing) + adam_adherence_ledger (record) + audit_log
    // (recordVisionGaugeRead's own observability event stamp, pre-existing on origin/main — not a
    // build/mutate surface) — nothing else mutated.
    const writtenTables = [...src.matchAll(/\.from\('([^']+)'\)[\s\S]{0,80}?\.insert\(/g)].map((m) => m[1]);
    for (const t of writtenTables) expect(['feedback', 'adam_adherence_ledger', 'audit_log']).toContain(t);
  });
});

/**
 * Purpose-built mock for the 2 new pm_board resolveFacts blocks — the generic makeSb() above
 * doesn't implement .not()/.order()/.limit()/.maybeSingle(), so it can't distinguish success from
 * failure for these specific query shapes. Every other table falls back to the same shape the
 * generic mock uses ({count/data: null, error: null}) so unrelated resolvers stay unaffected.
 */
function makePmBoardSb({ openRows = [], priorDetail = undefined, taskLedgerError = false, ledgerReadError = false } = {}) {
  return {
    from(table) {
      if (table === 'adam_task_ledger') {
        const b = {};
        b.select = () => b; b.eq = () => b;
        b.not = () => Promise.resolve(taskLedgerError ? { data: null, error: { message: 'boom' } } : { data: openRows, error: null });
        return b;
      }
      if (table === 'adam_adherence_ledger') {
        const b = {};
        b.select = () => b; b.eq = () => b; b.order = () => b; b.limit = () => b;
        b.maybeSingle = () => Promise.resolve(
          ledgerReadError ? { data: null, error: { message: 'boom' } }
            : { data: priorDetail === undefined ? null : { detail: priorDetail }, error: null }
        );
        return b;
      }
      // Every other table (session_coordination, strategic_directives_v2, etc.): benign no-op.
      const b = {};
      b.select = () => b; b.eq = () => b; b.gte = () => b; b.in = () => b; b.not = () => b;
      b.then = (res) => res({ count: null, data: null, error: null });
      return b;
    },
  };
}

describe('resolveFacts — pm_board fact-resolution (SD-LEO-INFRA-UPSCALE-ADAM-PROJECT-MANAGEMENT-DISCIPLINE-001-C)', () => {
  it('resolves an empty current snapshot when no open child-tier rows exist', async () => {
    const facts = await resolveFacts(makePmBoardSb({ openRows: [] }));
    expect(facts.pmBoardSnapshot).toEqual([]);
  });

  it('resolves a non-empty current snapshot from open child-tier rows', async () => {
    const facts = await resolveFacts(makePmBoardSb({ openRows: [{ id: 'a', status: 'open' }, { id: 'b', status: 'blocked' }] }));
    expect(facts.pmBoardSnapshot).toEqual([{ id: 'a', status: 'open' }, { id: 'b', status: 'blocked' }]);
  });

  it('is fail-soft: a current-snapshot query error leaves pmBoardSnapshot null, never throws', async () => {
    const facts = await resolveFacts(makePmBoardSb({ taskLedgerError: true }));
    expect(facts.pmBoardSnapshot).toBeNull();
  });

  it('resolves pmBoardPriorSnapshot as null when no prior pm_board ledger row exists', async () => {
    const facts = await resolveFacts(makePmBoardSb({ priorDetail: undefined }));
    expect(facts.pmBoardPriorSnapshot).toBeNull();
  });

  it('resolves pmBoardPriorSnapshot from the prior ledger row\'s pmsnap tail', async () => {
    const facts = await resolveFacts(makePmBoardSb({ priorDetail: '0 open child-tier item(s) ::pmsnap=a:open,b:blocked' }));
    expect([...facts.pmBoardPriorSnapshot.entries()]).toEqual([['a', 'open'], ['b', 'blocked']]);
  });

  it('is fail-soft: a prior-snapshot query error leaves pmBoardPriorSnapshot null, never throws', async () => {
    const facts = await resolveFacts(makePmBoardSb({ ledgerReadError: true }));
    expect(facts.pmBoardPriorSnapshot).toBeNull();
  });
});
