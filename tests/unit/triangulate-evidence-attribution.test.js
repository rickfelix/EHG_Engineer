/**
 * SD-LEO-INFRA-RECLAIMSAFE-CANNOT-TELL-001 / FR-1 — evidence attribution.
 *
 * triangulate.js aggregated six witnesses into one boolean, hasEvidenceOfLife, and derived
 * `reclaimSafe = !hasEvidenceOfLife`. That boolean answers "was SOMEONE alive on this SD", but
 * three of its witnesses carry no session identity whatsoever — branch_present and
 * plan_file_present are SD-keyed name matches, and recent_sub_agent_activity comes from a query
 * selecting only sd_id (sub_agent_execution_results has no session column). Consumers were
 * reading the result as "is it safe for THIS session to reclaim", which is a different question.
 *
 * These tests pin the ATTRIBUTION the gate now reports, and — just as importantly — pin that the
 * change is ADDITIVE: reclaimSafe and evidenceOfLifeSignals keep their old values and meaning.
 * TS-15 is the regression that fails if someone "simplifies" this by redefining reclaimSafe in
 * place, which is the one thing the SD forbids.
 */
import { describe, it, expect } from 'vitest';
import { triangulate } from '../../scripts/modules/claim-health/triangulate.js';

const SD_UUID = '11111111-2222-3333-4444-555555555555';
const SD_KEY = 'SD-ATTRIB-TEST-001';

/**
 * Minimal supabase stub shaped to triangulate()'s reads.
 * @param {object} o
 * @param {object[]} o.sessions   - claude_sessions rows
 * @param {object[]} o.workingSds - strategic_directives_v2 rows (is_working_on)
 * @param {boolean}  o.activity   - whether a sub_agent_execution_results row exists for the SD
 */
function stubSupabase({ sessions = [], workingSds = [], activity = false } = {}) {
  return {
    from(table) {
      const api = {
        select() { return this; }, eq() { return this; }, gte() { return this; },
        lte() { return this; }, in() { return this; }, not() { return this; },
        is() { return this; }, order() { return this; }, limit() { return this; },
        maybeSingle() { return Promise.resolve({ data: null, error: null }); },
        then(resolve) {
          if (table === 'claude_sessions') return resolve({ data: sessions, error: null });
          if (table === 'strategic_directives_v2') return resolve({ data: workingSds, error: null });
          if (table === 'sub_agent_execution_results') {
            return resolve({ data: activity ? [{ sd_id: SD_UUID }] : [], error: null });
          }
          return resolve({ data: [], error: null });
        },
      };
      return api;
    },
  };
}

async function entryFor(opts, triangulateOpts = {}) {
  const sb = stubSupabase(opts);
  const res = await triangulate(sb, SD_KEY, { skipGit: true, skipPlanFiles: true, ...triangulateOpts });
  for (const bucket of ['healthy', 'orphaned', 'ghost', 'discrepancies']) {
    const e = (res[bucket] || []).find(x => x.sdKey === SD_KEY);
    if (e) return { entry: e, bucket };
  }
  return { entry: null, bucket: null };
}

describe('FR-1: triangulate reports WHOSE evidence, not just that evidence exists', () => {
  it('classifies sub-agent activity as UNATTRIBUTED — it is keyed on sd_id alone', async () => {
    const { entry } = await entryFor({
      workingSds: [{ id: SD_UUID, sd_key: SD_KEY, is_working_on: true }],
      activity: true,
    });
    expect(entry).toBeTruthy();
    expect(entry.evidenceOfLifeSignals).toContain('recent_sub_agent_activity');
    expect(entry.evidenceAttribution.unattributed).toContain('recent_sub_agent_activity');
    expect(entry.evidenceAttribution.attributed).not.toContain('recent_sub_agent_activity');
    // The whole point: evidence fired, and NONE of it says who.
    expect(entry.evidenceAttribution.allUnattributed).toBe(true);
    expect(entry.evidenceAttribution.sessionIds).toEqual([]);
  });

  it('allUnattributed is false when a session-attributed witness fires, and names the session', async () => {
    // A live peer on the same branch — buildSiblingSessionMap carries real session ids here.
    const { entry } = await entryFor({
      sessions: [
        { session_id: 'peer-session', sd_key: SD_KEY, worktree_branch: `feat/${SD_KEY}`, status: 'active', heartbeat_at: new Date().toISOString(), process_alive_at: new Date().toISOString() },
      ],
      workingSds: [{ id: SD_UUID, sd_key: SD_KEY, is_working_on: true }],
    }, { mySessionId: 'my-session' });
    expect(entry).toBeTruthy();
    // Assert the PRECONDITION rather than guarding on it. An `if` here would let the whole
    // case skip silently if the sibling witness ever stopped firing, and the test would still
    // report green — the vacuousness this SD's own PRD warns about.
    expect(entry.evidenceOfLifeSignals).toContain('sibling_session_on_branch');
    expect(entry.evidenceAttribution.attributed).toContain('sibling_session_on_branch');
    expect(entry.evidenceAttribution.allUnattributed).toBe(false);
    expect(entry.evidenceAttribution.sessionIds).toContain('peer-session');
    // mySessionId is excluded upstream, so a named session means SOMEONE ELSE is alive.
    expect(entry.evidenceAttribution.sessionIds).not.toContain('my-session');
  });

  it('reports no evidence and no attribution when nothing fired', async () => {
    const { entry } = await entryFor({
      workingSds: [{ id: SD_UUID, sd_key: SD_KEY, is_working_on: true }],
      activity: false,
    });
    expect(entry).toBeTruthy();
    expect(entry.evidenceOfLifeSignals).toEqual([]);
    expect(entry.evidenceAttribution.attributed).toEqual([]);
    expect(entry.evidenceAttribution.unattributed).toEqual([]);
    // No evidence at all is NOT the same as unattributed evidence — this is the false-positive
    // direction the SD names, where protection was absent because no branch existed yet.
    expect(entry.evidenceAttribution.allUnattributed).toBe(false);
  });

  // TS-15 — the regression that matters most.
  it('is ADDITIVE: reclaimSafe and evidenceOfLifeSignals keep their pre-change meaning', async () => {
    const { entry } = await entryFor({
      workingSds: [{ id: SD_UUID, sd_key: SD_KEY, is_working_on: true }],
      activity: true,
    });
    // Unattributed evidence still suppresses reclaimSafe exactly as before. The fix does NOT
    // make the gate smarter on its own — it hands consumers the information to decide, and
    // FR-2/FR-3 are where that decision is made. A diff that flips this has redefined the
    // field in place, which the SD forbids and which would regress BaseExecutor's own tests.
    // Asserted unguarded, for the same anti-vacuousness reason as above.
    expect(entry.category).toBe('orphaned');
    expect(entry.reclaimSafe).toBe(false);
    expect(Array.isArray(entry.evidenceOfLifeSignals)).toBe(true);
    expect(entry.evidenceOfLifeSignals).toContain('recent_sub_agent_activity');
    // And the new field is genuinely additive, not a rename of an old one.
    expect(entry).toHaveProperty('evidenceAttribution');
    expect(entry).toHaveProperty('evidenceOfLifeSignals');
    expect(entry).toHaveProperty('siblingSessionIds');
  });
});
