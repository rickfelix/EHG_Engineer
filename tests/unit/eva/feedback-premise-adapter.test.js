// SD-FDBK-ENH-UAT-AGENT-FEEDBACK-001 FR-1: feedback-row -> premise_descriptor adapter.
// Reuses checkPremiseLiveness's own verdict matrix (tested in premise-liveness.test.js);
// this suite covers the adapter's shaping logic + the b6594220-shaped concrete scenario
// (a feedback row naming a file that was fixed by a shipped commit within the window).
import { describe, it, expect } from 'vitest';
import {
  extractReferencedFiles,
  feedbackToPremiseDescriptor,
  checkFeedbackPremiseLiveness,
} from '../../../lib/eva/feedback-premise-adapter.js';

const NOW = Date.parse('2026-06-23T00:00:00Z');

function mockSb({ handoffs = [], completed = [] } = {}) {
  return {
    from(table) {
      if (table === 'sd_phase_handoffs') {
        // recentRecount paginates (FR-6): .order() then awaited .range() terminal.
        return { select: () => ({ eq: () => ({ gte: () => {
          const b = { order: () => b, range: () => Promise.resolve({ data: handoffs, error: null }) };
          return b;
        } }) }) };
      }
      if (table === 'strategic_directives_v2') {
        return { select: () => ({ eq: () => ({ gte: () => ({ or: () => ({ limit: () => Promise.resolve({ data: completed, error: null }) }) }) }) }) };
      }
      return null;
    },
  };
}
const noGit = () => '';
const gitWithFix = () => 'abc1234 fix(SD-LEO-INFRA-AUTO-REFILL-READ-DB-ACTIVATION-FLAG-001): read DB flag';

describe('extractReferencedFiles', () => {
  it('extracts file paths with common extensions from free text', () => {
    const text = 'refill-cron.mjs gates its ACTION on env var, see scripts/sourcing-engine/refill-cron.mjs lines 8-15 and lib/foo.js';
    const files = extractReferencedFiles(text);
    expect(files).toContain('scripts/sourcing-engine/refill-cron.mjs');
    expect(files).toContain('lib/foo.js');
  });

  it('returns [] for text with no file paths, and dedupes repeats', () => {
    expect(extractReferencedFiles('no files mentioned here')).toEqual([]);
    expect(extractReferencedFiles('a.js and a.js again')).toEqual(['a.js']);
  });

  it('is total on empty/null input', () => {
    expect(extractReferencedFiles(null)).toEqual([]);
    expect(extractReferencedFiles(undefined)).toEqual([]);
    expect(extractReferencedFiles('')).toEqual([]);
  });
});

describe('feedbackToPremiseDescriptor', () => {
  it('shapes a feedback row into the premise_descriptor checkPremiseLiveness expects', () => {
    const fb = { id: 'fb-1', title: 'AUTO-REFILL-CRON-ENV-GATE-VS-DB-FLAG-DIVERGENCE', description: 'see scripts/sourcing-engine/refill-cron.mjs', category: 'infra', severity: 'high' };
    const d = feedbackToPremiseDescriptor(fb);
    expect(d.kind).toBe('feedback');
    expect(d.source).toBe('feedback');
    expect(d.cluster_reason).toBe(fb.title);
    expect(d.severity).toBe('high');
    expect(d.referenced_files).toContain('scripts/sourcing-engine/refill-cron.mjs');
  });

  it('is total on a missing/empty row', () => {
    const d = feedbackToPremiseDescriptor();
    expect(d.gate_name).toBeNull();
    expect(d.cluster_reason).toBeNull();
    expect(d.referenced_files).toEqual([]);
  });
});

describe('checkFeedbackPremiseLiveness — the b6594220-shaped scenario (FR-1)', () => {
  it('STALE: a feedback row naming an already-fixed file refuses (referenced-file git match)', async () => {
    const fb = {
      id: 'fb-1',
      title: 'AUTO-REFILL-CRON-ENV-GATE-VS-DB-FLAG-DIVERGENCE',
      description: 'refill-cron.mjs gates its ACTION on env var SOURCING_AUTO_REFILL_V1, see scripts/sourcing-engine/refill-cron.mjs',
      category: null,
    };
    const v = await checkFeedbackPremiseLiveness(fb, { supabase: mockSb(), git: gitWithFix, nowMs: NOW });
    expect(v.status).toBe('STALE');
    expect(v.recommendation).toBe('ARCHIVE');
  });

  it('LIVE: a feedback row whose file has no recent shipped fix stays live (fail-open)', async () => {
    const fb = { id: 'fb-2', title: 'Some other bug', description: 'see scripts/whatever.js', category: null };
    const v = await checkFeedbackPremiseLiveness(fb, { supabase: mockSb(), git: noGit, nowMs: NOW });
    expect(v.status).toBe('LIVE');
  });
});
