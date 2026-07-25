/**
 * SD-LEO-INFRA-ADAM-INBOUND-BACKLOG-WATCHDOG-001 — Phase 2 (watchdog + cron sweep + tick parity).
 *
 * Covers FR-2 (alarm/dedup/ceiling/zero-writes), FR-3 (tick parity by construction),
 * FR-4 (DI sweep + exit codes + workflow wiring) and FR-5 (seeded replay fixtures — no test
 * references a live session_coordination id, since replay row 4479197b is already past
 * expires_at and becomes reapable ~2026-08-01).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// Hermetic by construction: every test injects a fake client via deps.supabase, but the sweep
// module still imports createClient at module scope. Mocking it makes a live Supabase connection
// unreachable on EVERY path (including the buildSupabase fallback), so this unit test can never
// touch a real DB — which is also what scripts/audit-db-test-guards.mjs requires to classify it
// GUARDED rather than an unguarded DB test.
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => { throw new Error('unit test must not construct a live Supabase client'); },
}));

const emitFeedbackMock = vi.fn(async () => ({ id: 'fb-1', deduped: false }));
vi.mock('../../../lib/governance/emit-feedback.js', () => ({
  emitFeedback: (...args) => emitFeedbackMock(...args),
}));

const {
  runInboundBacklogWatchdog, dedupKeyFor, descriptionFor, assertThresholdsBelowEvidenceFloor,
  MAX_ESCALATIONS_PER_TICK, ESCALATION_KIND, SCOPE_BACKLOG, SCOPE_UNDRAINED,
} = await import('../../../lib/adam/inbound-backlog-watchdog.js');
const { classifyBacklog } = await import('../../../lib/adam/inbound-backlog.js');

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const NOW = Date.parse('2026-07-25T12:00:00.000Z');
const MIN = 60 * 1000;
const ago = (ms) => new Date(NOW - ms).toISOString();

/**
 * FR-5: the three witnessed replay shapes, SEEDED — each carries payload.reply_to AND
 * payload.correlation_id pointing at a message Adam SENT, with acknowledged_at NULL. Ids are
 * fixture-local on purpose; the live ids are never referenced.
 */
function replayFixtures() {
  return [
    { id: 'replay-a', target_session: 'adam-1', sender_type: 'solomon', payload: { kind: 'adam_advisory', reply_to: 'adam-sent-1', correlation_id: 'corr-1' }, created_at: ago(200 * MIN), read_at: null, acknowledged_at: null },
    { id: 'replay-b', target_session: 'adam-1', sender_type: 'coordinator', payload: { kind: 'adam_advisory', reply_to: 'adam-sent-2', correlation_id: 'corr-2' }, created_at: ago(180 * MIN), read_at: null, acknowledged_at: null },
    { id: 'replay-c', target_session: 'adam-1', sender_type: 'coordinator', payload: { kind: 'adam_advisory', reply_to: 'adam-sent-3', correlation_id: 'corr-3' }, created_at: ago(160 * MIN), read_at: null, acknowledged_at: null },
  ];
}

/** Fake supabase: records every table touched so "zero session_coordination writes" is provable. */
function fakeSupabase(backlogRows, { adamIds = ['adam-1'], sessionError = null } = {}) {
  const writes = [];
  const client = {
    writes,
    from(table) {
      const builder = {
        _table: table,
        select() { return builder; },
        eq() { return builder; },
        in() { return builder; },
        is() { return builder; },
        order() { return builder; },
        range(from, to) {
          const page = backlogRows.slice(from, to + 1);
          return Promise.resolve({ data: page, error: null });
        },
        insert(payload) { writes.push({ table, op: 'insert', payload }); return Promise.resolve({ data: null, error: null }); },
        update(payload) { writes.push({ table, op: 'update', payload }); return Promise.resolve({ data: null, error: null }); },
        then(res) { // claude_sessions role query awaits the builder directly
          if (table === 'claude_sessions') {
            return Promise.resolve(sessionError
              ? { data: null, error: { message: sessionError } }
              : { data: adamIds.map((id) => ({ session_id: id })), error: null }).then(res);
          }
          return Promise.resolve({ data: [], error: null }).then(res);
        },
      };
      return builder;
    },
  };
  return client;
}

