/**
 * SD-LEO-INFRA-CORRECTION-DELIVERY-PATH-001-D — a mid-EXEC SD amendment must reach the worker.
 *
 * Covers TS-1..TS-5 plus the four conditions TESTING made binding at PLAN-TO-EXEC
 * (evidence 30c9d925-8897-4f5b-ac43-612b4ce23d72):
 *   TC-1 TS-2 must SELF-VERIFY its fixture with the gate's own extractSdFrs, or it can pass
 *        vacuously without ever exercising the 88.5% blind-spot path.
 *   TC-2 FR-3 needs a named return contract, asserted here field by field.
 *   TC-3 TS-3 split into its two distinct triggers (no consumer vs dispatch failure).
 *   TC-5 FR-1 AC-4 gets a real scenario: prove no NEW payload kind is needed.
 *
 * No live credentials: the supabase client is a hand-built stub and dispatch is injected through
 * the opts seam, so this is a true unit test and never writes to a real project.
 */

import { describe, it, expect } from 'vitest';
import { amendSd, isInActiveBuildPhase, ACTIVE_BUILD_PHASES, PROTECTED_METADATA_KEYS } from '../../../lib/sd/amend-sd.js';
import { extractSdFrs } from '../../../scripts/modules/handoff/executors/plan-to-exec/gates/sd-prd-drift.js';
import { DIRECTIVE_KINDS, PAYLOAD_KINDS } from '../../../lib/fleet/worker-status.cjs';

const SD_UUID = '11111111-2222-3333-4444-555555555555';
const CLAIM_SESSION = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

/**
 * Minimal supabase stub. `sd` is the row returned for strategic_directives_v2;
 * `prds` is what product_requirements_v2 returns; updates are recorded.
 */
function makeSb({ sd, prds = [{ id: 'prd-1' }], updateError = null, updatedRows = [{ sd_key: 'SD-TEST-AMEND-001' }] }) {
  const updates = [];
  return {
    updates,
    from(table) {
      const api = {
        _table: table,
        select() { return api; },
        eq() { return api; },
        limit() {
          // product_requirements_v2 lookup resolves here (no maybeSingle in that path)
          if (api._table === 'product_requirements_v2') return Promise.resolve({ data: prds, error: null });
          return api;
        },
        maybeSingle() { return Promise.resolve({ data: sd, error: null }); },
        update(patch) {
          updates.push({ table: api._table, patch });
          // Mirrors the real chain: .update(...).eq(...).select(...) resolves to the affected rows.
          return { eq: () => ({ select: () => Promise.resolve({ data: updatedRows, error: updateError }) }) };
        },
      };
      return api;
    },
  };
}

const activeSd = (over = {}) => ({
  id: SD_UUID,
  sd_key: 'SD-TEST-AMEND-001',
  status: 'in_progress',
  is_active: true,
  archived_at: null,
  current_phase: 'EXEC',
  claiming_session_id: CLAIM_SESSION,
  ...over,
});

describe('isInActiveBuildPhase', () => {
  it('accepts the phases a worker can actually be building in', () => {
    for (const phase of ACTIVE_BUILD_PHASES) {
      expect(isInActiveBuildPhase(activeSd({ current_phase: phase }))).toBe(true);
    }
  });

  it('rejects LEAD phases, terminal SDs and archived rows', () => {
    expect(isInActiveBuildPhase(activeSd({ current_phase: 'LEAD' }))).toBe(false);
    expect(isInActiveBuildPhase(activeSd({ status: 'completed' }))).toBe(false);
    expect(isInActiveBuildPhase(activeSd({ archived_at: '2026-01-01' }))).toBe(false);
    expect(isInActiveBuildPhase(activeSd({ is_active: false }))).toBe(false);
  });
});

