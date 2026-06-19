/**
 * Integration pins for the Adam self-adherence review.
 * SD-LEO-INFRA-AUTOMATED-RECURRING-ADAM-001 — FR-3/FR-5/FR-6.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  runSelfAdherenceReview, sourceRemediation, recordAdherence,
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
    expect(sb.inserts.adam_adherence_ledger).toHaveLength(6); // one per probe (4 original + 2 red-flag: belt-starvation, dispatch-boundary)
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
    // Remediation writes ONLY to feedback (sourcing) + adam_adherence_ledger (record) — nothing else mutated.
    const writtenTables = [...src.matchAll(/\.from\('([^']+)'\)[\s\S]{0,80}?\.insert\(/g)].map((m) => m[1]);
    for (const t of writtenTables) expect(['feedback', 'adam_adherence_ledger']).toContain(t);
  });
});