beforeEach(() => emitFeedbackMock.mockClear());

describe('FR-2 — alarm fires on a single correlation-chain row, with zero session_coordination writes', () => {
  it('escalates a lone unacked row that belongs to a chain Adam participated in', async () => {
    const sb = fakeSupabase([replayFixtures()[0]]);
    const r = await runInboundBacklogWatchdog(sb, { now: NOW });
    expect(r.error).toBeNull();
    expect(r.breaching).toBe(true);
    expect(r.breachingCount).toBe(1);
    expect(emitFeedbackMock).toHaveBeenCalledTimes(1);
  });

  it('performs ZERO writes to session_coordination (no probe leg)', async () => {
    const sb = fakeSupabase(replayFixtures());
    await runInboundBacklogWatchdog(sb, { now: NOW });
    expect(sb.writes.filter((w) => w.table === 'session_coordination')).toEqual([]);
  });

  it('has NO liveness gate — it fires with no live Adam session registered (SD criterion 4)', async () => {
    // The fake reports historical adam ids but nothing about heartbeats; the watchdog must never
    // consult liveness. A mirrored liveness gate would return breaching:false here.
    const sb = fakeSupabase(replayFixtures());
    const r = await runInboundBacklogWatchdog(sb, { now: NOW });
    expect(r.breaching).toBe(true);
  });
});

describe('FR-2 — dedup discipline', () => {
  it('uses a <kind>:<scope>:<date> dedup_key, giving one row per scope per day', async () => {
    const sb = fakeSupabase(replayFixtures());
    await runInboundBacklogWatchdog(sb, { now: NOW });
    const call = emitFeedbackMock.mock.calls[0][0];
    expect(call.dedup_key).toBe(`${ESCALATION_KIND}:${SCOPE_BACKLOG}:2026-07-25`);
    expect(dedupKeyFor(SCOPE_BACKLOG, NOW)).toBe(call.dedup_key);
  });

  it('keeps description and dedup_key INVARIANT across ticks within the window', async () => {
    // emitFeedback hashes `${today}::${description}::${dedup_key}` — any per-tick-varying value
    // in either defeats dedup entirely (the live 66-row fleet_dormancy storm).
    const sbEarly = fakeSupabase(replayFixtures());
    await runInboundBacklogWatchdog(sbEarly, { now: NOW });
    const sbLater = fakeSupabase(replayFixtures());
    await runInboundBacklogWatchdog(sbLater, { now: NOW + 37 * MIN }); // ages moved, same day
    const [a, b] = emitFeedbackMock.mock.calls.map((c) => c[0]);
    expect(a.description).toBe(b.description);
    expect(a.dedup_key).toBe(b.dedup_key);
    // ...while the variable evidence still reaches the row, via unhashed metadata.
    expect(b.metadata.oldest_age_ms).toBeGreaterThan(a.metadata.oldest_age_ms);
  });

  it('embeds no digits in the hashed description (no age/count can leak into the hash)', () => {
    expect(descriptionFor(SCOPE_BACKLOG)).not.toMatch(/\d/);
    expect(descriptionFor(SCOPE_UNDRAINED)).not.toMatch(/\d/);
  });
});

