/**
 * Tests for SRIP Synthesis Engine Module
 * SD: SD-MAN-ORCH-SRIP-CLONER-INTEGRATION-001-C
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dotenv
vi.mock('dotenv', () => ({ default: { config: vi.fn() }, config: vi.fn() }));

// Mock Supabase
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from: vi.fn(),
  })),
}));

describe('SRIP Synthesis Engine', () => {
  let generateSynthesisPrompt,
    buildDesignSystemSection,
    buildLayoutSection,
    buildComponentsSection,
    buildBrandVoiceSection,
    buildTechnicalSection,
    assemblePromptText;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('../../../scripts/eva/srip/synthesis-engine.mjs');
    generateSynthesisPrompt = mod.generateSynthesisPrompt;
    buildDesignSystemSection = mod.buildDesignSystemSection;
    buildLayoutSection = mod.buildLayoutSection;
    buildComponentsSection = mod.buildComponentsSection;
    buildBrandVoiceSection = mod.buildBrandVoiceSection;
    buildTechnicalSection = mod.buildTechnicalSection;
    assemblePromptText = mod.assemblePromptText;
  });

  // ==========================================================================
  // Section Builders
  // ==========================================================================

  describe('buildDesignSystemSection', () => {
    it('uses brand overrides over DNA values', () => {
      const dnaJson = {
        design_tokens: {
          colors: { primary: '#000000', secondary: '#111111', accent: '#FF0000' },
          typography: { font_family: 'Arial' },
          spacing: ['4px', '8px'],
        },
      };
      const brand = { color_primary: '#3B82F6', color_secondary: '#10B981', typography_preference: 'Inter, sans-serif' };

      const section = buildDesignSystemSection(dnaJson, brand);

      expect(section.title).toBe('DESIGN_SYSTEM');
      expect(section.colors.primary).toBe('#3B82F6'); // brand override
      expect(section.colors.secondary).toBe('#10B981'); // brand override
      expect(section.colors.accent).toBe('#FF0000'); // DNA preserved
      expect(section.typography.font_family).toBe('Inter, sans-serif'); // brand override
      expect(section.spacing).toEqual(['4px', '8px']);
    });

    it('falls back to DNA values when brand has no overrides', () => {
      const dnaJson = {
        design_tokens: {
          colors: { primary: '#AABBCC' },
          typography: { font_family: 'Georgia, serif' },
        },
      };
      const brand = {};

      const section = buildDesignSystemSection(dnaJson, brand);

      expect(section.colors.primary).toBe('#AABBCC');
      expect(section.typography.font_family).toBe('Georgia, serif');
    });

    it('provides defaults when both DNA and brand are empty', () => {
      const section = buildDesignSystemSection({}, {});

      expect(section.colors.primary).toBe('#000000');
      expect(section.colors.background).toBe('#ffffff');
      expect(section.typography.font_family).toBe('system-ui, sans-serif');
      expect(section.spacing).toBeTruthy();
    });
  });

  describe('buildLayoutSection', () => {
    it('includes macro architecture and brand layout style', () => {
      const dnaJson = {
        macro_architecture: {
          grid_system: 'css-grid',
          responsive_approach: 'desktop-first',
          page_flow: 'two-column',
          sections: [{ name: 'header', layout_type: 'flex' }],
        },
        section_blueprints: {
          blueprints: [{ section_name: 'hero', layout: 'center-aligned' }],
        },
      };
      const brand = { layout_style: 'card-based', content_density: 'dense' };

      const section = buildLayoutSection(dnaJson, brand);

      expect(section.title).toBe('LAYOUT');
      expect(section.grid_system).toBe('css-grid');
      expect(section.layout_style).toBe('card-based');
      expect(section.content_density).toBe('dense');
      expect(section.sections).toHaveLength(1);
      expect(section.blueprints).toHaveLength(1);
    });
  });

  describe('buildComponentsSection', () => {
    it('includes component behaviors and CTA style', () => {
      const dnaJson = {
        component_behaviors: {
          components: [
            { type: 'button', variants: ['primary', 'ghost'] },
            { type: 'card', variants: ['default'] },
          ],
        },
      };
      const brand = { call_to_action_style: 'floating CTAs' };

      const section = buildComponentsSection(dnaJson, brand);

      expect(section.title).toBe('COMPONENTS');
      expect(section.call_to_action_style).toBe('floating CTAs');
      expect(section.components).toHaveLength(2);
    });
  });

  describe('buildBrandVoiceSection', () => {
    it('populates all brand voice fields', () => {
      const brand = {
        brand_name: 'Acme',
        tagline: 'Building tomorrow',
        tone_of_voice: 'authoritative',
        target_audience: 'CTOs',
        imagery_style: 'illustrations',
        competitive_positioning: 'Most reliable platform',
      };

      const section = buildBrandVoiceSection(brand);

      expect(section.title).toBe('BRAND_VOICE');
      expect(section.brand_name).toBe('Acme');
      expect(section.tagline).toBe('Building tomorrow');
      expect(section.tone_of_voice).toBe('authoritative');
      expect(section.target_audience).toBe('CTOs');
      expect(section.imagery_style).toBe('illustrations');
      expect(section.competitive_positioning).toBe('Most reliable platform');
    });

    it('provides defaults for missing brand data', () => {
      const section = buildBrandVoiceSection({});

      expect(section.brand_name).toBe('Unnamed Brand');
      expect(section.tone_of_voice).toBe('professional');
      expect(section.imagery_style).toBe('photography');
      expect(section.tagline).toBeNull();
    });
  });

  describe('buildTechnicalSection', () => {
    it('uses detected tech stack', () => {
      const dnaJson = {
        tech_stack: {
          framework: 'Next.js',
          css_approach: 'Tailwind',
          build_tool: 'Webpack',
          key_libraries: ['framer-motion', 'zustand'],
          rendering: 'SSR',
        },
      };

      const section = buildTechnicalSection(dnaJson);

      expect(section.title).toBe('TECHNICAL');
      expect(section.framework).toBe('Next.js');
      expect(section.css_approach).toBe('Tailwind');
      expect(section.key_libraries).toEqual(['framer-motion', 'zustand']);
      expect(section.rendering).toBe('SSR');
    });

    it('provides defaults when no tech stack detected', () => {
      const section = buildTechnicalSection({});

      expect(section.framework).toBe('React');
      expect(section.css_approach).toBe('Tailwind');
      expect(section.build_tool).toBe('Vite');
      expect(section.rendering).toBe('CSR');
    });
  });

  // ==========================================================================
  // Prompt Assembly
  // ==========================================================================

  describe('assemblePromptText', () => {
    it('includes all section titles in the output', () => {
      const sections = [
        buildDesignSystemSection({}, {}),
        buildLayoutSection({}, {}),
        buildComponentsSection({}, {}),
        buildBrandVoiceSection({}),
        buildTechnicalSection({}),
      ];

      const prompt = assemblePromptText(sections);

      expect(prompt).toContain('## DESIGN_SYSTEM');
      expect(prompt).toContain('## LAYOUT');
      expect(prompt).toContain('## COMPONENTS');
      expect(prompt).toContain('## BRAND_VOICE');
      expect(prompt).toContain('## TECHNICAL');
    });

    it('includes the header and generation timestamp', () => {
      const prompt = assemblePromptText([buildBrandVoiceSection({})]);

      expect(prompt).toContain('# SITE REPLICATION PROMPT');
      expect(prompt).toContain('# Generated by SRIP Synthesis Engine');
      expect(prompt).toContain('# Generated at:');
    });

    it('renders array data as list items', () => {
      const section = {
        title: 'TEST',
        instructions: 'Test section.',
        items: ['item1', 'item2', 'item3'],
      };

      const prompt = assemblePromptText([section]);

      expect(prompt).toContain('- item1');
      expect(prompt).toContain('- item2');
      expect(prompt).toContain('- item3');
    });

    it('renders object data with sub-keys', () => {
      const section = {
        title: 'TEST',
        instructions: 'Test section.',
        colors: {
          primary: '#FF0000',
          secondary: '#00FF00',
        },
      };

      const prompt = assemblePromptText([section]);

      expect(prompt).toContain('primary: #FF0000');
      expect(prompt).toContain('secondary: #00FF00');
    });

    it('skips null values', () => {
      const section = {
        title: 'TEST',
        instructions: 'Test section.',
        present: 'yes',
        absent: null,
      };

      const prompt = assemblePromptText([section]);

      expect(prompt).toContain('present');
      expect(prompt).not.toContain('absent');
    });
  });

  // ==========================================================================
  // Token Count Estimation
  // ==========================================================================

  describe('token count estimation', () => {
    it('estimates roughly 4 chars per token', () => {
      const sections = [
        buildDesignSystemSection({}, {}),
        buildLayoutSection({}, {}),
        buildComponentsSection({}, {}),
        buildBrandVoiceSection({}),
        buildTechnicalSection({}),
      ];

      const prompt = assemblePromptText(sections);
      const estimated = Math.ceil(prompt.length / 4);

      // Token count should be reasonable (prompt is non-trivial)
      expect(estimated).toBeGreaterThan(100);
      expect(estimated).toBeLessThan(10000);
    });
  });

  // ==========================================================================
  // generateSynthesisPrompt (integration with mock DB)
  // ==========================================================================

  describe('generateSynthesisPrompt', () => {
    function buildMockSupabase({ siteDna, interview, insertResult }) {
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
          if (table === 'srip_brand_interviews') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: interview,
                    error: interview ? null : { message: 'not found' },
                  }),
                }),
              }),
            };
          }
          if (table === 'srip_synthesis_prompts') {
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

    const fullDna = {
      id: 'dna-1',
      venture_id: 'ven-1',
      reference_url: 'https://example.com',
      quality_score: 83,
      dna_json: {
        macro_architecture: {
          grid_system: 'flexbox',
          responsive_approach: 'mobile-first',
          page_flow: 'hero-sections',
          sections: [{ name: 'hero' }, { name: 'features' }],
        },
        design_tokens: {
          colors: { primary: '#1a1a1a', secondary: '#4f46e5', accent: '#f59e0b', background: '#ffffff', text: '#111827' },
          typography: { font_family: 'Inter, sans-serif', size_scale: ['14px', '16px', '24px', '48px'] },
          spacing: ['8px', '16px', '32px', '64px'],
        },
        section_blueprints: {
          blueprints: [{ section_name: 'hero', layout: 'center-aligned' }],
        },
        component_behaviors: {
          components: [{ type: 'button', variants: ['primary', 'secondary'] }],
        },
        visual_composition: { whitespace: 'generous' },
        tech_stack: {
          framework: 'Next.js',
          css_approach: 'Tailwind',
          build_tool: 'Webpack',
          key_libraries: ['framer-motion'],
          rendering: 'SSR',
        },
      },
    };

    const fullInterview = {
      id: 'interview-1',
      venture_id: 'ven-1',
      answers: {
        brand_name: 'TestCo',
        tagline: 'Ship faster',
        tone_of_voice: 'professional',
        target_audience: 'developers',
        color_primary: '#3B82F6',
        color_secondary: '#10B981',
        typography_preference: 'Roboto, sans-serif',
        layout_style: 'minimal',
        content_density: 'sparse',
        call_to_action_style: 'bold buttons',
        imagery_style: 'illustrations',
        competitive_positioning: 'Developer-first',
      },
      pre_populated_count: 12,
      manual_input_count: 0,
      status: 'completed',
    };

    it('generates prompt with all 5 sections from full data', async () => {
      const supabase = buildMockSupabase({
        siteDna: fullDna,
        interview: fullInterview,
        insertResult: {
          data: [{
            id: 'synth-1',
            version: 1,
            token_count: 500,
            fidelity_target: 100,
            status: 'active',
          }],
          error: null,
        },
      });

      const result = await generateSynthesisPrompt({
        siteDnaId: 'dna-1',
        brandInterviewId: 'interview-1',
        supabase,
      });

      expect(result).not.toBeNull();
      expect(result.id).toBe('synth-1');
      expect(result.version).toBe(1);
      expect(result.status).toBe('active');
      expect(result.token_count).toBeGreaterThan(0);
    });

    it('returns null when site DNA is missing', async () => {
      const supabase = buildMockSupabase({
        siteDna: null,
        interview: fullInterview,
        insertResult: { data: [], error: null },
      });

      const result = await generateSynthesisPrompt({
        siteDnaId: 'missing',
        brandInterviewId: 'interview-1',
        supabase,
      });

      expect(result).toBeNull();
    });

    it('returns null when brand interview is missing', async () => {
      const supabase = buildMockSupabase({
        siteDna: fullDna,
        interview: null,
        insertResult: { data: [], error: null },
      });

      const result = await generateSynthesisPrompt({
        siteDnaId: 'dna-1',
        brandInterviewId: 'missing',
        supabase,
      });

      expect(result).toBeNull();
    });

    it('returns null on DB insert failure', async () => {
      const supabase = buildMockSupabase({
        siteDna: fullDna,
        interview: fullInterview,
        insertResult: {
          data: null,
          error: { message: 'unique constraint violation' },
        },
      });

      const result = await generateSynthesisPrompt({
        siteDnaId: 'dna-1',
        brandInterviewId: 'interview-1',
        supabase,
      });

      expect(result).toBeNull();
    });

    it('handles empty DNA and empty interview gracefully', async () => {
      const supabase = buildMockSupabase({
        siteDna: { id: 'dna-empty', venture_id: null, dna_json: {}, reference_url: null, quality_score: 0 },
        interview: { id: 'int-empty', venture_id: null, answers: {}, pre_populated_count: 0, manual_input_count: 12, status: 'draft' },
        insertResult: {
          data: [{
            id: 'synth-empty',
            version: 1,
            token_count: 200,
            fidelity_target: 0,
            status: 'active',
          }],
          error: null,
        },
      });

      const result = await generateSynthesisPrompt({
        siteDnaId: 'dna-empty',
        brandInterviewId: 'int-empty',
        supabase,
      });

      expect(result).not.toBeNull();
      expect(result.fidelity_target).toBe(0);
    });

    it('stores prompt with status active and version 1', async () => {
      const supabase = buildMockSupabase({
        siteDna: fullDna,
        interview: fullInterview,
        insertResult: {
          data: [{
            id: 'synth-2',
            version: 1,
            token_count: 600,
            fidelity_target: 100,
            status: 'active',
          }],
          error: null,
        },
      });

      const result = await generateSynthesisPrompt({
        siteDnaId: 'dna-1',
        brandInterviewId: 'interview-1',
        supabase,
      });

      expect(result.version).toBe(1);
      expect(result.status).toBe('active');
      // Verify insert was called on correct table
      expect(supabase.from).toHaveBeenCalledWith('srip_synthesis_prompts');
    });
  });
});