describe('TS-1: a mid-EXEC amendment notifies the claiming session', () => {
  it('dispatches a fence_notice addressed to claiming_session_id', async () => {
    const sent = [];
    const sb = makeSb({ sd: activeSd() });
    const res = await amendSd(sb, 'SD-TEST-AMEND-001', { description: 'new text' }, {
      dispatch: async (_sb, row) => { sent.push(row); },
      senderSession: 'sender-1',
    });

    expect(res.sdUpdated).toBe(true);
    expect(res.noticeRequired).toBe(true);
    expect(res.noticeDelivered).toBe(true);
    expect(res.errorCode).toBeNull();
    expect(sent).toHaveLength(1);
    expect(sent[0].target_session).toBe(CLAIM_SESSION);
    expect(sent[0].payload.kind).toBe('fence_notice');
    expect(sent[0].payload.sd_key).toBe('SD-TEST-AMEND-001');
    // The body must name the SD and the change, so the recipient acts without opening another table.
    expect(sent[0].payload.body).toContain('SD-TEST-AMEND-001');
    expect(sent[0].payload.body).toContain('description');
  });
});

describe('TS-2: the fix must work for the 88.5% of SDs the drift gate cannot see', () => {
  it('notifies even when the SD has ZERO extractable FRs (fixture self-verified — TC-1)', async () => {
    // TC-1: prove the fixture really is a zero-extractable-FR SD using the GATE'S OWN function,
    // the same one LEAD measured with. Without this the scenario could pass vacuously and the
    // blind-spot path would never actually be exercised.
    const fixtureSd = {
      ...activeSd(),
      description: 'A prose description with no functional-requirement markers at all.',
      scope: 'Likewise no markers here. Criteria are labelled AC-1 and AC-2, not the FR form.',
      metadata: {},
    };
    expect(extractSdFrs(fixtureSd)).toHaveLength(0);

    const sent = [];
    const sb = makeSb({ sd: fixtureSd });
    const res = await amendSd(sb, 'SD-TEST-AMEND-001', { scope: 'amended scope' }, {
      dispatch: async (_sb, row) => { sent.push(row); },
    });

    expect(res.noticeDelivered).toBe(true);
    expect(sent).toHaveLength(1);
  });

  it('a fixture WITH extractable FRs is a different case — guards the self-check itself', () => {
    const withFrs = { description: 'FR-1 the first requirement text', scope: '', metadata: {} };
    expect(extractSdFrs(withFrs).length).toBeGreaterThan(0);
  });
});

describe('TS-3a (TC-3): amendment with no consumer fails loudly, and does not roll back', () => {
  it('reports AMEND_NO_CONSUMER while keeping sdUpdated true', async () => {
    const sb = makeSb({ sd: activeSd({ claiming_session_id: null }) });
    const res = await amendSd(sb, 'SD-TEST-AMEND-001', { description: 'x' }, {
      dispatch: async () => { throw new Error('must not dispatch'); },
    });

    expect(res.sdUpdated).toBe(true);        // the amendment persisted...
    expect(res.noticeRequired).toBe(true);
    expect(res.noticeDelivered).toBe(false); // ...and the caller is told nobody heard it
    expect(res.errorCode).toBe('AMEND_NO_CONSUMER');
    expect(res.warning).toMatch(/no claiming session/i);
  });
});

describe('TS-3b (TC-3): dispatch failure is surfaced with the dispatcher\'s own typed code', () => {
  it.each([
    'DISPATCH_TARGET_INVALID',
    'DISPATCH_TARGET_UNKNOWN',
    'DISPATCH_TARGET_STALE',
    'DISPATCH_LOOKUP_FAILED',
  ])('translates %s rather than inventing new error vocabulary', async (code) => {
    const sb = makeSb({ sd: activeSd() });
    const res = await amendSd(sb, 'SD-TEST-AMEND-001', { description: 'x' }, {
      dispatch: async () => { const e = new Error('boom'); e.code = code; throw e; },
      logger: { warn() {}, error() {} },
    });

    expect(res.sdUpdated).toBe(true);
    expect(res.noticeDelivered).toBe(false);
    expect(res.errorCode).toBe(code);
    expect(res.warning).toContain('NOT notified');
  });
});

