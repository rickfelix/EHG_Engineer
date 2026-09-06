// SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-B / FR-3, TS-2..TS-4, TS-7, TS-15 — the writing verbs
// against injected clients. Every refusal path has a distinct code; the Opus gate is scoped.
import { describe, it, expect } from 'vitest';
import { runRuleEncode, verifyVerdict, subjectHash, needsVerifier, validSource, REFUSALS, VERIFIER_PRODUCER } from './rule-encode.mjs';
import { runClosureAdd } from './closure-add.mjs';
import { runCapture, CAPTURE_KINDS } from './capture.mjs';
import { runFeedbackAppend, normalizeDisposition, CHOSEN } from './feedback-append.mjs';
import { canonicalJson, sha256Hex } from '../../lib/michael/db.mjs';

const NOW = new Date('2026-09-06T09:00:00.000Z');
const MISSING = { data: null, error: { code: '42P01', message: 'relation does not exist' } };

/**
 * A recording supabase stub. `tables` maps table -> rows returned for reads; every mutation is
 * recorded in `writes` as { table, op, args } and answered with `answerWrite(table, ops)`.
 */
function recorder({ tables = {}, answerWrite = () => ({ data: { id: 'new-id' }, error: null }), readError = null } = {}) {
  const writes = [];
  const client = {
    writes,
    from(table) {
      const ops = [];
      let mutating = false;
      const q = new Proxy({}, {
        get(_t, prop) {
          if (prop === 'then') {
            return (res, rej) => {
              if (mutating) { writes.push({ table, ops: [...ops] }); return Promise.resolve(answerWrite(table, ops)).then(res, rej); }
              if (readError) return Promise.resolve(readError).then(res, rej);
              const eqs = Object.fromEntries(ops.filter((o) => o.op === 'eq').map((o) => o.args));
              const rows = (tables[table] || []).filter((r) => Object.entries(eqs).every(([k, v]) => r[k] === v));
              return Promise.resolve({ data: rows, error: null }).then(res, rej);
            };
          }
          return (...args) => { if (['insert', 'update', 'upsert', 'delete'].includes(prop)) mutating = true; ops.push({ op: prop, args }); return q; };
        },
      });
      return q;
    },
  };
  return client;
}

const BASE = ['--domain', 'gmail', '--key', 'newsletters-archive', '--text', 'Archive newsletters', '--source', 'terminal:2026-09-06T05:12'];
const goodVerdict = (hash, over = {}) => ({ producer: VERIFIER_PRODUCER, run_id: 'run-1', model: 'claude-opus-4-8', verdict: 'approve', reasoning: 'reversible, consistent', subject_hash: hash, produced_at: '2026-09-06T08:30:00.000Z', ...over });
const noRender = async () => ({ ok: true });

