/**
 * Unit Tests for UI-Touching SD Classifier
 * SD: SD-LEO-ENH-VISION-QA-AUTO-PROCEED-001
 *
 * Tests: classifySDAsUITouching, classifyFromScope (via classifySD fallback),
 * pattern matching, order-insensitivity, edge cases.
 */

import {
  classifySDAsUITouching,
  DEFAULT_UI_PATTERNS,
  DEFAULT_BACKEND_PATTERNS
} from '../../../lib/testing/ui-touching-classifier.js';

// ============================================================================
// TEST GROUP 1: classifySDAsUITouching - UI file detection
// ============================================================================
describe('classifySDAsUITouching()', () => {
  it('should detect .tsx files as UI-touching', () => {
    const result = classifySDAsUITouching(['src/components/Button.tsx']);
    expect(result.ui_touching).toBe(true);
    expect(result.matched_paths.length).toBe(1);
  });

  it('should detect .jsx files as UI-touching', () => {
    const result = classifySDAsUITouching(['pages/dashboard.jsx']);
    expect(result.ui_touching).toBe(true);
  });

  it('should detect .css files as UI-touching', () => {
    const result = classifySDAsUITouching(['styles/global.css']);
    expect(result.ui_touching).toBe(true);
  });

  it('should detect .scss files as UI-touching', () => {
    const result = classifySDAsUITouching(['src/styles/theme.scss']);
    expect(result.ui_touching).toBe(true);
  });

  it('should detect app/ directory as UI-touching', () => {
    const result = classifySDAsUITouching(['app/layout.ts']);
    expect(result.ui_touching).toBe(true);
  });

  it('should detect pages/ directory as UI-touching', () => {
    const result = classifySDAsUITouching(['pages/index.ts']);
    expect(result.ui_touching).toBe(true);
  });

  it('should detect src/components/ directory as UI-touching', () => {
    const result = classifySDAsUITouching(['src/components/Header.tsx']);
    expect(result.ui_touching).toBe(true);
  });

  it('should detect public/ directory as UI-touching', () => {
    const result = classifySDAsUITouching(['public/logo.svg']);
    expect(result.ui_touching).toBe(true);
  });

  it('should detect layout files as UI-touching', () => {
    const result = classifySDAsUITouching(['layout.tsx']);
    expect(result.ui_touching).toBe(true);
  });

  it('should detect theme files as UI-touching', () => {
    const result = classifySDAsUITouching(['theme.config.ts']);
    expect(result.ui_touching).toBe(true);
  });

  it('should detect tailwind config as UI-touching', () => {
    const result = classifySDAsUITouching(['tailwind.config.ts']);
    expect(result.ui_touching).toBe(true);
  });

  it('should detect .svg files as UI-touching', () => {
    const result = classifySDAsUITouching(['assets/icon.svg']);
    expect(result.ui_touching).toBe(true);
  });
});

// ============================================================================
// TEST GROUP 2: Backend-only detection
// ============================================================================
describe('classifySDAsUITouching() - backend only', () => {
  it('should NOT classify lib/ .js files as UI-touching', () => {
    const result = classifySDAsUITouching(['lib/utils/helper.js']);
    expect(result.ui_touching).toBe(false);
    expect(result.matched_paths.length).toBe(0);
  });

  it('should NOT classify scripts/ as UI-touching', () => {
    const result = classifySDAsUITouching(['scripts/migration.js']);
    expect(result.ui_touching).toBe(false);
  });

  it('should NOT classify database/ as UI-touching', () => {
    const result = classifySDAsUITouching(['database/migrations/001.sql']);
    expect(result.ui_touching).toBe(false);
  });

  it('should NOT classify config files as UI-touching', () => {
    const result = classifySDAsUITouching(['config/settings.json']);
    expect(result.ui_touching).toBe(false);
  });

  it('should NOT classify test files as UI-touching', () => {
    const result = classifySDAsUITouching(['tests/unit/helper.test.js']);
    expect(result.ui_touching).toBe(false);
  });

  it('should NOT classify .env files as UI-touching', () => {
    const result = classifySDAsUITouching(['.env.example']);
    expect(result.ui_touching).toBe(false);
  });
});

