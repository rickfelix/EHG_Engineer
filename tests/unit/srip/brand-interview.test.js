/**
 * Tests for SRIP Brand Interview Module
 * SD: SD-MAN-ORCH-SRIP-CLONER-INTEGRATION-001-C
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dotenv
vi.mock('dotenv', () => ({ default: { config: vi.fn() }, config: vi.fn() }));

// Mock Supabase
const mockFrom = vi.fn();
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from: mockFrom,
  })),
}));

describe('SRIP Brand Interview', () => {
  let BRAND_QUESTIONS, prePopulateFromVenture, runBrandInterview;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('../../../scripts/eva/srip/brand-interview.mjs');
    BRAND_QUESTIONS = mod.BRAND_QUESTIONS;
    prePopulateFromVenture = mod.prePopulateFromVenture;
    runBrandInterview = mod.runBrandInterview;
  });

  // ==========================================================================
  // Question Definitions
  // ==========================================================================

  describe('BRAND_QUESTIONS', () => {
    it('defines exactly 12 questions', () => {
      expect(BRAND_QUESTIONS).toHaveLength(12);
    });

    it('has all required question keys', () => {
      const keys = BRAND_QUESTIONS.map(q => q.key);
      expect(keys).toContain('brand_name');
      expect(keys).toContain('tagline');
      expect(keys).toContain('tone_of_voice');
      expect(keys).toContain('target_audience');
      expect(keys).toContain('color_primary');
      expect(keys).toContain('color_secondary');
      expect(keys).toContain('typography_preference');
      expect(keys).toContain('layout_style');
      expect(keys).toContain('content_density');
      expect(keys).toContain('call_to_action_style');
      expect(keys).toContain('imagery_style');
      expect(keys).toContain('competitive_positioning');
    });

    it('each question has key, label, and hint', () => {
      for (const q of BRAND_QUESTIONS) {
        expect(q.key).toBeTruthy();
        expect(q.label).toBeTruthy();
        expect(q.hint).toBeTruthy();
      }
    });

    it('has unique keys', () => {
      const keys = BRAND_QUESTIONS.map(q => q.key);
      expect(new Set(keys).size).toBe(keys.length);
    });
  });

  // ==========================================================================
  // Pre-Population
  // ==========================================================================

  describe('prePopulateFromVenture', () => {
    function buildMockSupabase(visionDocs, archPlans) {
      return {
        from: vi.fn((table) => {
          if (table === 'eva_vision_documents') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  order: vi.fn().mockReturnValue({
                    limit: vi.fn().mockResolvedValue({
                      data: visionDocs,
                      error: null,
                    }),
                  }),
                }),
              }),
            };
          }
          if (table === 'eva_architecture_plans') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  order: vi.fn().mockReturnValue({
                    limit: vi.fn().mockResolvedValue({
                      data: archPlans,
                      error: null,
                    }),
                  }),
                }),
              }),
            };
          }
          return {};
        }),
      };
    }

    it('extracts brand data from vision docs with rich content', async () => {
      const visionDocs = [{
        vision_key: 'vis-001',
        content: `
          Brand: Acme Corp
          Tagline: "Building the future of work"
          Target Audience: enterprise developers
          Our professional tone appeals to technical users.
          Primary color: #3B82F6, secondary: #10B981
          We use modern sans-serif typography like Inter.
          The layout is minimal with generous whitespace.
          Bold button CTAs drive conversion.
          Photography-driven imagery.
          Our competitive differentiation is AI-powered automation.
        `,
        metadata: null,
      }];

      const supabase = buildMockSupabase(visionDocs, []);
      const answers = await prePopulateFromVenture('venture-123', supabase);

      expect(answers.brand_name).toBe('Acme Corp');
      expect(answers.tagline).toBe('Building the future of work');
      expect(answers.tone_of_voice).toBe('professional');
      expect(answers.target_audience).toContain('enterprise developer');
      expect(answers.color_primary).toBe('#3B82F6');
      expect(answers.color_secondary).toBe('#10B981');
      expect(answers.typography_preference).toBe('modern sans-serif');
      expect(answers.layout_style).toBe('minimal');
      expect(answers.call_to_action_style).toBe('bold buttons');
      expect(answers.imagery_style).toBe('photography');
      expect(answers.competitive_positioning).toBeTruthy();
    });

    it('returns empty answers when ventureId is null', async () => {
      const supabase = buildMockSupabase([], []);
      const answers = await prePopulateFromVenture(null, supabase);
      expect(answers).toEqual({});
    });

    it('returns empty answers when no docs exist', async () => {
      const supabase = buildMockSupabase([], []);
      const answers = await prePopulateFromVenture('venture-empty', supabase);
      expect(answers).toEqual({});
    });

    it('handles database errors gracefully', async () => {
      const supabase = {
        from: vi.fn(() => ({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue({
                  data: null,
                  error: { message: 'connection timeout' },
                }),
              }),
            }),
          }),
        })),
      };

      const answers = await prePopulateFromVenture('venture-err', supabase);
      // Should return empty (graceful), not throw
      expect(answers).toEqual({});
    });

    it('extracts colors from architecture plan content', async () => {
      const archPlans = [{
        plan_key: 'arch-001',
        content: 'The design system uses primary=#FF6600 and secondary=#0066FF for brand consistency.',
        metadata: null,
      }];

      const supabase = buildMockSupabase([], archPlans);
      const answers = await prePopulateFromVenture('venture-colors', supabase);

      expect(answers.color_primary).toBe('#FF6600');
      expect(answers.color_secondary).toBe('#0066FF');
    });

    it('detects tone from metadata as well as content', async () => {
      const visionDocs = [{
        vision_key: 'vis-002',
        content: 'A simple product page.',
        metadata: { brand_style: 'playful and fun with vibrant colors' },
      }];

      const supabase = buildMockSupabase(visionDocs, []);
      const answers = await prePopulateFromVenture('venture-meta', supabase);

      expect(answers.tone_of_voice).toBe('playful');
    });
  });

  // ==========================================================================
  // runBrandInterview
  // ==========================================================================

  describe('runBrandInterview', () => {
    function buildFullMockSupabase({ siteDna, visionDocs = [], archPlans = [], insertResult }) {
      return {
        from: vi.fn((table) => {
          if (table === 'srip_site_dna') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: siteDna,
                    error: siteDna ? null : { message: 'not found' },
                  }),
                }),
              }),
            };
          }
          if (table === 'eva_vision_documents') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  order: vi.fn().mockReturnValue({
                    limit: vi.fn().mockResolvedValue({
                      data: visionDocs,
                      error: null,
                    }),
                  }),
                }),
              }),
            };
          }
          if (table === 'eva_architecture_plans') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  order: vi.fn().mockReturnValue({
                    limit: vi.fn().mockResolvedValue({
                      data: archPlans,
                      error: null,
                    }),
                  }),
                }),
              }),
            };
          }
          if (table === 'srip_brand_interviews') {
            return {
              insert: vi.fn().mockReturnValue({
                select: vi.fn().mockResolvedValue(insertResult),
              }),
            };
          }
          return {};
        }),
      };
    }

    it('stores interview with pre-populated and manual counts', async () => {
      const supabase = buildFullMockSupabase({
        siteDna: {
          id: 'dna-1',
          venture_id: 'ven-1',
          dna_json: {
            design_tokens: {
              colors: { primary: '#111111', secondary: '#222222' },
              typography: { font_family: 'Roboto, sans-serif' },
            },
          },
          reference_url: 'https://example.com',
          status: 'completed',
        },
        visionDocs: [{
          vision_key: 'v1',
          content: 'Brand: TestBrand\nTagline: "We build things"\nTarget audience: startups',
          metadata: null,
        }],
        insertResult: {
          data: [{
            id: 'interview-1',
            status: 'draft',
            pre_populated_count: 6,
            manual_input_count: 6,
          }],
          error: null,
        },
      });

      const result = await runBrandInterview({
        siteDnaId: 'dna-1',
        supabase,
      });

      expect(result).not.toBeNull();
      expect(result.id).toBe('interview-1');
      // Verify insert was called on srip_brand_interviews
      expect(supabase.from).toHaveBeenCalledWith('srip_brand_interviews');
    });

    it('returns null when site DNA is not found', async () => {
      const supabase = buildFullMockSupabase({
        siteDna: null,
        insertResult: { data: [], error: null },
      });

      const result = await runBrandInterview({
        siteDnaId: 'nonexistent',
        supabase,
      });

      expect(result).toBeNull();
    });

    it('auto-detects venture_id from site DNA', async () => {
      const supabase = buildFullMockSupabase({
        siteDna: {
          id: 'dna-2',
          venture_id: 'auto-ven',
          dna_json: {},
          reference_url: 'https://test.com',
          status: 'completed',
        },
        insertResult: {
          data: [{
            id: 'interview-2',
            status: 'draft',
            pre_populated_count: 0,
            manual_input_count: 12,
          }],
          error: null,
        },
      });

      const result = await runBrandInterview({
        siteDnaId: 'dna-2',
        // no ventureId provided — should use site_dna.venture_id
        supabase,
      });

      expect(result).not.toBeNull();
      expect(result.manual_input_count).toBe(12);
    });

    it('returns null on DB insert failure', async () => {
      const supabase = buildFullMockSupabase({
        siteDna: {
          id: 'dna-3',
          venture_id: null,
          dna_json: {},
          reference_url: 'https://fail.com',
          status: 'completed',
        },
        insertResult: {
          data: null,
          error: { message: 'insert failed' },
        },
      });

      const result = await runBrandInterview({
        siteDnaId: 'dna-3',
        supabase,
      });

      expect(result).toBeNull();
    });

    it('enriches answers from DNA design_tokens when venture has no docs', async () => {
      const supabase = buildFullMockSupabase({
        siteDna: {
          id: 'dna-4',
          venture_id: 'ven-no-docs',
          dna_json: {
            design_tokens: {
              colors: { primary: '#AABBCC', secondary: '#DDEEFF' },
              typography: { font_family: 'Fira Code, monospace' },
            },
          },
          reference_url: 'https://dna-only.com',
          status: 'completed',
        },
        visionDocs: [],
        archPlans: [],
        insertResult: {
          data: [{
            id: 'interview-4',
            status: 'draft',
            pre_populated_count: 3,
            manual_input_count: 9,
          }],
          error: null,
        },
      });

      const result = await runBrandInterview({
        siteDnaId: 'dna-4',
        supabase,
      });

      expect(result).not.toBeNull();
      // DNA colors + typography should contribute to pre_populated_count
      expect(result.pre_populated_count).toBe(3);
    });
  });
});
