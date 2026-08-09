/**
 * Operator Contract gate — core validator tests
 * (SD-LEO-INFRA-OPERATOR-CONTRACT-GATE-001, FR-1..FR-6, FR-8 fixtures).
 */
import { describe, it, expect } from 'vitest';
import {
  detectCreator,
  validateConsumer,
  validateCadence,
  validateReaper,
  evaluateWaiver,
  evaluateOperatorContract,
  CREATOR_KINDS,
} from '../index.js';

const FIXED_NOW = new Date('2026-07-13T00:00:00.000Z');
const future = (days) => new Date(FIXED_NOW.getTime() + days * 86_400_000).toISOString();
const past = (days) => new Date(FIXED_NOW.getTime() - days * 86_400_000).toISOString();

describe('detectCreator (FR-1)', () => {
  it('flags a CREATE TABLE migration as a table CREATOR with evidence', () => {
    const r = detectCreator({
      migrations: [{ path: 'db/migrations/20260713_foo.sql', sql: 'CREATE TABLE IF NOT EXISTS foo_events (id uuid);' }],
    });
    expect(r.is_creator).toBe(true);
    expect(r.creator_kinds).toContain(CREATOR_KINDS.TABLE);
    expect(r.evidence[0]).toMatch(/CREATE TABLE/);
  });

  it('flags a writer as a CREATOR only when it targets a table the SD also creates', () => {
    const r = detectCreator({
      migrations: [{ path: 'db/m.sql', sql: 'CREATE TABLE foo_events (id uuid);' }],
      changedFiles: [{ path: 'lib/foo/writer.js', added: "await supabase.from('foo_events').insert(row)" }],
    });
    expect(r.is_creator).toBe(true);
    expect(r.creator_kinds).toContain(CREATOR_KINDS.WRITER);
  });

  it('does NOT flag a writer that only writes to an EXISTING table (SC#5 zero-false-positive)', () => {
    const r = detectCreator({
      changedFiles: [{ path: 'lib/foo/logger.js', added: "await supabase.from('audit_log').insert(row)" }],
    });
    expect(r.is_creator).toBe(false);
  });

  it('flags a leo_feature_flags insert as a flag CREATOR', () => {
    const r = detectCreator({
      changedFiles: [{ path: 'lib/flags/new.js', added: "supabase.from('leo_feature_flags').insert({ key: 'x' })" }],
    });
    expect(r.creator_kinds).toContain(CREATOR_KINDS.FLAG);
  });

  it('flags a new detector MODULE (path-based) as a detector CREATOR', () => {
    const r = detectCreator({
      changedFiles: [{ path: 'lib/detectors/drift-detector.js', added: 'export function run() {}' }],
    });
    expect(r.creator_kinds).toContain(CREATOR_KINDS.DETECTOR);
  });

  it('does NOT flag a loose detectX() call-site as a detector (would false-positive)', () => {
    const r = detectCreator({
      changedFiles: [{ path: 'lib/util/thing.js', added: 'const x = detectSomething(input);' }],
    });
    expect(r.is_creator).toBe(false);
  });

  it('does NOT flag edits to existing non-creator code', () => {
    const r = detectCreator({
      changedFiles: [{ path: 'lib/util/format.js', added: 'return value.trim().toLowerCase();' }],
    });
    expect(r.is_creator).toBe(false);
    expect(r.creator_kinds).toHaveLength(0);
  });
});

describe('validateConsumer (FR-2)', () => {
  it('accepts a non-test read-path against the created table', () => {
    const r = validateConsumer({
      changedFiles: [{ path: 'lib/foo/consumer.js', added: "const { data } = await supabase.from('foo_events').select('*')" }],
      createdTables: ['foo_events'],
    });
    expect(r.consumer_present).toBe(true);
  });

  it('rejects when only the writer exists (no consumer)', () => {
    const r = validateConsumer({
      changedFiles: [{ path: 'lib/foo/writer.js', added: "await supabase.from('foo_events').insert(row)" }],
      createdTables: ['foo_events'],
    });
    expect(r.consumer_present).toBe(false);
  });

  it('does not count a test file as a consumer', () => {
    const r = validateConsumer({
      changedFiles: [{ path: 'lib/foo/__tests__/foo.test.js', added: "supabase.from('foo_events').select('*')" }],
      createdTables: ['foo_events'],
    });
    expect(r.consumer_present).toBe(false);
  });
});