describe('FR-2 — bounded ceiling and evidence floor', () => {
  it('never exceeds MAX_ESCALATIONS_PER_TICK under a 200-row burst', async () => {
    const burst = Array.from({ length: 200 }, (_, i) => ({
      id: `burst-${i}`, target_session: 'adam-1', sender_type: 'coordinator',
      payload: { kind: 'adam_advisory' }, created_at: ago(120 * MIN), read_at: null, acknowledged_at: null,
    }));
    const sb = fakeSupabase(burst);
    const r = await runInboundBacklogWatchdog(sb, { now: NOW });
    expect(r.breachingCount).toBe(200);
    expect(r.escalated.length).toBeLessThanOrEqual(MAX_ESCALATIONS_PER_TICK);
    expect(emitFeedbackMock.mock.calls.length).toBeLessThanOrEqual(MAX_ESCALATIONS_PER_TICK);
  });

  it('assertThresholdsBelowEvidenceFloor passes today and is the guard a relaxation would trip', () => {
    expect(assertThresholdsBelowEvidenceFloor()).toBeNull();
  });

  it('treats an unresolvable Adam identity as INFRA, never as an all-clear', async () => {
    const sb = fakeSupabase([], { adamIds: [] });
    const r = await runInboundBacklogWatchdog(sb, { now: NOW });
    expect(r.breaching).toBe(false);
    expect(r.error).toMatch(/no role=adam session ids/);
  });
});

describe('FR-3 — tick count equals watchdog count BY CONSTRUCTION', () => {
  it('classifyBacklog over identical seeded data yields one shared number for both consumers', async () => {
    const seeded = replayFixtures();
    const sb = fakeSupabase(seeded);
    const watchdog = await runInboundBacklogWatchdog(sb, { now: NOW });
    // The tick derives its count from the SAME selector+classifier (scripts/adam-quiet-tick.mjs
    // surfaceInboxItems), so equality is structural, not a reconciled coincidence.
    const tickVerdict = classifyBacklog(seeded, NOW);
    expect(tickVerdict.rawBacklogCount).toBe(watchdog.rawBacklogCount);
    expect(tickVerdict.breachingCount).toBe(watchdog.breachingCount);
  });

  it('all three seeded replay shapes surface rather than being suppressed', () => {
    const verdict = classifyBacklog(replayFixtures(), NOW);
    expect(verdict.breachingCount).toBe(3);
  });

  it('surfaces all three witnessed reply-shaped rows despite their Adam-sent ancestors being in the correlation window', async () => {
    // BEHAVIORAL pin (replaced a source-grep for `hasCorrelatedReply(` per RCA a39dffac). The
    // requirement is that these rows SURFACE — not that a particular symbol is absent. The
    // narrowed predicate keeps suppression for thread-ROOT rows, so a shape-pin would have
    // forbidden the correct fix. Each fixture carries payload.reply_to (non-root) and its
    // Adam-sent ancestor is present in the correlation window — the exact condition under which
    // the old predicate hid them.
    const { surfaceInboxItems } = await import('../../../scripts/adam-quiet-tick.mjs');
    const seeded = replayFixtures();
    const ancestors = seeded.map((r) => ({
      id: r.payload.reply_to, payload: { kind: 'adam_advisory', correlation_id: r.payload.correlation_id },
      sender_session: 'adam-1', target_session: 'someone-else',
    }));
    const sb = { from: () => { const st = { or: false, op: 'select' }; const c = {
      select: () => c, update: () => { st.op = 'update'; return c; }, eq: () => c, is: () => c,
      gte: () => c, order: () => c, limit: () => c, or: () => { st.or = true; return c; },
      single: async () => ({ data: { session_id: 'adam-1', metadata: { role: 'adam' } }, error: null }),
      then: (res) => Promise.resolve(
        st.op === 'update' ? { data: [], error: null }
          : st.or ? { data: [...seeded, ...ancestors], error: null }
          : { data: seeded, error: null }).then(res),
    }; return c; } };
    const out = await surfaceInboxItems(sb);
    for (const r of seeded) expect(out.items.map((i) => i.id)).toContain(r.id);
  });

  it('keeps TICK_SURFACE_WINDOW_MS at 7d — aging out was verified NOT to be the cause', () => {
    const src = readFileSync(resolve(REPO, 'scripts/adam-quiet-tick.mjs'), 'utf8');
    expect(src).toMatch(/const TICK_SURFACE_WINDOW_MS = 7 \* 24 \* 60 \* 60 \* 1000;/);
  });
});

