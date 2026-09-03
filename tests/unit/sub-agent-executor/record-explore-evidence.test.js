/**
 * The sanctioned Explore transcription writer must refuse empty evidence.
 * SD-LEO-INFRA-EXPLORE-UNREGISTERED-LEO-001, FR-1 / TS-7.
 *
 * WHY THE REFUSAL IS THE TEST-WORTHY PART. This SD closes a fail-open where a crashed CLI wrote an
 * ERROR tombstone that advisory-passed the evidence gate at score 100. That failure was at least
 * LOUD — the row was visible, warned about, and countable (all 8 live instances were found in one
 * query). A writer that will record a verdict with no summary and no findings replaces it with a
 * well-formed EMPTY PASS: invisible instead of countable, and strictly worse. Asserting only "a row
 * was written" would be satisfied by a bare re-export of storeSubAgentResults, so the assertions
 * here are about what the writer REFUSES, not what it writes.
 *
 * No database and no subprocess: refusalReason() and recordExploreEvidence(args, {store}) are
 * exported for exactly this, and the store is injected.
 */

import { describe, it, expect, vi } from 'vitest';
import { refusalReason, recordExploreEvidence, parseArgs, fetchTargetApplication } from '../../../scripts/record-explore-evidence.js';

const GOOD = { sd_id: 'SD-X', verdict: 'PASS', summary: 'enumerated 6 call sites; 4 attacker-reachable' };

/** A fake supabase client whose strategic_directives_v2 lookup returns `targetApplication`,
 * and records which column ('id' vs 'sd_key') the query filtered on. */
function makeFakeSupabase(targetApplication, { seenColumns = [] } = {}) {
  return {
    from(table) {
      expect(table).toBe('strategic_directives_v2');
      return {
        select: () => ({
          eq: (col, val) => {
            seenColumns.push([col, val]);
            return { maybeSingle: async () => ({ data: targetApplication == null ? null : { target_application: targetApplication }, error: null }) };
          },
        }),
      };
    },
  };
}

describe('record-explore-evidence: the empty-evidence refusal', () => {
  it('refuses a verdict carrying no summary and no findings', () => {
    const reason = refusalReason({ sd_id: 'SD-X', verdict: 'PASS' });
    expect(reason).toMatch(/no summary and no findings/);
  });

  it('refuses when summary is only whitespace — blank is not content', () => {
    expect(refusalReason({ sd_id: 'SD-X', verdict: 'PASS', summary: '   \n  ' })).toMatch(/no summary and no findings/);
  });

  it('refuses when findings is an array of blanks', () => {
    expect(refusalReason({ sd_id: 'SD-X', verdict: 'PASS', findings: ['', '  '] })).toMatch(/no summary and no findings/);
  });

  it('ACCEPTS findings with no summary — either one is real evidence', () => {
    // Two-sided. A guard that rejected everything would satisfy the refusal tests above while
    // making the writer useless, and the whole point of FR-1 is that a sanctioned producer EXISTS.
    expect(refusalReason({ sd_id: 'SD-X', verdict: 'PASS', findings: ['leo_sub_agents has 33 codes, zero EXPLORE'] })).toBeNull();
  });

  it('ACCEPTS a summary with no findings', () => {
    expect(refusalReason(GOOD)).toBeNull();
  });
});

describe('record-explore-evidence: the verdict is never defaulted', () => {
  it('refuses a MISSING verdict rather than assuming PASS', () => {
    // A pass by omission is still a pass nobody vouched for — the same laundering the tombstone
    // performed, in a friendlier costume.
    expect(refusalReason({ sd_id: 'SD-X', summary: 'real content' })).toMatch(/missing --verdict/);
  });

  it('refuses an unrecognised verdict rather than passing it through', () => {
    expect(refusalReason({ sd_id: 'SD-X', verdict: 'PROBABLY_FINE', summary: 'x' })).toMatch(/unrecognised --verdict/);
  });

  it('refuses a missing sd_id', () => {
    expect(refusalReason({ verdict: 'PASS', summary: 'x' })).toMatch(/missing --sd-id/);
  });
});

describe('record-explore-evidence: what actually reaches the writer', () => {
  it('does NOT call the store at all when the record is refused', async () => {
    // The refusal must happen BEFORE the write, not be cleaned up after one.
    const store = vi.fn();
    await expect(recordExploreEvidence({ sd_id: 'SD-X', verdict: 'PASS' }, { store }))
      .rejects.toThrow(/no summary and no findings/);
    expect(store).not.toHaveBeenCalled();
  });

  it('POSITIVE CONTROL: a valid record DOES reach the store — so the assertion above discriminates', async () => {
    // Without this, "store not called" would also pass if recordExploreEvidence were broken outright
    // (bad import, wrong arg shape) — the standard failure mode of a mock-based absence assertion.
    const store = vi.fn().mockResolvedValue({ id: 'row-1' });
    const supabase = makeFakeSupabase('EHG_Engineer');
    const resolveRepo = vi.fn().mockResolvedValue({ repoPath: '/repo/EHG_Engineer', repoResolved: true, registrySource: 'db' });
    const out = await recordExploreEvidence(GOOD, { store, supabase, resolveRepo });
    expect(store).toHaveBeenCalledTimes(1);
    expect(out).toEqual({ id: 'row-1' });
  });

  it('writes sub_agent_code Explore, the CALLER verdict, and a canonical repo_path', async () => {
    const store = vi.fn().mockResolvedValue({ id: 'row-2' });
    const supabase = makeFakeSupabase('EHG_Engineer');
    const resolveRepo = vi.fn().mockResolvedValue({ repoPath: '/repo/EHG_Engineer', repoResolved: true, registrySource: 'db' });
    await recordExploreEvidence({ ...GOOD, verdict: 'CONDITIONAL_PASS', phase: 'PLAN' }, { store, supabase, resolveRepo });
    const [code, sdId, subAgent, results, options] = store.mock.calls[0];
    expect(code).toBe('Explore');
    expect(sdId).toBe('SD-X');
    expect(subAgent).toBeNull();
    expect(results.verdict).toBe('CONDITIONAL_PASS');   // caller's, not defaulted
    expect(options.phase).toBe('PLAN');                 // caller's, not defaulted
    // A worktree-valued repo_path fails SUB_AGENT_REPO_RESOLUTION, so this must be canonical:
    // forward slashes and no .worktrees segment.
    expect(results.metadata.repo_path).not.toMatch(/\.worktrees/);
    expect(results.metadata.repo_path).not.toMatch(/\\/);
  });
});