describe('validateCadence (FR-3)', () => {
  it('accepts an active registry row with a positive interval + surfaces the witness', () => {
    const r = validateCadence({
      registryRows: [{ process_key: 'foo-sweep', currently_expected_active: true, expected_interval_seconds: 1800, last_fired_at: '2026-07-13T00:00:00Z' }],
      capabilityKeys: ['foo-sweep'],
    });
    expect(r.cadence_armed).toBe(true);
    expect(r.process_key).toBe('foo-sweep');
    expect(r.witnessed).toBe(true);
  });

  it('accepts an ARMED-but-not-yet-fired row (armed, witnessed=false)', () => {
    const r = validateCadence({
      registryRows: [{ process_key: 'foo-sweep', currently_expected_active: true, expected_interval_seconds: 1800, last_fired_at: null }],
      capabilityKeys: ['foo-sweep'],
    });
    expect(r.cadence_armed).toBe(true);
    expect(r.witnessed).toBe(false);
  });

  it('rejects a bare CLI (no registry row)', () => {
    const r = validateCadence({ registryRows: [], capabilityKeys: ['foo-sweep'] });
    expect(r.cadence_armed).toBe(false);
  });

  it('rejects an inactive (currently_expected_active=false) registry row', () => {
    const r = validateCadence({
      registryRows: [{ process_key: 'foo-sweep', currently_expected_active: false, expected_interval_seconds: 1800 }],
      capabilityKeys: ['foo-sweep'],
    });
    expect(r.cadence_armed).toBe(false);
  });
});

describe('validateReaper (FR-4)', () => {
  it('accepts a created table covered by a retention policy', () => {
    const r = validateReaper({ retentionPolicies: [{ table: 'foo_events' }], createdTables: ['foo_events'] });
    expect(r.reaper_present).toBe(true);
  });

  it('rejects a created table with no retention policy', () => {
    const r = validateReaper({ retentionPolicies: [{ table: 'other' }], createdTables: ['foo_events'] });
    expect(r.reaper_present).toBe(false);
    expect(r.evidence[0]).toMatch(/foo_events/);
  });
});

describe('evaluateWaiver (FR-6)', () => {
  it('accepts a future-dated waiver with owner+expiry and emits an audit payload', () => {
    const r = evaluateWaiver({ owner: 'chairman', reason: 'build-ahead', expiry: future(30) }, FIXED_NOW);
    expect(r.valid).toBe(true);
    expect(r.audit.event).toBe('OPERATOR_CONTRACT_WAIVER_APPLIED');
    expect(r.audit.owner).toBe('chairman');
  });

  it('rejects an expired waiver', () => {
    const r = evaluateWaiver({ owner: 'chairman', expiry: past(1) }, FIXED_NOW);
    expect(r.valid).toBe(false);
    expect(r.reason).toMatch(/expired/);
  });

  it('rejects a waiver missing owner', () => {
    const r = evaluateWaiver({ expiry: future(30) }, FIXED_NOW);
    expect(r.valid).toBe(false);
    expect(r.reason).toMatch(/owner/);
  });

  it('rejects a waiver missing expiry', () => {
    const r = evaluateWaiver({ owner: 'chairman' }, FIXED_NOW);
    expect(r.valid).toBe(false);
    expect(r.reason).toMatch(/expiry/);
  });
});

describe('evaluateOperatorContract (FR-5) — end-to-end verdicts', () => {
  const creator = { is_creator: true, creator_kinds: ['table', 'writer'], evidence: ['x'] };
  const fullTriple = { consumer_present: true, cadence_armed: true, reaper_present: true };
  const noTriple = { consumer_present: false, cadence_armed: false, reaper_present: false };

  it('NEGATIVE fixture: CREATOR without triple → fail with all three missing', () => {
    const r = evaluateOperatorContract({ creator, triple: noTriple, now: FIXED_NOW });
    expect(r.verdict).toBe('fail');
    expect(r.reason).toMatch(/OPERATOR_CONTRACT_INCOMPLETE/);
    expect(r.missing).toEqual(['consumer', 'armed_cadence', 'reaper']);
  });

  it('POSITIVE fixture: CREATOR with full triple → pass', () => {
    const r = evaluateOperatorContract({ creator, triple: fullTriple, now: FIXED_NOW });
    expect(r.verdict).toBe('pass');
    expect(r.reason).toBe('OPERATOR_CONTRACT_COMPLETE');
  });

  it('WAIVER fixture: incomplete triple + future waiver → pass with audit', () => {
    const r = evaluateOperatorContract({
      creator,
      triple: noTriple,
      waiver: { owner: 'chairman', expiry: future(30) },
      now: FIXED_NOW,
    });
    expect(r.verdict).toBe('pass');
    expect(r.reason).toMatch(/OPERATOR_CONTRACT_WAIVED/);
    expect(r.waiver_audit.event).toBe('OPERATOR_CONTRACT_WAIVER_APPLIED');
  });

  it('EXPIRED-WAIVER fixture: incomplete triple + expired waiver → fail', () => {
    const r = evaluateOperatorContract({
      creator,
      triple: noTriple,
      waiver: { owner: 'chairman', expiry: past(1) },
      now: FIXED_NOW,
    });
    expect(r.verdict).toBe('fail');
    expect(r.waiver_audit).toBeNull();
  });

  it('ZERO-FALSE-POSITIVE: non-CREATOR SD → no-op pass regardless of triple', () => {
    const r = evaluateOperatorContract({
      creator: { is_creator: false, creator_kinds: [], evidence: [] },
      triple: noTriple,
      now: FIXED_NOW,
    });
    expect(r.verdict).toBe('pass');
    expect(r.reason).toMatch(/NOT_APPLICABLE/);
    expect(r.missing).toHaveLength(0);
  });
});

