/**
 * SD-LEO-FIX-FIX-PHANTOM-COLUMN-002 — EVA phantom-column alignment guard.
 *
 * TS-1: logEvaAudit writes only live eva_audit_log columns and surfaces errors.
 * TS-2: static assertions — touched files contain zero phantom column names in
 *       DB-call context. Live column lists (verified against the EHG_Engineer DB,
 *       project dedlbzhpgkmetvhbkyzq, 2026-06-10) are embedded as source of truth.
 * TS-3: vision-gap-detected writes via select-then-insert/update (no onConflict
 *       upsert — eva_vision_gaps has NO unique constraint on (sd_id, dimension_key)).
 *
 * All mocked — NO live writes. The optional live schema smoke is read-only and
 * runs only when RUN_LIVE_SCHEMA_CHECK=1.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Capture vision-events subscribers so TS-3 can drive the gap-detected writer
// directly (publishVisionEvent is fire-and-forget). Hoisted by vitest.
vi.mock('../../lib/eva/event-bus/vision-events.js', () => {
  const captured = [];
  return {
    subscribeVisionEvent: (eventType, handler) => captured.push({ eventType, handler }),
    VISION_EVENTS: { GAP_DETECTED: 'vision.gap_detected' },
    __captured: captured,
  };
});

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
/**
 * Read a source file with comments stripped — explanatory comments are allowed
 * to mention the legacy phantom names; executable code is not.
 */
const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|\s)\/\/.*$/gm, '$1');

// ── Cached live column lists (source of truth, verified 2026-06-10) ──────────
const LIVE_COLUMNS = {
  eva_audit_log: ['id', 'eva_venture_id', 'action_type', 'action_source', 'action_data', 'actor_type', 'actor_id', 'created_at'],
  eva_event_log: ['id', 'event_type', 'trigger_source', 'venture_id', 'correlation_id', 'status', 'error_message', 'job_name', 'scheduled_time', 'metadata', 'created_at'],
  eva_vision_gaps: ['id', 'vision_score_id', 'sd_id', 'dimension_key', 'dimension_name', 'dimension_score', 'gap_description', 'severity', 'status', 'corrective_sd_id', 'accepted_at', 'accepted_by', 'acceptance_rationale', 'resolved_at', 'resolved_by', 'created_at', 'updated_at'],
  eva_scheduler_metrics: ['id', 'event_type', 'occurred_at', 'scheduler_instance_id', 'venture_id', 'stage_name', 'outcome', 'failure_reason', 'duration_ms', 'queue_depth', 'dispatched_count', 'paused', 'pause_reason', 'stages_dispatched', 'stages_remaining', 'max_stages_per_cycle', 'metadata', 'created_at'],
};
// CHECK-constrained enums on eva_event_log (live):
const EVENT_LOG_TRIGGER_SOURCES = ['realtime', 'cron', 'manual'];
const EVENT_LOG_STATUSES = ['succeeded', 'failed', 'suppressed'];

// ── Helpers ───────────────────────────────────────────────────────────────────
/** Extract code windows following each `.from('<table>')` call. */
function fromBlocks(content, table, windowChars = 350) {
  const needle = `.from('${table}')`;
  const blocks = [];
  let idx = content.indexOf(needle);
  while (idx !== -1) {
    blocks.push(content.slice(idx, idx + windowChars));
    idx = content.indexOf(needle, idx + 1);
  }
  return blocks;
}

// ── TS-1: logEvaAudit ─────────────────────────────────────────────────────────
describe('TS-1: logEvaAudit (eva_audit_log fail-loud writer)', () => {
  let inserted;
  const makeClient = (error = null) => ({
    from(table) {
      return {
        insert(row) {
          inserted = { table, row };
          return Promise.resolve({ error });
        },
      };
    },
  });

  beforeEach(() => {
    inserted = null;
    vi.restoreAllMocks();
  });

  it('writes only live eva_audit_log columns', async () => {
    const { logEvaAudit } = await import('../../lib/eva/event-bus/handlers/_log-eva-audit.js');
    const result = await logEvaAudit(makeClient(), {
      eva_venture_id: 'v-1',
      action_type: 'unit_test',
      action_data: { a: 1 },
      actor_type: 'event_bus',
      actor_id: 'tester',
    }, { handler: 'UnitTest' });

    expect(result.ok).toBe(true);
    expect(inserted.table).toBe('eva_audit_log');
    const keys = Object.keys(inserted.row);
    for (const key of keys) {
      expect(LIVE_COLUMNS.eva_audit_log, `phantom column '${key}' written by logEvaAudit`).toContain(key);
    }
    // Phantom legacy names must never appear
    expect(keys).not.toContain('venture_id');
    expect(keys).not.toContain('details');
    expect(keys).not.toContain('actor');
    expect(inserted.row.eva_venture_id).toBe('v-1');
    expect(inserted.row.action_data).toEqual({ a: 1 });
    expect(inserted.row.actor_type).toBe('event_bus');
  });

  it('surfaces insert errors via console.warn and returns ok:false', async () => {
    const { logEvaAudit } = await import('../../lib/eva/event-bus/handlers/_log-eva-audit.js');
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = await logEvaAudit(makeClient({ message: 'column does not exist' }), {
      eva_venture_id: 'v-2',
      action_type: 'unit_test_fail',
    }, { handler: 'UnitTest' });

    expect(result.ok).toBe(false);
    expect(result.error.message).toBe('column does not exist');
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0][0]).toContain('UnitTest');
    expect(warnSpy.mock.calls[0][0]).toContain('unit_test_fail');
  });
});

