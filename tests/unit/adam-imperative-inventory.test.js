/**
 * Imperative inventory artifact — mechanical guards.
 * SD-LEO-INFRA-ADAM-CONTRACT-READABLE-001 — FR-1 / TS-2.
 *
 * TS-2 originally asserted "every imperative from the original is locatable after extraction".
 * That is not dischargeable by a test — it needs semantic judgement, and asserting it directly
 * would swap one undischargeable criterion for another (the LEAD revision had already made that
 * swap once, replacing byte accounting). The judgement therefore lives in a COMMITTED artifact
 * where it can be reviewed; this test guards only what a machine can actually check.
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DIR = path.join(ROOT, 'docs/protocol/adam-contract-review-2026-07-29');
const ORIGINAL = path.join(DIR, 'CLAUDE_ADAM.ORIGINAL-2026-07-29.md');
const INVENTORY = path.join(DIR, 'imperative-inventory.json');

const inv = JSON.parse(fs.readFileSync(INVENTORY, 'utf8'));

// Adjudication vocabulary. The four added below are NOT softer synonyms for "landed" — each one
// records something a bare landed/dropped split cannot express, and each keeps an item VISIBLE:
//   CANDIDATE_LOSS               not located in the contract or either companion
//   CHAIRMAN_DECISION_REQUIRED   altered rather than dropped, and only the chairman may resolve it
//   CLASSIFIED_PENDING_FR2       companion-bound, so its fate rides on the unresolved govern-vs-demote call
//   provenance_bound / companion_bound / *_obligation_survives
//                                the obligation survives; some rationale or detail did not
const VALID = new Set([
  'landed', 'merged_into', 'deliberately_dropped', 'NEEDS_DECISION', 'not_an_obligation',
  'CANDIDATE_LOSS', 'CHAIRMAN_DECISION_REQUIRED', 'CLASSIFIED_PENDING_FR2',
  'provenance_bound', 'companion_bound',
  'rationale_dropped_obligation_survives', 'detail_dropped_obligation_survives',
]);

/** Dispositions that mean "still open" — the ledger is not closed while any of these remain. */
const OPEN = new Set(['NEEDS_DECISION', 'CLASSIFIED_PENDING_FR2', 'CANDIDATE_LOSS', 'CHAIRMAN_DECISION_REQUIRED']);

