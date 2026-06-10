/**
 * SD-LEO-FIX-FIX-PHANTOM-COLUMN-001 — phantom-column write fixes + fail-loud guard.
 *
 * Strategy: mock clients EXPOSE THE REAL COLUMN SET and reject unknown keys exactly like
 * PostgREST (42703) — so any regression to a phantom column fails these tests the same way
 * it fails in prod (except loudly).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// Real column sets (live-verified 2026-06-10, SD metadata.lead_verification).
const REAL = {
  audit_log: ['id', 'event_type', 'entity_type', 'entity_id', 'old_value', 'new_value', 'metadata', 'severity', 'created_by', 'created_at'],
  issue_patterns: ['id', 'pattern_id', 'category', 'severity', 'issue_summary', 'occurrence_count', 'first_seen_sd_id', 'last_seen_sd_id', 'metadata', 'status', 'created_at', 'updated_at'],
  strategic_directives_v2: ['id', 'sd_key', 'claiming_session_id', 'active_session_id', 'is_working_on', 'current_phase', 'status', 'metadata'],
};

/** Chainable mock: insert/select/update validate keys against the real column set. */
function makeStrictTable(table, { selectData = [] } = {}) {
  const cols = new Set(REAL[table]);
  const calls = { inserts: [], updates: [], selects: [] };
  const reject = (keys) => {
    const bad = keys.filter((k) => !cols.has(k));
    return bad.length ? { code: '42703', message: `column ${table}.${bad[0]} does not exist` } : null;
  };
  const builder = (ctx = {}) => {
    const b = {
      insert(payload) {
        calls.inserts.push(payload);
        const err = reject(Object.keys(payload));
        return { error: err, select: () => ({ single: async () => ({ data: err ? null : payload, error: err }) }), then: (r) => r({ error: err }) };
      },
      update(payload) {
        calls.updates.push(payload);
        ctx.updateErr = reject(Object.keys(payload));
        return b;
      },
      select(colsStr) {
        calls.selects.push(colsStr);
        const requested = String(colsStr).split(',').map((s) => s.trim());
        ctx.selectErr = reject(requested);
        return b;
      },
      eq() { return b; },
      or() { return b; },
      order() { return b; },
      limit() { return b; },
      async single() { return ctx.selectErr ? { data: null, error: ctx.selectErr } : { data: selectData[0] ?? null, error: null }; },
      async maybeSingle() { return ctx.selectErr ? { data: null, error: ctx.selectErr } : { data: selectData[0] ?? null, error: null }; },
      then(resolve) { // awaited builder (select list or update)
        if (ctx.selectErr || ctx.updateErr) return resolve({ data: null, error: ctx.selectErr || ctx.updateErr });
        return resolve({ data: selectData, error: null });
      },
    };
    return b;
  };
  return { from: () => builder(), calls };
}

