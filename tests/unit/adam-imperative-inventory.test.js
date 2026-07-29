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
const VALID = new Set(['landed', 'merged_into', 'deliberately_dropped', 'NEEDS_DECISION']);

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

  it('CONTROL: the inventory is not vacuously satisfied', () => {
    // If everything were auto-marked landed, every assertion above still passes while the
    // artifact asserts nothing. Unreviewed obligations must remain visible as open work.
    expect(inv.entries.length).toBeGreaterThan(100);
    expect(inv.entries.filter((e) => e.disposition === 'NEEDS_DECISION').length).toBeGreaterThan(0);
  });
});
