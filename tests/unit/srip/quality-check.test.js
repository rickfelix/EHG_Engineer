/**
 * Tests for SRIP Quality Check Module
 * SD: SD-MAN-ORCH-SRIP-CLONER-INTEGRATION-001-D
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

describe('SRIP Quality Check', () => {
  let scoreLayout,
    scoreVisualComposition,
    scoreDesignSystem,
    scoreInteraction,
    scoreTechnical,
    scoreAccessibility,
    runQualityCheck;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('../../../scripts/eva/srip/quality-check.mjs');
    scoreLayout = mod.scoreLayout;
    scoreVisualComposition = mod.scoreVisualComposition;
    scoreDesignSystem = mod.scoreDesignSystem;
    scoreInteraction = mod.scoreInteraction;
    scoreTechnical = mod.scoreTechnical;
    scoreAccessibility = mod.scoreAccessibility;
    runQualityCheck = mod.runQualityCheck;
  });

  // ==========================================================================
  // scoreLayout
  // ==========================================================================

  describe('scoreLayout', () => {
    it('returns high score for prompt with full layout specs', () => {
      const text = `
        ## LAYOUT
        Use a CSS grid system with flexbox for the header section.
        The hero and sidebar columns use a responsive desktop-first approach
        with mobile breakpoint at 768px. Footer row spans full width.
      `;
      const result = scoreLayout(text, {});
      expect(result.score).toBeGreaterThanOrEqual(50);
      expect(result.gaps).toHaveLength(0);
    });

    it('returns 0 and gaps for empty prompt text', () => {
      const result = scoreLayout('', {});
      expect(result.score).toBe(0);
      expect(result.gaps.length).toBeGreaterThan(0);
      expect(result.gaps).toContain('No grid system specified (grid, flexbox, or css-grid)');
      expect(result.gaps).toContain('No page sections defined (header, footer, hero, sidebar)');
      expect(result.gaps).toContain('No responsive strategy mentioned');
    });

    it('identifies missing responsive strategy', () => {
      const text = 'Use grid layout with header and footer sections.';
      const result = scoreLayout(text, {});
      expect(result.gaps).toContain('No responsive strategy mentioned');
    });

    it('identifies missing page sections', () => {
      const text = 'Use a responsive grid with mobile breakpoint.';
      const result = scoreLayout(text, {});
      expect(result.gaps).toContain('No page sections defined (header, footer, hero, sidebar)');
    });
  });

  // ==========================================================================
  // scoreVisualComposition
  // ==========================================================================

  describe('scoreVisualComposition', () => {
    it('returns high score for prompt with visual hierarchy and whitespace', () => {
      const text = `
        The visual hierarchy has a primary focal point at the hero heading.
        Use generous whitespace with consistent spacing and padding.
        Center alignment for the main content with balanced composition and visual weight.
        Maintain contrast between sections using margin.
      `;
      const result = scoreVisualComposition(text, {});
      expect(result.score).toBeGreaterThanOrEqual(50);
      expect(result.gaps).toHaveLength(0);
    });

    it('returns 0 and gaps for empty prompt text', () => {
      const result = scoreVisualComposition('', {});
      expect(result.score).toBe(0);
      expect(result.gaps.length).toBeGreaterThan(0);
      expect(result.gaps).toContain('No visual hierarchy or focal point defined');
      expect(result.gaps).toContain('No whitespace or spacing strategy specified');
      expect(result.gaps).toContain('No alignment approach specified');
    });

    it('identifies missing alignment', () => {
      const text = 'Use generous whitespace with visual hierarchy and focal points.';
      const result = scoreVisualComposition(text, {});
      expect(result.gaps).toContain('No alignment approach specified');
    });
  });

  // ==========================================================================
  // scoreDesignSystem
  // ==========================================================================

  describe('scoreDesignSystem', () => {
    it('returns high score for prompt with full design tokens', () => {
      const text = `
        ## DESIGN_SYSTEM
        Design system tokens:
        - primary color: #3B82F6, secondary: #10B981, accent: #F59E0B, background: #FFF
        - font family: Inter, typography weights: 400, 600, 700
        - size scale: 14px, 16px, 24px
        - spacing: 4px, 8px, 16px
        - border radius: 4px, 8px
        - shadow: 0 1px 3px rgba(0,0,0,0.1)
        - token-based design system approach
      `;
      const result = scoreDesignSystem(text, {});
      expect(result.score).toBeGreaterThanOrEqual(50);
      expect(result.gaps).toHaveLength(0);
    });

    it('returns 0 and gaps for empty prompt text', () => {
      const result = scoreDesignSystem('', {});
      expect(result.score).toBe(0);
      expect(result.gaps.length).toBeGreaterThan(0);
      expect(result.gaps).toContain('No color tokens defined');
      expect(result.gaps).toContain('No typography tokens defined');
      expect(result.gaps).toContain('No spacing or shape tokens defined');
    });

    it('identifies missing typography', () => {
      const text = 'Primary color: #FF0000 with generous spacing and border radius.';
      const result = scoreDesignSystem(text, {});
      expect(result.gaps).toContain('No typography tokens defined');
    });
  });

  // ==========================================================================
  // scoreInteraction
  // ==========================================================================

  describe('scoreInteraction', () => {
    it('returns high score for prompt with component behaviors and states', () => {
      const text = `
        ## COMPONENTS
        Interactive components include button, input, form, and modal elements.
        Component states: hover, active, focus, disabled.
        Use subtle animation and transition for state changes.
        Click events on interactive dropdown and tooltip components.
      `;
      const result = scoreInteraction(text, {});
      expect(result.score).toBeGreaterThanOrEqual(50);
      expect(result.gaps).toHaveLength(0);
    });

    it('returns 0 and gaps for empty prompt text', () => {
      const result = scoreInteraction('', {});
      expect(result.score).toBe(0);
      expect(result.gaps.length).toBeGreaterThan(0);
      expect(result.gaps).toContain('No interactive components specified');
      expect(result.gaps).toContain('No component states defined (hover, active, focus, disabled)');
      expect(result.gaps).toContain('No animation or transition behavior specified');
    });

    it('identifies missing states', () => {
      const text = 'Button and modal components with animation transitions.';
      const result = scoreInteraction(text, {});
      expect(result.gaps).toContain('No component states defined (hover, active, focus, disabled)');
    });
  });

  // ==========================================================================
  // scoreTechnical
  // ==========================================================================

  describe('scoreTechnical', () => {
    it('returns high score for prompt with full tech stack', () => {
      const text = `
        ## TECHNICAL
        Framework: Next.js (React-based) with TypeScript.
        CSS approach: Tailwind CSS with module-level styles.
        Build tool: Webpack / Vite.
        Rendering: SSR with CSR fallback.
        JavaScript and sass support included.
      `;
      const result = scoreTechnical(text, {});
      expect(result.score).toBeGreaterThanOrEqual(50);
      expect(result.gaps).toHaveLength(0);
    });

    it('returns 0 and gaps for empty prompt text', () => {
      const result = scoreTechnical('', {});
      expect(result.score).toBe(0);
      expect(result.gaps.length).toBeGreaterThan(0);
      expect(result.gaps).toContain('No frontend framework specified');
      expect(result.gaps).toContain('No CSS approach specified');
      expect(result.gaps).toContain('No build tool specified');
    });

    it('identifies missing CSS approach', () => {
      const text = 'Use React framework with Webpack build tool and SSR rendering.';
      const result = scoreTechnical(text, {});
      expect(result.gaps).toContain('No CSS approach specified');
    });
  });

  // ==========================================================================
  // scoreAccessibility
  // ==========================================================================

  describe('scoreAccessibility', () => {
    it('returns high score for prompt with accessibility specs', () => {
      const text = `
        Ensure alt text on all images. Use ARIA role and label attributes.
        Maintain WCAG contrast ratios. A11y audit passes required.
        Support keyboard tab navigation and focus indicators.
        Semantic HTML with landmark regions for screen reader users.
        Accessible design throughout.
      `;
      const result = scoreAccessibility(text, {});
      expect(result.score).toBeGreaterThanOrEqual(50);
      expect(result.gaps).toHaveLength(0);
    });

    it('returns 0 and gaps for empty prompt text', () => {
      const result = scoreAccessibility('', {});
      expect(result.score).toBe(0);
      expect(result.gaps.length).toBeGreaterThan(0);
      expect(result.gaps).toContain('No alt text or ARIA attributes mentioned');
      expect(result.gaps).toContain('No contrast or WCAG compliance mentioned');
      expect(result.gaps).toContain('No keyboard navigation or screen reader support mentioned');
    });

    it('identifies missing keyboard navigation', () => {
      const text = 'Ensure alt text on images with WCAG contrast compliance.';
      const result = scoreAccessibility(text, {});
      expect(result.gaps).toContain('No keyboard navigation or screen reader support mentioned');
    });
  });

  // ==========================================================================
  // Overall Score Calculation
  // ==========================================================================

  describe('overall score calculation', () => {
    it('averages 6 domain scores correctly', () => {
      // Prompt with good coverage across all domains
      const fullPrompt = `
        grid flexbox responsive mobile header footer hero section column row desktop breakpoint sidebar css-grid layout
        hierarchy focal contrast whitespace spacing padding margin alignment center composition weight visual rhythm left-aligned right-aligned
        color primary secondary accent background font typography size weight spacing border radius shadow token design system
        button input form modal hover active focus disabled animation transition motion click component interactive tooltip accordion dropdown
        react tailwind css vite webpack build ssr csr framework next.js typescript javascript sass styled module rendering ssg vue angular svelte
        alt aria role label contrast wcag a11y accessible keyboard tab focus screen reader semantic landmark alt text
      `;
      const layoutResult = scoreLayout(fullPrompt, {});
      const visualResult = scoreVisualComposition(fullPrompt, {});
      const designResult = scoreDesignSystem(fullPrompt, {});
      const interactionResult = scoreInteraction(fullPrompt, {});
      const technicalResult = scoreTechnical(fullPrompt, {});
      const accessibilityResult = scoreAccessibility(fullPrompt, {});

      const scores = [
        layoutResult.score,
        visualResult.score,
        designResult.score,
        interactionResult.score,
        technicalResult.score,
        accessibilityResult.score,
      ];
      const expectedAvg = Math.round(scores.reduce((s, v) => s + v, 0) / 6);

      // All domains should score high (>= 90) and average correctly
      for (const s of scores) {
        expect(s).toBeGreaterThanOrEqual(90);
      }
      expect(expectedAvg).toBe(Math.round(scores.reduce((s, v) => s + v, 0) / 6));
    });

    it('averages to 0 for empty prompt', () => {
      const scores = [
        scoreLayout('', {}).score,
        scoreVisualComposition('', {}).score,
        scoreDesignSystem('', {}).score,
        scoreInteraction('', {}).score,
        scoreTechnical('', {}).score,
        scoreAccessibility('', {}).score,
      ];
      const avg = Math.round(scores.reduce((s, v) => s + v, 0) / 6);
      expect(avg).toBe(0);
    });
  });

  // ==========================================================================
  // Gap Aggregation
  // ==========================================================================

  describe('gap aggregation', () => {
    it('aggregates gaps from all domains for empty prompt', () => {
      const allGaps = [];
      const domains = [
        { key: 'layout', fn: scoreLayout },
        { key: 'visual_composition', fn: scoreVisualComposition },
        { key: 'design_system', fn: scoreDesignSystem },
        { key: 'interaction', fn: scoreInteraction },
        { key: 'technical', fn: scoreTechnical },
        { key: 'accessibility', fn: scoreAccessibility },
      ];

      for (const { key, fn } of domains) {
        const result = fn('', {});
        for (const gap of result.gaps) {
          allGaps.push({ domain: key, gap });
        }
      }

      // Each domain produces 3 gaps for empty input = 18 total
      expect(allGaps).toHaveLength(18);
      // Each gap has domain and gap text
      for (const g of allGaps) {
        expect(g.domain).toBeTruthy();
        expect(g.gap).toBeTruthy();
      }
    });

    it('produces zero gaps for full-coverage prompt', () => {
      const fullPrompt = `
        grid flexbox responsive mobile header footer hero section column row desktop breakpoint sidebar css-grid layout
        hierarchy focal contrast whitespace spacing padding margin alignment center composition weight visual rhythm left-aligned
        color primary secondary accent background font typography size weight spacing border radius shadow token design system
        button input form modal hover active focus disabled animation transition motion click component interactive tooltip accordion dropdown
        react tailwind css vite webpack build ssr csr framework next.js typescript javascript sass styled module rendering ssg
        alt aria role label contrast wcag a11y accessible keyboard tab focus screen reader semantic landmark alt text
      `;
      const allGaps = [];
      const domains = [
        { key: 'layout', fn: scoreLayout },
        { key: 'visual_composition', fn: scoreVisualComposition },
        { key: 'design_system', fn: scoreDesignSystem },
        { key: 'interaction', fn: scoreInteraction },
        { key: 'technical', fn: scoreTechnical },
        { key: 'accessibility', fn: scoreAccessibility },
      ];

      for (const { key, fn } of domains) {
        const result = fn(fullPrompt, {});
        for (const gap of result.gaps) {
          allGaps.push({ domain: key, gap });
        }
      }

      expect(allGaps).toHaveLength(0);
    });
  });

  // ==========================================================================
  // Pass/Fail Determination
  // ==========================================================================

  describe('pass/fail determination', () => {
    it('passes when overall score >= 70', () => {
      const fullPrompt = `
        grid flexbox responsive mobile header footer hero section column row desktop breakpoint sidebar css-grid layout
        hierarchy focal contrast whitespace spacing padding margin alignment center composition weight visual rhythm left-aligned
        color primary secondary accent background font typography size weight spacing border radius shadow token design system
        button input form modal hover active focus disabled animation transition motion click component interactive tooltip accordion dropdown
        react tailwind css vite webpack build ssr csr framework next.js typescript javascript sass styled module rendering ssg
        alt aria role label contrast wcag a11y accessible keyboard tab focus screen reader semantic landmark alt text
      `;
      const scores = [
        scoreLayout(fullPrompt, {}).score,
        scoreVisualComposition(fullPrompt, {}).score,
        scoreDesignSystem(fullPrompt, {}).score,
        scoreInteraction(fullPrompt, {}).score,
        scoreTechnical(fullPrompt, {}).score,
        scoreAccessibility(fullPrompt, {}).score,
      ];
      const avg = Math.round(scores.reduce((s, v) => s + v, 0) / 6);
      expect(avg).toBeGreaterThanOrEqual(70);
    });

    it('fails when overall score < 70 (empty prompt)', () => {
      const scores = [
        scoreLayout('', {}).score,
        scoreVisualComposition('', {}).score,
        scoreDesignSystem('', {}).score,
        scoreInteraction('', {}).score,
        scoreTechnical('', {}).score,
        scoreAccessibility('', {}).score,
      ];
      const avg = Math.round(scores.reduce((s, v) => s + v, 0) / 6);
      expect(avg).toBeLessThan(70);
    });
  });

  // ==========================================================================
  // runQualityCheck (integration with mock DB)
  // ==========================================================================

  describe('runQualityCheck', () => {
    function buildMockSupabase({ synthesisPrompt, siteDna, insertResult }) {
      return {
        from: vi.fn((table) => {
          if (table === 'srip_synthesis_prompts') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: synthesisPrompt,
                    error: synthesisPrompt ? null : { message: 'not found' },
                  }),
                }),
              }),
              insert: vi.fn().mockReturnValue({
                select: vi.fn().mockResolvedValue({ data: [], error: null }),
              }),
            };
          }
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
          if (table === 'srip_quality_checks') {
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

    const fullPromptText = `
      ## LAYOUT
      Use CSS grid with flexbox. Responsive mobile-first with desktop breakpoint.
      Sections: header, hero, sidebar, footer. Column and row layout.

      ## VISUAL_COMPOSITION
      Visual hierarchy with primary focal point. Generous whitespace and spacing.
      Center alignment with consistent padding, margin, and contrast.
      Balanced composition and visual weight with rhythm.

      ## DESIGN_SYSTEM
      Primary color: #3B82F6, secondary: #10B981, accent: #F59E0B, background: #FFF.
      Font family: Inter with typography weights 400, 600, 700. Size scale: 14-48px.
      Spacing tokens: 4px-64px. Border radius: 4px, 8px. Shadow: subtle box-shadow.
      Design system tokens throughout.

      ## COMPONENTS
      Button, input, form, modal, tooltip, accordion, dropdown components.
      States: hover, active, focus, disabled.
      Animation and transition for motion effects. Click interactive component.

      ## TECHNICAL
      Framework: React / Next.js with TypeScript and JavaScript.
      CSS: Tailwind with Sass and styled module support.
      Build: Vite / Webpack. Rendering: SSR, SSG, CSR.

      ## ACCESSIBILITY
      Alt text on images. ARIA role and label attributes.
      WCAG contrast ratios. A11y accessible design.
      Keyboard tab navigation with focus indicators. Screen reader semantic landmark.
    `;

    it('runs all 6 domain checks and stores result', async () => {
      const supabase = buildMockSupabase({
        synthesisPrompt: {
          id: 'synth-1',
          venture_id: 'ven-1',
          site_dna_id: 'dna-1',
          prompt_text: fullPromptText,
          fidelity_target: 90,
          status: 'active',
        },
        siteDna: {
          id: 'dna-1',
          dna_json: { macro_architecture: { grid_system: 'flexbox' } },
        },
        insertResult: {
          data: [{
            id: 'check-1',
            venture_id: 'ven-1',
            overall_score: 100,
            pass_threshold: 70,
            domain_scores: {},
            gaps: [],
            created_at: new Date().toISOString(),
          }],
          error: null,
        },
      });

      const result = await runQualityCheck({
        synthesisPromptId: 'synth-1',
        supabase,
      });

      expect(result).not.toBeNull();
      expect(result.id).toBe('check-1');
      expect(supabase.from).toHaveBeenCalledWith('srip_quality_checks');
    });

    it('returns null when synthesis prompt is missing', async () => {
      const supabase = buildMockSupabase({
        synthesisPrompt: null,
        siteDna: null,
        insertResult: { data: [], error: null },
      });

      const result = await runQualityCheck({
        synthesisPromptId: 'missing-id',
        supabase,
      });

      expect(result).toBeNull();
    });

    it('returns null on DB insert failure', async () => {
      const supabase = buildMockSupabase({
        synthesisPrompt: {
          id: 'synth-2',
          venture_id: 'ven-2',
          site_dna_id: null,
          prompt_text: 'minimal prompt',
          fidelity_target: 50,
          status: 'active',
        },
        siteDna: null,
        insertResult: {
          data: null,
          error: { message: 'unique constraint violation' },
        },
      });

      const result = await runQualityCheck({
        synthesisPromptId: 'synth-2',
        supabase,
      });

      expect(result).toBeNull();
    });

    it('handles missing site DNA gracefully', async () => {
      const supabase = buildMockSupabase({
        synthesisPrompt: {
          id: 'synth-3',
          venture_id: 'ven-3',
          site_dna_id: 'dna-missing',
          prompt_text: fullPromptText,
          fidelity_target: 80,
          status: 'active',
        },
        siteDna: null,
        insertResult: {
          data: [{
            id: 'check-3',
            venture_id: 'ven-3',
            overall_score: 100,
            pass_threshold: 70,
            domain_scores: {},
            gaps: [],
            created_at: new Date().toISOString(),
          }],
          error: null,
        },
      });

      const result = await runQualityCheck({
        synthesisPromptId: 'synth-3',
        supabase,
      });

      // Should still succeed — DNA is optional reference
      expect(result).not.toBeNull();
      expect(result.id).toBe('check-3');
    });

    it('handles prompt with no site_dna_id', async () => {
      const supabase = buildMockSupabase({
        synthesisPrompt: {
          id: 'synth-4',
          venture_id: null,
          site_dna_id: null,
          prompt_text: 'empty prompt with no references',
          fidelity_target: 0,
          status: 'active',
        },
        siteDna: null,
        insertResult: {
          data: [{
            id: 'check-4',
            venture_id: null,
            overall_score: 0,
            pass_threshold: 70,
            domain_scores: {},
            gaps: [],
            created_at: new Date().toISOString(),
          }],
          error: null,
        },
      });

      const result = await runQualityCheck({
        synthesisPromptId: 'synth-4',
        supabase,
      });

      expect(result).not.toBeNull();
    });

    it('stores pass_threshold of 70', async () => {
      const supabase = buildMockSupabase({
        synthesisPrompt: {
          id: 'synth-5',
          venture_id: 'ven-5',
          site_dna_id: null,
          prompt_text: fullPromptText,
          fidelity_target: 95,
          status: 'active',
        },
        siteDna: null,
        insertResult: {
          data: [{
            id: 'check-5',
            venture_id: 'ven-5',
            overall_score: 100,
            pass_threshold: 70,
            domain_scores: {},
            gaps: [],
            created_at: new Date().toISOString(),
          }],
          error: null,
        },
      });

      const result = await runQualityCheck({
        synthesisPromptId: 'synth-5',
        supabase,
      });

      expect(result).not.toBeNull();
      expect(result.pass_threshold).toBe(70);
    });
  });
});
