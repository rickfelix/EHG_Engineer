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

  it('changes NOTHING else — restoration only, no silent edits to approved text', () => {
    // The chairman approved the rest of this file. A correction that also reworded approved
    // content would smuggle unapproved changes in behind a legitimate fix.
    const withoutRestoration = CORRECTED
      .replace(/### 5q\. ACCEPTANCE-SITTING OWNERSHIP[\s\S]*?(?=### 5r\.)/, '')
      .replace(/### 5r\. SD sourcing & creation — hard rules[\s\S]*?(?=## 6\. Self-assessment)/, '');
    expect(withoutRestoration).toBe(PROPOSED);
  });

  it('stays within the token budget the SD exists to satisfy', () => {
    // 2.507 B/token measured against the real truncation notice (103,790 B = 41,399 tokens).
    // This is a projection and is NOT a substitute for the acceptance step of actually reading
    // the generated file un-paginated — a byte proxy is what mis-sized this contract before.
    const projected = CORRECTED.length / 2.507;
    expect(projected).toBeLessThan(20000);
  });
});
