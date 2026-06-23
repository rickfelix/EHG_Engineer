/**
 * SD-REFILL-00MFWEGZ — coordinator-backlog-rank now excludes an orchestrator child whose PARENT
 * has not passed LEAD, by reusing the canonical parentLeadPending gate (lib/fleet/claim-eligibility.cjs).
 * This pins that gate's contract so the ranking surface stays in lockstep with the claim surface:
 * a child is dispatchable only once its parent passes LEAD-TO-PLAN (or is completed / has no parent).
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { parentLeadPending } = require('../../lib/fleet/claim-eligibility.cjs');

/** Mock sb whose strategic_directives_v2 lookup resolves to a given parent row (or error). */
function sbWithParent(parentRow, err = null) {
  return {
    from() {
      return {
        select() {
          return {
            or() {
              return { maybeSingle: () => Promise.resolve({ data: parentRow, error: err }) };
            },
          };
        },
      };
    },
  };
}

describe('SD-REFILL-00MFWEGZ: parentLeadPending (backlog-rank child exclusion gate)', () => {
  it('returns false (rankable) for an SD with no parent_sd_id — no fetch', async () => {
    let fetched = false;
    const sb = { from() { fetched = true; return {}; } };
    expect(await parentLeadPending(sb, { sd_key: 'SD-X-001' })).toBe(false);
    expect(fetched).toBe(false);
  });

  it('returns true (excluded) when the parent is in LEAD', async () => {
    const sb = sbWithParent({ status: 'draft', current_phase: 'LEAD' });
    expect(await parentLeadPending(sb, { sd_key: 'SD-A1', parent_sd_id: 'SD-A' })).toBe(true);
  });

  it('returns true (excluded) when the parent is in LEAD_APPROVAL', async () => {
    const sb = sbWithParent({ status: 'pending_approval', current_phase: 'LEAD_APPROVAL' });
    expect(await parentLeadPending(sb, { sd_key: 'SD-B1', parent_sd_id: 'SD-B' })).toBe(true);
  });

  it('returns false (rankable) when the parent has passed LEAD (e.g. EXEC)', async () => {
    const sb = sbWithParent({ status: 'in_progress', current_phase: 'EXEC' });
    expect(await parentLeadPending(sb, { sd_key: 'SD-C1', parent_sd_id: 'SD-C' })).toBe(false);
  });

  it('returns false (rankable) when the parent is completed', async () => {
    const sb = sbWithParent({ status: 'completed', current_phase: 'COMPLETED' });
    expect(await parentLeadPending(sb, { sd_key: 'SD-D1', parent_sd_id: 'SD-D' })).toBe(false);
  });

  it('fail-opens to false (rankable) when the parent lookup errors or returns nothing', async () => {
    expect(await parentLeadPending(sbWithParent(null, { message: 'boom' }), { sd_key: 'SD-E1', parent_sd_id: 'SD-E' })).toBe(false);
    expect(await parentLeadPending(sbWithParent(null), { sd_key: 'SD-F1', parent_sd_id: 'SD-F' })).toBe(false);
  });
});