// QF-20260813-220: record-explore-evidence.js previously derived repo_path from its OWN file
// location (always inside EHG_Engineer, via import.meta.url) regardless of which application
// the SD actually targets -- breaking cross-repo evidence capture (e.g. an AltifyAI-venture SD).
// Fixed to look up the SD's own target_application and resolve THAT app's repo path via the
// shared, DB-first resolveSubAgentRepo mechanism every other sub-agent already uses.
describe('record-explore-evidence: cross-repo target_application resolution (QF-20260813-220)', () => {
  it('fetchTargetApplication queries by "id" when sd_id looks like a UUID', async () => {
    const seenColumns = [];
    const supabase = makeFakeSupabase('ehg', { seenColumns });
    const app = await fetchTargetApplication('4a3b2c1d-0000-4000-8000-000000000000', supabase);
    expect(app).toBe('ehg');
    expect(seenColumns).toEqual([['id', '4a3b2c1d-0000-4000-8000-000000000000']]);
  });

  it('fetchTargetApplication queries by "sd_key" for a non-UUID sd_id', async () => {
    const seenColumns = [];
    const supabase = makeFakeSupabase('ehg', { seenColumns });
    const app = await fetchTargetApplication('SD-ALTIFYAI-LEO-ORCH-SPRINT-2026-001-D3', supabase);
    expect(app).toBe('ehg');
    expect(seenColumns).toEqual([['sd_key', 'SD-ALTIFYAI-LEO-ORCH-SPRINT-2026-001-D3']]);
  });

  it('fetchTargetApplication returns null (never throws) when the SD row is not found', async () => {
    const supabase = makeFakeSupabase(null);
    expect(await fetchTargetApplication('SD-DOES-NOT-EXIST', supabase)).toBeNull();
  });

  it('fetchTargetApplication returns null (never throws) when the query itself throws', async () => {
    const supabase = { from() { throw new Error('db unavailable'); } };
    expect(await fetchTargetApplication('SD-X', supabase)).toBeNull();
  });

  it('resolves the repo via the SD\'s OWN target_application, never hand-rolled from this script\'s own file location', async () => {
    const store = vi.fn().mockResolvedValue({ id: 'row-3' });
    const supabase = makeFakeSupabase('ehg');
    const resolveRepo = vi.fn().mockResolvedValue({ repoPath: '/repo/ehg', repoResolved: true, registrySource: 'db' });
    await recordExploreEvidence({ ...GOOD, sd_id: 'SD-ALTIFYAI-LEO-ORCH-SPRINT-2026-001-D3' }, { store, supabase, resolveRepo });
    expect(resolveRepo).toHaveBeenCalledWith(expect.objectContaining({
      sdId: 'SD-ALTIFYAI-LEO-ORCH-SPRINT-2026-001-D3',
      targetApplication: 'ehg',
      subAgentCode: 'Explore',
    }));
    const [, , , results] = store.mock.calls[0];
    expect(results.metadata.repo_path).toBe('/repo/ehg');
  });

  it('a failed resolution (SD not found / target_application unresolvable) still writes evidence — never crashes — and downgrades the verdict, matching every other sub-agent\'s fail-closed semantics', async () => {
    const store = vi.fn().mockResolvedValue({ id: 'row-4' });
    const supabase = makeFakeSupabase(null); // SD lookup misses -> targetApplication null
    const resolveRepo = vi.fn().mockResolvedValue({ repoPath: null, repoResolved: false, registrySource: 'fallback' });
    await recordExploreEvidence(GOOD, { store, supabase, resolveRepo });
    expect(store).toHaveBeenCalledTimes(1);
    const [, , , results] = store.mock.calls[0];
    expect(results.metadata.repo_resolved).toBe(false);
    expect(results.verdict).toBe('CONDITIONAL_PASS'); // downgraded from the caller's PASS
  });
});

describe('record-explore-evidence: argv parsing', () => {
  it('collects repeated --findings into an array', () => {
    const args = parseArgs(['--sd-id', 'SD-X', '--verdict', 'PASS', '--findings', 'one', '--findings', 'two']);
    expect(args.sd_id).toBe('SD-X');
    expect(args.findings).toEqual(['one', 'two']);
  });
});
