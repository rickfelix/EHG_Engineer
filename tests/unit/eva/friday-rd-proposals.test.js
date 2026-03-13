/**
 * Tests for Friday Meeting R&D Proposals integration
 * Tests gatherRdProposals, renderRdProposals, buildCombinedDecisionPayload,
 * and processRdProposalDecision from lib/skunkworks/friday-rd-section.js
 *
 * SD: SD-AUTONOMOUS-SKUNKWORKS-RD-DEPARTMENT-ORCH-001-B
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  gatherRdProposals,
  renderRdProposals,
  buildCombinedDecisionPayload,
  processRdProposalDecision,
} from '../../../lib/skunkworks/friday-rd-section.js';

function mockSupabase(data, error = null) {
  return {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue({ data, error }),
          }),
        }),
      }),
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    }),
  };
}

const logger = { log: vi.fn(), warn: vi.fn() };

describe('gatherRdProposals', () => {
  it('returns proposals grouped by signal_source', async () => {
    const proposals = [
      { id: '1', title: 'P1', signal_source: 'calibration', priority_score: 80 },
      { id: '2', title: 'P2', signal_source: 'calibration', priority_score: 60 },
      { id: '3', title: 'P3', signal_source: 'venture_portfolio', priority_score: 70 },
    ];
    const supabase = mockSupabase(proposals);

    const result = await gatherRdProposals({ supabase, logger });

    expect(result.proposals).toHaveLength(3);
    expect(result.grouped.calibration).toHaveLength(2);
    expect(result.grouped.venture_portfolio).toHaveLength(1);
  });

  it('returns empty on query error', async () => {
    const supabase = mockSupabase(null, { message: 'connection failed' });

    const result = await gatherRdProposals({ supabase, logger });

    expect(result.proposals).toHaveLength(0);
    expect(result.grouped).toEqual({});
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('connection failed'));
  });

  it('returns empty when no proposals exist', async () => {
    const supabase = mockSupabase([]);

    const result = await gatherRdProposals({ supabase, logger });

    expect(result.proposals).toHaveLength(0);
  });

  it('defaults null signal_source to composite', async () => {
    const proposals = [{ id: '1', title: 'P1', signal_source: null, priority_score: 50 }];
    const supabase = mockSupabase(proposals);

    const result = await gatherRdProposals({ supabase, logger });

    expect(result.grouped.composite).toHaveLength(1);
  });

  it('queries only pending_review status', async () => {
    const supabase = mockSupabase([]);

    await gatherRdProposals({ supabase, logger });

    expect(supabase.from).toHaveBeenCalledWith('rd_proposals');
    const chain = supabase.from.mock.results[0].value;
    expect(chain.select).toHaveBeenCalled();
    const selectChain = chain.select.mock.results[0].value;
    expect(selectChain.eq).toHaveBeenCalledWith('status', 'pending_review');
  });
});

describe('renderRdProposals', () => {
  it('shows empty state when no proposals', () => {
    const output = renderRdProposals({ proposals: [], grouped: {} });

    expect(output).toContain('SECTION 5: R&D PROPOSALS');
    expect(output).toContain('No pending R&D proposals');
    expect(output).toContain('skunkworks batch runs every Monday');
  });

  it('renders proposals grouped by signal source', () => {
    const data = {
      proposals: [
        { id: '1', title: 'Calibrate X', priority_score: 85, hypothesis: 'Recalibrating X improves accuracy', signal_source: 'calibration' },
        { id: '2', title: 'Fix health Y', priority_score: 70, hypothesis: null, signal_source: 'codebase_health' },
      ],
      grouped: {
        calibration: [{ id: '1', title: 'Calibrate X', priority_score: 85, hypothesis: 'Recalibrating X improves accuracy' }],
        codebase_health: [{ id: '2', title: 'Fix health Y', priority_score: 70, hypothesis: null }],
      },
    };

    const output = renderRdProposals(data);

    expect(output).toContain('2 pending proposal(s) across 2 signal source(s)');
    expect(output).toContain('[CALIBRATION]');
    expect(output).toContain('Calibrate X (priority: 85)');
    expect(output).toContain('Hypothesis: Recalibrating X improves accuracy');
    expect(output).toContain('[CODEBASE_HEALTH]');
    expect(output).toContain('Fix health Y (priority: 70)');
    // No hypothesis line for null hypothesis
    expect(output).not.toContain('Hypothesis: null');
  });
});

describe('buildCombinedDecisionPayload', () => {
  it('returns null when no items', () => {
    expect(buildCombinedDecisionPayload([], [])).toBeNull();
  });

  it('builds findings with Accept/Dismiss/Defer options', () => {
    const findings = [
      { id: 'f1', title: 'Finding 1', description: 'Desc', analysis_domain: 'gate', priority_score: 0.8, action_type: 'review' },
    ];
    const payload = buildCombinedDecisionPayload(findings, []);

    expect(payload.questions).toHaveLength(1);
    expect(payload.questions[0].itemType).toBe('finding');
    expect(payload.questions[0].itemId).toBe('f1');
    expect(payload.questions[0].options.map(o => o.label)).toEqual(['Accept', 'Dismiss', 'Defer']);
  });

  it('builds proposals with Approve/Dismiss/Defer options', () => {
    const proposals = [
      { id: 'p1', title: 'Proposal 1', hypothesis: 'H1', signal_source: 'calibration', priority_score: 90 },
    ];
    const payload = buildCombinedDecisionPayload([], proposals);

    expect(payload.questions).toHaveLength(1);
    expect(payload.questions[0].itemType).toBe('rd_proposal');
    expect(payload.questions[0].itemId).toBe('p1');
    expect(payload.questions[0].options.map(o => o.label)).toEqual(['Approve', 'Dismiss', 'Defer']);
  });

  it('combines findings and proposals with correct numbering', () => {
    const findings = [{ id: 'f1', title: 'F1', description: 'D', analysis_domain: 'x', priority_score: 1, action_type: 'y' }];
    const proposals = [{ id: 'p1', title: 'P1', hypothesis: 'H', signal_source: 'z', priority_score: 2 }];

    const payload = buildCombinedDecisionPayload(findings, proposals);

    expect(payload.questions).toHaveLength(2);
    expect(payload.questions[0].header).toContain('Item 1/2');
    expect(payload.questions[0].header).toContain('Consultant Finding');
    expect(payload.questions[1].header).toContain('Item 2/2');
    expect(payload.questions[1].header).toContain('R&D Proposal');
  });

  it('handles null hypothesis in proposals', () => {
    const proposals = [{ id: 'p1', title: 'P1', hypothesis: null, signal_source: 'x', priority_score: 1 }];
    const payload = buildCombinedDecisionPayload([], proposals);

    expect(payload.questions[0].question).toContain('Hypothesis: N/A');
  });
});

describe('processRdProposalDecision', () => {
  it('updates status to accepted on Approve', async () => {
    const updateMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });
    const supabase = { from: vi.fn().mockReturnValue({ update: updateMock }) };

    const result = await processRdProposalDecision({ supabase, logger }, 'p1', 'Approve');

    expect(result).toBe('accepted');
    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({
      status: 'accepted',
      decided_by: 'chairman',
    }));
  });

  it('updates status to dismissed on Dismiss', async () => {
    const updateMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });
    const supabase = { from: vi.fn().mockReturnValue({ update: updateMock }) };

    const result = await processRdProposalDecision({ supabase, logger }, 'p1', 'Dismiss');

    expect(result).toBe('dismissed');
    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({
      status: 'dismissed',
    }));
  });

  it('returns deferred without DB update on Defer', async () => {
    const updateMock = vi.fn();
    const supabase = { from: vi.fn().mockReturnValue({ update: updateMock }) };

    const result = await processRdProposalDecision({ supabase, logger }, 'p1', 'Defer');

    expect(result).toBe('deferred');
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('includes decision_notes when provided', async () => {
    const updateMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });
    const supabase = { from: vi.fn().mockReturnValue({ update: updateMock }) };

    await processRdProposalDecision({ supabase, logger }, 'p1', 'Approve', 'Looks promising');

    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({
      decision_notes: 'Looks promising',
    }));
  });

  it('sets reviewed_at and decided_at timestamps', async () => {
    const updateMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });
    const supabase = { from: vi.fn().mockReturnValue({ update: updateMock }) };

    await processRdProposalDecision({ supabase, logger }, 'p1', 'Approve');

    const updateArg = updateMock.mock.calls[0][0];
    expect(updateArg.reviewed_at).toBeDefined();
    expect(updateArg.decided_at).toBeDefined();
    expect(new Date(updateArg.reviewed_at).toISOString()).toBe(updateArg.reviewed_at);
  });

  it('warns on DB update error', async () => {
    const updateMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: { message: 'connection lost' } }),
    });
    const supabase = { from: vi.fn().mockReturnValue({ update: updateMock }) };

    const result = await processRdProposalDecision({ supabase, logger }, 'p1', 'Approve');

    expect(result).toBe('accepted');
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('connection lost'));
  });
});
