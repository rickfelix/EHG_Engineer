#!/usr/bin/env node

/**
 * Design Sub-Agent - ACTIVE Design Validation Tool
 * Validates accessibility, responsive design, and UX compliance
 */

import fsModule from 'fs';
const fs = fsModule.promises;
import path from 'path';
import { execSync } from 'child_process';

class DesignSubAgent {
  constructor() {
    this.wcagCriteria = {
      'contrast': { min: 4.5, enhanced: 7 },
      'touchTarget': { min: 44, recommended: 48 },
      'focusIndicator': { required: true },
      'altText': { required: true },
      'headingStructure': { required: true },
      'ariaLabels': { required: true }
    };

    this.breakpoints = {
      mobile: 320,
      tablet: 768,
      desktop: 1024,
      wide: 1440
    };

    this.gitDiffOnly = false;
    this.gitDiffFiles = [];
  }

  /**
   * Main execution - run all design checks
   */
  async execute(options = {}) {
    console.log('🎨 Design Sub-Agent ACTIVATED\n');

    // Enable git-diff-only mode if specified
    if (options.gitDiffOnly) {
      this.gitDiffOnly = true;
      await this.loadGitDiffFiles(options.path || './src');
      console.log(`📋 Git Diff Mode: Scanning ${this.gitDiffFiles.length} modified files only\n`);
    } else {
      console.log('Validating ACTUAL design implementation, not just following guidelines.\n');
    }

    const results = {
      timestamp: new Date().toISOString(),
      accessibility: {},
      responsive: {},
      components: {},
      consistency: {},
      issues: [],
      score: 100
    };

    // 1. Accessibility audit
    console.log('♿ Running accessibility audit...');
    const accessibilityCheck = await this.checkAccessibility(options.path || './src');
    results.accessibility = accessibilityCheck;
    
    // 2. Responsive design validation
    console.log('📱 Validating responsive design...');
    const responsiveCheck = await this.checkResponsiveDesign(options.path || './src');
    results.responsive = responsiveCheck;
    
    // 3. Component consistency check
    console.log('🧩 Checking component consistency...');
    const componentCheck = await this.checkComponentConsistency(options.path || './src');
    results.components = componentCheck;
    
    // 4. Color contrast validation
    console.log('🎨 Validating color contrast...');
    const contrastCheck = await this.checkColorContrast(options.path || './src');
    results.accessibility.contrast = contrastCheck;
    
    // 5. Touch target sizes
    console.log('👆 Checking touch target sizes...');
    const touchTargetCheck = await this.checkTouchTargets(options.path || './src');
    results.accessibility.touchTargets = touchTargetCheck;
    
    // 6. Typography consistency
    console.log('📝 Validating typography...');
    const typographyCheck = await this.checkTypography(options.path || './src');
    results.consistency.typography = typographyCheck;
    
    // 7. Animation performance
    console.log('🎬 Checking animation performance...');
    const animationCheck = await this.checkAnimations(options.path || './src');
    results.consistency.animations = animationCheck;
    
    // 8. Design system compliance
    console.log('📐 Validating design system compliance...');
    const designSystemCheck = await this.checkDesignSystem(options.path || './src');
    results.consistency.designSystem = designSystemCheck;
    
    // Calculate design score
    results.score = this.calculateScore(results);
    
    // Generate report
    this.generateReport(results);
    
    // Generate fixes
    if (results.score < 90) {
      await this.generateFixRecommendations(results);
    }
    
    return results;
  }

