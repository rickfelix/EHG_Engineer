/**
 * claude_sessions.metadata must be MERGED, never replaced.
 * SD-LEO-INFRA-PERSIST-MONITOR-OBSERVED-001 (re-scoped by coordinator ruling).
 *
 * THE DEFECT. A PostgREST write REPLACES a JSONB column. A writer carrying only its own keys
 * silently deletes the rest. Drop fleet_identity.callsign and sessionIdentityKind() returns null
 * (server/routes/fleet-panel.js:54-79), so :204 filters the row out and THE SEAT DISAPPEARS FROM
 * THE SESSIONS PAGE. Not a wrong value — an ABSENT ROW, which reads as nothing-wrong rather than as
 * an error, because nobody counts the rows they cannot see.
 *
 * SIX AUTHORS ALREADY DOCUMENTED THIS IN COMMENTS after being burned, and the hazard survived all
 * six. A warning comment is not a guard. That is why this is a test.
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const { classifyFile, VERDICT, AT_RISK_KEY_CENSUS } = require(path.join(ROOT, 'lib/fleet/metadata-write-audit.cjs'));

// ─────────────────────────────────────────────────────────────────────────────────────────────
// PART 1 — THE CONSUMER. This is the part that matters most, and the part I got wrong first.
//
// sessionIdentityKind is an ORDERED FALLBACK CHAIN. My first draft asserted that a clobbered row
// goes ABSENT, and prospective testing (evidence 9b5c3844) showed it does not: `model` is a
// non-null identity source one branch BELOW fleet_identity.callsign, so the real incident payload
// {model, effort} degrades the row to 'unstamped' and it STAYS PRESENT with callsign null.
// The regression is worker -> unstamped, NOT present -> absent. A test asserting ABSENT would have
// gone green on a fixture that strips everything while never touching the incident that happened.
// ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Mirror of server/routes/fleet-panel.js sessionIdentityKind (:54-79) — the ordered fallback.
 * Replicated rather than imported because that module pulls the express route graph; the ORDER is
 * the thing under test and is pinned by the cases below.
 */
function sessionIdentityKind(meta) {
  if (!meta || typeof meta !== 'object') return null;
  if (meta.is_coordinator) return 'coordinator';
  if (meta.role) return String(meta.role);
  if (meta.fleet_identity && meta.fleet_identity.callsign) return 'worker';
  if (meta.model) return 'unstamped';
  return null;
}

/** The :204 filter: allRows.filter(r => r.identity_kind !== null). */
const isOnSessionsPage = (meta) => sessionIdentityKind(meta) !== null;
/** fleet-panel.js:117 emits null callsign for anything that is not a stamped worker. */
const renderedCallsign = (meta) =>
  (sessionIdentityKind(meta) === 'worker' ? meta.fleet_identity.callsign : null);

