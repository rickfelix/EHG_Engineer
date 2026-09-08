/**
 * QF-20260905-431: leo-create-sd --child's template description ("Child SD of <parent>: <title>",
 * 11-33 words) hard-blocked GATE_SD_QUALITY on EVERY child mint by construction — measured live
 * on all ten SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-A..-J children, requiring three
 * hand-enrichment rounds per child before LEAD-TO-PLAN passed. SD_TYPE_THRESHOLDS
 * (scripts/modules/sd-quality-scoring.js) requires 50 words (infrastructure/enhancement/bugfix/
 * refactor) or 100 words (feature/security, the type a --child mint silently defaults to when no
 * --type is given).
 *
 * These tests exercise the REAL gate functions (validateSdQuality's content-quality component via
 * checkContentQuality, validateMechanismClaims) against buildChildDescription's actual output —
 * not a hand-rolled word-count reimplementation that could drift from the real gate.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildChildDescription } from '../../../lib/sd-creation/source-adapters/child.js';
import { wordCount, checkContentQuality, SD_TYPE_THRESHOLDS, DEFAULT_THRESHOLD } from '../../../scripts/modules/sd-quality-scoring.js';
import { validateMechanismClaims } from '../../../scripts/modules/handoff/executors/lead-to-plan/gates/mechanism-claim-verifier.js';

const parentNoDescription = { sd_key: 'SD-LEO-ORCH-TEST-001', title: 'Test orchestrator', description: '' };
const parentWithDescription = {
  sd_key: 'SD-LEO-ORCH-TEST-001',
  title: 'Test orchestrator',
  description: 'Formalize the widget lifecycle across the fleet, including seat rotation, comms routing, and coordinator handoff contracts so autonomous workers stop treating widgets as an ad hoc alias.',
};

describe('buildChildDescription clears GATE_SD_QUALITY\'s description-length floor for every SD type', () => {
  it('clears the 100-word feature/security floor even with NO parent description (the worst case)', () => {
    const desc = buildChildDescription(parentNoDescription, 'SD-LEO-ORCH-TEST-001-A', 'Widget seat lifecycle');
    expect(wordCount(desc)).toBeGreaterThanOrEqual(SD_TYPE_THRESHOLDS.feature.minDescriptionWords);
  });

  it('clears the 50-word infrastructure/enhancement/bugfix/refactor floor with margin', () => {
    const desc = buildChildDescription(parentNoDescription, 'SD-LEO-ORCH-TEST-001-A', 'Widget seat lifecycle');
    expect(wordCount(desc)).toBeGreaterThanOrEqual(SD_TYPE_THRESHOLDS.infrastructure.minDescriptionWords + 10);
  });

  it('clears the DEFAULT_THRESHOLD floor used for an unrecognized sd_type', () => {
    const desc = buildChildDescription(parentNoDescription, 'SD-LEO-ORCH-TEST-001-A', 'Widget seat lifecycle');
    expect(wordCount(desc)).toBeGreaterThanOrEqual(DEFAULT_THRESHOLD.minDescriptionWords);
  });

  it('folding in the parent\'s own description (when present) only adds words, never reduces below the floor', () => {
    const withDesc = buildChildDescription(parentWithDescription, 'SD-LEO-ORCH-TEST-001-A', 'Widget seat lifecycle');
    const withoutDesc = buildChildDescription(parentNoDescription, 'SD-LEO-ORCH-TEST-001-A', 'Widget seat lifecycle');
    expect(wordCount(withDesc)).toBeGreaterThan(wordCount(withoutDesc));
    expect(wordCount(withDesc)).toBeGreaterThanOrEqual(SD_TYPE_THRESHOLDS.feature.minDescriptionWords);
  });

  it('a genuinely substantive parent description is truncated (not unbounded) in the scope note', () => {
    const longParent = { ...parentWithDescription, description: 'x '.repeat(500).trim() };
    const shortDesc = buildChildDescription({ ...longParent, description: 'short' }, 'SD-LEO-ORCH-TEST-001-A', 'Widget seat lifecycle');
    const longDesc = buildChildDescription(longParent, 'SD-LEO-ORCH-TEST-001-A', 'Widget seat lifecycle');
    // The scope note is capped at 260 chars regardless of how long parent.description actually is —
    // assert the DELTA stays bounded rather than pinning an exact total length.
    expect(longDesc.length - shortDesc.length).toBeLessThan(300);
  });

  it('ACCEPTANCE, against the REAL gate function: checkContentQuality scores the description component fully for every declared SD type', () => {
    const desc = buildChildDescription(parentNoDescription, 'SD-LEO-ORCH-TEST-001-A', 'Widget seat lifecycle');
    for (const [sdType, threshold] of Object.entries(SD_TYPE_THRESHOLDS)) {
      const result = checkContentQuality({ description: desc, sd_type: sdType, scope: null }, threshold);
      const tooShort = result.issues.find((i) => i.type === 'too_short');
      expect(tooShort, `sd_type=${sdType} (floor ${threshold.minDescriptionWords}) reported too_short`).toBeUndefined();
    }
  });

  it('does not introduce a false mechanism claim — validateMechanismClaims passes cleanly on the generated text', () => {
    const desc = buildChildDescription(parentWithDescription, 'SD-LEO-ORCH-TEST-001-A', 'Widget seat lifecycle');
    const result = validateMechanismClaims({ description: desc, title: 'Widget seat lifecycle', metadata: {} });
    expect(result.pass).toBe(true);
    expect(result.details.claims).toEqual([]);
  });
});

describe('createChild wiring (QF-20260905-431): overrides passthrough and mechanism_verifications seeding', () => {
  const source = readFileSync('lib/sd-creation/source-adapters/child.js', 'utf8');
  const createSdCallStart = source.indexOf('const sd = await createSD({');
  const createSdCallEnd = source.indexOf('\n  });', createSdCallStart);
  const createSdBody = source.slice(createSdCallStart, createSdCallEnd);

  it('description uses overrides.description when supplied, else the auto-built template', () => {
    // QF-20260907-765: hoisted into a `childDescription` variable (reused by the dry-run gate
    // battery above this call) — same computation, no longer inlined at the createSD call site.
    expect(source).toContain('const childDescription = overrides.description || buildChildDescription(parent, sdKey, childTitle)');
    expect(createSdBody).toContain('description: childDescription');
  });

  it('success_criteria and smoke_test_steps forward overrides straight through (skip the generic template defaults)', () => {
    expect(createSdBody).toContain('success_criteria: overrides.successCriteria || null');
    expect(createSdBody).toContain('smoke_test_steps: overrides.smokeTestSteps || null');
  });

  it('metadata.mechanism_verifications is seeded as an empty array on every mint', () => {
    expect(createSdBody).toMatch(/mechanism_verifications:\s*\[\]/);
  });
});
