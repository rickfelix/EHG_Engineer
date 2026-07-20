/**
 * Vitest cases for scripts/audit-completed-sd-db-content-parity.js (FR-6 audit half).
 * SD: SD-LEO-INFRA-CODE-CONTENT-PARITY-001
 */
import { describe, it, expect, vi } from 'vitest';
import { runAudit } from '../../../scripts/audit-completed-sd-db-content-parity.js';

function makeAuditClient({ sds, rowsByTable = {} }) {
  const calls = { feedbackInserts: [], verificationInserts: [], registryQueries: [] };

  function from(name) {
    if (name === 'strategic_directives_v2') {
      const queryObj = {
        _filters: {},
        _gte: null,
        select: () => queryObj,
        eq(col, val) {
          queryObj._filters[col] = val;
          return queryObj;
        },
        gte(col, val) {
          queryObj._gte = { col, val };
          return queryObj;
        },
        maybeSingle: async () => ({ data: sds.find((s) => s.sd_key === queryObj._filters.sd_key) || null, error: null }),
        // FR-6 batch 9 (SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001): the read now paginates
        // via fetchAllPaginated, which calls .order() (chainable) then .range() (terminal)
        // instead of awaiting the query directly — extend the chain, same filtering logic.
        order: () => queryObj,
        range: async () => {
          const filtered = sds
            .filter((sd) => Object.entries(queryObj._filters).every(([k, v]) => sd[k] === v))
            .filter((sd) => !queryObj._gte || sd[queryObj._gte.col] >= queryObj._gte.val);
          return { data: filtered, error: null };
        },
        then(onFulfilled) {
          const filtered = sds
            .filter((sd) => Object.entries(queryObj._filters).every(([k, v]) => sd[k] === v))
            .filter((sd) => !queryObj._gte || sd[queryObj._gte.col] >= queryObj._gte.val);
          return Promise.resolve({ data: filtered, error: null }).then(onFulfilled);
        },
      };
      return queryObj;
    }
    if (name === 'feedback') {
      // SD-FDBK-INFRA-MIGRATE-EMIT-FEEDBACK-001 FR-5: emitFeedback dedup-check
      // chain support — `.select('id').eq('category', x).eq('metadata->>dedup_hash', h).maybeSingle()`.
      // Returns {data: null} so the INSERT branch proceeds.
      const insertChain = (row) => {
        const single = async () => ({ data: { id: `fb-${calls.feedbackInserts.length + 1}` }, error: null });
        return { select: () => ({ single }), then: (cb) => cb({ data: { id: 'inserted' }, error: null }) };
      };
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({ maybeSingle: async () => ({ data: null }) }),
          }),
        }),
        insert: (row) => {
          calls.feedbackInserts.push(row);
          return insertChain(row);
        },
      };
    }
    if (name === 'v_active_sessions') {
      // emitFeedback FR-2 auto-fill lookup; return empty so it no-ops in tests.
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              not: async () => ({ data: [], error: null }),
            }),
          }),
        }),
      };
    }
    if (name === 'sd_verification_results') {
      return {
        insert: async (row) => {
          calls.verificationInserts.push(row);
          return { error: null };
        },
      };
    }
    // registry tables (stage_config etc.)
    let filters = {};
    const queryObj = {
      select: () => queryObj,
      eq: (col, val) => {
        filters[col] = val;
        return queryObj;
      },
      maybeSingle: async () => {
        calls.registryQueries.push({ table: name, filters: { ...filters } });
        const rows = rowsByTable[name] || [];
        const match = rows.find((r) => Object.entries(filters).every(([k, v]) => r[k] === v));
        return { data: match || null, error: null };
      },
    };
    return queryObj;
  }
  return { from, _calls: calls };
}

const SD_WITH_DRIFT = {
  id: 'uuid-redesign',
  sd_key: 'SD-REDESIGN-S18S26-MARKETINGFIRST-POSTBUILD-ORCH-001',
  status: 'completed',
  updated_at: '2026-04-21T00:00:00Z',
  metadata: {
    db_content_assertions: [
      { table: 'stage_config', row_filter: { stage_number: 20 }, expected_columns: { stage_name: 'Code Quality Gate' } },
    ],
  },
};
const SD_NO_ASSERTIONS = { id: 'uuid-x', sd_key: 'SD-X', status: 'completed', updated_at: '2026-04-22T00:00:00Z', metadata: {} };
const STAGE_CONFIG_LIVE = [{ stage_number: 20, stage_name: 'User Testing' }];

describe('runAudit walker', () => {
  it('walks completed SDs and detects pre-existing-gap on SD-REDESIGN-S18S26', async () => {
    const client = makeAuditClient({ sds: [SD_WITH_DRIFT, SD_NO_ASSERTIONS], rowsByTable: { stage_config: STAGE_CONFIG_LIVE } });
    const findings = await runAudit({ supabase: client, since: '2026-04-01', dryRun: false, auditRunId: 'audit-uuid-1' });
    expect(findings).toHaveLength(1);
    expect(findings[0].sd_key).toBe('SD-REDESIGN-S18S26-MARKETINGFIRST-POSTBUILD-ORCH-001');
    expect(findings[0].mismatches[0]).toMatchObject({ column: 'stage_name', expected: 'Code Quality Gate', actual: 'User Testing' });
  });

  it('feedback-row writer shape: includes parity_gap_detected, audit_run_id, deferred_from_sd_key', async () => {
    const client = makeAuditClient({ sds: [SD_WITH_DRIFT], rowsByTable: { stage_config: STAGE_CONFIG_LIVE } });
    await runAudit({ supabase: client, since: null, dryRun: false, auditRunId: 'audit-uuid-2' });
    const fb = client._calls.feedbackInserts[0];
    expect(fb).toBeDefined();
    expect(fb.category).toBe('harness_backlog');
    expect(fb.source_type).toBe('manual_feedback');
    expect(fb.metadata.parity_gap_detected).toBe(true);
    expect(fb.metadata.audit_run_id).toBe('audit-uuid-2');
    expect(fb.metadata.deferred_from_sd_key).toBe(SD_WITH_DRIFT.sd_key);
    expect(fb.metadata.mismatch_count).toBe(1);
  });

  it('dry-run mode: no feedback inserts', async () => {
    const client = makeAuditClient({ sds: [SD_WITH_DRIFT], rowsByTable: { stage_config: STAGE_CONFIG_LIVE } });
    const findings = await runAudit({ supabase: client, since: null, dryRun: true, auditRunId: 'audit-uuid-3' });
    expect(findings).toHaveLength(1);
    expect(client._calls.feedbackInserts).toHaveLength(0);
  });

  it('skips SDs without metadata.db_content_assertions', async () => {
    const client = makeAuditClient({ sds: [SD_NO_ASSERTIONS], rowsByTable: { stage_config: STAGE_CONFIG_LIVE } });
    const findings = await runAudit({ supabase: client, since: null, dryRun: true, auditRunId: 'audit-uuid-4' });
    expect(findings).toHaveLength(0);
    expect(client._calls.registryQueries).toHaveLength(0);
  });
});
