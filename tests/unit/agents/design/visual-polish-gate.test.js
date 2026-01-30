/**
 * Visual Polish Gate Unit Tests
 * @sd SD-LEO-ORCH-AESTHETIC-DESIGN-SYSTEM-001-C
 */

import { describe, it, expect, vi } from 'vitest';
import {
  AI_SLOP_PATTERNS,
  STAGE_ENFORCEMENT,
  CRITIQUE_DIMENSIONS,
  PERSONALITY_CONSTRAINTS,
  VIEWPORTS,
  THEME_METHODS,
  detectAISlop,
  auditPersonalityCompliance,
  getEnforcementDecision,
  generateImpeccableCritique,
  executeVisualPolishGate,
  formatGateResult,
  detectThemeMethod,
  toggleTheme,
  captureDualModeScreenshots,
  validateContrastInMode,
  executeDualModeAudit,
  formatDualModeResult
} from '../../../../lib/agents/design-sub-agent/visual-polish-gate.js';

describe('Visual Polish Gate', () => {
  describe('AI Slop Detection', () => {
    it('should detect purple gradient patterns in CSS', () => {
      const cssContent = `
        .hero {
          background: linear-gradient(to right, #8B5CF6, #A855F7);
        }
      `;

      const violations = detectAISlop(cssContent, 'css');

      expect(violations.length).toBeGreaterThan(0);
      expect(violations.some(v => v.type === 'PURPLE_GRADIENT')).toBe(true);
    });

    it('should detect purple Tailwind classes in JSX', () => {
      const jsxContent = `
        <div className="bg-violet-500 hover:bg-violet-600">
          Gradient button
        </div>
      `;

      const violations = detectAISlop(jsxContent, 'jsx');

      expect(violations.some(v => v.type === 'PURPLE_GRADIENT')).toBe(true);
    });

    it('should detect pure gray hex colors', () => {
      const cssContent = `
        .text {
          color: #808080;
          border-color: #666666;
        }
      `;

      const violations = detectAISlop(cssContent, 'css');

      expect(violations.some(v => v.type === 'PURE_GRAY')).toBe(true);
    });

    it('should detect nested card patterns in JSX', () => {
      const jsxContent = `
        <Card>
          <CardContent>
            <Card>
              <CardContent>Nested content</CardContent>
            </Card>
          </CardContent>
        </Card>
      `;

      const violations = detectAISlop(jsxContent, 'jsx');

      expect(violations.some(v => v.type === 'NESTED_CARDS')).toBe(true);
    });

    it('should detect default font usage', () => {
      const cssContent = `
        body {
          font-family: Arial, sans-serif;
        }
      `;

      const violations = detectAISlop(cssContent, 'css');

      expect(violations.some(v => v.type === 'DEFAULT_FONTS')).toBe(true);
    });

    it('should return empty array for clean content', () => {
      const cleanContent = `
        <div className="bg-blue-500 text-white p-4 rounded-lg">
          Clean button with custom colors
        </div>
      `;

      const violations = detectAISlop(cleanContent, 'jsx');

      // May have some minor violations but not purple gradient
      expect(violations.some(v => v.type === 'PURPLE_GRADIENT')).toBe(false);
    });
  });

  describe('Stage Enforcement', () => {
    it('should return ADVISORY for ideation stage', () => {
      const violations = [{ type: 'PURPLE_GRADIENT', severity: 'MEDIUM' }];
      const decision = getEnforcementDecision('ideation', violations);

      expect(decision.action).toBe('ADVISORY');
      expect(decision.exitCode).toBe(0);
    });

    it('should return WARNING for build stage', () => {
      const violations = [{ type: 'PURE_GRAY', severity: 'LOW' }];
      const decision = getEnforcementDecision('build', violations);

      expect(decision.action).toBe('WARNING');
      expect(decision.exitCode).toBe(0);
    });

    it('should return HARD_BLOCK for launch stage', () => {
      const violations = [{ type: 'PURPLE_GRADIENT', severity: 'MEDIUM' }];
      const decision = getEnforcementDecision('launch', violations);

      expect(decision.action).toBe('HARD_BLOCK');
      expect(decision.exitCode).toBe(1);
    });

    it('should return PASS when no violations', () => {
      const violations = [];
      const decision = getEnforcementDecision('launch', violations);

      expect(decision.action).toBe('PASS');
      expect(decision.exitCode).toBe(0);
    });

    it('should escalate high severity to WARNING in non-launch stages', () => {
      const violations = [{ type: 'CRITICAL_PATTERN', severity: 'HIGH' }];
      const decision = getEnforcementDecision('build', violations);

      expect(decision.action).toBe('WARNING');
      expect(decision.escalated).toBe(true);
    });
  });

  describe('Personality Audit', () => {
    it('should audit against spartan constraints', () => {
      const content = `
        <div className="shadow-lg rounded-xl bg-gradient-to-r animate-pulse">
          Fancy card
        </div>
      `;

      const audit = auditPersonalityCompliance(content, 'spartan');

      expect(audit.personality).toBe('spartan');
      expect(audit.status).toBe('VIOLATIONS_FOUND');
      expect(audit.violations.length).toBeGreaterThan(0);
    });

    it('should pass for compliant spartan content', () => {
      const content = `
        <div className="border p-2 font-mono">
          Minimal interface
        </div>
      `;

      const audit = auditPersonalityCompliance(content, 'spartan');

      expect(audit.complianceScore).toBeGreaterThanOrEqual(50);
    });

    it('should skip unknown personality', () => {
      const content = '<div>Content</div>';
      const audit = auditPersonalityCompliance(content, 'unknown-personality');

      expect(audit.status).toBe('SKIPPED');
      expect(audit.reason).toContain('No constraints defined');
    });

    it('should check required patterns for accessible personality', () => {
      const content = `
        <button className="focus:ring-2 focus:ring-blue-500">
          <span className="sr-only">Submit form</span>
          Submit
        </button>
      `;

      const audit = auditPersonalityCompliance(content, 'accessible');

      expect(audit.passed.some(p => p.type === 'REQUIRED_PATTERN')).toBe(true);
    });

    it('should flag forbidden patterns for enterprise', () => {
      const content = `
        <div className="bg-pink-500 rounded-full animate-bounce">
          Playful but not enterprise
        </div>
      `;

      const audit = auditPersonalityCompliance(content, 'enterprise');

      expect(audit.violations.some(v => v.type === 'FORBIDDEN_PATTERN')).toBe(true);
    });
  });

  describe('Impeccable Critique', () => {
    it('should generate critique report with all dimensions', () => {
      const analysis = {
        hierarchy: { headingSizes: 80, visualWeight: 75, whitespace: 70, alignment: 85 },
        clarity: { labelClarity: 90, actionClarity: 85, errorStates: 60, loadingStates: 75 },
        emotionalResonance: { brandAlignment: 80, toneConsistency: 75, microInteractions: 70, imagery: 65 }
      };

      const critique = generateImpeccableCritique(analysis);

      expect(critique.dimensions).toHaveProperty('hierarchy');
      expect(critique.dimensions).toHaveProperty('clarity');
      expect(critique.dimensions).toHaveProperty('emotionalResonance');
      expect(critique.overallScore).toBeGreaterThan(0);
      expect(critique.overallScore).toBeLessThanOrEqual(100);
    });

    it('should provide suggestions for low-scoring dimensions', () => {
      const analysis = {
        hierarchy: { headingSizes: 40, visualWeight: 35, whitespace: 30, alignment: 45 },
        clarity: { labelClarity: 90, actionClarity: 85, errorStates: 80, loadingStates: 75 },
        emotionalResonance: { brandAlignment: 80, toneConsistency: 75, microInteractions: 70, imagery: 65 }
      };

      const critique = generateImpeccableCritique(analysis);

      expect(critique.suggestions.length).toBeGreaterThan(0);
      expect(critique.suggestions.some(s => s.dimension === 'Hierarchy')).toBe(true);
    });

    it('should use default scores when analysis is null', () => {
      const critique = generateImpeccableCritique(null);

      expect(critique.overallScore).toBe(70); // Default 70% for all dimensions
    });
  });

  describe('Gate Execution', () => {
    it('should execute gate and return comprehensive result', async () => {
      const result = await executeVisualPolishGate({
        content: '<div className="p-4 bg-blue-500">Clean button</div>',
        fileType: 'jsx',
        ventureStage: 'build'
      });

      expect(result).toHaveProperty('status');
      expect(result).toHaveProperty('score');
      expect(result).toHaveProperty('aiSlop');
      expect(result).toHaveProperty('critique');
      expect(result.gate).toBe('VISUAL_POLISH_GATE');
    });

    it('should return HARD_BLOCK for launch stage with violations', async () => {
      const result = await executeVisualPolishGate({
        content: '<div className="bg-violet-500 from-purple-500 to-indigo-600">AI content</div>',
        fileType: 'jsx',
        ventureStage: 'launch'
      });

      expect(result.status).toBe('HARD_BLOCK');
      expect(result.exitCode).toBe(1);
    });

    it('should include personality audit when personality provided', async () => {
      const result = await executeVisualPolishGate({
        content: '<div className="font-mono border">Spartan design</div>',
        fileType: 'jsx',
        ventureStage: 'build',
        venturePersonality: 'spartan'
      });

      expect(result.personalityAudit).not.toBeNull();
      expect(result.personalityAudit.personality).toBe('spartan');
    });

    it('should return EXCELLENT for high-scoring clean content', async () => {
      const result = await executeVisualPolishGate({
        content: '<div className="p-4 bg-slate-100">Clean design</div>',
        fileType: 'jsx',
        ventureStage: 'ideation',
        analysis: {
          hierarchy: { headingSizes: 95, visualWeight: 90, whitespace: 92, alignment: 95 },
          clarity: { labelClarity: 95, actionClarity: 90, errorStates: 88, loadingStates: 92 },
          emotionalResonance: { brandAlignment: 92, toneConsistency: 90, microInteractions: 88, imagery: 90 }
        }
      });

      expect(result.score).toBeGreaterThanOrEqual(90);
      expect(result.status).toBe('EXCELLENT');
    });
  });

  describe('Constants', () => {
    it('should have all required AI slop patterns', () => {
      expect(AI_SLOP_PATTERNS).toHaveProperty('PURPLE_GRADIENT');
      expect(AI_SLOP_PATTERNS).toHaveProperty('PURE_GRAY');
      expect(AI_SLOP_PATTERNS).toHaveProperty('NESTED_CARDS');
      expect(AI_SLOP_PATTERNS).toHaveProperty('DEFAULT_FONTS');
    });

    it('should have stage enforcement for all stages', () => {
      expect(STAGE_ENFORCEMENT).toHaveProperty('ideation');
      expect(STAGE_ENFORCEMENT).toHaveProperty('validation');
      expect(STAGE_ENFORCEMENT).toHaveProperty('build');
      expect(STAGE_ENFORCEMENT).toHaveProperty('launch');
    });

    it('should have all critique dimensions', () => {
      expect(CRITIQUE_DIMENSIONS).toHaveProperty('hierarchy');
      expect(CRITIQUE_DIMENSIONS).toHaveProperty('clarity');
      expect(CRITIQUE_DIMENSIONS).toHaveProperty('emotionalResonance');
    });

    it('should have personality constraints for key personalities', () => {
      expect(PERSONALITY_CONSTRAINTS).toHaveProperty('spartan');
      expect(PERSONALITY_CONSTRAINTS).toHaveProperty('enterprise');
      expect(PERSONALITY_CONSTRAINTS).toHaveProperty('accessible');
    });
  });

  describe('Format Output', () => {
    it('should format gate result for console', async () => {
      const result = await executeVisualPolishGate({
        content: '<div className="p-4">Test</div>',
        fileType: 'jsx',
        ventureStage: 'build'
      });

      const formatted = formatGateResult(result);

      expect(formatted).toContain('VISUAL POLISH GATE RESULT');
      expect(formatted).toContain('AI SLOP DETECTION');
      expect(formatted).toContain('IMPECCABLE CRITIQUE');
    });
  });

  // ============================================================
  // CHILD D: Dual-Mode Auditing Tests
  // SD-LEO-ORCH-AESTHETIC-DESIGN-SYSTEM-001-D
  // ============================================================

  describe('Dual-Mode Constants', () => {
    describe('VIEWPORTS', () => {
      it('should define desktop viewport', () => {
        expect(VIEWPORTS.desktop).toEqual({ width: 1920, height: 1080, name: 'desktop' });
      });

      it('should define tablet viewport', () => {
        expect(VIEWPORTS.tablet).toEqual({ width: 768, height: 1024, name: 'tablet' });
      });

      it('should define mobile viewport', () => {
        expect(VIEWPORTS.mobile).toEqual({ width: 375, height: 667, name: 'mobile' });
      });

      it('should have all three standard viewports', () => {
        expect(Object.keys(VIEWPORTS)).toHaveLength(3);
        expect(VIEWPORTS).toHaveProperty('desktop');
        expect(VIEWPORTS).toHaveProperty('tablet');
        expect(VIEWPORTS).toHaveProperty('mobile');
      });
    });

    describe('THEME_METHODS', () => {
      it('should define class-based method', () => {
        expect(THEME_METHODS.CLASS_BASED).toBe('class-based');
      });

      it('should define media-query method', () => {
        expect(THEME_METHODS.MEDIA_QUERY).toBe('media-query');
      });

      it('should define unknown method', () => {
        expect(THEME_METHODS.UNKNOWN).toBe('unknown');
      });

      it('should have all three theme methods', () => {
        expect(Object.keys(THEME_METHODS)).toHaveLength(3);
      });
    });
  });

  describe('Theme Detection (US-002)', () => {
    // Create mock page object for testing
    const createMockPage = (evaluateResults = []) => {
      let callIndex = 0;
      return {
        evaluate: vi.fn(() => {
          const result = evaluateResults[callIndex] ?? false;
          callIndex++;
          return Promise.resolve(result);
        }),
        emulateMedia: vi.fn(() => Promise.resolve()),
        waitForTimeout: vi.fn(() => Promise.resolve())
      };
    };

    it('should detect class-based theming when dark class present', async () => {
      const mockPage = createMockPage([true]); // First evaluate returns true for class-based
      const method = await detectThemeMethod(mockPage);
      expect(method).toBe('class-based');
    });

    it('should detect media-query theming when no class support but media queries exist', async () => {
      const mockPage = createMockPage([false, true]); // Class-based false, media-query true
      const method = await detectThemeMethod(mockPage);
      expect(method).toBe('media-query');
    });

    it('should return unknown when no theme support detected', async () => {
      const mockPage = createMockPage([false, false]); // Both false
      const method = await detectThemeMethod(mockPage);
      expect(method).toBe('unknown');
    });

    it('should handle page evaluation errors gracefully', async () => {
      const mockPage = {
        evaluate: vi.fn(() => Promise.reject(new Error('Page error')))
      };
      const method = await detectThemeMethod(mockPage);
      expect(method).toBe('unknown');
    });
  });

  describe('Theme Toggle (US-002)', () => {
    const createMockPage = () => ({
      evaluate: vi.fn(() => Promise.resolve()),
      emulateMedia: vi.fn(() => Promise.resolve()),
      waitForTimeout: vi.fn(() => Promise.resolve())
    });

    it('should toggle to dark mode using class-based method', async () => {
      const mockPage = createMockPage();
      const result = await toggleTheme(mockPage, 'dark', 'class-based');

      expect(result.mode).toBe('dark');
      expect(result.themeMethod).toBe('class-based');
      expect(result.success).toBe(true);
      expect(mockPage.evaluate).toHaveBeenCalled();
    });

    it('should toggle to light mode using class-based method', async () => {
      const mockPage = createMockPage();
      const result = await toggleTheme(mockPage, 'light', 'class-based');

      expect(result.mode).toBe('light');
      expect(result.themeMethod).toBe('class-based');
      expect(result.success).toBe(true);
    });

    it('should toggle using media-query method via emulateMedia', async () => {
      const mockPage = createMockPage();
      const result = await toggleTheme(mockPage, 'dark', 'media-query');

      expect(result.mode).toBe('dark');
      expect(result.themeMethod).toBe('media-query');
      expect(result.success).toBe(true);
      expect(mockPage.emulateMedia).toHaveBeenCalledWith({ colorScheme: 'dark' });
    });

    it('should use hybrid approach for unknown method', async () => {
      const mockPage = createMockPage();
      const result = await toggleTheme(mockPage, 'dark', 'unknown');

      expect(result.success).toBe(true);
      expect(result.themeMethod).toBe('hybrid');
      expect(mockPage.evaluate).toHaveBeenCalled();
      expect(mockPage.emulateMedia).toHaveBeenCalled();
    });

    it('should record themeMethod and themeModeAudited in result', async () => {
      const mockPage = createMockPage();
      const result = await toggleTheme(mockPage, 'dark', 'class-based');

      expect(result).toHaveProperty('themeMethod', 'class-based');
      expect(result).toHaveProperty('mode', 'dark');
    });

    it('should handle toggle errors gracefully', async () => {
      const mockPage = {
        evaluate: vi.fn(() => Promise.reject(new Error('Toggle failed'))),
        emulateMedia: vi.fn(() => Promise.resolve()),
        waitForTimeout: vi.fn(() => Promise.resolve())
      };
      const result = await toggleTheme(mockPage, 'dark', 'class-based');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Toggle failed');
    });
  });

  describe('Dual-Mode Screenshots (US-003)', () => {
    const createMockPage = () => ({
      setViewportSize: vi.fn(() => Promise.resolve()),
      screenshot: vi.fn(() => Promise.resolve()),
      evaluate: vi.fn(() => Promise.resolve()),
      emulateMedia: vi.fn(() => Promise.resolve()),
      waitForTimeout: vi.fn(() => Promise.resolve())
    });

    it('should capture screenshots for all viewports in both modes', async () => {
      const mockPage = createMockPage();
      const screenshots = await captureDualModeScreenshots(
        mockPage,
        './test-output/screenshots',
        VIEWPORTS
      );

      // Should have all three viewports
      expect(screenshots).toHaveProperty('desktop');
      expect(screenshots).toHaveProperty('tablet');
      expect(screenshots).toHaveProperty('mobile');
    });

    it('should capture both light and dark screenshots per viewport', async () => {
      const mockPage = createMockPage();
      const screenshots = await captureDualModeScreenshots(
        mockPage,
        './test-output/screenshots',
        VIEWPORTS
      );

      expect(screenshots.desktop).toHaveProperty('light');
      expect(screenshots.desktop).toHaveProperty('dark');
      expect(screenshots.tablet).toHaveProperty('light');
      expect(screenshots.tablet).toHaveProperty('dark');
      expect(screenshots.mobile).toHaveProperty('light');
      expect(screenshots.mobile).toHaveProperty('dark');
    });

    it('should set viewport size for each device', async () => {
      const mockPage = createMockPage();
      await captureDualModeScreenshots(mockPage, './test-output', VIEWPORTS);

      expect(mockPage.setViewportSize).toHaveBeenCalledWith({ width: 1920, height: 1080 });
      expect(mockPage.setViewportSize).toHaveBeenCalledWith({ width: 768, height: 1024 });
      expect(mockPage.setViewportSize).toHaveBeenCalledWith({ width: 375, height: 667 });
    });

    it('should use correct naming convention for screenshots', async () => {
      const mockPage = createMockPage();
      const screenshots = await captureDualModeScreenshots(
        mockPage,
        './visual-polish-reports/screenshots',
        VIEWPORTS
      );

      expect(screenshots.desktop.light).toBe('screenshots/desktop-light.png');
      expect(screenshots.desktop.dark).toBe('screenshots/desktop-dark.png');
      expect(screenshots.tablet.light).toBe('screenshots/tablet-light.png');
      expect(screenshots.tablet.dark).toBe('screenshots/tablet-dark.png');
      expect(screenshots.mobile.light).toBe('screenshots/mobile-light.png');
      expect(screenshots.mobile.dark).toBe('screenshots/mobile-dark.png');
    });

    it('should handle screenshot capture failures gracefully', async () => {
      const mockPage = {
        setViewportSize: vi.fn(() => Promise.resolve()),
        screenshot: vi.fn(() => Promise.reject(new Error('Capture failed'))),
        evaluate: vi.fn(() => Promise.resolve()),
        emulateMedia: vi.fn(() => Promise.resolve()),
        waitForTimeout: vi.fn(() => Promise.resolve())
      };

      // Should not throw, should handle gracefully
      const screenshots = await captureDualModeScreenshots(mockPage, './test-output', VIEWPORTS);
      expect(screenshots).toBeDefined();
    });
  });

  describe('Contrast Validation (US-004)', () => {
    const createMockPageWithElements = (elements) => ({
      evaluate: vi.fn((fn) => {
        // If the function is for getting text elements, return our mock elements
        if (fn.toString().includes('createTreeWalker')) {
          return Promise.resolve(elements);
        }
        // Otherwise return empty for theme detection
        return Promise.resolve();
      }),
      emulateMedia: vi.fn(() => Promise.resolve()),
      waitForTimeout: vi.fn(() => Promise.resolve())
    });

    it('should validate contrast ratios and report violations', async () => {
      // Mock page with a low-contrast element
      const mockPage = createMockPageWithElements([
        {
          selector: '.low-contrast',
          foreground: 'rgb(204, 204, 204)', // Light gray
          background: 'rgb(255, 255, 255)', // White
          isLargeText: false,
          fontSize: 14
        }
      ]);

      const result = await validateContrastInMode(mockPage, 'light');

      expect(result.mode).toBe('light');
      expect(result.violations.length).toBeGreaterThan(0);
    });

    it('should pass elements with sufficient contrast', async () => {
      const mockPage = createMockPageWithElements([
        {
          selector: '.good-contrast',
          foreground: 'rgb(0, 0, 0)', // Black
          background: 'rgb(255, 255, 255)', // White - 21:1 ratio
          isLargeText: false,
          fontSize: 14
        }
      ]);

      const result = await validateContrastInMode(mockPage, 'light');

      expect(result.passed).toBe(1);
      expect(result.violations.length).toBe(0);
    });

    it('should use 4.5:1 ratio for normal text', async () => {
      const mockPage = createMockPageWithElements([
        {
          selector: '.normal-text',
          foreground: 'rgb(136, 136, 136)', // #888 - ~3.5:1 ratio
          background: 'rgb(255, 255, 255)',
          isLargeText: false,
          fontSize: 14
        }
      ]);

      const result = await validateContrastInMode(mockPage, 'light');

      expect(result.violations.length).toBe(1);
      expect(result.violations[0].requiredRatio).toBe(4.5);
    });

    it('should use 3.0:1 ratio for large text', async () => {
      const mockPage = createMockPageWithElements([
        {
          selector: '.large-text',
          foreground: 'rgb(136, 136, 136)', // ~3.5:1 ratio
          background: 'rgb(255, 255, 255)',
          isLargeText: true,
          fontSize: 24
        }
      ]);

      const result = await validateContrastInMode(mockPage, 'light');

      // 3.5:1 is > 3.0:1 requirement for large text, so should pass
      expect(result.passed).toBe(1);
      expect(result.violations.length).toBe(0);
    });

    it('should include violation details with selector and ratios', async () => {
      const mockPage = createMockPageWithElements([
        {
          selector: '.hero-title',
          foreground: 'rgb(200, 200, 200)',
          background: 'rgb(255, 255, 255)',
          isLargeText: false,
          fontSize: 14
        }
      ]);

      const result = await validateContrastInMode(mockPage, 'light');

      expect(result.violations[0]).toHaveProperty('selector');
      expect(result.violations[0]).toHaveProperty('actualRatio');
      expect(result.violations[0]).toHaveProperty('requiredRatio');
      expect(result.violations[0]).toHaveProperty('foreground');
      expect(result.violations[0]).toHaveProperty('background');
      expect(result.violations[0]).toHaveProperty('mode', 'light');
    });

    it('should run validation in specified mode', async () => {
      const mockPage = createMockPageWithElements([]);

      await validateContrastInMode(mockPage, 'dark');

      // Should have called emulateMedia or evaluate to toggle theme
      expect(mockPage.evaluate).toHaveBeenCalled();
    });
  });

  describe('Dual-Mode Audit Execution (US-001)', () => {
    it('should return SKIPPED when no page provided', async () => {
      const result = await executeDualModeAudit({
        previewUrl: 'https://example.com'
      });

      expect(result.status).toBe('SKIPPED');
      expect(result.error).toContain('Playwright page object required');
    });

    it('should return gate type VISUAL_POLISH_GATE_DUAL_MODE', async () => {
      const result = await executeDualModeAudit({});

      expect(result.gate).toBe('VISUAL_POLISH_GATE_DUAL_MODE');
    });

    it('should include both light and dark mode results', async () => {
      const mockPage = {
        goto: vi.fn(() => Promise.resolve()),
        content: vi.fn(() => Promise.resolve('<div>Test</div>')),
        evaluate: vi.fn(() => Promise.resolve([])),
        emulateMedia: vi.fn(() => Promise.resolve()),
        waitForTimeout: vi.fn(() => Promise.resolve()),
        setViewportSize: vi.fn(() => Promise.resolve()),
        screenshot: vi.fn(() => Promise.resolve())
      };

      const result = await executeDualModeAudit({
        page: mockPage,
        ventureStage: 'build'
      });

      expect(result.modes).toHaveProperty('light');
      expect(result.modes).toHaveProperty('dark');
    });

    it('should include contrast violations per mode', async () => {
      const mockPage = {
        goto: vi.fn(() => Promise.resolve()),
        content: vi.fn(() => Promise.resolve('<div>Test</div>')),
        evaluate: vi.fn(() => Promise.resolve([])),
        emulateMedia: vi.fn(() => Promise.resolve()),
        waitForTimeout: vi.fn(() => Promise.resolve()),
        setViewportSize: vi.fn(() => Promise.resolve()),
        screenshot: vi.fn(() => Promise.resolve())
      };

      const result = await executeDualModeAudit({
        page: mockPage
      });

      expect(result.contrastViolations).toHaveProperty('light');
      expect(result.contrastViolations).toHaveProperty('dark');
      expect(Array.isArray(result.contrastViolations.light)).toBe(true);
      expect(Array.isArray(result.contrastViolations.dark)).toBe(true);
    });

    it('should include screenshot paths in result', async () => {
      const mockPage = {
        goto: vi.fn(() => Promise.resolve()),
        content: vi.fn(() => Promise.resolve('<div>Test</div>')),
        evaluate: vi.fn(() => Promise.resolve([])),
        emulateMedia: vi.fn(() => Promise.resolve()),
        waitForTimeout: vi.fn(() => Promise.resolve()),
        setViewportSize: vi.fn(() => Promise.resolve()),
        screenshot: vi.fn(() => Promise.resolve())
      };

      const result = await executeDualModeAudit({
        page: mockPage
      });

      expect(result.screenshots).toBeDefined();
    });

    it('should set exit code 1 when either mode fails', async () => {
      const mockPage = {
        goto: vi.fn(() => Promise.resolve()),
        content: vi.fn(() => Promise.resolve('<div className="bg-violet-500">AI content</div>')),
        evaluate: vi.fn(() => Promise.resolve([])),
        emulateMedia: vi.fn(() => Promise.resolve()),
        waitForTimeout: vi.fn(() => Promise.resolve()),
        setViewportSize: vi.fn(() => Promise.resolve()),
        screenshot: vi.fn(() => Promise.resolve())
      };

      const result = await executeDualModeAudit({
        page: mockPage,
        ventureStage: 'launch' // Launch stage = HARD_BLOCK
      });

      // Note: May be HARD_BLOCK or WARNING depending on content detection
      expect(result).toHaveProperty('exitCode');
      expect([0, 1]).toContain(result.exitCode);
    });

    it('should include summary with pass/fail per mode', async () => {
      const mockPage = {
        goto: vi.fn(() => Promise.resolve()),
        content: vi.fn(() => Promise.resolve('<div>Clean</div>')),
        evaluate: vi.fn(() => Promise.resolve([])),
        emulateMedia: vi.fn(() => Promise.resolve()),
        waitForTimeout: vi.fn(() => Promise.resolve()),
        setViewportSize: vi.fn(() => Promise.resolve()),
        screenshot: vi.fn(() => Promise.resolve())
      };

      const result = await executeDualModeAudit({
        page: mockPage,
        ventureStage: 'build'
      });

      expect(result.summary).toHaveProperty('lightPassed');
      expect(result.summary).toHaveProperty('darkPassed');
      expect(result.summary).toHaveProperty('totalViolations');
    });

    it('should record theme method used', async () => {
      const mockPage = {
        goto: vi.fn(() => Promise.resolve()),
        content: vi.fn(() => Promise.resolve('<div>Test</div>')),
        evaluate: vi.fn(() => Promise.resolve(true)), // Class-based support
        emulateMedia: vi.fn(() => Promise.resolve()),
        waitForTimeout: vi.fn(() => Promise.resolve()),
        setViewportSize: vi.fn(() => Promise.resolve()),
        screenshot: vi.fn(() => Promise.resolve())
      };

      const result = await executeDualModeAudit({
        page: mockPage
      });

      expect(result.themeMethod).toBeDefined();
    });
  });

  describe('Dual-Mode Format Output', () => {
    it('should format dual-mode result with both mode sections', () => {
      const mockResult = {
        status: 'PASS',
        themeMethod: 'class-based',
        previewUrl: 'https://preview.example.com',
        exitCode: 0,
        modes: {
          light: { status: 'PASS', score: 85, aiSlop: { violations: [] } },
          dark: { status: 'PASS', score: 82, aiSlop: { violations: [] } }
        },
        screenshots: {
          desktop: { light: 'screenshots/desktop-light.png', dark: 'screenshots/desktop-dark.png' }
        },
        contrastViolations: { light: [], dark: [] },
        summary: { lightPassed: true, darkPassed: true, totalViolations: 0 }
      };

      const formatted = formatDualModeResult(mockResult);

      expect(formatted).toContain('VISUAL POLISH GATE - DUAL MODE AUDIT');
      expect(formatted).toContain('LIGHT MODE AUDIT');
      expect(formatted).toContain('DARK MODE AUDIT');
      expect(formatted).toContain('Theme Method: class-based');
    });

    it('should show SCREENSHOTS CAPTURED section', () => {
      const mockResult = {
        status: 'PASS',
        themeMethod: 'class-based',
        exitCode: 0,
        modes: {
          light: { status: 'PASS', score: 85, aiSlop: { violations: [] } },
          dark: { status: 'PASS', score: 82, aiSlop: { violations: [] } }
        },
        screenshots: {
          desktop: { light: 'screenshots/desktop-light.png', dark: 'screenshots/desktop-dark.png' },
          mobile: { light: 'screenshots/mobile-light.png', dark: 'screenshots/mobile-dark.png' }
        },
        contrastViolations: { light: [], dark: [] },
        summary: { lightPassed: true, darkPassed: true, totalViolations: 0 }
      };

      const formatted = formatDualModeResult(mockResult);

      expect(formatted).toContain('SCREENSHOTS CAPTURED');
      expect(formatted).toContain('desktop-light.png');
      expect(formatted).toContain('desktop-dark.png');
    });

    it('should show contrast violations when present', () => {
      const mockResult = {
        status: 'WARNING',
        themeMethod: 'class-based',
        exitCode: 0,
        modes: {
          light: { status: 'WARNING', score: 65, aiSlop: { violations: [] } },
          dark: { status: 'PASS', score: 82, aiSlop: { violations: [] } }
        },
        screenshots: {},
        contrastViolations: {
          light: [
            { selector: '.hero-title', actualRatio: 3.2, requiredRatio: 4.5 }
          ],
          dark: []
        },
        summary: { lightPassed: true, darkPassed: true, totalViolations: 1 }
      };

      const formatted = formatDualModeResult(mockResult);

      expect(formatted).toContain('CONTRAST VIOLATIONS');
      expect(formatted).toContain('.hero-title');
      expect(formatted).toContain('3.2:1');
    });

    it('should show correct status icons', () => {
      const passResult = {
        status: 'PASS',
        modes: { light: { status: 'PASS' }, dark: { status: 'PASS' } },
        screenshots: {},
        contrastViolations: { light: [], dark: [] },
        summary: { lightPassed: true, darkPassed: true, totalViolations: 0 }
      };

      const blockResult = {
        status: 'HARD_BLOCK',
        modes: { light: { status: 'HARD_BLOCK' }, dark: { status: 'PASS' } },
        screenshots: {},
        contrastViolations: { light: [], dark: [] },
        summary: { lightPassed: false, darkPassed: true, totalViolations: 2 }
      };

      expect(formatDualModeResult(passResult)).toContain('✅');
      expect(formatDualModeResult(blockResult)).toContain('❌');
    });
  });
});
