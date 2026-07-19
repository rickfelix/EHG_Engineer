/**
 * SD-LEO-INFRA-CHAIRMAN-DAILY-REVIEW-DOC-001-B — durable 5:45 ET morning-review sweep.
 *
 * Pins the owed-state contract (TS-1..TS-7): enqueue-only (never provider.send), per-ET-date
 * dedupe double-fire no-op, notBefore=6AM ET deferral, STAGED-absent fail-soft inert, the
 * ET-wall-clock DST gate (exactly one of the two UTC fires works per season), a short/PII-free
 * body, and the "what moved yesterday" query window.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, it, expect, vi } from 'vitest';
import {
  main,
  parseArgs,
  buildMorningReviewBody,
  etLocalHour,
  etDateStr,
  et6amIso,
  etPrior545Iso,
  BODY_CEILING,
} from '../../../scripts/cron/chairman-morning-review-sweep.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SWEEP_SRC = readFileSync(path.join(__dirname, '../../../scripts/cron/chairman-morning-review-sweep.mjs'), 'utf8');

// Instants chosen so the ET wall-clock gate is exercised in BOTH DST seasons.
const SUMMER_WORK = new Date('2026-07-18T09:45:00Z');  // 05:45 EDT -> ET hour 5 (does work)
const SUMMER_INERT = new Date('2026-07-18T10:45:00Z');  // 06:45 EDT -> ET hour 6 (inert)
const WINTER_WORK = new Date('2026-01-15T10:45:00Z');  // 05:45 EST -> ET hour 5 (does work)
const WINTER_INERT = new Date('2026-01-15T09:45:00Z');  // 04:45 EST -> ET hour 4 (inert)

/** Minimal chainable fake supabase; records terminal queries and resolves configured datasets. */
function makeSupabase(data = {}) {
  const calls = [];
  function from(table) {
    const q = { table, ops: [] };
    const rec = (m, args) => { q.ops.push({ m, args }); return api; };
    const api = {
      select: (...a) => rec('select', a),
      eq: (...a) => rec('eq', a),
      gte: (...a) => rec('gte', a),
      not: (...a) => rec('not', a),
      order: (...a) => rec('order', a),
      limit: (...a) => rec('limit', a),
      then: (resolve, reject) => {
        calls.push(q);
        const has = (m) => q.ops.some((o) => o.m === m);
        let rows = [];
        if (table === 'strategic_roadmaps') rows = data.roadmaps || [];
        else if (table === 'roadmap_waves') rows = data.waves || [];
        else if (table === 'strategic_directives_v2') rows = has('not') ? (data.inFlight || []) : (data.completed || []);
        return Promise.resolve({ data: rows, error: null }).then(resolve, reject);
      },
    };
    return api;
  }
  return { from, _calls: calls };
}

const richData = {
  roadmaps: [{ id: 'rm1', status: 'active', created_at: '2026-06-01T00:00:00Z' }],
  waves: [{ status: 'completed', progress_pct: 100 }, { status: 'active', progress_pct: 40 }],
  completed: [{ sd_key: 'A', updated_at: '2026-07-17T12:00:00Z' }, { sd_key: 'B', updated_at: '2026-07-17T18:00:00Z' }],
  inFlight: [{ sd_key: 'C', created_at: '2026-07-16T00:00:00Z', sd_type: 'feature', claiming_session_id: null }],
};

function baseDeps(overrides = {}) {
  return {
    supabase: makeSupabase(richData),
    env: { CHAIRMAN_PHONE: '+15555550123' },
    now: SUMMER_WORK,
    logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
    ...overrides,
  };
}

describe('parseArgs', () => {
  it('parses --once and --dry-run', () => {
    expect(parseArgs(['node', 's', '--once', '--dry-run'])).toEqual({ once: true, dryRun: true, help: false });
  });
});

