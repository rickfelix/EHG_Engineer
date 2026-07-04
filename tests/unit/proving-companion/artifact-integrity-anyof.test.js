/**
 * QF-20260703-439: stage 21's requiredArtifacts is anyOf, not AND -- a venture with
 * distribution_channel_config alone (no distribution_ad_copy) must pass the boundary.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockIn = vi.fn();
const mockEq = vi.fn();
const mockSelect = vi.fn();
const mockFrom = vi.fn();

vi.mock('../../../lib/supabase-client.js', () => ({
  createSupabaseServiceClient: () => ({ from: mockFrom }),
}));

let checkArtifactIntegrity;

beforeEach(async () => {
  vi.clearAllMocks();
  mockEq.mockReturnValue({ in: mockIn });
  mockSelect.mockReturnValue({ eq: mockEq });
  mockFrom.mockReturnValue({ select: mockSelect });
  ({ checkArtifactIntegrity } = await import('../../../lib/proving-companion/artifact-integrity-checker.js'));
});

function artifact(type, contentLength = 200, qualityScore = 80) {
  return { artifact_type: type, content: 'x'.repeat(contentLength), quality_score: qualityScore };
}

describe('checkArtifactIntegrity - stage 21 anyOf (QF-20260703-439)', () => {
  it('passes when ONLY distribution_channel_config exists (organic-only venture, no ad copy)', async () => {
    mockIn.mockResolvedValue({ data: [artifact('distribution_channel_config')], error: null });
    const results = await checkArtifactIntegrity('venture-1', 21, 21);
    const anyOfCheck = results['21'].checks.find((c) => c.name.startsWith('artifact_anyOf:'));
    expect(anyOfCheck.pass).toBe(true);
    expect(anyOfCheck.detail).toContain('distribution_channel_config');
    expect(results['21'].fail_count).toBe(0);
  });

  it('passes when ONLY distribution_ad_copy exists', async () => {
    mockIn.mockResolvedValue({ data: [artifact('distribution_ad_copy')], error: null });
    const results = await checkArtifactIntegrity('venture-1', 21, 21);
    expect(results['21'].checks.find((c) => c.name.startsWith('artifact_anyOf:')).pass).toBe(true);
  });

  it('fails when NEITHER distribution artifact exists', async () => {
    mockIn.mockResolvedValue({ data: [], error: null });
    const results = await checkArtifactIntegrity('venture-1', 21, 21);
    const anyOfCheck = results['21'].checks.find((c) => c.name.startsWith('artifact_anyOf:'));
    expect(anyOfCheck.pass).toBe(false);
    expect(anyOfCheck.detail).toContain('None of');
    expect(results['21'].fail_count).toBe(1);
  });

  it('does not count an anyOf group as satisfied by a low-quality/short-content artifact', async () => {
    mockIn.mockResolvedValue({ data: [artifact('distribution_channel_config', 10, null)], error: null });
    const results = await checkArtifactIntegrity('venture-1', 21, 21);
    expect(results['21'].checks.find((c) => c.name.startsWith('artifact_anyOf:')).pass).toBe(false);
  });
});