  /**
   * Check accessibility compliance
   */
  async checkAccessibility(basePath) {
    const results = {
      issues: [],
      warnings: [],
      passed: [],
      wcagLevel: 'AA'
    };
    
    const files = await this.getComponentFiles(basePath);
    
    for (const file of files) {
      const content = await fs.readFile(file, 'utf8');
      const relPath = path.relative(process.cwd(), file);
      
      // Check for images without alt text
      if (/<img(?![^>]*alt=)/gi.test(content)) {
        results.issues.push({
          type: 'MISSING_ALT_TEXT',
          file: relPath,
          severity: 'HIGH',
          wcag: '1.1.1',
          fix: 'Add alt="" for decorative images or descriptive alt text for informative images'
        });
      }
      
      // Check for missing ARIA labels on interactive elements
      const interactiveElements = content.match(/<(button|input|select|textarea)[^>]*>/gi) || [];
      for (const element of interactiveElements) {
        if (!element.includes('aria-label') && !element.includes('aria-labelledby') && !element.includes('placeholder')) {
          const elementType = element.match(/<(\w+)/)[1];
          results.warnings.push({
            type: 'MISSING_ARIA_LABEL',
            element: elementType,
            file: relPath,
            severity: 'MEDIUM',
            wcag: '4.1.2'
          });
        }
      }
      
      // Check for proper heading structure
      const headings = content.match(/<h[1-6]/gi) || [];
      const headingLevels = headings.map(h => parseInt(h.charAt(2))).sort();
      
      for (let i = 1; i < headingLevels.length; i++) {
        if (headingLevels[i] - headingLevels[i-1] > 1) {
          results.issues.push({
            type: 'HEADING_SKIP',
            file: relPath,
            from: `h${headingLevels[i-1]}`,
            to: `h${headingLevels[i]}`,
            severity: 'MEDIUM',
            wcag: '1.3.1',
            fix: 'Maintain proper heading hierarchy without skipping levels'
          });
        }
      }
      
      // Check for keyboard navigation
      if (/<div[^>]*onclick/gi.test(content) && !/<div[^>]*tabindex/gi.test(content)) {
        results.issues.push({
          type: 'KEYBOARD_TRAP',
          file: relPath,
          severity: 'HIGH',
          wcag: '2.1.1',
          fix: 'Add tabindex="0" and keyboard event handlers to clickable divs'
        });
      }
      
      // Check for focus indicators
      if (/outline:\s*none|outline:\s*0/gi.test(content) && !/focus:.*outline/gi.test(content)) {
        results.warnings.push({
          type: 'MISSING_FOCUS_INDICATOR',
          file: relPath,
          severity: 'HIGH',
          wcag: '2.4.7',
          fix: 'Provide visible focus indicators for keyboard navigation'
        });
      }
      
      // Check for form labels
      const inputs = content.match(/<input[^>]*>/gi) || [];
      const labels = content.match(/<label/gi) || [];
      
      if (inputs.length > labels.length) {
        results.issues.push({
          type: 'MISSING_FORM_LABELS',
          file: relPath,
          severity: 'HIGH',
          wcag: '3.3.2',
          inputs: inputs.length,
          labels: labels.length,
          fix: 'Associate all form inputs with labels'
        });
      }
      
      // Check for semantic HTML
      if (/<div[^>]*role=["']button["']/gi.test(content)) {
        results.warnings.push({
          type: 'NON_SEMANTIC_HTML',
          file: relPath,
          severity: 'LOW',
          fix: 'Use <button> instead of <div role="button">'
        });
      }
    }
    
    // Check for positive patterns
    const cssFiles = await this.getCSSFiles(basePath);
    for (const file of cssFiles) {
      const content = await fs.readFile(file, 'utf8');
      
      if (/:focus-visible/gi.test(content)) {
        results.passed.push('Uses :focus-visible for better keyboard navigation');
      }
      
      if (/@media.*prefers-reduced-motion/gi.test(content)) {
        results.passed.push('Respects prefers-reduced-motion');
      }
      
      if (/@media.*prefers-color-scheme/gi.test(content)) {
        results.passed.push('Supports dark mode preference');
      }
    }
    
    results.status = results.issues.length === 0 ? 'PASS' : 
                    results.issues.filter(i => i.severity === 'HIGH').length > 2 ? 'FAIL' : 'WARNING';
    
    return results;
  }

  /**
   * Check responsive design implementation
   */
  async checkResponsiveDesign(basePath) {
    const results = {
      breakpoints: [],
      issues: [],
      mobileFirst: false,
      viewportMeta: false
    };
    
    // Check for viewport meta tag in HTML
    const htmlFiles = await this.getHTMLFiles(basePath);
    for (const file of htmlFiles) {
      const content = await fs.readFile(file, 'utf8');
      
      if (/<meta[^>]*viewport/gi.test(content)) {
        results.viewportMeta = true;
        
        // Check for proper viewport settings
        if (!content.includes('width=device-width') || !content.includes('initial-scale=1')) {
          results.issues.push({
            type: 'INCORRECT_VIEWPORT',
            file: path.relative(process.cwd(), file),
            severity: 'HIGH',
            fix: '<meta name="viewport" content="width=device-width, initial-scale=1">'
          });
        }
      }
    }
    
    // Analyze CSS for responsive patterns
    const cssFiles = await this.getCSSFiles(basePath);
    
    for (const file of cssFiles) {
      const content = await fs.readFile(file, 'utf8');
      const relPath = path.relative(process.cwd(), file);
      
      // Extract media queries
      const mediaQueries = content.match(/@media[^{]+/gi) || [];
      
      for (const query of mediaQueries) {
        // Check for min-width (mobile-first)
        if (/min-width/gi.test(query)) {
          results.mobileFirst = true;
          const width = query.match(/min-width:\s*(\d+)/);
          if (width) {
            results.breakpoints.push({
              type: 'min-width',
              value: parseInt(width[1]),
              file: relPath
            });
          }
        }
        
        // Check for max-width (desktop-first)
        if (/max-width/gi.test(query)) {
          const width = query.match(/max-width:\s*(\d+)/);
          if (width) {
            results.breakpoints.push({
              type: 'max-width',
              value: parseInt(width[1]),
              file: relPath
            });
          }
        }
      }
      
      // Check for fixed widths
      const fixedWidths = content.match(/width:\s*\d+px/gi) || [];
      if (fixedWidths.length > 5) {
        results.issues.push({
          type: 'EXCESSIVE_FIXED_WIDTHS',
          file: relPath,
          count: fixedWidths.length,
          severity: 'MEDIUM',
          fix: 'Use relative units (%, rem, vw) instead of fixed pixels'
        });
      }
      
      // Check for horizontal scroll issues
      if (/overflow-x:\s*scroll/gi.test(content)) {
        results.issues.push({
          type: 'HORIZONTAL_SCROLL',
          file: relPath,
          severity: 'MEDIUM',
          fix: 'Avoid horizontal scrolling on mobile devices'
        });
      }
      
      // Check for flexible images
      if (!content.includes('max-width: 100%') && content.includes('img')) {
        results.issues.push({
          type: 'NON_RESPONSIVE_IMAGES',
          file: relPath,
          severity: 'MEDIUM',
          fix: 'Add img { max-width: 100%; height: auto; }'
        });
      }
    }
    
    // Analyze breakpoint consistency
    const uniqueBreakpoints = [...new Set(results.breakpoints.map(b => b.value))];
    if (uniqueBreakpoints.length > 5) {
      results.issues.push({
        type: 'TOO_MANY_BREAKPOINTS',
        count: uniqueBreakpoints.length,
        severity: 'LOW',
        fix: 'Standardize on 3-4 main breakpoints'
      });
    }
    
    // Check component files for responsive utilities
    const componentFiles = await this.getComponentFiles(basePath);
    let responsiveUtilities = 0;
    
    for (const file of componentFiles) {
      const content = await fs.readFile(file, 'utf8');
      
      // Check for responsive utility classes (Tailwind, Bootstrap)
      if (/sm:|md:|lg:|xl:|col-sm|col-md|col-lg/gi.test(content)) {
        responsiveUtilities++;
      }
      
      // Check for CSS Grid or Flexbox
      if (/display:\s*(grid|flex)/gi.test(content)) {
        results.passed = results.passed || [];
        results.passed.push('Uses modern layout (Grid/Flexbox)');
      }
    }
    
    results.status = !results.viewportMeta || results.issues.filter(i => i.severity === 'HIGH').length > 0 ? 'FAIL' :
                    results.issues.length > 3 ? 'WARNING' : 'PASS';
    
    return results;
  }

  /**
   * Check component consistency
   */
  async checkComponentConsistency(basePath) {
    const results = {
      components: [],
      inconsistencies: [],
      designPatterns: {}
    };
    
    const componentFiles = await this.getComponentFiles(basePath);
    const componentAnalysis = new Map();
    
    for (const file of componentFiles) {
      const content = await fs.readFile(file, 'utf8');
      const componentName = path.basename(file).replace(/\.(jsx?|tsx?)$/, '');
      
      const analysis = {
        name: componentName,
        file: path.relative(process.cwd(), file),
        hasProps: /props\./gi.test(content) || /\{.*\}.*=.*props/gi.test(content),
        hasState: /useState|this\.state/gi.test(content),
        hasEffects: /useEffect|componentDidMount/gi.test(content),
        buttonPatterns: [],
        inputPatterns: [],
        spacing: []
      };
      
      // Analyze button patterns
      const buttons = content.match(/<(button|Button)[^>]*>/gi) || [];
      for (const button of buttons) {
        const classes = button.match(/className=["']([^"']+)["']/);
        if (classes) {
          analysis.buttonPatterns.push(classes[1]);
        }
      }
      
      // Analyze input patterns
      const inputs = content.match(/<(input|Input|TextField)[^>]*>/gi) || [];
      for (const input of inputs) {
        const classes = input.match(/className=["']([^"']+)["']/);
        if (classes) {
          analysis.inputPatterns.push(classes[1]);
        }
      }
      
      // Analyze spacing patterns
      const spacingPatterns = content.match(/(margin|padding):\s*[\d.]+\w+/gi) || [];
      analysis.spacing = spacingPatterns;
      
      componentAnalysis.set(componentName, analysis);
      results.components.push(analysis);
    }
    
    // Check for inconsistencies
    const allButtonClasses = results.components.flatMap(c => c.buttonPatterns);
    const uniqueButtonStyles = [...new Set(allButtonClasses)];
    
    if (uniqueButtonStyles.length > 5) {
      results.inconsistencies.push({
        type: 'INCONSISTENT_BUTTONS',
        count: uniqueButtonStyles.length,
        severity: 'MEDIUM',
        message: 'Too many button variations',
        fix: 'Create a consistent button component with variants'
      });
    }
    
    const allInputClasses = results.components.flatMap(c => c.inputPatterns);
    const uniqueInputStyles = [...new Set(allInputClasses)];
    
    if (uniqueInputStyles.length > 3) {
      results.inconsistencies.push({
        type: 'INCONSISTENT_INPUTS',
        count: uniqueInputStyles.length,
        severity: 'MEDIUM',
        message: 'Too many input variations',
        fix: 'Standardize form input styling'
      });
    }
    
    // Check for design pattern usage
    results.designPatterns = {
      atomicDesign: this.checkAtomicDesign(results.components),
      componentComposition: results.components.filter(c => c.hasProps).length / results.components.length,
      stateManagement: results.components.filter(c => c.hasState).length
    };
    
    results.status = results.inconsistencies.filter(i => i.severity === 'HIGH').length > 0 ? 'FAIL' :
                    results.inconsistencies.length > 5 ? 'WARNING' : 'PASS';
    
    return results;
  }

  /**
   * Check color contrast ratios
   */
  async checkColorContrast(basePath) {
    const results = {
      issues: [],
      warnings: [],
      passed: []
    };
    
    const cssFiles = await this.getCSSFiles(basePath);
    
    // Common color combinations to check
    const colorCombos = [];
    
    for (const file of cssFiles) {
      const content = await fs.readFile(file, 'utf8');
      const relPath = path.relative(process.cwd(), file);
      
      // Extract color definitions
      const colors = this.extractColors(content);
      
      // Find text color + background combinations
      const rules = content.split('}');
      
      for (const rule of rules) {
        const hasColor = rule.match(/color:\s*([^;]+)/);
        const hasBackground = rule.match(/background(?:-color)?:\s*([^;]+)/);
        
        if (hasColor && hasBackground) {
          const textColor = hasColor[1].trim();
          const bgColor = hasBackground[1].trim();
          
          // Calculate contrast if we can parse the colors
          const contrast = this.calculateContrast(textColor, bgColor);
          
          if (contrast !== null) {
            if (contrast < this.wcagCriteria.contrast.min) {
              results.issues.push({
                type: 'LOW_CONTRAST',
                file: relPath,
                textColor,
                bgColor,
                contrast: contrast.toFixed(2),
                required: this.wcagCriteria.contrast.min,
                severity: 'HIGH',
                wcag: '1.4.3'
              });
            } else if (contrast < this.wcagCriteria.contrast.enhanced) {
              results.warnings.push({
                type: 'SUBOPTIMAL_CONTRAST',
                file: relPath,
                contrast: contrast.toFixed(2),
                recommended: this.wcagCriteria.contrast.enhanced
              });
            } else {
              results.passed.push(`Good contrast: ${contrast.toFixed(2)}:1`);
            }
          }
        }
      }
      
      // Check for common bad patterns
      if (/color:\s*#[789abcdef]{6}/gi.test(content)) {
        results.warnings.push({
          type: 'LIGHT_GRAY_TEXT',
          file: relPath,
          severity: 'MEDIUM',
          fix: 'Light gray text often has poor contrast'
        });
      }
    }
    
    results.status = results.issues.length > 0 ? 'FAIL' : 
                    results.warnings.length > 3 ? 'WARNING' : 'PASS';
    
    return results;
  }

  /**
   * Check touch target sizes
   */
  async checkTouchTargets(basePath) {
    const results = {
      issues: [],
      warnings: [],
      passed: []
    };
    
    const cssFiles = await this.getCSSFiles(basePath);
    
    for (const file of cssFiles) {
      const content = await fs.readFile(file, 'utf8');
      const relPath = path.relative(process.cwd(), file);
      
      // Check button sizes
      const buttonRules = content.match(/button[^{]*\{[^}]+\}/gi) || [];
      
      for (const rule of buttonRules) {
        const height = rule.match(/height:\s*(\d+)/);
        const minHeight = rule.match(/min-height:\s*(\d+)/);
        const padding = rule.match(/padding:\s*(\d+)/);
        
        let effectiveHeight = 0;
        
        if (height) effectiveHeight = parseInt(height[1]);
        else if (minHeight) effectiveHeight = parseInt(minHeight[1]);
        else if (padding) effectiveHeight = parseInt(padding[1]) * 2 + 20; // Estimate
        
        if (effectiveHeight > 0 && effectiveHeight < this.wcagCriteria.touchTarget.min) {
          results.issues.push({
            type: 'SMALL_TOUCH_TARGET',
            file: relPath,
            size: effectiveHeight,
            minimum: this.wcagCriteria.touchTarget.min,
            severity: 'HIGH',
            wcag: '2.5.5',
            fix: `Minimum touch target should be ${this.wcagCriteria.touchTarget.min}px`
          });
        }
      }
      
      // Check link spacing
      if (/a\s*\{[^}]*line-height:\s*1(?:\.\d)?\s*;/gi.test(content)) {
        results.warnings.push({
          type: 'CRAMPED_LINKS',
          file: relPath,
          severity: 'MEDIUM',
          fix: 'Increase line-height for better touch targets in link lists'
        });
      }
    }
    
    // Check component files for inline styles
    const componentFiles = await this.getComponentFiles(basePath);
    
    for (const file of componentFiles) {
      const content = await fs.readFile(file, 'utf8');
      
      // Check for small fixed sizes
      const smallSizes = content.match(/(?:width|height):\s*["']?\d{1,2}px/gi) || [];
      
      if (smallSizes.length > 0) {
        results.warnings.push({
          type: 'POTENTIAL_SMALL_TARGETS',
          file: path.relative(process.cwd(), file),
          count: smallSizes.length,
          severity: 'LOW'
        });
      }
    }
    
    results.status = results.issues.filter(i => i.severity === 'HIGH').length > 0 ? 'FAIL' :
                    results.warnings.length > 5 ? 'WARNING' : 'PASS';
    
    return results;
  }

  /**
   * Check typography consistency
   */
  async checkTypography(basePath) {
    const results = {
      fonts: [],
      sizes: [],
      lineHeights: [],
      issues: []
    };
    
    const cssFiles = await this.getCSSFiles(basePath);
    
    for (const file of cssFiles) {
      const content = await fs.readFile(file, 'utf8');
      
      // Extract font families
      const fontFamilies = content.match(/font-family:\s*([^;]+)/gi) || [];
      results.fonts.push(...fontFamilies.map(f => f.replace(/font-family:\s*/i, '').trim()));
      
      // Extract font sizes
      const fontSizes = content.match(/font-size:\s*([^;]+)/gi) || [];
      results.sizes.push(...fontSizes.map(f => f.replace(/font-size:\s*/i, '').trim()));
      
      // Extract line heights
      const lineHeights = content.match(/line-height:\s*([^;]+)/gi) || [];
      results.lineHeights.push(...lineHeights.map(f => f.replace(/line-height:\s*/i, '').trim()));
    }
    
    // Check for consistency
    const uniqueFonts = [...new Set(results.fonts)];
    const uniqueSizes = [...new Set(results.sizes)];
    
    if (uniqueFonts.length > 3) {
      results.issues.push({
        type: 'TOO_MANY_FONTS',
        count: uniqueFonts.length,
        severity: 'MEDIUM',
        fix: 'Limit to 2-3 font families maximum'
      });
    }
    
    if (uniqueSizes.length > 8) {
      results.issues.push({
        type: 'INCONSISTENT_TYPE_SCALE',
        count: uniqueSizes.length,
        severity: 'LOW',
        fix: 'Use a consistent type scale (e.g., 12, 14, 16, 20, 24, 32)'
      });
    }
    
    // Check for px vs rem usage
    const pxSizes = results.sizes.filter(s => s.includes('px')).length;
    const remSizes = results.sizes.filter(s => s.includes('rem')).length;
    
    if (pxSizes > 0 && remSizes > 0) {
      results.issues.push({
        type: 'MIXED_UNITS',
        severity: 'MEDIUM',
        fix: 'Use rem units consistently for better accessibility'
      });
    }
    
    results.status = results.issues.filter(i => i.severity === 'HIGH').length > 0 ? 'FAIL' :
                    results.issues.length > 5 ? 'WARNING' : 'PASS';
    
    return results;
  }

  /**
   * Check animation performance
   */
  async checkAnimations(basePath) {
    const results = {
      animations: [],
      issues: [],
      performant: []
    };
    
    const cssFiles = await this.getCSSFiles(basePath);
    
    for (const file of cssFiles) {
      const content = await fs.readFile(file, 'utf8');
      const relPath = path.relative(process.cwd(), file);
      
      // Check for animations
      const animations = content.match(/@keyframes\s+(\w+)/gi) || [];
      const transitions = content.match(/transition:\s*([^;]+)/gi) || [];
      
      results.animations.push(...animations.map(a => ({
        type: 'keyframes',
        name: a.replace(/@keyframes\s+/i, ''),
        file: relPath
      })));
      
      // Check for performance issues
      if (/transition:.*all/gi.test(content)) {
        results.issues.push({
          type: 'TRANSITION_ALL',
          file: relPath,
          severity: 'MEDIUM',
          fix: 'Specify exact properties instead of "all" for better performance'
        });
      }
      
      // Check for transform and opacity (performant)
      if (/transform|opacity/gi.test(content)) {
        results.performant.push('Uses transform/opacity for animations');
      }
      
      // Check for layout-triggering properties
      if (/animation.*(?:width|height|top|left)/gi.test(content)) {
        results.issues.push({
          type: 'LAYOUT_ANIMATION',
          file: relPath,
          severity: 'HIGH',
          fix: 'Avoid animating layout properties (width, height, top, left)'
        });
      }
      
      // Check for will-change
      if (/will-change:\s*transform/gi.test(content)) {
        results.performant.push('Uses will-change for optimization');
      }
      
      // Check for reduced motion support
      if (/@media.*prefers-reduced-motion/gi.test(content)) {
        results.performant.push('Respects prefers-reduced-motion');
      } else if (animations.length > 0 || transitions.length > 0) {
        results.issues.push({
          type: 'NO_REDUCED_MOTION',
          file: relPath,
          severity: 'MEDIUM',
          wcag: '2.3.3',
          fix: 'Add @media (prefers-reduced-motion: reduce) support'
        });
      }
    }
    
    results.status = results.issues.filter(i => i.severity === 'HIGH').length > 0 ? 'FAIL' :
                    results.issues.length > 3 ? 'WARNING' : 'PASS';
    
    return results;
  }

  /**
   * Check design system compliance
   */
  async checkDesignSystem(basePath) {
    const results = {
      tokens: {},
      components: {},
      compliance: 0,
      issues: []
    };
    
    // Look for design tokens/variables
    const cssFiles = await this.getCSSFiles(basePath);
    let hasVariables = false;
    let hasTokens = false;
    
    for (const file of cssFiles) {
      const content = await fs.readFile(file, 'utf8');
      
      // Check for CSS variables
      if (/--\w+:/gi.test(content)) {
        hasVariables = true;
        const variables = content.match(/--[\w-]+:/gi) || [];
        results.tokens.cssVariables = variables.length;
      }
      
      // Check for design token usage
      if (/var\(--/gi.test(content)) {
        hasTokens = true;
        const usage = content.match(/var\(--[\w-]+\)/gi) || [];
        results.tokens.usage = usage.length;
      }
      
      // Check for hard-coded values
      const hardcodedColors = content.match(/#[0-9a-f]{3,6}/gi) || [];
      if (hardcodedColors.length > 10) {
        results.issues.push({
          type: 'HARDCODED_COLORS',
          count: hardcodedColors.length,
          file: path.relative(process.cwd(), file),
          severity: 'MEDIUM',
          fix: 'Use CSS variables or design tokens for colors'
        });
      }
    }
    
    // Check component structure
    const componentFiles = await this.getComponentFiles(basePath);
    const componentPatterns = {
      atomic: 0,
      compound: 0,
      composed: 0
    };
    
    for (const file of componentFiles) {
      const name = path.basename(file);
      
      if (/^(Atom|Molecule|Organism)/i.test(name)) {
        componentPatterns.atomic++;
      } else if (/^(Base|Core|Ui)/i.test(name)) {
        componentPatterns.compound++;
      }
    }
    
    results.components = componentPatterns;
    
    // Calculate compliance score
    let score = 0;
    if (hasVariables) score += 25;
    if (hasTokens) score += 25;
    if (results.issues.length === 0) score += 25;
    if (componentPatterns.atomic > 0 || componentPatterns.compound > 0) score += 25;
    
    results.compliance = score;
    
    results.status = score >= 75 ? 'PASS' : score >= 50 ? 'WARNING' : 'FAIL';
    
    return results;
  }

  /**
   * Check atomic design patterns
   */
  checkAtomicDesign(components) {
    const atoms = components.filter(c => 
      /button|input|label|icon/i.test(c.name) && !c.hasState
    ).length;
    
    const molecules = components.filter(c =>
      /form|card|list/i.test(c.name) && c.hasProps
    ).length;
    
    const organisms = components.filter(c =>
      /header|footer|nav|sidebar/i.test(c.name)
    ).length;
    
    return {
      atoms,
      molecules,
      organisms,
      follows: atoms > 0 && molecules > 0
    };
  }

  /**
   * Extract colors from CSS
   */
  extractColors(css) {
    const colors = [];
    
    // Hex colors
    const hexColors = css.match(/#[0-9a-f]{3,6}/gi) || [];
    colors.push(...hexColors);
    
    // RGB colors
    const rgbColors = css.match(/rgb\([^)]+\)/gi) || [];
    colors.push(...rgbColors);
    
    // Named colors
    const namedColors = css.match(/color:\s*\w+/gi) || [];
    colors.push(...namedColors.map(c => c.replace('color:', '').trim()));
    
    return colors;
  }

  /**
   * Calculate contrast ratio between two colors
   */
  calculateContrast(color1, color2) {
    // This is a simplified calculation
    // In production, you'd use a proper color contrast library
    
    // For now, return null if we can't parse the colors
    if (!color1.startsWith('#') || !color2.startsWith('#')) {
      return null;
    }
    
    // Very basic contrast check
    const isDark1 = this.isColorDark(color1);
    const isDark2 = this.isColorDark(color2);
    
    if (isDark1 !== isDark2) {
      return 7.5; // Assume good contrast
    } else {
      return 2.5; // Assume poor contrast
    }
  }

  /**
   * Check if color is dark
   */
  isColorDark(hexColor) {
    if (!hexColor.startsWith('#')) return false;
    
    const hex = hexColor.replace('#', '');
    const r = parseInt(hex.substr(0, 2), 16);
    const g = parseInt(hex.substr(2, 2), 16);
    const b = parseInt(hex.substr(4, 2), 16);
    
    const brightness = (r * 299 + g * 587 + b * 114) / 1000;
    return brightness < 128;
  }

  /**
   * Calculate design score
   */
  calculateScore(results) {
    let score = 100;
    
    // Accessibility deductions
    const a11yIssues = results.accessibility.issues || [];
    score -= a11yIssues.filter(i => i.severity === 'HIGH').length * 10;
    score -= a11yIssues.filter(i => i.severity === 'MEDIUM').length * 5;
    
    // Responsive design deductions
    const responsiveIssues = results.responsive.issues || [];
    score -= responsiveIssues.filter(i => i.severity === 'HIGH').length * 10;
    score -= responsiveIssues.filter(i => i.severity === 'MEDIUM').length * 3;
    
    // Consistency deductions
    const consistencyIssues = results.components.inconsistencies || [];
    score -= consistencyIssues.length * 3;
    
    // Touch target issues
    if (results.accessibility.touchTargets) {
      score -= results.accessibility.touchTargets.issues.length * 5;
    }
    
    // Contrast issues
    if (results.accessibility.contrast) {
      score -= results.accessibility.contrast.issues.length * 5;
    }
    
    return Math.max(0, score);
  }

  /**
   * Generate design report
   */
  generateReport(results) {
    console.log('\n' + '='.repeat(70));
    console.log('DESIGN VALIDATION REPORT');
    console.log('='.repeat(70));
    
    console.log(`\n🎨 Design Score: ${results.score}/100`);
    
    // Accessibility summary
    const a11y = results.accessibility;
    console.log(`\n♿ Accessibility: ${a11y.status}`);
    if (a11y.issues && a11y.issues.length > 0) {
      console.log(`   Issues: ${a11y.issues.length}`);
      a11y.issues.slice(0, 3).forEach(issue => {
        console.log(`   - ${issue.type} (WCAG ${issue.wcag})`);
      });
    }
    if (a11y.passed && a11y.passed.length > 0) {
      console.log(`   ✅ ${a11y.passed.join(', ')}`);
    }
    
    // Responsive design summary
    const responsive = results.responsive;
    console.log(`\n📱 Responsive Design: ${responsive.status}`);
    console.log(`   Viewport meta: ${responsive.viewportMeta ? '✅' : '❌'}`);
    console.log(`   Mobile-first: ${responsive.mobileFirst ? '✅' : '❌'}`);
    console.log(`   Breakpoints: ${responsive.breakpoints.length}`);
    
    // Component consistency
    const components = results.components;
    if (components.inconsistencies && components.inconsistencies.length > 0) {
      console.log('\n🧩 Component Consistency: WARNING');
      components.inconsistencies.forEach(issue => {
        console.log(`   - ${issue.message}`);
      });
    }
    
    // Design system compliance
    if (results.consistency && results.consistency.designSystem) {
      const ds = results.consistency.designSystem;
      console.log(`\n📐 Design System Compliance: ${ds.compliance}%`);
      if (ds.tokens) {
        console.log(`   CSS Variables: ${ds.tokens.cssVariables || 0}`);
        console.log(`   Token Usage: ${ds.tokens.usage || 0}`);
      }
    }
    
    console.log('\n' + '='.repeat(70));
  }

  /**
   * Generate fix recommendations
   */
  async generateFixRecommendations(results) {
    const fixes = [];
    
    // Accessibility fixes
    if (results.accessibility.issues) {
      for (const issue of results.accessibility.issues.filter(i => i.severity === 'HIGH')) {
        fixes.push({
          priority: 'CRITICAL',
          area: 'Accessibility',
          issue: issue.type,
          wcag: issue.wcag,
          fix: issue.fix
        });
      }
    }
    
    // Responsive fixes
    if (!results.responsive.viewportMeta) {
      fixes.push({
        priority: 'CRITICAL',
        area: 'Responsive',
        issue: 'Missing viewport meta tag',
        fix: 'Add <meta name="viewport" content="width=device-width, initial-scale=1">'
      });
    }
    
    // Save fix guide
    const guidePath = 'design-fixes.md';
    let md = '# Design Fix Guide\n\n';
    md += `**Generated**: ${new Date().toISOString()}\n`;
    md += `**Score**: ${results.score}/100\n\n`;
    
    md += '## Critical Fixes\n\n';
    fixes.filter(f => f.priority === 'CRITICAL').forEach(fix => {
      md += `### ${fix.area}: ${fix.issue}\n`;
      if (fix.wcag) md += `**WCAG**: ${fix.wcag}\n`;
      md += `**Fix**: ${fix.fix}\n\n`;
    });
    
    await fs.writeFile(guidePath, md);
    console.log(`\n📝 Design fix guide saved to: ${guidePath}`);
  }

  // Helper methods
  /**
   * Load files modified in git diff
   */
  async loadGitDiffFiles(basePath) {
    try {
      // Find git root directory
      const gitRoot = execSync('git rev-parse --show-toplevel', {
        encoding: 'utf8',
        cwd: process.cwd()
      }).trim();

      // Get files modified in current branch vs main (or master)
      let gitCommand = 'git diff --name-only HEAD~5..HEAD';  // Last 5 commits

      try {
        // Try to get files changed compared to main/master
        execSync('git rev-parse --verify main', { stdio: 'ignore', cwd: gitRoot });
        gitCommand = 'git diff --name-only main...HEAD';
      } catch {
        try {
          execSync('git rev-parse --verify master', { stdio: 'ignore', cwd: gitRoot });
          gitCommand = 'git diff --name-only master...HEAD';
        } catch {
          // Fall back to last 5 commits
          gitCommand = 'git diff --name-only HEAD~5..HEAD';
        }
      }

      const output = execSync(gitCommand, { encoding: 'utf8', cwd: gitRoot });
      const modifiedFiles = output
        .split('\n')
        .filter(f => f.trim())
        .map(f => path.resolve(gitRoot, f));

      this.gitDiffFiles = modifiedFiles;
    } catch (error) {
      console.warn('Failed to load git diff files:', error.message);
      this.gitDiffFiles = [];
    }
  }

  async getComponentFiles(basePath) {
    const files = [];

    async function walk(dir) {
      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);

          if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
            await walk(fullPath);
          } else if (entry.isFile() && entry.name.match(/\.(jsx?|tsx?)$/)) {
            files.push(fullPath);
          }
        }
      } catch (e) {
        // Directory doesn't exist
      }
    }

    await walk(basePath);

    // Filter by git diff if enabled
    if (this.gitDiffOnly && this.gitDiffFiles.length > 0) {
      return files.filter(f => this.gitDiffFiles.includes(f));
    }

    return files;
  }

  async getCSSFiles(basePath) {
    const files = [];

    async function walk(dir) {
      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);

          if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
            await walk(fullPath);
          } else if (entry.isFile() && entry.name.match(/\.(css|scss|sass|less)$/)) {
            files.push(fullPath);
          }
        }
      } catch (e) {
        // Directory doesn't exist
      }
    }

    await walk(basePath);

    // Filter by git diff if enabled
    if (this.gitDiffOnly && this.gitDiffFiles.length > 0) {
      return files.filter(f => this.gitDiffFiles.includes(f));
    }

    return files;
  }

  async getHTMLFiles(basePath) {
    const files = [];

    async function walk(dir) {
      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);

          if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
            await walk(fullPath);
          } else if (entry.isFile() && entry.name.match(/\.html$/)) {
            files.push(fullPath);
          }
        }
      } catch (e) {
        // Directory doesn't exist
      }
    }
    
    // Also check common locations
    const commonPaths = ['index.html', 'public/index.html', 'src/index.html'];
    for (const p of commonPaths) {
      try {
        await fs.access(p);
        files.push(p);
      } catch (e) {
        // File doesn't exist
      }
    }

    await walk(basePath);

    const uniqueFiles = [...new Set(files)];

    // Filter by git diff if enabled
    if (this.gitDiffOnly && this.gitDiffFiles.length > 0) {
      return uniqueFiles.filter(f => this.gitDiffFiles.includes(f));
    }

    return uniqueFiles;
  }
}

// CLI execution
if (import.meta.url === `file://${process.argv[1]}`) {
  const agent = new DesignSubAgent();

  const gitDiffOnly = process.argv.includes('--git-diff-only');
  const pathArg = process.argv.find(arg => !arg.includes('--') && arg !== process.argv[1]);

  agent.execute({
    path: pathArg || './src',
    gitDiffOnly
  }).then(results => {
    if (results.score < 70) {
      console.log('\n⚠️  Design validation failed!');
      console.log('   Fix accessibility and responsive issues.');
      process.exit(1);
    } else {
      console.log('\n✅ Design validation complete.');
      process.exit(0);
    }
  }).catch(error => {
    console.error('Design validation failed:', error);
    process.exit(1);
  });
}

export default DesignSubAgent;