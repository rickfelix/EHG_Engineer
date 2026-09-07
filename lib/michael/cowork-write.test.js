// SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-F / FR-3, FR-4, TR-2, TS-3, TS-4, TS-5.
import { describe, it, expect } from 'vitest';
import { stubClient } from './db.test.js';
import { writeRule, writeLabel, writeClosure, writeFeedbackEntry, ruleContentEqual, COWORK_WRITE_REFUSALS } from './cowork-write.mjs';

const NOW = new Date('2026-09-07T12:00:00.000Z');
const MISSING = { data: null, error: { code: '42P01', message: 'relation does not exist' } };

function db({ activeRule = null, insertAnswer = null, upsertAnswer = null, absent = false } = {}) {
  const calls = [];
  const sb = stubClient((table, ops) => {
    calls.push({ table, kind: ops[0].op, ops });
    if (absent) return MISSING;
    if (ops[0].op === 'insert') return insertAnswer ? insertAnswer(ops) : { data: { id: 'row-1' }, error: null };
    if (ops[0].op === 'upsert') return upsertAnswer ? upsertAnswer(ops) : { data: { id: 'row-1' }, error: null };
    if (ops[0].op === 'select') return { data: activeRule ? [activeRule] : [], error: null };
    return { data: null, error: null };
  });
  return { sb, calls };
}

describe('writeRule', () => {
  it('a first-time import (no active row) is a plain insert with auto_apply=false and populated provenance', async () => {
    const { sb, calls } = db();
    const r = await writeRule({ sb, domain: 'gmail', rule_key: 'r1', rule_text: 'text', rule_json: { match: {} } }, { sourceFile: 'gmail.md', now: NOW });
    expect(r.ok).toBe(true);
    expect(r.action).toBe('insert');
    const insertCall = calls.find((c) => c.kind === 'insert');
    const row = insertCall.ops[0].args[0];
    expect(row.auto_apply).toBe(false);
    expect(row.provenance).toEqual({ source: 'cowork-import:gmail.md', imported_from: 'gmail.md', imported_at: NOW.toISOString(), ratification_id: null });
  });

  it('re-importing IDENTICAL content against an existing active row is a clean no-op, no write', async () => {
    const activeRule = { id: 'existing-1', rule_text: 'text', rule_json: { match: {} }, status: 'active' };
    const { sb, calls } = db({ activeRule });
    const r = await writeRule({ sb, domain: 'gmail', rule_key: 'r1', rule_text: 'text', rule_json: { match: {} } }, { sourceFile: 'gmail.md', now: NOW });
    expect(r.ok).toBe(true);
    expect(r.action).toBe('noop');
    expect(calls.some((c) => c.kind === 'insert' || c.kind === 'update')).toBe(false);
  });

  it('re-importing CHANGED content against an existing active row REFUSES and never writes, naming rule-encode.mjs', async () => {
    const activeRule = { id: 'existing-1', rule_text: 'old text', rule_json: null, status: 'active' };
    const { sb, calls } = db({ activeRule });
    const r = await writeRule({ sb, domain: 'gmail', rule_key: 'r1', rule_text: 'NEW text', rule_json: null }, { sourceFile: 'gmail.md', now: NOW });
    expect(r.ok).toBe(false);
    expect(r.refusal).toBe(COWORK_WRITE_REFUSALS.CONTENT_CHANGED_NEEDS_VERIFIER);
    expect(r.message).toContain('rule-encode.mjs');
    expect(calls.some((c) => c.kind === 'insert' || c.kind === 'update')).toBe(false);
  });

  it('is inert on a missing relation, never throws', async () => {
    const { sb } = db({ absent: true });
    const r = await writeRule({ sb, domain: 'gmail', rule_key: 'r1', rule_text: 't', rule_json: null }, { sourceFile: 'gmail.md', now: NOW });
    expect(r.ok).toBe(false);
    expect(r.refusal).toBe('TABLES_ABSENT');
  });

  it('ruleContentEqual is order-independent for rule_json keys', () => {
    expect(ruleContentEqual({ rule_text: 't', rule_json: { a: 1, b: 2 } }, { rule_text: 't', rule_json: { b: 2, a: 1 } })).toBe(true);
    expect(ruleContentEqual({ rule_text: 't', rule_json: { a: 1 } }, { rule_text: 't', rule_json: { a: 2 } })).toBe(false);
  });
});

describe('writeLabel / writeClosure / writeFeedbackEntry', () => {
  it('writeLabel upserts on label_id', async () => {
    const { sb, calls } = db();
    const r = await writeLabel({ sb, label: { label_id: 'L1', name: 'Newsletters', class: 'newsletter', keep_in_inbox: false, summarize: true } });
    expect(r.ok).toBe(true);
    const upsertCall = calls.find((c) => c.kind === 'upsert');
    expect(upsertCall.ops[0].args[1]).toEqual({ onConflict: 'label_id' });
  });

  it('writeClosure upserts on closure_key with a populated provenance object', async () => {
    const { sb, calls } = db();
    const r = await writeClosure({ sb, closure: { closure_key: 'c1', topic: 'x', keywords: ['a'], closure_text: 'body', scope: null, expires_at: null } });
    expect(r.ok).toBe(true);
    const upsertCall = calls.find((c) => c.kind === 'upsert');
    expect(upsertCall.ops[0].args[1]).toEqual({ onConflict: 'closure_key' });
    expect(upsertCall.ops[0].args[0].provenance).toBeTruthy();
  });

  it('writeFeedbackEntry upserts on et_date', async () => {
    const { sb, calls } = db();
    const r = await writeFeedbackEntry({ sb, entry: { et_date: '2026-01-15', landed: 'x', friction: null, outcome_vs_jobs: null, acted: true } });
    expect(r.ok).toBe(true);
    const upsertCall = calls.find((c) => c.kind === 'upsert');
    expect(upsertCall.ops[0].args[1]).toEqual({ onConflict: 'et_date' });
  });
});