describe('imperative inventory artifact (TS-2)', () => {
  it('pins the source it was derived from', () => {
    // The inventory is meaningless against a different original. If the preserved contract is
    // ever re-saved or regenerated, this fails loudly instead of silently describing stale text.
    const actual = crypto.createHash('sha256').update(fs.readFileSync(ORIGINAL, 'utf8').replace(/\r\n/g, '\n')).digest('hex');
    expect(inv.source_sha256).toBe(actual);
  });

  it('gives every entry a disposition from the allowed set', () => {
    const bad = inv.entries.filter((e) => !VALID.has(e.disposition));
    expect(bad.map((e) => e.key)).toEqual([]);
  });

  it('has no empty or duplicate entries', () => {
    expect(inv.entries.filter((e) => !e.imperative || !e.imperative.trim()).length).toBe(0);
    const keys = inv.entries.map((e) => e.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('reports counts that match the entries it carries', () => {
    expect(inv.counts.original).toBe(inv.entries.length);
    expect(inv.counts.landed).toBe(inv.entries.filter((e) => e.disposition === 'landed').length);
  });

  it('REGRESSION: enumerates obligations written WITHOUT a modal marker', () => {
    // The discovered defect: the first enumerator required MUST/NEVER/ALWAYS and so could not see
    // DECOMPOSE-WEAKEST-LAYER — chairman-directed, present in the original, bare imperative mood.
    // Only 54 of 533 clauses carry a modal, so a modal gate drops ~90% of the population, and a
    // dropped obligation gets no disposition and can be deleted in silence.
    const nonModal = inv.entries.filter((e) => e.carries_modal === false);
    expect(nonModal.length).toBeGreaterThan(inv.entries.length * 0.5);

    const corpus = inv.entries.map((e) => e.imperative.toLowerCase()).join(' || ');
    expect(corpus).toMatch(/decompose.{0,20}weakest/i);
    expect(corpus).toMatch(/courtesy.{0,15}ack/i);
  });

  it('attaches a deletion verdict to the DEFINING clause, never to a passing mention', () => {
    // Regression: the first verdict regex matched any clause containing "acceptance-sitting",
    // which tagged a DIFFERENT clause — one merely listing the duty's name while discussing the
    // role-model correction — as a confirmed deletion. A wrong verdict in this ledger misleads
    // every later reader, and this artifact is the control for the whole authoring pass.
    const flagged = inv.entries.filter((e) => /CONFIRMED DELETION/.test(e.probe_evidence || ''));
    expect(flagged.length).toBe(1);
    expect(flagged[0].imperative).toMatch(/^\*{0,2}ACCEPTANCE-SITTING OWNERSHIP/i);
  });

  it('never retires a real rule as a non-obligation', () => {
    // Triage shrinks the review queue by marking headings and citations. Over-marking silently
    // retires a live rule, which is the precise harm the inventory exists to prevent — so the
    // classifier must stay pointed at keeping things OPEN.
    //
    // Regression: "SOURCE-AND-GO (default — no pre-review)" is a routing RULE and was retired as
    // a citation because its name starts with "Source". Citations carry a colon; rule names do
    // not. A pattern matching a PREFIX is not a pattern matching a MEANING.
    const retired = inv.entries.filter((e) => e.disposition === 'not_an_obligation');
    for (const probe of [/SOURCE-AND-GO/i, /DECOMPOSE-WEAKEST-LAYER/i, /ACCEPTANCE-SITTING OWNERSHIP/i, /NEVER hand-insert/i]) {
      expect(retired.filter((e) => probe.test(e.imperative))).toEqual([]);
    }
    // Every retirement carries its reason, so the judgement is reviewable rather than implicit.
    expect(retired.every((e) => typeof e.triage_reason === 'string' && e.triage_reason.length > 0)).toBe(true);
  });

  it('CONTROL: the inventory is not vacuously satisfied', () => {
    // If everything were auto-marked landed, every assertion above still passes while the
    // artifact asserts nothing. Unreviewed obligations must remain visible as open work.
    //
    // WIDENED, NOT WEAKENED. This used to require NEEDS_DECISION > 0, which stopped being the
    // right question once adjudication introduced a vocabulary: the queue can be empty while the
    // LEDGER is still open, because companion-bound entries are parked behind the FR-2
    // govern-vs-demote call. Asserting on the queue alone would now fail on correct work AND —
    // worse — would pass on a laundered artifact that renamed everything to a non-queue
    // disposition. So the control asks the question it always meant: is unresolved work still
    // visible, and has the ledger avoided collapsing into all-clear?
    expect(inv.entries.length).toBeGreaterThan(100);

    const open = inv.entries.filter((e) => OPEN.has(e.disposition));
    expect(open.length).toBeGreaterThan(0);

    // A ledger that is >=95% "landed" is indistinguishable from one auto-marked landed. The real
    // artifact sits far below this; the bound exists to catch a future bulk-close.
    const landed = inv.entries.filter((e) => e.disposition === 'landed').length;
    expect(landed / inv.entries.length).toBeLessThan(0.95);

    // Every open entry must say WHY it is still open, so "open" cannot become a parking label that
    // means nothing. NEEDS_DECISION predates this rule and is exempt — it is the un-triaged state.
    const unexplained = open.filter((e) =>
      e.disposition !== 'NEEDS_DECISION' &&
      !(e.triage?.why_not_closed || e.survival_basis?.note));
    expect(unexplained.map((e) => e.key)).toEqual([]);
  });
});