describe('FR-4 — DI sweep, exit codes, and workflow wiring', () => {
  it('main(argv, deps) returns 0 clean / 2 breach / 1 infra with an injected clock and fake supabase', async () => {
    const { main, EXIT_OK, EXIT_BREACH, EXIT_INFRA } = await import('../../../scripts/cron/adam-inbound-backlog-watchdog-sweep.mjs');
    const logger = { log: vi.fn() };

    const clean = await main(['node', 'x', '--once'], { logger, env: {}, now: NOW, supabase: fakeSupabase([]) });
    expect(clean.exitCode).toBe(EXIT_OK);

    const breach = await main(['node', 'x', '--once'], { logger, env: {}, now: NOW, supabase: fakeSupabase(replayFixtures()) });
    expect(breach.exitCode).toBe(EXIT_BREACH);

    const infra = await main(['node', 'x', '--once'], { logger, env: {}, now: NOW, supabase: fakeSupabase([], { sessionError: 'boom' }) });
    expect(infra.exitCode).toBe(EXIT_INFRA);
    expect(infra.exitCode).not.toBe(EXIT_BREACH); // a broken watchdog is never a quiet lane
  });

  it('--dry-run classifies without emitting', async () => {
    const { main } = await import('../../../scripts/cron/adam-inbound-backlog-watchdog-sweep.mjs');
    const r = await main(['node', 'x', '--once', '--dry-run'], { logger: { log: vi.fn() }, env: {}, now: NOW, supabase: fakeSupabase(replayFixtures()) });
    expect(r.summary.breaching).toBe(true);
    expect(emitFeedbackMock).not.toHaveBeenCalled();
  });

  it('logs a single-line JSON summary behind a bracket tag', async () => {
    const { main } = await import('../../../scripts/cron/adam-inbound-backlog-watchdog-sweep.mjs');
    const logger = { log: vi.fn() };
    await main(['node', 'x', '--once'], { logger, env: {}, now: NOW, supabase: fakeSupabase([]) });
    const line = logger.log.mock.calls[0][0];
    expect(line.startsWith('[adam-inbound-backlog] ')).toBe(true);
    expect(line).not.toContain('\n');
    expect(() => JSON.parse(line.replace('[adam-inbound-backlog] ', ''))).not.toThrow();
  });

  it('the workflow injects ONLY supabase-js credentials and matches the repo cron convention', () => {
    const wf = readFileSync(resolve(REPO, '.github/workflows/adam-inbound-backlog-watchdog-cron.yml'), 'utf8');
    expect(wf).toMatch(/SUPABASE_URL: \$\{\{ secrets\.SUPABASE_URL \}\}/);
    expect(wf).toMatch(/SUPABASE_SERVICE_ROLE_KEY: \$\{\{ secrets\.SUPABASE_SERVICE_ROLE_KEY \}\}/);
    // No pooler/pg WIRING — SUPABASE_POOLER_URL is in ZERO *cron*.yml and is undefined on a
    // runner. Asserted over non-comment lines only: the workflow's prose deliberately NAMES the
    // pooler to explain its absence, and a raw substring check would forbid documenting that.
    const wired = wf.split('\n').filter((l) => !l.trim().startsWith('#')).join('\n');
    expect(wired).not.toMatch(/POOLER|DATABASE_URL|PGHOST/);
    expect(wf).toMatch(/schedule:/);
    expect(wf).toMatch(/workflow_dispatch:/);
    expect(wf).toMatch(/permissions:\s*\n\s*contents: read/);
    expect(wf).toMatch(/concurrency:/);
    expect(wf).toMatch(/node-version: '22'/);
    expect(wf).toMatch(/npm ci --ignore-scripts/);
    // Plain interval cron — no hour-list/DST idiom.
    expect(wf).toMatch(/cron: '\*\/30 \* \* \* \*'/);
  });
});