// ── TS-2: static phantom-column assertions ────────────────────────────────────
describe('TS-2: no phantom columns in DB-call context (static)', () => {
  const AUDIT_HANDLER_FILES = [
    'lib/eva/event-bus/handlers/budget-exceeded.js',
    'lib/eva/event-bus/handlers/chairman-override.js',
    'lib/eva/event-bus/handlers/venture-created.js',
    'lib/eva/event-bus/handlers/stage-failed.js',
    'lib/eva/event-bus/handlers/venture-killed.js',
    'lib/eva/event-bus/handlers/gate-evaluated.js',
    'lib/eva/event-bus/handlers/sd-completed.js',
  ];

  it('all eva_audit_log writes route through logEvaAudit (no direct inserts)', () => {
    for (const file of AUDIT_HANDLER_FILES) {
      const content = read(file);
      expect(content, `${file} must not call eva_audit_log directly`).not.toContain(".from('eva_audit_log')");
      expect(content, `${file} must use the logEvaAudit helper`).toContain('logEvaAudit(');
    }
    // The helper itself is the single writer and uses only live columns
    const helper = read('lib/eva/event-bus/handlers/_log-eva-audit.js');
    expect(helper).toContain("from('eva_audit_log')");
    expect(helper).toContain('eva_venture_id');
    expect(helper).toMatch(/if \(error\)/);
  });

  const EVENT_LOG_FILES = [
    'scripts/eva/heal-command.mjs',
    'scripts/modules/governance/cascade-validator.js',
    'lib/agents/venture-ceo/handlers.js',
    'lib/eva/dfe-gate-escalation-router.js',
    'lib/eva/analysis-history.js',
    'lib/eva/routing-state-machine.js',
    'lib/eva/gate-failure-recovery.js',
  ];

  it('eva_event_log writers use metadata + NOT NULL columns, never event_data/payload/severity', () => {
    for (const file of EVENT_LOG_FILES) {
      const content = read(file);
      const blocks = fromBlocks(content, 'eva_event_log', 700);
      expect(blocks.length, `${file} should reference eva_event_log`).toBeGreaterThan(0);

      for (const block of blocks) {
        if (block.includes('.insert(')) {
          // Required NOT NULL columns (no DB defaults)
          expect(block, `${file}: insert missing trigger_source`).toMatch(/trigger_source:/);
          expect(block, `${file}: insert missing status`).toMatch(/status:/);
          expect(block, `${file}: insert missing correlation_id`).toMatch(/correlation_id:/);
          expect(block, `${file}: insert missing metadata`).toMatch(/metadata:/);
          // Phantom names must not appear as insert columns before the metadata payload
          const head = block.slice(0, block.indexOf('metadata:'));
          expect(head, `${file}: phantom event_data in insert`).not.toMatch(/event_data:/);
          expect(head, `${file}: phantom payload column in insert`).not.toMatch(/payload:/);
          expect(head, `${file}: phantom severity column in insert`).not.toMatch(/severity:/);
          // CHECK-constrained enum literals must be valid
          const ts = block.match(/trigger_source:\s*'([a-z_]+)'/);
          if (ts) expect(EVENT_LOG_TRIGGER_SOURCES, `${file}: invalid trigger_source '${ts[1]}'`).toContain(ts[1]);
          const st = block.match(/status:\s*'([a-z_]+)'/);
          if (st) expect(EVENT_LOG_STATUSES, `${file}: invalid status '${st[1]}'`).toContain(st[1]);
        }
        if (block.includes('.select(')) {
          const sel = block.match(/\.select\('([^']*)'/);
          if (sel) {
            expect(sel[1], `${file}: phantom column in eva_event_log select`).not.toMatch(/payload|event_data|severity/);
          }
        }
      }
      // No file may reference the phantom event_data column at all
      expect(content, `${file}: stray event_data reference`).not.toMatch(/\bevent_data\b/);
    }
  });

  it('eva_vision_gaps writers/readers use live column names', () => {
    const checks = [
      { file: 'lib/eva/event-bus/handlers/vision-gap-detected.js', forbid: [/\bdimension_id\b/, /\bscore_id\b/, /\bdetected_at\b/, /onConflict/, /\.upsert\(/], require: ['dimension_key', 'dimension_score', 'vision_score_id'] },
      { file: 'lib/eva/event-bus/handlers/vision-corrective-sd-created.js', forbid: [/corrective_sd_key/, /\bdimension_id\b/], require: ['corrective_sd_id', 'dimension_key'] },
      { file: 'lib/eva/event-bus/handlers/vision-gap-accepted.js', forbid: [/resolution_notes/, /\bdimension_id\b/], require: ['acceptance_rationale', 'accepted_at', 'dimension_key'] },
      { file: 'lib/eva/event-bus/handlers/vision-rescore-completed.js', forbid: [/\bdimension_id\b/, /corrective_sd_key/], require: ['dimension_key', 'dimension_score'] },
      { file: 'lib/eva/escalation-event-persister.js', forbid: [/corrective_sd_key/, /dimension_label/, /gap_severity/, /current_score/, /target_score/], require: ['corrective_sd_id', 'dimension_score'] },
      { file: 'lib/eva/jobs/okr-monthly-generator.js', forbid: [/\bdimension_code\b/, /\.order\('gap_score'/, /select\('[^']*gap_score/], require: ['dimension_key', 'dimension_score'] },
    ];
    for (const { file, forbid, require: req } of checks) {
      const content = read(file);
      for (const re of forbid) {
        expect(content, `${file}: phantom pattern ${re}`).not.toMatch(re);
      }
      for (const needle of req) {
        expect(content, `${file}: missing live column ${needle}`).toContain(needle);
      }
    }
  });

  it('eva_scheduler_metrics writers/readers use event_type + metadata', () => {
    for (const file of ['lib/eva/operations/domain-handler.js', 'lib/eva/operations/index.js']) {
      const content = read(file);
      expect(content, `${file}: phantom metric_type`).not.toMatch(/metric_type/);
      expect(content, `${file}: phantom metric_value`).not.toMatch(/metric_value/);
    }
    const dh = read('lib/eva/operations/domain-handler.js');
    expect(dh).toMatch(/event_type: 'ops_metrics_combined'/);
    expect(dh).toMatch(/event_type: 'ops_status_snapshot'/);
  });

  it('strategic_directives_v2 reads use completion_date, ventures reads use current_lifecycle_stage', () => {
    const car = read('scripts/eva/consultant-analysis-round.mjs');
    expect(car, 'consultant-analysis-round: phantom completed_at').not.toMatch(/completed_at/);
    expect(car).toContain('completion_date');

    for (const file of ['scripts/eva/consultant-analysis-round.mjs', 'scripts/eva/management-review-round.mjs', 'lib/eva/launch-workflow/index.js']) {
      const content = read(file);
      expect(content, `${file}: phantom current_stage`).not.toMatch(/current_stage\b/);
      expect(content).toContain('current_lifecycle_stage');
    }

    const vp = read('lib/skunkworks/signal-readers/venture-portfolio.js');
    expect(vp, 'venture-portfolio: phantom synthesis_score').not.toMatch(/synthesis_score/);
    expect(vp, 'venture-portfolio: phantom bare stage select').not.toMatch(/select\('[^']*[, ]stage[, ']/);
    expect(vp).toContain('current_lifecycle_stage');
    expect(vp).toContain('ai_score');
  });

  it('eva_vision_documents / eva_architecture_plans writes carry no phantom metadata key', () => {
    const content = read('lib/eva/artifact-persistence-service.js');
    for (const table of ['eva_vision_documents', 'eva_architecture_plans']) {
      for (const block of fromBlocks(content, table, 420)) {
        if (block.includes('.insert(') || block.includes('.update(')) {
          expect(block, `${table} write still carries phantom metadata key`).not.toMatch(/\bmetadata:\s/);
        }
      }
    }
    // Errors are now captured on all four statements
    expect(content).toMatch(/eva_vision_documents update failed/);
    expect(content).toMatch(/eva_vision_documents insert failed/);
    expect(content).toMatch(/eva_architecture_plans update failed/);
    expect(content).toMatch(/eva_architecture_plans insert failed/);
  });

  it('gate-failure-recovery stashes retry context in eva_event_log, not eva_ventures.metadata', () => {
    const content = read('lib/eva/gate-failure-recovery.js');
    expect(content).not.toMatch(/eva_ventures'\)[\s\S]{0,80}\.select\('metadata'\)/);
    expect(content).not.toMatch(/\.update\(\{ metadata/);
    expect(content).toContain("event_type: 'gate_retry_context'");
  });
});

// ── TS-3: vision-gap-detected select-then-insert/update ──────────────────────
describe('TS-3: vision-gap-detected write path (mocked)', () => {
  function makeGapClient({ existingId = null } = {}) {
    const calls = { inserts: [], updates: [], upserts: [], selects: 0 };
    const client = {
      from(table) {
        const ctx = { table, op: null, updateRow: null, eqs: [] };
        const builder = {
          select() { ctx.op = 'select'; return builder; },
          insert(row) { calls.inserts.push({ table, row }); return Promise.resolve({ error: null }); },
          upsert(row, opts) { calls.upserts.push({ table, row, opts }); return Promise.resolve({ error: null }); },
          update(row) { ctx.op = 'update'; ctx.updateRow = row; return builder; },
          eq(col, val) { ctx.eqs.push([col, val]); return builder; },
          limit() { return builder; },
          maybeSingle() {
            calls.selects += 1;
            return Promise.resolve({ data: existingId ? { id: existingId } : null, error: null });
          },
          then(resolve, reject) {
            if (ctx.op === 'update') calls.updates.push({ table, row: ctx.updateRow, eqs: ctx.eqs });
            return Promise.resolve({ error: null }).then(resolve, reject);
          },
        };
        return builder;
      },
    };
    return { client, calls };
  }

  async function getGapWriter() {
    const visionEvents = await import('../../lib/eva/event-bus/vision-events.js');
    const mod = await import('../../lib/eva/event-bus/handlers/vision-gap-detected.js');
    mod._resetVisionGapDetectedHandlers();
    visionEvents.__captured.length = 0;
    mod.registerVisionGapDetectedHandlers();
    // Subscriber 2 is the DB writer (subscriber 1 is the console logger)
    const writer = visionEvents.__captured[1];
    expect(writer).toBeDefined();
    return writer.handler;
  }

  it('inserts a new gap with live columns when none exists', async () => {
    const handler = await getGapWriter();
    const { client, calls } = makeGapClient({ existingId: null });

    await handler({ sdKey: 'SD-X-001', dimension: 'tech_depth', dimId: 'dim_tech', score: 42, threshold: 70, scoreId: null, supabase: client });

    expect(calls.upserts).toHaveLength(0);
    expect(calls.updates).toHaveLength(0);
    expect(calls.inserts).toHaveLength(1);
    const row = calls.inserts[0].row;
    expect(row).toEqual({
      sd_id: 'SD-X-001',
      dimension_key: 'dim_tech',
      dimension_name: 'tech_depth',
      dimension_score: 42,
      vision_score_id: null,
      status: 'open',
    });
    for (const key of Object.keys(row)) {
      expect(LIVE_COLUMNS.eva_vision_gaps, `phantom column '${key}' in gap insert`).toContain(key);
    }
  });

  it('updates the existing gap row when one exists (no onConflict anywhere)', async () => {
    const handler = await getGapWriter();
    const { client, calls } = makeGapClient({ existingId: 'gap-1' });

    await handler({ sdKey: 'SD-X-001', dimension: 'tech_depth', dimId: 'dim_tech', score: 55, threshold: 70, scoreId: 'b8a8f1e2-0000-4000-8000-000000000001', supabase: client });

    expect(calls.upserts).toHaveLength(0);
    expect(calls.inserts).toHaveLength(0);
    expect(calls.updates).toHaveLength(1);
    const { row, eqs } = calls.updates[0];
    expect(eqs).toContainEqual(['id', 'gap-1']);
    expect(row.dimension_key).toBe('dim_tech');
    expect(row.dimension_score).toBe(55);
    expect(row.vision_score_id).toBe('b8a8f1e2-0000-4000-8000-000000000001');
    expect(row).not.toHaveProperty('dimension_id');
    expect(row).not.toHaveProperty('score');
    expect(row).not.toHaveProperty('threshold');
    expect(row).not.toHaveProperty('detected_at');
  });
});

// ── Optional read-only live schema smoke (opt-in) ─────────────────────────────
describe.skipIf(process.env.RUN_LIVE_SCHEMA_CHECK !== '1')('live schema smoke (read-only, opt-in)', () => {
  it('verifies the embedded column lists against the live engineer DB', async () => {
    const { createDatabaseClient } = await import('../../lib/supabase-connection.js');
    const client = await createDatabaseClient('engineer', { verify: false });
    try {
      const tables = Object.keys(LIVE_COLUMNS);
      const res = await client.query(
        "SELECT table_name, column_name FROM information_schema.columns WHERE table_schema='public' AND table_name = ANY($1)",
        [tables],
      );
      const live = {};
      for (const r of res.rows) (live[r.table_name] ||= new Set()).add(r.column_name);
      for (const [table, columns] of Object.entries(LIVE_COLUMNS)) {
        for (const column of columns) {
          expect(live[table]?.has(column), `${table}.${column} missing in live DB`).toBe(true);
        }
      }
    } finally {
      await client.end();
    }
  }, 30000);
});
