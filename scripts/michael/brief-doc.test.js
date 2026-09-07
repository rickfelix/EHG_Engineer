// SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-E / FR-7, TS-8 — the Drive-doc copy (GHA venue).
import { describe, it, expect, vi } from 'vitest';
import { stubClient } from '../../lib/michael/db.test.js';
import { runBriefDoc, renderBriefText, buildPreShipElements } from './brief-doc.mjs';
import { runPreShipGate } from '../../lib/daily-review/artifact-preship-gate.js';

const NOW = new Date('2026-09-06T12:00:00.000Z');
const MISSING = { data: null, error: { code: '42P01', message: 'relation does not exist' } };
const DATA_JSON = { schema: 2, date: '2026-09-06', lede: 'Deep day. 1 calendar event.', headsUp: [], frontPage: { today: { event_count: 1, coded_count: 1, optional_open: 0, overlap_count: 0 }, gmail: { handled: 1, unclassifiedCount: 0, needsYou: [], call: 'inbox triaged' }, todoist: { state: 'ok', window: [], note: 'all graded', calls: [] }, ehg: { shown: true, pointer: 'EHG chairman project (Todoist)', handedCount: 2 }, claudeCode: {} }, enrichment: { oracle: null, watchLater: null, body: null, yesterday: null, signals: [] }, logs: {} };
const ASSEMBLED_ROW = { id: 'row-1', et_date: '2026-09-06', assembled_at: '2026-09-06T09:45:00Z', data_json: DATA_JSON };
const ALREADY_DOCCED_ROW = { ...ASSEMBLED_ROW, data_json: { ...DATA_JSON, logs: { 'brief-assemble': 'r1', brief_doc: 'doc-existing' } } };
const UNASSEMBLED_ROW = { id: 'row-2', et_date: '2026-09-06', assembled_at: null, data_json: null };

function db({ briefRow = ASSEMBLED_ROW, absent = false, updateAnswer = null } = {}) {
  const calls = [];
  const sb = stubClient((table, ops) => {
    calls.push({ table, kind: ops[0].op, ops });
    if (absent) return MISSING;
    if (ops[0].op === 'update') return updateAnswer ? updateAnswer(ops) : { data: [{ id: 'row-1' }], error: null };
    if (ops[0].op !== 'select') return { data: null, error: null };
    if (table === 'michael_brief_runs') return { data: briefRow ? [briefRow] : [], error: null };
    return { data: [], error: null };
  });
  return { sb, calls };
}

function fakeDrive({ fail = null } = {}) {
  const calls = [];
  const createDoc = vi.fn(async (doc, opts) => {
    calls.push({ doc, opts });
    if (fail) throw fail;
    return { docId: 'doc-1', webViewLink: 'https://docs.google.com/document/d/doc-1' };
  });
  return { createDoc, calls };
}