describe('TS-4: no false blockers', () => {
  it('emits nothing and warns about nothing when no PRD exists', async () => {
    const sent = [];
    const sb = makeSb({ sd: activeSd(), prds: [] });
    const res = await amendSd(sb, 'SD-TEST-AMEND-001', { description: 'x' }, {
      dispatch: async (_sb, row) => { sent.push(row); },
    });

    expect(res.sdUpdated).toBe(true);
    expect(res.noticeRequired).toBe(false);
    expect(res.warning).toBeNull();
    expect(res.errorCode).toBeNull();
    expect(sent).toHaveLength(0);
  });

  it('emits nothing for a draft/LEAD SD or a completed one', async () => {
    for (const over of [{ current_phase: 'LEAD', status: 'draft' }, { status: 'completed' }]) {
      const sent = [];
      const sb = makeSb({ sd: activeSd(over) });
      const res = await amendSd(sb, 'SD-TEST-AMEND-001', { description: 'x' }, {
        dispatch: async (_sb, row) => { sent.push(row); },
      });
      expect(res.noticeRequired).toBe(false);
      expect(sent).toHaveLength(0);
    }
  });

  it('refuses an empty patch instead of writing nothing and claiming success', async () => {
    const sb = makeSb({ sd: activeSd() });
    const res = await amendSd(sb, 'SD-TEST-AMEND-001', {}, {});
    expect(res.sdUpdated).toBe(false);
    expect(res.errorCode).toBe('AMEND_EMPTY_PATCH');
  });
});

describe('SECURITY cbe69100 F1: the patch is allowlisted, not passed through', () => {
  it.each(['claiming_session_id', 'status', 'sd_type', 'is_active'])(
    'refuses to write %s and does NOT touch the table',
    async (col) => {
      const sb = makeSb({ sd: activeSd() });
      const res = await amendSd(sb, 'SD-TEST-AMEND-001', { [col]: 'x' }, {});

      expect(res.sdUpdated).toBe(false);
      expect(res.errorCode).toBe('AMEND_FIELD_NOT_AMENDABLE');
      // Fails CLOSED — the column is refused, never silently dropped while reporting success.
      expect(sb.updates).toHaveLength(0);
    }
  );

  it('refuses a mixed patch outright rather than applying only the legal half', async () => {
    const sb = makeSb({ sd: activeSd() });
    const res = await amendSd(sb, 'SD-TEST-AMEND-001', { description: 'ok', claiming_session_id: null }, {});
    expect(res.sdUpdated).toBe(false);
    expect(res.warning).toMatch(/claim_sd\/release_sd/);
    expect(sb.updates).toHaveLength(0);
  });

  it('still allows the three legitimate amendable fields', async () => {
    for (const col of ['description', 'scope', 'metadata']) {
      const sb = makeSb({ sd: activeSd(), prds: [] });
      const res = await amendSd(sb, 'SD-TEST-AMEND-001', { [col]: col === 'metadata' ? { k: 1 } : 'text' }, {
        // metadata takes the atomic-merge path, so it needs the seam rather than the column update.
        mergeMetadata: async (key) => ({ merged: true, sdKey: key }),
      });
      expect(res.sdUpdated).toBe(true);
      expect(res.errorCode).toBeNull();
    }
  });
});