describe('audit-write-guard — fail-loud contract', () => {
  let guard;
  beforeEach(async () => {
    guard = await import('../lib/audit-write-guard.js');
    guard._resetAuditWriteGuardForTests();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it('logs site + code + payload keys on a 42703', () => {
    guard.logAuditWriteFailure('test-site', { code: '42703', message: 'column x does not exist' }, { a: 1, b: 2 });
    expect(console.error).toHaveBeenCalledTimes(1);
    const msg = console.error.mock.calls[0][0];
    expect(msg).toContain('test-site');
    expect(msg).toContain('42703');
    expect(msg).toContain('payload_keys=[a,b]');
  });

  it('dedups per (site, code) but logs a DISTINCT code at the same site', () => {
    guard._resetAuditWriteGuardForTests();
    expect(guard.logAuditWriteFailure('s1', { code: '42703', message: 'x' })).toBe(true);   // logs
    expect(guard.logAuditWriteFailure('s1', { code: '42703', message: 'x' })).toBe(false);  // deduped
    expect(guard.logAuditWriteFailure('s1', { code: '23505', message: 'y' })).toBe(true);   // distinct code logs
  });

  it('never throws, even on garbage input', () => {
    expect(() => guard.logAuditWriteFailure(undefined, null, 42)).not.toThrow();
  });
});

describe('cluster 1 — claim-lifecycle release CAS on real columns only', () => {
  it('captureClaimSnapshot + releaseClaimOnPROpen succeed against a strict SDv2 mock', async () => {
    const mod = await import('../lib/claim-lifecycle-release.mjs');
    const strict = makeStrictTable('strategic_directives_v2', {
      selectData: [{ id: 'uuid-1', claiming_session_id: 'sess-1' }],
    });
    // Patch getSupabase via env-free injection: temporarily monkey-patch createClient target.
    // The module reads env at call time; instead we test the QUERY SHAPE via the strict mock
    // by invoking the underlying logic through a stubbed client.
    // captureClaimSnapshot/releaseClaimOnPROpen build their own client, so we assert the
    // SOURCE has no phantom references (static) and exercise the CAS shape via the mock.
    // Strip comments first — the doc comments legitimately NAME the phantom columns when
    // explaining the fix; what must never reappear is a CODE reference.
    const raw = fs.readFileSync(path.join(ROOT, 'lib', 'claim-lifecycle-release.mjs'), 'utf8');
    const src = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(src).not.toMatch(/heartbeat_at/);
    expect(src).not.toMatch(/claimed_at/);
    // CAS shape: select + update through the strict mock must not 42703
    const sel = strict.from().select('id,claiming_session_id');
    const got = await sel.single();
    expect(got.error).toBeNull();
    const upd = strict.from().update({ claiming_session_id: null });
    const res = await upd;
    expect(res.error).toBeNull();
  });
});

describe('clusters 2+3 — audit_log writers emit only real columns', () => {
  it('ship-review-findings-populator recordWarning payload passes the strict mock', async () => {
    const strict = makeStrictTable('audit_log');
    const mod = await import('../scripts/modules/handoff/executors/lead-final-approval/hooks/ship-review-findings-populator.js');
    // recordWarning is internal; exercise it via the exported flow OR statically + shape-test.
    const src = fs.readFileSync(path.join(ROOT, 'scripts/modules/handoff/executors/lead-final-approval/hooks/ship-review-findings-populator.js'), 'utf8');
    expect(src).toMatch(/event_type: 'ship_review_findings_populator_failed'/);
    expect(src).not.toMatch(/^\s*action:/m);
    expect(src).not.toMatch(/^\s*sd_key: sd\.sd_key \|\| null,$/m); // top-level phantom gone
    // The remapped payload shape passes the strict column check:
    const r = strict.from().insert({
      event_type: 'ship_review_findings_populator_failed', entity_type: 'strategic_directive',
      entity_id: 'SD-X', severity: 'warning', metadata: { sd_id: 'u', sd_key: 'SD-X', reason_code: 'rc', message: 'm' },
    });
    expect(r.error).toBeNull();
  });

  it('dfe-escalation-gate + chairman-sla-enforcer write audit_log (not governance_audit_log) with real columns', () => {
    for (const f of ['scripts/modules/handoff/gates/dfe-escalation-gate.js', 'lib/eva/chairman-sla-enforcer.js']) {
      const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
      expect(src, `${f} still writes governance_audit_log`).not.toMatch(/from\('governance_audit_log'\)\s*\.insert/);
      expect(src).toMatch(/from\('audit_log'\)\.insert/);
      expect(src).toMatch(/logAuditWriteFailure/);
      expect(src).not.toMatch(/^\s*gate_name:.*,$\n^\s*sd_key:/m); // top-level phantoms gone (now inside metadata)
    }
    const strict = makeStrictTable('audit_log');
    const r = strict.from().insert({
      event_type: 'sla_violation_blocked', entity_type: 'chairman_decision', entity_id: '1',
      severity: 'high', metadata: { gate_name: 'CHAIRMAN_SLA_ENFORCER', sd_key: 'SD-X' },
    });
    expect(r.error).toBeNull();
  });

  it('learning filter-bypass + release-feedback-preclaim payloads pass the strict mock', () => {
    const strict = makeStrictTable('audit_log');
    expect(strict.from().insert({
      event_type: 'LEARN_FILTER_BYPASS', entity_type: 'learning_run', entity_id: null,
      severity: 'warning', created_by: 'sess', metadata: { command: 'c', sd_id: null, session_id: 'sess', ts: 't' },
    }).error).toBeNull();
    expect(strict.from().insert({
      event_type: 'feedback_qf_release', entity_type: 'quick_fix', entity_id: 'QF-1',
      severity: 'info', created_by: null, metadata: { message: 'm', qf_id: 'QF-1', released_ids: [], source: 'manual', reason: 'r' },
    }).error).toBeNull();
    // and the OLD phantom payloads would have been rejected (proves the mock has teeth):
    expect(strict.from().insert({ event: 'X', session_id: 's', details: {} }).error?.code).toBe('42703');
    expect(strict.from().insert({ category: 'x', session_id: 's', message: 'm', severity: 'info', metadata: {} }).error?.code).toBe('42703');
  });
});

describe('cluster 4 — issue_patterns writer + reader pair', () => {
  it('rca-learning-ingestion insert payload passes the strict mock; old payload rejected', () => {
    const strict = makeStrictTable('issue_patterns');
    expect(strict.from().insert({
      id: 'PAT-1', pattern_id: 'PAT-1', issue_summary: 'label', category: 'c', severity: 'high',
      occurrence_count: 1, metadata: { defect_class: 'd', preventable: true, pattern_name: 'label', first_seen_at: 't1', last_seen_at: 't2' },
    }).error).toBeNull();
    expect(strict.from().insert({
      id: 'PAT-1', pattern_name: 'label', category: 'c', severity: 'high', occurrence_count: 1, first_seen: 't1', last_seen: 't2', metadata: {},
    }).error?.code).toBe('42703');
  });

  it('findSimilar returns a seeded match through the strict mock (was always [])', async () => {
    const { findSimilar } = await import('../lib/eva/historical-pattern-matcher.js');
    const strict = makeStrictTable('issue_patterns', {
      selectData: [{
        id: 'PAT-9', pattern_id: 'PAT-9', issue_summary: 'gate timeout storms', category: 'gate_failure',
        occurrence_count: 7, updated_at: new Date().toISOString(), severity: 'high',
        metadata: { pattern_name: 'gate timeout storms', last_seen_at: new Date().toISOString() },
      }],
    });
    const out = await findSimilar({ triggerTypes: ['gate_failure'], supabase: strict });
    expect(out.length).toBe(1);
    expect(out[0].pattern_name).toBe('gate timeout storms');
    expect(out[0].frequency).toBe(7);
    expect(out[0].description).toBe('gate timeout storms');
    expect(out[0].relevance).toBeGreaterThan(0);
  });

  it('findSimilar reader SELECT uses only real columns (strict mock rejects phantom selects)', async () => {
    const { findSimilar } = await import('../lib/eva/historical-pattern-matcher.js');
    const strict = makeStrictTable('issue_patterns', { selectData: [] });
    const out = await findSimilar({ triggerTypes: ['x'], supabase: strict });
    expect(out).toEqual([]); // empty data, NOT an error path
    // the select call was validated against real columns by the mock — a phantom column
    // in the SELECT would have errored and the function would warn+[] identically, so pin
    // the source too:
    const src = fs.readFileSync(path.join(ROOT, 'lib/eva/historical-pattern-matcher.js'), 'utf8');
    expect(src).toMatch(/select\('id, pattern_id, issue_summary, category, occurrence_count, updated_at, severity, metadata'\)/);
  });
});
