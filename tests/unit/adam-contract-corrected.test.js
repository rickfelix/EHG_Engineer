/**
 * The corrected shortened contract — restoration guard.
 * SD-LEO-INFRA-ADAM-CONTRACT-READABLE-001 — FR-1.
 *
 * The chairman-approved shortened contract DELETED a chairman-delegated duty outright:
 * ACCEPTANCE-SITTING OWNERSHIP appears nowhere in it (sitting / acceptance / reschedule / t-24
 * all score zero). The approval justified the cut on the grounds that what was removed is
 * "provenance prose, not rules" — which does not hold for this duty. CORRECTED restores it.
 *
 * These assertions exist because the loss was silent: nothing failed, no gate complained, and
 * the duty simply stopped being governed.
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DIR = path.join(ROOT, 'docs/protocol/adam-contract-review-2026-07-29');
const read = (f) => fs.readFileSync(path.join(DIR, f), 'utf8').replace(/\r\n/g, '\n');

const PROPOSED = read('CLAUDE_ADAM.PROPOSED-2026-07-29.md');
const CORRECTED = read('CLAUDE_ADAM.CORRECTED-2026-07-29.md');

describe('corrected Adam contract', () => {
  it('pins the defect: the approved shortened version has NO trace of the duty', () => {
    // If this ever starts failing, the upstream proposal changed and the correction may be
    // redundant — which is worth knowing rather than silently double-applying.
    for (const probe of [/acceptance[- ]sitting/i, /reschedule/i, /T-24/i]) {
      expect(PROPOSED).not.toMatch(probe);
    }
  });

  it('restores all five obligations, not just the heading', () => {
    // A heading alone would satisfy a name-based check while governing nothing — the exact
    // failure mode that let the deletion through in the first place.
    expect(CORRECTED).toMatch(/ACCEPTANCE-SITTING OWNERSHIP/);
    expect(CORRECTED).toMatch(/>=24h ahead/i);           // decision packets
    expect(CORRECTED).toMatch(/T-24h/i);                 // readiness-gate verification
    expect(CORRECTED).toMatch(/day before and the morning of/i); // reminders
    expect(CORRECTED).toMatch(/never run a no-op sitting/i);     // reschedule before
    expect(CORRECTED).toMatch(/post-sitting confirmation/i);     // durable outcome recording
  });

  it('lifts the rules that were fused inside the HOW-TO row', () => {
    // Row 604 is genuinely how-to and moves to CLAUDE_ADAM_MANUAL.md — but it had RULES welded
    // into it. Moving the row as a unit would demote them from governed to advisory, in a file
    // nothing loads. DECOMPOSE-WEAKEST-LAYER is chairman-directed and was the clearest case:
    // it reads as "missing from the contract" precisely because it lived in the manual row.
    expect(CORRECTED).toMatch(/ONE canonical path/i);
    expect(CORRECTED).toMatch(/NEVER hand-insert/i);
    expect(CORRECTED).toMatch(/ENF-SD-CREATE-SKILL/);
    expect(CORRECTED).toMatch(/DECOMPOSE-WEAKEST-LAYER/);
    expect(CORRECTED).toMatch(/CLASSIFY each weak capability BEFORE sourcing/i);
  });

  it('pins that those rules are absent upstream — the lift is not redundant', () => {
    // Guards against double-application if the proposal is ever revised to include them.
    expect(PROPOSED).not.toMatch(/weakest.layer/i);
    expect(PROPOSED).not.toMatch(/hand-insert/i);
  });

  it('restores the Adam/EVA persona split — a role BOUNDARY, not provenance', () => {
    // Chairman verbal 2026-07-12. Without it, what is Adam's to carry versus EVA's is undefined.
    // All five markers were absent from the approved shortened file and present in the original.
    expect(PROPOSED).not.toMatch(/harness-side/i);
    for (const probe of [/harness-side/i, /venture-side/i, /chief.of.staff/i, /Chief Builder/i, /Persona split/i]) {
      expect(CORRECTED).toMatch(probe);
    }
  });

  it('changes NOTHING unapproved — every delta from the approved file is on the ruling list', () => {
    // INTENT UNCHANGED, MECHANISM REPLACED. The guarantee is still "a correction must not smuggle
    // unapproved edits in behind a legitimate fix". What changed is that the approved delta set grew
    // by explicit ruling, and two of the additions are INLINE (a dash-delimiter fix and a restored
    // phrase mid-sentence) which no section-strip can remove — so exact-equality-after-stripping
    // could no longer express the rule. A line-level allowlist can, and it still fails on any line
    // that is not attributable to a recorded authority.
    //
    // EVERY ENTRY BELOW CITES WHY IT IS ALLOWED. An addition with no authority is the thing this
    // test exists to catch, and it will still fail here.
    // CHECKED IN THE DIRECTION THE RISK ACTUALLY RUNS. Additions are RESTORATIONS — the whole point
    // of this file — so scanning added lines mostly rediscovers the restorations and drowns in
    // wrapped continuation lines that carry no distinguishing marker. The danger is the opposite:
    // approved text QUIETLY REMOVED OR REWORDED while attention is on the additions. So assert that
    // every line of the approved file still appears verbatim, and enumerate the few that do not.
    const correctedLines = new Set(CORRECTED.split('\n'));
    const REWORDED_WITH_AUTHORITY = [
      // S1: parentheses -> dashes. NOT cosmetic: lib/governance/adam-contract-audit.js keys its
      // ACTIVE_GATE_RE on a DASH-delimited enumeration precisely so it does not fire on
      // paren-delimited changelog entries. The paren form made a LIVE guard match nothing and
      // return conflict:false vacuously.
      /self-generated proactive work/i,
      // S5g(c3): chairman verbal 2026-07-31 set the heartbeat cadence to HOURLY, superseding the
      // 2026-07-19 30-minute override. The approved file had dropped the cadence word entirely.
      /ROUTINE HEARTBEAT/i,
      // S5f item 3: re-derived from the LIVE row. The approved file predates
      // SD-LEO-INFRA-SOURCING-ENGINE-BELT-GATED-001; landing it verbatim would have REVERTED a
      // merged sibling and reinstated four retired no-op flags.
      /sourcing-engine activation flags/i,
      // S6: restored "no runtime effect whatsoever", which the condensation had traded for
      // "changes a dashboard, not a behaviour" — same force, but the phrase is pinned by
      // tests/unit/governance/self-score-contract-content.test.js.
      /leo_feature_flags` is a GAUGE/i,
      // S5k: the phone-notify sentence gained the LAYER-not-a-replacement clause (four-losses A).
      /Use SPARINGLY/i,
      // S5e: the ranking paragraph gained the gauge-reuse rule (four-losses A).
      /THE DEFERRED QUESTION ADAM OWNS/i,
    ];
    const silentlyLost = PROPOSED.split('\n')
      .filter((line) => line.trim().length > 0)
      .filter((line) => !correctedLines.has(line))
      .filter((line) => !REWORDED_WITH_AUTHORITY.some((re) => re.test(line)));
    expect(silentlyLost).toEqual([]);
  });

  it('stays within the token budget the SD exists to satisfy', () => {
    // 2.507 B/token measured against the real truncation notice (103,790 B = 41,399 tokens).
    // This is a projection and is NOT a substitute for the acceptance step of actually reading
    // the generated file un-paginated — a byte proxy is what mis-sized this contract before.
    const projected = CORRECTED.length / 2.507;
    expect(projected).toBeLessThan(20000);
  });
});