describe('PR #6559 adversarial CRITICAL: metadata is merged atomically, never replaced', () => {
  it('routes metadata through the atomic DB-side merge, never a read-spread-write', async () => {
    // Round 2 finding: a JS spread built from a snapshot resurrects a hold a concurrent process
    // just cleared. lib/coordinator/safe-metadata-merge.mjs exists to prevent exactly that, so the
    // contract under test is "metadata never rides the column .update()".
    const merged = [];
    const sd = activeSd({ metadata: { chairman_ratified: false, note: 'keep me' } });
    const sb = makeSb({ sd, prds: [] });

    const res = await amendSd(sb, 'SD-TEST-AMEND-001', { metadata: { extra: 1 } }, {
      mergeMetadata: async (key, patch) => { merged.push({ key, patch }); return { merged: true, sdKey: key }; },
    });

    expect(res.sdUpdated).toBe(true);
    // Only the keys the caller asked for are sent; every other key is untouched BY THE DB, so no
    // snapshot of chairman_ratified is ever written back.
    expect(merged).toEqual([{ key: 'SD-TEST-AMEND-001', patch: { extra: 1 } }]);
    // And metadata must NOT have gone through the column update path at all.
    expect(sb.updates).toHaveLength(0);
  });

  it('reports failure when the atomic merge matches no rows', async () => {
    const sb = makeSb({ sd: activeSd(), prds: [] });
    const res = await amendSd(sb, 'SD-TEST-AMEND-001', { metadata: { a: 1 } }, {
      mergeMetadata: async () => ({ merged: false, sdKey: 'x', error: 'no rows' }),
    });
    expect(res.sdUpdated).toBe(false);
    expect(res.errorCode).toBe('AMEND_METADATA_MERGE_FAILED');
  });

  it('refuses an explicit undefined value, which serialization would silently drop', async () => {
    const sb = makeSb({ sd: activeSd(), prds: [] });
    const res = await amendSd(sb, 'SD-TEST-AMEND-001', { metadata: { note: undefined } }, {
      mergeMetadata: async () => { throw new Error('must not merge'); },
    });
    expect(res.sdUpdated).toBe(false);
    expect(res.errorCode).toBe('AMEND_METADATA_UNDEFINED_VALUE');
  });

  it.each([...PROTECTED_METADATA_KEYS])('refuses to write the governance key %s at all', async (key) => {
    const sb = makeSb({ sd: activeSd({ metadata: {} }), prds: [] });
    const res = await amendSd(sb, 'SD-TEST-AMEND-001', { metadata: { [key]: 'anything' } }, {});

    expect(res.sdUpdated).toBe(false);
    expect(res.errorCode).toBe('AMEND_PROTECTED_METADATA_KEY');
    expect(sb.updates).toHaveLength(0);
  });

  it('rejects a non-object metadata rather than replacing the column with it', async () => {
    for (const bad of ['a string', 42, ['an', 'array'], null]) {
      const sb = makeSb({ sd: activeSd(), prds: [] });
      const res = await amendSd(sb, 'SD-TEST-AMEND-001', { metadata: bad }, {});
      expect(res.sdUpdated).toBe(false);
      expect(sb.updates).toHaveLength(0);
    }
  });
});

describe('PR #6559 adversarial WARNING: a zero-row UPDATE is not a success', () => {
  it('reports AMEND_NO_ROWS_UPDATED instead of claiming the write happened', async () => {
    const sent = [];
    // PostgREST returns no error when nothing matched — only the returned row set reveals it.
    const sb = makeSb({ sd: activeSd(), updatedRows: [] });
    const res = await amendSd(sb, 'SD-TEST-AMEND-001', { description: 'x' }, {
      dispatch: async (_sb, row) => { sent.push(row); },
    });

    expect(res.sdUpdated).toBe(false);
    expect(res.errorCode).toBe('AMEND_NO_ROWS_UPDATED');
    // And crucially: no notice claiming a change that never landed.
    expect(sent).toHaveLength(0);
  });
});

describe('TS-5 / FR-1 AC-4 (TC-5): no NEW payload kind is introduced', () => {
  it('reuses a kind already registered in DIRECTIVE_KINDS', () => {
    // The whole reuse-vs-mint argument rests on this: fence_notice is already a directive kind,
    // so no drain-set test and no source-pinned array needs touching.
    expect(DIRECTIVE_KINDS).toContain('fence_notice');
    expect(Object.values(PAYLOAD_KINDS)).toContain('fence_notice');
  });

  it('FR-5 disjointness from sibling -C: the notice is one-way, never an advisory reply', async () => {
    const sent = [];
    const sb = makeSb({ sd: activeSd() });
    await amendSd(sb, 'SD-TEST-AMEND-001', { description: 'x' }, {
      dispatch: async (_sb, row) => { sent.push(row); },
    });

    const payload = sent[0].payload;
    // -C's alreadyAnswered dedup is scoped to payload.kind === 'ADAM_ADVISORY' and reply rows.
    // Staying out of both keeps the two children mechanically disjoint, which the parent requires.
    expect(String(payload.kind).toLowerCase()).not.toBe('adam_advisory');
    expect(payload.reply_class).toBeUndefined();
    expect(payload.reply_to).toBeUndefined();
  });
});