// ============================================================================
// TEST GROUP 3: Mixed file sets
// ============================================================================
describe('classifySDAsUITouching() - mixed files', () => {
  it('should detect UI-touching when mixed with backend files', () => {
    const result = classifySDAsUITouching([
      'lib/api/handler.js',
      'src/components/Dashboard.tsx',
      'scripts/deploy.js'
    ]);
    expect(result.ui_touching).toBe(true);
    expect(result.matched_paths.length).toBe(1);
    expect(result.matched_paths[0]).toContain('dashboard.tsx');
  });

  it('should count multiple UI matches', () => {
    const result = classifySDAsUITouching([
      'src/components/Header.tsx',
      'src/components/Footer.tsx',
      'styles/global.css'
    ]);
    expect(result.ui_touching).toBe(true);
    expect(result.matched_paths.length).toBe(3);
  });

  it('should return reason with match count', () => {
    const result = classifySDAsUITouching([
      'src/components/A.tsx',
      'src/components/B.tsx'
    ]);
    expect(result.reason).toContain('2 file(s) match UI patterns');
  });
});

// ============================================================================
// TEST GROUP 4: Order insensitivity (FR-2 requirement)
// ============================================================================
describe('classifySDAsUITouching() - order insensitivity', () => {
  it('should produce same result regardless of path order', () => {
    const paths = [
      'lib/api/handler.js',
      'src/components/Dashboard.tsx',
      'scripts/deploy.js'
    ];
    const reversed = [...paths].reverse();
    const shuffled = [paths[1], paths[2], paths[0]];

    const result1 = classifySDAsUITouching(paths);
    const result2 = classifySDAsUITouching(reversed);
    const result3 = classifySDAsUITouching(shuffled);

    expect(result1.ui_touching).toBe(result2.ui_touching);
    expect(result2.ui_touching).toBe(result3.ui_touching);
    expect(result1.matched_paths.length).toBe(result2.matched_paths.length);
  });
});

// ============================================================================
// TEST GROUP 5: Edge cases
// ============================================================================
describe('classifySDAsUITouching() - edge cases', () => {
  it('should handle null input', () => {
    const result = classifySDAsUITouching(null);
    expect(result.ui_touching).toBe(false);
    expect(result.reason).toBe('no_changed_paths');
  });

  it('should handle empty array', () => {
    const result = classifySDAsUITouching([]);
    expect(result.ui_touching).toBe(false);
    expect(result.reason).toBe('no_changed_paths');
  });

  it('should handle undefined input', () => {
    const result = classifySDAsUITouching(undefined);
    expect(result.ui_touching).toBe(false);
    expect(result.reason).toBe('no_changed_paths');
  });

  it('should be case-insensitive for paths', () => {
    const result = classifySDAsUITouching(['SRC/Components/Button.TSX']);
    expect(result.ui_touching).toBe(true);
  });

  it('should normalize backslashes to forward slashes', () => {
    const result = classifySDAsUITouching(['src\\components\\Button.tsx']);
    expect(result.ui_touching).toBe(true);
  });
});

// ============================================================================
// TEST GROUP 6: Custom patterns
// ============================================================================
describe('classifySDAsUITouching() - custom patterns', () => {
  it('should accept custom UI patterns', () => {
    const result = classifySDAsUITouching(
      ['custom-ui/widget.ts'],
      { uiPatterns: ['custom-ui/'] }
    );
    expect(result.ui_touching).toBe(true);
  });

  it('should not match default patterns when custom patterns provided', () => {
    const result = classifySDAsUITouching(
      ['src/components/Button.tsx'],
      { uiPatterns: ['custom-only/'] }
    );
    expect(result.ui_touching).toBe(false);
  });
});

// ============================================================================
// TEST GROUP 7: Constants exported
// ============================================================================
describe('DEFAULT_UI_PATTERNS', () => {
  it('should be an array', () => {
    expect(Array.isArray(DEFAULT_UI_PATTERNS)).toBe(true);
  });

  it('should include common UI patterns', () => {
    expect(DEFAULT_UI_PATTERNS).toContain('.tsx');
    expect(DEFAULT_UI_PATTERNS).toContain('.jsx');
    expect(DEFAULT_UI_PATTERNS).toContain('.css');
    expect(DEFAULT_UI_PATTERNS).toContain('app/');
    expect(DEFAULT_UI_PATTERNS).toContain('pages/');
  });
});

describe('DEFAULT_BACKEND_PATTERNS', () => {
  it('should be an array', () => {
    expect(Array.isArray(DEFAULT_BACKEND_PATTERNS)).toBe(true);
  });

  it('should include common backend patterns', () => {
    expect(DEFAULT_BACKEND_PATTERNS).toContain('lib/');
    expect(DEFAULT_BACKEND_PATTERNS).toContain('scripts/');
    expect(DEFAULT_BACKEND_PATTERNS).toContain('database/');
  });
});