describe('ET wall-clock gate fixtures are valid (season sanity)', () => {
  it('summer 09:45Z is 05:45 ET (hour 5); 10:45Z is hour 6', () => {
    expect(etLocalHour(SUMMER_WORK)).toBe(5);
    expect(etLocalHour(SUMMER_INERT)).toBe(6);
  });
  it('winter 10:45Z is 05:45 ET (hour 5); 09:45Z is hour 4', () => {
    expect(etLocalHour(WINTER_WORK)).toBe(5);
    expect(etLocalHour(WINTER_INERT)).toBe(4);
  });
});

describe('TS-1 — enqueues via the owed-state path, never fire-and-forget', () => {
  it('calls enqueueChairmanSms with kind=morning_review when ET hour===5 and phone set', async () => {
    const enqueue = vi.fn(async () => ({ enqueued: true, obligationId: 'ob-1' }));
    const deps = baseDeps({ enqueue });
    const r = await main(['node', 's', '--once'], deps);

    expect(r.exitCode).toBe(0);
    expect(r.action).toBe('enqueued');
    expect(enqueue).toHaveBeenCalledTimes(1);
    const [, arg] = enqueue.mock.calls[0];
    expect(arg.kind).toBe('morning_review');
    expect(arg.recipientPhone).toBe('+15555550123');
    expect(arg.decisionId).toBeNull();
  });

  it('the sweep source never calls a provider send seam (no twilioProvider / .send()) ', () => {
    // Strip comments/docstrings — the invariant is that no CODE path imports a provider or calls .send().
    const code = SWEEP_SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(code).not.toMatch(/twilioProvider/);
    expect(code).not.toMatch(/\.send\(/);
    expect(code).not.toMatch(/from ['"][^'"]*twilio/i);
  });
});

describe('TS-2 — dedupeKey prevents a double-send on a cron double-fire', () => {
  it('same ET-date dedupeKey; second pass is a deduped no-op success', async () => {
    let firstSeen = false;
    const enqueue = vi.fn(async (_sb, { dedupeKey }) => {
      if (!firstSeen) { firstSeen = true; return { enqueued: true, obligationId: 'ob-1' }; }
      expect(dedupeKey).toBe(`morning_review:${etDateStr(SUMMER_WORK)}`);
      return { enqueued: false, deduped: true };
    });
    const deps = baseDeps({ enqueue });

    const r1 = await main(['node', 's', '--once'], deps);
    const r2 = await main(['node', 's', '--once'], deps);

    expect(enqueue.mock.calls[0][1].dedupeKey).toBe('morning_review:2026-07-18');
    expect(enqueue.mock.calls[1][1].dedupeKey).toBe('morning_review:2026-07-18');
    expect(r1.action).toBe('enqueued');
    expect(r2.action).toBe('deduped');
    expect(r2.exitCode).toBe(0);
  });
});

describe('TS-3 — notBefore = 6AM ET defers an overnight/early enqueue', () => {
  it('the enqueued obligation carries not_before = the 6:00 AM ET instant', async () => {
    const enqueue = vi.fn(async () => ({ enqueued: true, obligationId: 'ob-1' }));
    const deps = baseDeps({ enqueue });
    await main(['node', 's', '--once'], deps);

    const { notBefore } = enqueue.mock.calls[0][1];
    expect(notBefore).toBe(et6amIso(SUMMER_WORK));
    const nb = new Date(notBefore);
    expect(etLocalHour(nb)).toBe(6);              // resolves to 6AM ET wall-clock
    expect(nb.getTime()).toBeGreaterThan(SUMMER_WORK.getTime()); // 5:45 precedes 6:00 -> deferred
  });
});

describe('TS-4 — STAGED obligations table absent -> fail-soft inert, no crash', () => {
  it('table_absent return logs inert and exits 0 without throwing', async () => {
    const enqueue = vi.fn(async () => ({ enqueued: false, reason: 'table_absent' }));
    const deps = baseDeps({ enqueue });
    const r = await main(['node', 's', '--once'], deps);

    expect(r.exitCode).toBe(0);
    expect(r.action).toBe('inert');
    expect(r.summary.reason).toBe('table_absent');
  });
});

describe('TS-5 — ET-wall-clock gate makes exactly one DST entry do work', () => {
  it('inert (no enqueue) when the ET hour is not 5 — summer 10:45Z fire', async () => {
    const enqueue = vi.fn();
    const r = await main(['node', 's', '--once'], baseDeps({ enqueue, now: SUMMER_INERT }));
    expect(r.action).toBe('inert');
    expect(r.reason).toBe('outside_et_window');
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('inert (no enqueue) when the ET hour is not 5 — winter 09:45Z fire', async () => {
    const enqueue = vi.fn();
    const r = await main(['node', 's', '--once'], baseDeps({ enqueue, now: WINTER_INERT }));
    expect(r.action).toBe('inert');
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('works on the season-correct fire — winter 10:45Z', async () => {
    const enqueue = vi.fn(async () => ({ enqueued: true, obligationId: 'ob-1' }));
    const r = await main(['node', 's', '--once'], baseDeps({ enqueue, now: WINTER_WORK }));
    expect(r.action).toBe('enqueued');
    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(enqueue.mock.calls[0][1].dedupeKey).toBe('morning_review:2026-01-15');
  });
});

describe('TS-6 — body is short, segment-aware, and PII-free (no phone/body in logs)', () => {
  it('body contains the forecast/roadmap/yesterday lines and stays under the segment ceiling', async () => {
    const body = await buildMorningReviewBody(makeSupabase(richData), { now: SUMMER_WORK });
    expect(body).toMatch(/Estimated completion/);   // formatForecastLine
    expect(body).toMatch(/Roadmap:/);
    expect(body).toMatch(/Yesterday: \d+ shipped, \d+ in-flight/);
    expect(body.length).toBeLessThan(320);
    expect(body.length).toBeLessThanOrEqual(BODY_CEILING);
  });

  it('no log line emits the recipient phone or the raw body text', async () => {
    const PHONE = '+15555550123';
    const enqueue = vi.fn(async () => ({ enqueued: true, obligationId: 'ob-1' }));
    const logger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const body = await buildMorningReviewBody(makeSupabase(richData), { now: SUMMER_WORK });
    await main(['node', 's', '--once'], baseDeps({ enqueue, logger, env: { CHAIRMAN_PHONE: PHONE } }));

    const logged = logger.log.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(logged).not.toContain(PHONE);
    expect(logged).not.toContain(body);
  });
});

describe('TS-7 — "what moved yesterday" query window', () => {
  it('completed-since uses eq(status,completed)+gte(updated_at, prior 5:45 ET); in-flight uses not(status,in,terminal)', async () => {
    const sb = makeSupabase(richData);
    await buildMorningReviewBody(sb, { now: SUMMER_WORK });

    const priorIso = etPrior545Iso(SUMMER_WORK);
    const sdCalls = sb._calls.filter((c) => c.table === 'strategic_directives_v2');

    const completedSince = sdCalls.some((c) =>
      c.ops.some((o) => o.m === 'eq' && o.args[0] === 'status' && o.args[1] === 'completed') &&
      c.ops.some((o) => o.m === 'gte' && o.args[0] === 'updated_at' && o.args[1] === priorIso));
    expect(completedSince).toBe(true);

    const inFlight = sdCalls.some((c) =>
      c.ops.some((o) => o.m === 'not' && o.args[0] === 'status' && o.args[1] === 'in' && o.args[2] === '("completed","cancelled","deferred")'));
    expect(inFlight).toBe(true);
  });
});

describe('CHAIRMAN_PHONE unset -> inert', () => {
  it('logs inert and exits 0 with no enqueue when the phone is unset', async () => {
    const enqueue = vi.fn();
    const r = await main(['node', 's', '--once'], baseDeps({ enqueue, env: {} }));
    expect(r.exitCode).toBe(0);
    expect(r.action).toBe('inert');
    expect(r.reason).toBe('chairman_phone_unset');
    expect(enqueue).not.toHaveBeenCalled();
  });
});
