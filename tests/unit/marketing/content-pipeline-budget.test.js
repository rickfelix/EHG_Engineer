/**
 * QF-20260707-848: content-pipeline.js checkBudget()/recordSpend() call signature mismatch.
 *
 * Both checkBudget and recordSpend in budget-governor.js take POSITIONAL args
 * (supabase, ventureId, platform, amount) but content-pipeline.js was calling them
 * with an object, silently turning "Step 1: Check budget" into dead code and
 * making spend-recording a silent no-op.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const checkBudget = vi.fn();
const recordSpend = vi.fn();
vi.mock('../../../lib/marketing/budget-governor.js', () => ({ checkBudget, recordSpend }));

const generateContent = vi.fn();
vi.mock('../../../lib/marketing/content-generator.js', () => ({ generateContent }));

const publish = vi.fn();
vi.mock('../../../lib/marketing/publisher/index.js', () => ({
  publish,
  getSupportedPlatforms: () => ['x', 'bluesky', 'email', 'google_ads'],
}));

vi.mock('../../../lib/marketing/utm.js', () => ({ generateUTMParams: () => ({}) }));

const { executePipeline } = await import('../../../lib/marketing/content-pipeline.js');

function fakeSupabase() {
  return { from: () => ({ upsert: () => Promise.resolve({ error: null }) }) };
}

describe('content-pipeline.js budget call signatures (QF-20260707-848)', () => {
  beforeEach(() => {
    checkBudget.mockReset();
    recordSpend.mockReset();
    generateContent.mockReset();
    publish.mockReset();
  });

  it('calls checkBudget with POSITIONAL args and halts the channel when disallowed', async () => {
    checkBudget.mockResolvedValue({ allowed: false, reason: 'Monthly budget exceeded' });

    const result = await executePipeline({
      supabase: fakeSupabase(),
      ventureId: 'v-1',
      ventureContext: { name: 'Acme', description: 'desc' },
      channelIds: ['email'],
    });

    expect(checkBudget).toHaveBeenCalledWith(expect.anything(), 'v-1', 'email');
    expect(generateContent).not.toHaveBeenCalled();
    expect(result.channels[0].status).toBe('failed');
    expect(result.channels[0].error).toBe('Monthly budget exceeded');
  });

  it('calls recordSpend with POSITIONAL args after a successful publish', async () => {
    checkBudget.mockResolvedValue({ allowed: true, budget: {} });
    generateContent.mockResolvedValue({ contentId: 'c-1', variants: [{ body: 'b', headline: 'h', cta: 'go' }] });
    // SD-LEO-INFRA-DEMAND-ENGINE-FAIL-001 FR-3: content-pipeline.js now also requires
    // mode:'real' (not bare success:true) before crediting a publish/recording spend.
    publish.mockResolvedValue({ success: true, mode: 'real' });

    await executePipeline({
      supabase: fakeSupabase(),
      ventureId: 'v-1',
      ventureContext: { name: 'Acme', description: 'desc' },
      channelIds: ['email'],
    });

    expect(recordSpend).toHaveBeenCalledWith(expect.anything(), 'v-1', 'email', 0);
  });

  it("SD-LEO-INFRA-DEMAND-ENGINE-FAIL-001 FR-3: a mock/denied publish (success:true, mode!='real') never records spend", async () => {
    checkBudget.mockResolvedValue({ allowed: true, budget: {} });
    generateContent.mockResolvedValue({ contentId: 'c-1', variants: [{ body: 'b', headline: 'h', cta: 'go' }] });
    publish.mockResolvedValue({ success: true, mode: 'mock', dryRun: true });

    const result = await executePipeline({
      supabase: fakeSupabase(),
      ventureId: 'v-1',
      ventureContext: { name: 'Acme', description: 'desc' },
      channelIds: ['email'],
    });

    expect(recordSpend).not.toHaveBeenCalled();
    expect(result.summary.totalPublished).toBe(0);
  });
});