/**
 * SD-LEO-INFRA-PERSIST-BELT-CAPACITY-001 — the created-table extraction read PROSE as SQL.
 *
 * MEASURED on a real staged migration, collectSdDiff returned
 *   ["would", "IF", "public", "returns", "belt_capacity_verdicts_backup"]
 * and the actual created table was NOT among them. Three causes, all fixed in harness-adapter.js:
 * SQL comments were scanned, single-quoted RAISE messages were scanned, and the name pattern
 * stopped at the dot so `public.foo` captured the SCHEMA.
 *
 * WHY IT MATTERS MORE THAN A COSMETIC MISPARSE: the REAPER check asks whether a retention policy
 * covers each created table. A wrong name asks about a table nobody has — so a genuinely unreaped
 * table can PASS while a correctly reaped one FAILS. The gate is documented as fail-toward-safe
 * (TR-2); this inverted it in both directions at once. The file that documents itself most
 * carefully was punished hardest, because a header warning against `CREATE TABLE IF NOT EXISTS`
 * was read as a CREATE TABLE statement.
 *
 * These call the pure extraction through a fixture rather than git, so they need no repo state.
 */
describe('created-table extraction distinguishes a STATEMENT from a MENTION', () => {
  // Mirrors harness-adapter.js's extraction exactly. Kept as a local mirror because collectSdDiff
  // shells out to git; the regex is the part with the defect.
  const extract = (sql) => {
    const stripped = sql
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/--[^\n]*/g, ' ')
      .replace(/'(?:[^']|'')*'/g, ' ');
    return (stripped.match(/create\s+table\s+(?:if\s+not\s+exists\s+)?["`]?([a-z0-9_]+(?:\.[a-z0-9_]+)?)/gi) || [])
      .map((s) => s.replace(/create\s+table\s+(?:if\s+not\s+exists\s+)?["`]?/i, '').trim().replace(/^[a-z0-9_]+\./i, ''))
      .filter(Boolean);
  };

  it('[CONTROL] a bare CREATE TABLE is still found — the fix must not trade one blindness for another', () => {
    expect(extract('CREATE TABLE widgets (id UUID);')).toEqual(['widgets']);
    expect(extract('create table if not exists gadgets (id uuid);')).toEqual(['gadgets']);
  });

  it('strips the schema qualifier so public.foo and foo are ONE identity', () => {
    // Retention policies and every other consumer key on the bare name. Capturing `public` meant
    // the reaper check asked about a table called public, for every schema-qualified migration.
    expect(extract('CREATE TABLE public.belt_capacity_verdicts (id UUID);')).toEqual(['belt_capacity_verdicts']);
  });

  it('does NOT read a line comment as a statement', () => {
    expect(extract('-- the instant CREATE TABLE returns, anon holds full access\nCREATE TABLE public.real_one (id UUID);'))
      .toEqual(['real_one']);
  });

  it('does NOT read a block comment as a statement', () => {
    expect(extract('/* CREATE TABLE foo_backup AS SELECT * FROM foo; */ CREATE TABLE real_two (id UUID);'))
      .toEqual(['real_two']);
  });

  it('does NOT read a quoted RAISE message as a statement — including one WARNING against it', () => {
    // The exact shape that produced "IF": a message spanning two string literals, so
    // `if\s+not\s+exists` never matched and the pattern fell through to capturing IF.
    const sql = "DO $$ BEGIN RAISE EXCEPTION 'DO NOT swap in CREATE TABLE IF NOT '\n'EXISTS to make this pass.'; END $$;\nCREATE TABLE public.real_three (id UUID);";
    expect(extract(sql)).toEqual(['real_three']);
  });

  it('[REGRESSION] the full pathological migration yields exactly ONE name', () => {
    const sql = [
      '-- CHAIRMAN-GATED. Do not self-apply.',
      '-- A _DOWN advising: CREATE TABLE belt_capacity_verdicts_backup AS SELECT * FROM belt_capacity_verdicts;',
      'DO $$ BEGIN',
      "  RAISE EXCEPTION 'already exists. DO NOT swap in CREATE TABLE IF NOT '",
      "    'EXISTS to make this pass.';",
      'END $$;',
      'CREATE TABLE public.belt_capacity_verdicts (id UUID PRIMARY KEY);',
      '/* the instant CREATE TABLE returns, the inherited ACL is live */',
    ].join('\n');
    expect(extract(sql), 'five garbage names previously came out of this shape').toEqual(['belt_capacity_verdicts']);
  });
});