describe('rule-encode: the Opus verifier gate', () => {
  it('TS-2: a flip without --verifier-verdict refuses, names the verdict, and writes nothing', async () => {
    const sb = recorder();
    const r = await runRuleEncode({ sb, argv: [...BASE, '--auto-apply', '--verb', 'archive'], now: NOW, render: noRender });
    expect(r.ok).toBe(false);
    expect(r.refusal).toBe(REFUSALS.VERIFIER_VERDICT_MISSING);
    expect(r.message).toMatch(/--verifier-verdict/);
    expect(r.subject_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(sb.writes).toHaveLength(0);
  });

  it('scoped gate: a plain new rule (no flip, no prior) needs NO verdict and writes one row', async () => {
    const sb = recorder();
    const r = await runRuleEncode({ sb, argv: BASE, now: NOW, render: noRender });
    expect(r.ok).toBe(true);
    expect(r.gate).toBe(false);
    expect(sb.writes).toHaveLength(1);
    expect(sb.writes[0].ops[0].op).toBe('insert');
    const row = sb.writes[0].ops[0].args[0];
    expect(row).toMatchObject({ domain: 'gmail', rule_key: 'newsletters-archive', status: 'active', auto_apply: false, supersedes: null });
    expect(row.provenance).toMatchObject({ source: 'terminal:2026-09-06T05:12', verifier: null });
    expect(row.provenance.subject_hash).toBe(r.subject_hash);
  });

  it('TS-3: a flip with an opus approve verdict writes the row with the verdict verbatim in provenance', async () => {
    const hash = subjectHash({ domain: 'gmail', rule_key: 'newsletters-archive', rule_text: 'Archive newsletters', rule_json: null, auto_apply: true, auto_apply_verb: 'archive', supersedes: null });
    const verdict = goodVerdict(hash);
    const sb = recorder();
    const r = await runRuleEncode({ sb, argv: [...BASE, '--auto-apply', '--verb', 'archive', '--verifier-verdict', 'v.json'], now: NOW, readVerdict: () => verdict, render: noRender });
    expect(r.ok).toBe(true);
    expect(r.gate).toBe(true);
    const row = sb.writes[0].ops[0].args[0];
    expect(row.auto_apply).toBe(true);
    expect(row.auto_apply_verb).toBe('archive');
    expect(row.auto_apply_since).toBe(NOW.toISOString());
    expect(row.provenance.verifier).toEqual(verdict);
  });

  it('TS-3/TR-4: superseding an active rule flips the prior FIRST (guarded on status) then inserts with supersedes', async () => {
    const prior = { id: 'prior-1', domain: 'gmail', rule_key: 'newsletters-archive', rule_text: 'old', status: 'active', auto_apply: false, auto_apply_verb: null };
    const hash = subjectHash({ domain: 'gmail', rule_key: 'newsletters-archive', rule_text: 'Archive newsletters', rule_json: null, auto_apply: false, auto_apply_verb: null, supersedes: 'prior-1' });
    const sb = recorder({ tables: { michael_rules: [prior] }, answerWrite: (t, ops) => ({ data: ops[0].op === 'update' ? { id: 'prior-1' } : { id: 'new-1' }, error: null }) });
    const r = await runRuleEncode({ sb, argv: [...BASE, '--verifier-verdict', 'v.json'], now: NOW, readVerdict: () => goodVerdict(hash), render: noRender });
    expect(r).toMatchObject({ ok: true, id: 'new-1', superseded: 'prior-1', gate: true });
    expect(sb.writes.map((w) => w.ops[0].op)).toEqual(['update', 'insert']);
    const upd = sb.writes[0].ops;
    expect(upd[0].args[0]).toEqual({ status: 'superseded' });
    expect(upd.filter((o) => o.op === 'eq').map((o) => o.args)).toEqual([['id', 'prior-1'], ['status', 'active']]);
    expect(sb.writes[1].ops[0].args[0].supersedes).toBe('prior-1');
  });

  it('TR-4: when the guarded flip touches zero rows (another writer superseded it) the insert is refused', async () => {
    const prior = { id: 'prior-1', domain: 'gmail', rule_key: 'newsletters-archive', rule_text: 'old', status: 'active', auto_apply: false, auto_apply_verb: null };
    const hash = subjectHash({ domain: 'gmail', rule_key: 'newsletters-archive', rule_text: 'Archive newsletters', rule_json: null, auto_apply: false, auto_apply_verb: null, supersedes: 'prior-1' });
    const sb = recorder({ tables: { michael_rules: [prior] }, answerWrite: () => ({ data: null, error: null }) });
    const r = await runRuleEncode({ sb, argv: [...BASE, '--verifier-verdict', 'v.json'], now: NOW, readVerdict: () => goodVerdict(hash), render: noRender });
    expect(r.refusal).toBe(REFUSALS.RULE_ALREADY_SUPERSEDED);
    expect(sb.writes).toHaveLength(1);
  });

  it('TS-4: every verdict refusal has a DISTINCT code (producer, model, hash, reject, stale, invalid)', () => {
    const hash = 'a'.repeat(64);
    const cases = [
      verifyVerdict(goodVerdict(hash, { producer: 'seat' }), hash, NOW),
      verifyVerdict(goodVerdict(hash, { model: 'claude-sonnet-4-6' }), hash, NOW),
      verifyVerdict(goodVerdict('b'.repeat(64)), hash, NOW),
      verifyVerdict(goodVerdict(hash, { verdict: 'reject' }), hash, NOW),
      verifyVerdict(goodVerdict(hash, { produced_at: '2026-09-04T08:30:00.000Z' }), hash, NOW),
      verifyVerdict({ producer: VERIFIER_PRODUCER }, hash, NOW),
    ];
    for (const c of cases) expect(c.ok).toBe(false);
    const codes = cases.map((c) => c.code);
    expect(new Set(codes).size).toBe(6);
    expect(codes).toEqual([REFUSALS.VERIFIER_PRODUCER_MISMATCH, REFUSALS.VERIFIER_MODEL_NOT_OPUS, REFUSALS.VERIFIER_HASH_MISMATCH, REFUSALS.VERIFIER_REJECTED, REFUSALS.VERIFIER_STALE, REFUSALS.VERIFIER_FILE_INVALID]);
    expect(verifyVerdict(goodVerdict(hash), hash, NOW)).toEqual({ ok: true });
  });

  it('TS-15: the subject hash is key-order independent (canonical JSON), and the seat cannot pass a hand-typed hash of a different subject', () => {
    const s1 = { domain: 'gmail', rule_key: 'k', rule_text: 't', rule_json: { b: 1, a: 2 }, auto_apply: true, auto_apply_verb: 'label', supersedes: null };
    const s2 = { supersedes: null, auto_apply_verb: 'label', auto_apply: true, rule_json: { a: 2, b: 1 }, rule_text: 't', rule_key: 'k', domain: 'gmail' };
    expect(subjectHash(s1)).toBe(subjectHash(s2));
    expect(subjectHash(s1)).toBe(sha256Hex(canonicalJson({ domain: 'gmail', rule_key: 'k', rule_text: 't', rule_json: { a: 2, b: 1 }, auto_apply: true, auto_apply_verb: 'label', supersedes: null })));
    expect(subjectHash({ ...s1, auto_apply_verb: 'archive' })).not.toBe(subjectHash(s1));
  });

  it('needsVerifier: flip, verb change, or active prior => true; plain new rule => false', () => {
    expect(needsVerifier({ next: { auto_apply: true }, prior: null })).toBe(true);
    expect(needsVerifier({ next: { auto_apply: false, auto_apply_verb: null }, prior: { status: 'active' } })).toBe(true);
    expect(needsVerifier({ next: { auto_apply: false, auto_apply_verb: null }, prior: null })).toBe(false);
  });

  it('argument refusals: domain, verb (complete never auto-applies), source shape, rule-json', async () => {
    const sb = recorder();
    expect((await runRuleEncode({ sb, argv: ['--domain', 'nope', '--key', 'k', '--text', 't', '--source', 'terminal:x'] })).refusal).toBe(REFUSALS.INVALID_DOMAIN);
    expect((await runRuleEncode({ sb, argv: [...BASE, '--auto-apply', '--verb', 'complete'] })).refusal).toBe(REFUSALS.INVALID_VERB);
    expect((await runRuleEncode({ sb, argv: ['--domain', 'gmail', '--key', 'k', '--text', 't', '--source', 'nope'] })).refusal).toBe(REFUSALS.SOURCE_INVALID);
    expect((await runRuleEncode({ sb, argv: [...BASE, '--rule-json', '{bad'] })).refusal).toBe(REFUSALS.RULE_JSON_INVALID);
    expect(validSource('terminal:2026-09-06T05:12')).toBe(true);
    expect(validSource('sms:')).toBe(false);
    expect(validSource('no-colon-here')).toBe(false);
    expect(sb.writes).toHaveLength(0);
  });

  it('absent tables: refuses TABLES_ABSENT before any write', async () => {
    const sb = recorder({ readError: MISSING });
    const r = await runRuleEncode({ sb, argv: BASE, now: NOW });
    expect(r.refusal).toBe(REFUSALS.TABLES_ABSENT);
    expect(sb.writes).toHaveLength(0);
  });

  it('--dry-run computes the hash and the gate but writes nothing', async () => {
    const sb = recorder();
    const r = await runRuleEncode({ sb, argv: [...BASE, '--dry-run'], now: NOW });
    expect(r).toMatchObject({ ok: true, dry_run: true, gate: false });
    expect(r.would_write.provenance.subject_hash).toBe(r.subject_hash);
    expect(sb.writes).toHaveLength(0);
  });
});

describe('closure-add / capture', () => {
  it('closure-add upserts by closure_key with keywords split and provenance', async () => {
    const sb = recorder();
    const r = await runClosureAdd({ sb, argv: ['--key', 'gym', '--topic', 'gym', '--text', 'keep', '--keywords', 'gym, membership', '--scope', 'personal', '--source', 'terminal:x1'], now: NOW });
    expect(r.ok).toBe(true);
    const [w] = sb.writes;
    expect(w.ops[0].op).toBe('upsert');
    expect(w.ops[0].args[1]).toEqual({ onConflict: 'closure_key' });
    expect(w.ops[0].args[0]).toMatchObject({ closure_key: 'gym', keywords: ['gym', 'membership'], scope: 'personal', expires_at: null });
    expect(w.ops[0].args[0].provenance.source).toBe('terminal:x1');
  });
  it('closure-add refuses a bad expiry and absent tables', async () => {
    expect((await runClosureAdd({ sb: recorder(), argv: ['--key', 'k', '--topic', 't', '--text', 'x', '--source', 'terminal:x1', '--expires', 'soon'] })).refusal).toBe('EXPIRES_INVALID');
    const sb = recorder({ answerWrite: () => MISSING });
    expect((await runClosureAdd({ sb, argv: ['--key', 'k', '--topic', 't', '--text', 'x', '--source', 'terminal:x1'] })).refusal).toBe('TABLES_ABSENT');
  });
  it('capture stages a michael_staged_items row with kind and payload text', async () => {
    const sb = recorder();
    const r = await runCapture({ sb, argv: ['--text', 'Call the dentist', '--payload', '{"due":"friday"}'], now: NOW });
    expect(r).toMatchObject({ ok: true, kind: 'capture' });
    const row = sb.writes[0].ops[0].args[0];
    expect(row.kind).toBe('capture');
    expect(row.payload).toMatchObject({ text: 'Call the dentist', due: 'friday' });
    expect(CAPTURE_KINDS).toContain('rule_edit');
    expect((await runCapture({ sb: recorder(), argv: ['--text', 'x', '--kind', 'weird'] })).refusal).toBe('INVALID_KIND');
  });
});

describe('feedback-append: the disposition grain (TS-7)', () => {
  it('normalizes a disposition and rejects an unknown chosen', () => {
    expect(CHOSEN).toEqual(['approve', 'override', 'auto', 'skip']);
    const ok = normalizeDisposition('{"topic":"gmail","rule_key":"k","proposed":"archive","chosen":"auto","reasoning":"r"}', NOW);
    expect(ok.ok).toBe(true);
    expect(ok.disposition).toMatchObject({ topic: 'gmail', rule_key: 'k', chosen: 'auto', at: NOW.toISOString() });
    expect(normalizeDisposition({ topic: 'gmail', chosen: 'maybe' }).ok).toBe(false);
    expect(normalizeDisposition({ chosen: 'approve' }).ok).toBe(false);
  });
  it('same-day append: existing dispositions are kept and the new one is appended; upsert by et_date', async () => {
    const existing = { id: 'row-1', et_date: '2026-09-06', dispositions: [{ topic: 'a', chosen: 'approve' }], landed: 'yes', friction: null, outcome_vs_jobs: null, acted: false };
    const sb = recorder({ tables: { michael_feedback_ledger: [existing] } });
    const r = await runFeedbackAppend({ sb, argv: ['--date', '2026-09-06', '--acted', '--disposition', '{"topic":"gmail","rule_key":"k","chosen":"override"}'], now: NOW });
    expect(r).toMatchObject({ ok: true, appended: 1, total: 2 });
    const [w] = sb.writes;
    expect(w.ops[0].op).toBe('upsert');
    expect(w.ops[0].args[1]).toEqual({ onConflict: 'et_date' });
    const row = w.ops[0].args[0];
    expect(row.dispositions).toHaveLength(2);
    expect(row.dispositions[0]).toEqual({ topic: 'a', chosen: 'approve' });
    expect(row.dispositions[1]).toMatchObject({ rule_key: 'k', chosen: 'override' });
    expect(row.landed).toBe('yes');
    expect(row.acted).toBe(true);
  });
  it('defaults the date to today (ET) and refuses with nothing to write or a bad date', async () => {
    const sb = recorder();
    const r = await runFeedbackAppend({ sb, argv: ['--landed', 'fine'], now: NOW });
    expect(r.ok).toBe(true);
    expect(sb.writes[0].ops[0].args[0].et_date).toBe('2026-09-06');
    expect((await runFeedbackAppend({ sb: recorder(), argv: [], now: NOW })).refusal).toBe('MISSING_ARGS');
    expect((await runFeedbackAppend({ sb: recorder(), argv: ['--date', 'yesterday', '--landed', 'x'], now: NOW })).refusal).toBe('DATE_INVALID');
    expect((await runFeedbackAppend({ sb: recorder(), argv: ['--disposition', '{"topic":"g","chosen":"nope"}'], now: NOW })).refusal).toBe('DISPOSITION_INVALID');
  });
  it('absent tables: refuses TABLES_ABSENT before any write', async () => {
    const sb = recorder({ readError: MISSING });
    expect((await runFeedbackAppend({ sb, argv: ['--landed', 'x'], now: NOW })).refusal).toBe('TABLES_ABSENT');
    expect(sb.writes).toHaveLength(0);
  });
});