describe('CONSUMER: a metadata write must not cost a seat its identity', () => {
  // Only identity source is fleet_identity.callsign. No model, no role — so nothing can satisfy
  // the assertion via a fallback branch and quietly make the negative cases unfalsifiable.
  const STAMPED = { fleet_identity: { callsign: 'Alpha-2', color: 'purple' }, tier_rank: 4 };

  it('a compliant merge keeps the seat a stamped worker', () => {
    const after = { ...STAMPED, last_git_metric_at_ms: 1785534896469 };
    // Asserted as a PAIR. `identity_kind !== null` is too weak — it passes on the degradation below,
    // which is the actual incident.
    expect(sessionIdentityKind(after)).toBe('worker');
    expect(renderedCallsign(after)).toBe('Alpha-2');
    expect(isOnSessionsPage(after)).toBe(true);
  });

  it('THE REAL INCIDENT (3c40949b): a blind write degrades worker -> unstamped, and the row STAYS', () => {
    // Exactly what lib/checkin/steps/model-effort-merge.cjs writes back. Worker 3c40949b lost its
    // Charlie/purple identity to a concurrent write inside NINE MINUTES.
    const after = { model: 'opus', effort: 'xhigh' };
    expect(sessionIdentityKind(after)).toBe('unstamped');
    expect(renderedCallsign(after)).toBeNull();
    // PRESENT, not absent. This is the assertion my first draft got backwards.
    expect(isOnSessionsPage(after)).toBe(true);
  });

  it('the DISAPPEARANCE mode: a write leaving no identity key removes the row entirely', () => {
    const after = { last_git_metric_at_ms: 1785534896469 };
    expect(sessionIdentityKind(after)).toBeNull();
    expect(isOnSessionsPage(after)).toBe(false);
  });

  it('CONTROL: the fallback ORDER is what makes the degradation possible', () => {
    // If callsign ever stopped out-ranking model, the first test would pass for the wrong reason.
    expect(sessionIdentityKind({ fleet_identity: { callsign: 'X' }, model: 'opus' })).toBe('worker');
    expect(sessionIdentityKind({ model: 'opus' })).toBe('unstamped');
    // And a bare non-identity payload must not be rescued by some other branch.
    expect(sessionIdentityKind({ wind_down: { reason: 'x' } })).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// PART 2 — THE CLASSIFIER. Capability, not verb.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe('classifier: does this write REPLACE the column?', () => {
  it('catches upsert, which no verb-based guard would', () => {
    const src = `
      await sb.from('claude_sessions')
        .upsert({ session_id, metadata: { model, effort } }, { onConflict: 'session_id' });
    `;
    const f = classifyFile(src, 'fixture.js');
    expect(f.length).toBeGreaterThan(0);
    expect(f[0].verdict).toBe(VERDICT.REPLACE);
    expect(f[0].form).toBe('upsert');
  });

  it('catches POST + resolution=merge-duplicates, the highest-volume replacing writer', () => {
    const src = `
      await fetch(url + '/claude_sessions', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates' },
        body: JSON.stringify({ session_id, metadata: { model } }),
      });
    `;
    const f = classifyFile(src, 'fixture.js');
    expect(f.some((x) => x.verdict === VERDICT.REPLACE)).toBe(true);
  });

  it('does NOT call a server-side jsonb merge a replace', () => {
    const src = `
      await client.query(
        "UPDATE claude_sessions SET metadata = COALESCE(metadata,'{}'::jsonb) || $2::jsonb WHERE session_id = $1",
        [id, patch]
      );
    `;
    const f = classifyFile(src, 'fixture.js');
    expect(f.every((x) => x.verdict !== VERDICT.REPLACE)).toBe(true);
  });

  it('REGRESSION: JavaScript `metadata || {}` is NOT the SQL jsonb concat', () => {
    // The first version matched a bare `||` and classified this replace as a MERGE — a FALSE GREEN,
    // the one outcome a guard must never produce. `||` is overloaded across the two languages;
    // the SQL form is disambiguated by ::jsonb or a SET clause, which JS cannot produce.
    const src = `
      const meta = metadata || {};
      await sb.from('claude_sessions').update({ metadata: { model: meta.model } }).eq('session_id', id);
    `;
    const f = classifyFile(src, 'fixture.js');
    expect(f.some((x) => x.verdict === VERDICT.REPLACE)).toBe(true);
  });

  it('does not report a comment describing the hazard as the hazard', () => {
    // Six files carry warning comments containing literal replacing examples. Flagging those is how
    // a guard becomes noise and gets switched off — the TR-3 failure mode.
    const src = `
      // WRONG: .update({ metadata: { non_fleet: true } }) on claude_sessions REPLACES the column
      /* Historical: an .upsert({ metadata }) here destroyed fleet_identity. */
      const x = 1;
    `;
    expect(classifyFile(src, 'fixture.js')).toEqual([]);
  });

  it('ignores writes that do not carry metadata at all', () => {
    const src = 'await sb.from(\'claude_sessions\').update({ heartbeat_at: now }).eq(\'session_id\', id);';
    expect(classifyFile(src, 'fixture.js')).toEqual([]);
  });

  it('ignores other tables', () => {
    const src = 'await sb.from(\'session_coordination\').update({ metadata: { a: 1 } }).eq(\'id\', id);';
    expect(classifyFile(src, 'fixture.js')).toEqual([]);
  });

  it('reports an AT-RISK CENSUS, never a computed destruction list', () => {
    // The destroyed set is a RUNTIME fact for a spread payload. Claiming to have computed it would
    // be a name making a claim the implementation cannot support — the same defect class as the
    // false QF-20260727-488 citation this SD struck.
    const src = 'await sb.from(\'claude_sessions\').upsert({ session_id, metadata: { model } });';
    const f = classifyFile(src, 'fixture.js').find((x) => x.verdict === VERDICT.REPLACE);
    expect(f.at_risk_keys).toEqual(AT_RISK_KEY_CENSUS);
    expect(f.at_risk_keys).toContain('fleet_identity');
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// PART 3 — THE LIVE TREE. Scoped honestly: this pins the writers we KNOW about rather than
// claiming a clean bill of health for 357 call sites the classifier has not adjudicated.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe('live tree', () => {
  const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

  it('the live compliant merge sites are not flagged', () => {
    // WAS VACUOUS, AND SAID "THREE" WHILE ITERATING TWO. Both files write via raw SQL, which no
    // REPLACING_FORM matches, so they return ZERO findings of any verdict — `filter(REPLACE)` was
    // satisfied by the empty set and the assertion would have passed identically with MERGE_FORMS
    // deleted. Part 1 of this file is careful about unfalsifiable assertions; Part 3 was not.
    // A test that cannot fail is not evidence, which is the thesis of the SD it belongs to.
    // The honest assertion is therefore about ABSENCE OF A FALSE ACCUSATION, stated as such, plus a
    // positive check that the classifier can see a merge at all when one is in a shape it parses.
    for (const rel of ['lib/fleet/attention-flag-writer.js', 'lib/fleet/window-visibility-writer.js']) {
      const f = classifyFile(read(rel), rel);
      expect(f.filter((x) => x.verdict === VERDICT.REPLACE)).toEqual([]);
    }
    // The non-vacuous half: a merge the classifier DOES parse is classified as one.
    const parsed = classifyFile(
      'await sb.from(\'claude_sessions\').update({ metadata: patch }); // sql: metadata || $2::jsonb',
      'fixture.js',
    );
    expect(parsed.length).toBeGreaterThan(0);
    expect(parsed.some((x) => x.verdict === VERDICT.MERGE)).toBe(true);
  });

  it('REGRESSION: stripComments must not delete lines, or every citation is wrong', () => {
    // `^\s*` with /m ate newlines and ' '.repeat() replaced them with spaces: 172 lines vanished
    // from session-manager.mjs, 195 from capture-session-id.cjs. Reported line numbers were off by
    // up to 159, and capture-session-id.cjs fell out of the proximity window entirely — so the
    // guard returned ZERO findings for the file its own header names as its reason for existing.
    for (const rel of ['lib/session-manager.mjs', 'scripts/hooks/capture-session-id.cjs']) {
      const src = read(rel);
      const findings = classifyFile(src, rel);
      const maxLine = findings.reduce((n, f) => Math.max(n, f.line), 0);
      // A citation past the end of the file is impossible unless stripping changed the numbering.
      expect(maxLine).toBeLessThanOrEqual(src.split('\n').length);
    }
  });

  it('the canonical merge-preserving helpers are not reported as defects', () => {
    // These read before writing. They still RACE — that is why they are reported as
    // read_then_write rather than silently blessed — but they are not the blind-replace defect,
    // and a guard that fails on them gets disabled wholesale.
    for (const rel of ['lib/session-writer.cjs', 'lib/checkin/steps/model-effort-merge.cjs']) {
      const f = classifyFile(read(rel), rel);
      expect(f.filter((x) => x.verdict === VERDICT.REPLACE)).toEqual([]);
    }
  });

  it('KNOWN REPLACING WRITERS are still detected — a silent drop here is the regression', () => {
    // lib/session-manager.mjs is the documented wipe-on-reinit site. If this ever returns zero, the
    // classifier has stopped seeing the thing it exists to see, and everything else here is theatre.
    const rel = 'lib/session-manager.mjs';
    const f = classifyFile(read(rel), rel).filter((x) => x.verdict === VERDICT.REPLACE);
    expect(f.length).toBeGreaterThan(0);
  });
});
