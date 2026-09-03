// A COMPLETION writer must never write onto a HANDOFF retrospective row.
//
// MEASURED DEFECT (2026-09-03): three of three SDs that reached LEAD-FINAL had their LEAD-TO-PLAN
// handoff retrospective overwritten by the completion generator. The generator looked up "any
// retrospective for this SD" (unscoped), found the HANDOFF row because that is the one that exists
// first, and upserted onto its id — an UPDATE. The row kept its handoff-era created_at and acquired
// completion content plus retro_type=SD_COMPLETION. Consequences, all three at once:
//   1. the phase-handoff retrospective was destroyed with no trace;
//   2. the completion gate (needs an SD_COMPLETION row created AFTER LEAD-TO-PLAN acceptance)
//      rejected the row as stale — mine missed the boundary by 702ms;
//   3. the generators then refused to mint a real one, reporting "already exists" (type-only check).
// Two SDs were stranded at pending_approval with their code already merged to main.
//
// WHY THE PROTECTION IS SCOPED BY INTENT RATHER THAN BLANKET — this is the load-bearing design point.
// SD-LEO-INFRA-RETRO-PROMOTION-PATH-001 DELIBERATELY allows a HANDOFF retro to be enhanced in place by
// a HANDOFF writer, and tests/unit/retro-clobber-handoff-replay.test.js pins that across 150 sampled
// rows. A blanket "HANDOFF is never overwritable" rule passes this file's intent but BREAKS that
// shipped path — verified: it failed 2 of those 4 tests before the rule was re-scoped. The corruption
// is not "a handoff row was written to", it is "a handoff row was written to BY A COMPLETION WRITER".
import { describe, it, expect } from 'vitest';
import { isSafeToWriteRetro, classifyRetro } from '../../scripts/modules/handoff/lib/retro-clobber-guard.js';

const handoffRow = (extra = {}) => ({
  id: 'row-handoff-1', retro_type: 'HANDOFF', generated_by: 'SUB_AGENT', status: 'PUBLISHED',
  quality_score: 100, key_learnings: [], created_at: '2026-09-03T11:04:44.215Z',
  updated_at: '2026-09-03T11:04:44.215Z', ...extra,
});

// Minimal client: returns whatever row the test supplies for the newest-retro lookup.
function clientReturning(row) {
  const b = {
    select() { return b; }, eq() { return b; }, order() { return b; }, limit() { return b; },
    maybeSingle() { return Promise.resolve({ data: row, error: null }); },
  };
  return { from() { return b; } };
}

describe('completion writes must not land on a HANDOFF row', () => {
  it('BLOCKS a completion writer from overwriting a HANDOFF retro — the measured corruption', async () => {
    const guard = await isSafeToWriteRetro(clientReturning(handoffRow()), 'SD-X', { intendedType: 'SD_COMPLETION' });
    expect(guard.safe).toBe(false);
    expect(guard.reason).toBe('completion_write_onto_handoff_row');
  });

  it('BLOCKS regardless of the handoff row quality or status — a thin handoff retro is still the only record of that event', async () => {
    const thin = handoffRow({ status: 'DRAFT', quality_score: 5 });
    const guard = await isSafeToWriteRetro(clientReturning(thin), 'SD-X', { intendedType: 'SD_COMPLETION' });
    expect(guard.safe).toBe(false);
    expect(guard.reason).toBe('completion_write_onto_handoff_row');
  });

  it('does NOT block a HANDOFF writer enhancing a HANDOFF row — the promotion path stays open', async () => {
    // SD-LEO-INFRA-RETRO-PROMOTION-PATH-001. Blocking this is what a blanket rule got wrong.
    const guard = await isSafeToWriteRetro(clientReturning(handoffRow()), 'SD-X', { intendedType: 'HANDOFF' });
    expect(guard.reason).not.toBe('completion_write_onto_handoff_row');
  });

  it('a caller declaring NO intent keeps the pre-existing behaviour exactly', async () => {
    // The three handoff writers pass no intendedType; their behaviour must be byte-identical.
    const row = handoffRow();
    const guard = await isSafeToWriteRetro(clientReturning(row), 'SD-X');
    expect(guard.reason).toBe(classifyRetro(row).reason);
  });

  it('completion-onto-completion is unchanged — the original PUBLISHED protection still wins', async () => {
    const completion = { ...handoffRow(), retro_type: 'SD_COMPLETION' };
    const guard = await isSafeToWriteRetro(clientReturning(completion), 'SD-X', { intendedType: 'SD_COMPLETION' });
    expect(guard.safe).toBe(false);
    expect(guard.reason).toBe('published_sd_completion'); // NOT the new reason
  });

  it('no existing row is still safe to insert', async () => {
    const guard = await isSafeToWriteRetro(clientReturning(null), 'SD-X', { intendedType: 'SD_COMPLETION' });
    expect(guard.safe).toBe(true);
  });
});

describe('the generator no longer looks up "any retrospective for this SD"', () => {
  it('the LLM prompt scopes its existence check to SD_COMPLETION and forbids cross-type updates', async () => {
    const { readFileSync } = await import('fs');
    const src = readFileSync(new URL('../../scripts/programmatic/retrospective-generator.js', import.meta.url), 'utf8');
    // The corrupter was a PROMPT, not code — no deterministic writer emits SD_COMPLETION at handoff
    // time, which is why grepping the source for it found nothing. The model supplied it at runtime
    // because it was told only "check if one exists already" and "Upsert".
    expect(src).toMatch(/retro_type = 'SD_COMPLETION', select id/);
    expect(src).toMatch(/NEVER update a retrospectives row whose retro_type is anything other than 'SD_COMPLETION'/);
    expect(src).not.toMatch(/Query retrospectives WHERE sd_id = '\$\{sdId\}', select id \(check if one exists already\)/);
  });

  it('the code fallback path scopes its lookup too, and writes the canonical UPPERCASE type', async () => {
    const { readFileSync } = await import('fs');
    const src = readFileSync(new URL('../../scripts/programmatic/retrospective-generator.js', import.meta.url), 'utf8');
    // Same unscoped-lookup defect existed in the non-LLM fallback, which no prompt fix would reach.
    expect(src).toMatch(/\.eq\('retro_type', 'SD_COMPLETION'\)/);
    // The fallback wrote 'sd_completion' lowercase — the only lowercase retro_type anywhere. Every
    // reader compares against the uppercase enum, so such a row is invisible to the very gate it
    // exists to satisfy. Latent because this path fires only on LLM-enrichment failure.
    expect(src).not.toMatch(/retro_type: 'sd_completion'/);
    expect(src).toMatch(/retro_type: 'SD_COMPLETION'/);
  });
});
