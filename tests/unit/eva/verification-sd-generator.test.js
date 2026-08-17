import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isValidSdType } from '../../../lib/sd-type-enum.js';

const mockInsert = vi.fn().mockResolvedValue({ error: null });
const mockFrom = vi.fn(() => ({
  select: vi.fn().mockReturnValue({
    eq: vi.fn().mockReturnValue({
      single: vi.fn().mockResolvedValue({ data: { name: 'TestVenture' }, error: null }),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    }),
  }),
  insert: mockInsert,
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from: mockFrom,
  })),
}));

const { createVerificationSDs } = await import('../../../lib/eva/bridge/verification-sd-generator.js');

describe('Verification SD Generator', () => {
  const ventureId = '00000000-0000-0000-0000-000000000001';
  const syncData = {
    commitSha: 'abc1234def5678',
    branch: 'replit/sprint-1',
    repoUrl: 'https://github.com/rickfelix/test-venture',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockInsert.mockResolvedValue({ error: null });
    // Reset mockFrom to default behavior
    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: { name: 'TestVenture' }, error: null }),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      }),
      insert: mockInsert,
    }));
  });

  it('should create QA and Security verification SDs', async () => {
    const result = await createVerificationSDs(ventureId, syncData);

    expect(result.created).toHaveLength(2);
    expect(result.errors).toHaveLength(0);
    expect(result.created[0]).toContain('VERIFY-QA');
    expect(result.created[1]).toContain('VERIFY-SEC');
  });

  it('should include commit SHA in SD descriptions', async () => {
    await createVerificationSDs(ventureId, syncData);

    const insertCalls = mockInsert.mock.calls;
    expect(insertCalls.length).toBe(2);

    const qaSD = insertCalls[0][0];
    expect(qaSD.scope).toContain('abc1234def5678');
    expect(qaSD.title).toContain('abc1234');
    expect(qaSD.sd_type).toBe('bugfix');
    expect(qaSD.status).toBe('draft');
    expect(qaSD.venture_id).toBe(ventureId);
  });

  it('should set security SD with correct metadata', async () => {
    await createVerificationSDs(ventureId, syncData);

    const secSD = mockInsert.mock.calls[1][0];
    expect(secSD.category).toBe('security');
    expect(secSD.metadata.build_method).toBe('replit_agent');
    expect(secSD.metadata.source_commit).toBe('abc1234def5678');
  });

  it('should skip creation if SDs already exist', async () => {
    // Mock that SD already exists
    mockFrom.mockImplementation((table) => {
      if (table === 'ventures') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: { name: 'TestVenture' }, error: null }),
            }),
          }),
        };
      }
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: { sd_key: 'SD-VERIFY-QA-TESTVNTR-001', status: 'draft' },
              error: null,
            }),
          }),
        }),
        insert: mockInsert,
      };
    });

    const result = await createVerificationSDs(ventureId, syncData);

    // Should still report as created (idempotent) but not call insert
    expect(result.created).toHaveLength(2);
  });

  it('should include proper success_criteria for QA SD', async () => {
    await createVerificationSDs(ventureId, syncData);

    const qaSD = mockInsert.mock.calls[0][0];
    expect(qaSD.success_criteria).toHaveLength(3);
    expect(qaSD.success_criteria[0].criterion).toContain('Test suite');
    expect(qaSD.success_criteria[1].criterion).toContain('coverage');
  });

  it('should set high priority for verification SDs', async () => {
    await createVerificationSDs(ventureId, syncData);

    const qaSD = mockInsert.mock.calls[0][0];
    const secSD = mockInsert.mock.calls[1][0];
    expect(qaSD.priority).toBe('high');
    expect(secSD.priority).toBe('high');
  });

  // QF-20260817-079: both template sd_type literals drifted to the phantom key 'fix' (canonical
  // is 'bugfix') -- the same phantom-key class the A2 ultrareview QF fixed for vision-to-patterns.js
  // / threshold-resolver.js. Asserting CANONICAL SET MEMBERSHIP, not a hardcoded expected string,
  // so a future edit that reintroduces a phantom key (or a new template entry that never gets
  // updated) fails this test even if nobody remembers to update a literal 'bugfix' assertion here.
  it('every generated SD carries a canonical sd_type (drift-proof against phantom keys)', async () => {
    await createVerificationSDs(ventureId, syncData);

    const insertCalls = mockInsert.mock.calls;
    expect(insertCalls.length).toBe(2);
    for (const [payload] of insertCalls) {
      expect(isValidSdType(payload.sd_type), `sd_type "${payload.sd_type}" for ${payload.sd_key} is not in CANONICAL_SD_TYPES`).toBe(true);
    }
  });
});