describe('runBriefDoc', () => {
  it('creates exactly one doc, calls runPreShipGate before createBriefDoc, and stores the doc id at data_json.logs.brief_doc', async () => {
    const { sb, calls } = db();
    const { createDoc, calls: driveCalls } = fakeDrive();
    const r = await runBriefDoc({ sb, argv: ['--apply'], now: NOW, createDoc, env: { GOOGLE_SERVICE_ACCOUNT_JSON: '{}' } });
    expect(r.ok).toBe(true);
    expect(r.doc_id).toBe('doc-1');
    expect(driveCalls).toHaveLength(1);
    const updateCall = calls.find((c) => c.table === 'michael_brief_runs' && c.kind === 'update');
    expect(updateCall.ops[0].args[0].data_json.logs.brief_doc).toBe('doc-1');
    expect(typeof updateCall.ops[0].args[0].brief_md).toBe('string');
  });

  it('is a no-op on a second run for the same date (idempotent per date)', async () => {
    const { sb, calls } = db({ briefRow: ALREADY_DOCCED_ROW });
    const { createDoc, calls: driveCalls } = fakeDrive();
    const r = await runBriefDoc({ sb, argv: ['--apply'], now: NOW, createDoc });
    expect(r.action).toBe('noop');
    expect(r.doc_id).toBe('doc-existing');
    expect(driveCalls).toHaveLength(0);
    expect(calls.some((c) => c.kind === 'update')).toBe(false);
  });

  it('the real elements runBriefDoc builds are never blocked (every numeric/date element carries a source)', async () => {
    const { sb } = db();
    const { createDoc, calls: driveCalls } = fakeDrive();
    const r = await runBriefDoc({ sb, argv: ['--apply'], now: NOW, createDoc });
    expect(r.ok).toBe(true);
    expect(driveCalls).toHaveLength(1);
  });

  it('runPreShipGate itself blocks an unsourced numeric element — the contract buildPreShipElements relies on to stay honest', () => {
    const elements = buildPreShipElements(DATA_JSON, { etDate: '2026-09-06' });
    delete elements[1].source; // simulate a future regression that stops attaching a source
    const verdict = runPreShipGate({ elements }, { getForecast: () => undefined });
    expect(verdict.blocked).toBe(true);
    expect(verdict.offending[0].id).toBe('gmail.unclassifiedCount');
  });

  it('MissingCredentialError from createBriefDoc propagates as the failure reason; no doc row update', async () => {
    const { sb, calls } = db();
    const err = new Error('GOOGLE_SERVICE_ACCOUNT_JSON missing — failing closed (no unauthenticated fallback)');
    err.name = 'MissingCredentialError';
    const { createDoc } = fakeDrive({ fail: err });
    const r = await runBriefDoc({ sb, argv: ['--apply'], now: NOW, createDoc, env: {} });
    expect(r.ok).toBe(false);
    expect(r.refusal).toBe('MISSING_CREDENTIAL');
    expect(calls.some((c) => c.kind === 'update')).toBe(false);
  });

  it('refuses (no write) when no row exists or the row was not assembled', async () => {
    const rNoRow = await runBriefDoc({ sb: db({ briefRow: null }).sb, argv: ['--apply'], now: NOW, createDoc: fakeDrive().createDoc });
    expect(rNoRow.refusal).toBe('NO_ROW');
    const rUnassembled = await runBriefDoc({ sb: db({ briefRow: UNASSEMBLED_ROW }).sb, argv: ['--apply'], now: NOW, createDoc: fakeDrive().createDoc });
    expect(rUnassembled.refusal).toBe('NOT_ASSEMBLED');
  });

  it('is inert on a missing relation, never throws', async () => {
    const { sb } = db({ absent: true });
    const r = await runBriefDoc({ sb, argv: ['--apply'], now: NOW, createDoc: fakeDrive().createDoc });
    expect(r.ok).toBe(false);
    expect(r.refusal).toBe('TABLES_ABSENT');
  });

  it('dry-run (no --apply) previews the brief_md and never calls createDoc', async () => {
    const { sb } = db();
    const { createDoc, calls: driveCalls } = fakeDrive();
    const r = await runBriefDoc({ sb, argv: [], now: NOW, createDoc });
    expect(r.action).toBe('dry_run');
    expect(typeof r.preview.brief_md).toBe('string');
    expect(driveCalls).toHaveLength(0);
  });
});

describe('renderBriefText / buildPreShipElements (pure)', () => {
  it('renderBriefText produces plain text (no HTML tags) naming the long date and the lede', () => {
    const text = renderBriefText(DATA_JSON, { etDate: '2026-09-06' });
    expect(text).toContain('September 6, 2026');
    expect(text).toContain(DATA_JSON.lede);
    expect(text).not.toMatch(/<[a-z]/i);
  });

  it('buildPreShipElements attaches a named source to every numeric/date element', () => {
    const elements = buildPreShipElements(DATA_JSON, { etDate: '2026-09-06' });
    for (const el of elements) expect(el.source).toBeTruthy();
    expect(elements.find((e) => e.id === 'ehg.handedCount').value).toBe(2);
  });
});
