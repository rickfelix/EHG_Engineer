/**
 * SD-LEO-INFRA-AUTO-REFILL-CONTENT-SUBSTANCE-GATE-001 (FR-1/FR-3)
 *
 * The auto-refill engine (live post-#5238) promoted RAW todoist-corpus captures as un-buildable
 * SD-REFILL-* stubs: bare-URL / markdown-link-only titles (youtube/claude.ai references) and
 * refine_recommendation='review' idea bookmarks. The new CONTENT_SUBSTANCE axis in
 * evaluateRefillCandidate rejects both classes — distinct from the length-based substance_thin.
 */
import { describe, it, expect } from 'vitest';
import {
  evaluateRefillCandidate,
  REFILL_INVALID_REASONS,
  isBareUrlOrLinkOnlyTitle,
} from '../../../lib/sourcing-engine/refill-candidate-validity.js';

// Mirror the existing well-formed staged candidate (passes every OTHER axis).
const validItem = (over = {}) => ({
  item_disposition: 'pending',
  promoted_to_sd_key: null,
  title: 'Harden the worktree reaper',
  source_type: 'conversion_ledger',
  source_id: '11111111-1111-1111-1111-111111111111',
  lane: 'belt',
  ...over,
});

// The 4 contentless captures that polluted the belt (live titles).
const CONTENTLESS_CAPTURES = {
  '00BUV1PE': '[How Top Engineers Stop AI Agents From Writing Slop](https://youtu.be/88FC685v7ac?si=dxKybO1s85mGnR1p)',
  '00C2EY90': '[Interactive session | Claude Code](https://claude.ai/code/session_01AD1Fex5StWuzbHTXoLjm43)',
  '00HTVYPZ': '[How I Built The PERFECT AI Agent In 1 Week (And Why I CANT Release It)](https://youtu.be/_h2EnRfxMQE?si=kIbvXr0J5dUGNOcI)',
  '00J2VGQI': '[Google Gemini’s NEW Upgrades Are MIND BLOWING (New Use Cases)](https://youtu.be/QsqSXIz-nX4?si=wMbfIFIp-581HGJj)',
};

describe('isBareUrlOrLinkOnlyTitle (FR-1 predicate)', () => {
  it('TS-1: a bare URL title is contentless', () => {
    expect(isBareUrlOrLinkOnlyTitle('https://claude.ai/code/session_01AD1Fex5StWuzbHTXoLjm43')).toBe(true);
    expect(isBareUrlOrLinkOnlyTitle('  http://youtu.be/abc  ')).toBe(true);
  });
  it('TS-2: a whole-title markdown link is contentless (incl. truncated, no closing paren)', () => {
    expect(isBareUrlOrLinkOnlyTitle('[Some Video](https://youtu.be/x)')).toBe(true);
    expect(isBareUrlOrLinkOnlyTitle('[Truncated Title](https://youtu.be/x9gHaJ')).toBe(true); // truncated
  });
  it('all 4 live contentless captures match', () => {
    for (const [id, title] of Object.entries(CONTENTLESS_CAPTURES)) {
      expect(isBareUrlOrLinkOnlyTitle(title), id).toBe(true);
    }
  });
  it('a substantive title (even one CONTAINING a url) is NOT contentless', () => {
    expect(isBareUrlOrLinkOnlyTitle('Harden the worktree reaper')).toBe(false);
    expect(isBareUrlOrLinkOnlyTitle('Fix the dashboard at https://app.example.com to show belt depth')).toBe(false);
    expect(isBareUrlOrLinkOnlyTitle('')).toBe(false);
    expect(isBareUrlOrLinkOnlyTitle(null)).toBe(false);
  });
});

describe('evaluateRefillCandidate — CONTENT_SUBSTANCE axis', () => {
  it('TS-1/TS-2: a bare-URL / markdown-link-only title is rejected', () => {
    expect(evaluateRefillCandidate(validItem({ title: 'https://claude.ai/code/session_01AD' })).reason)
      .toBe(REFILL_INVALID_REASONS.CONTENT_SUBSTANCE);
    expect(evaluateRefillCandidate(validItem({ title: '[Some Video](https://youtu.be/x)' })).reason)
      .toBe(REFILL_INVALID_REASONS.CONTENT_SUBSTANCE);
  });

  it('TS-6: all 4 live contentless captures are rejected by CONTENT_SUBSTANCE', () => {
    for (const [id, title] of Object.entries(CONTENTLESS_CAPTURES)) {
      const r = evaluateRefillCandidate(validItem({ title }));
      expect(r.valid, id).toBe(false);
      expect(r.reason, id).toBe(REFILL_INVALID_REASONS.CONTENT_SUBSTANCE);
    }
  });

  it('TS-3: refine_recommendation review/defer is rejected (promote only "promote")', () => {
    expect(evaluateRefillCandidate(validItem({ metadata: { refine_recommendation: 'review' } })).reason)
      .toBe(REFILL_INVALID_REASONS.CONTENT_SUBSTANCE);
    expect(evaluateRefillCandidate(validItem({ metadata: { refine_recommendation: 'defer' } })).reason)
      .toBe(REFILL_INVALID_REASONS.CONTENT_SUBSTANCE);
  });

  it('TS-4: refine_recommendation=promote + substantive title PASSES', () => {
    expect(evaluateRefillCandidate(validItem({ metadata: { refine_recommendation: 'promote' } })))
      .toEqual({ valid: true, reason: null });
  });

  it('TS-5: a substantive idea-note with NO refine_recommendation still promotes', () => {
    expect(evaluateRefillCandidate(validItem({ title: 'Add a per-capability vision gauge to the dashboard' })))
      .toEqual({ valid: true, reason: null });
  });

  it('a contentless link with a recovered substantive body is NOT rejected (enrichment path)', () => {
    const enriched = validItem({
      title: '[Some Video](https://youtu.be/x)',
      metadata: { description: 'Extracted spec: add a retry-with-backoff wrapper to the promotion path so transient DB errors do not drop a candidate; cover with a unit test.' },
    });
    // softened by hasRecoveredSubstance — only the bare-link sub-axis is bypassed; no non-promote grade here
    expect(evaluateRefillCandidate(enriched)).toEqual({ valid: true, reason: null });
  });

  it('legacy item with no refine_recommendation + substantive title is unaffected', () => {
    expect(evaluateRefillCandidate(validItem())).toEqual({ valid: true, reason: null });
  });
});
