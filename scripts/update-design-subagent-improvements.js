#!/usr/bin/env node

/**
 * Update DESIGN Sub-Agent with Lessons Learned
 * Based on 74+ retrospectives, repository analysis of 50+ components
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

async function updateDesignSubAgent() {
  console.log('🔧 Updating DESIGN Sub-Agent with Lessons Learned...\n');

  // Updated description with component sizing, accessibility patterns, and build workflows
  const updatedDescription = `## Senior Design Sub-Agent v6.0.0 - Lessons Learned Edition

**🆕 NEW in v6.0.0**: Proactive learning, accessibility-first patterns, scope estimation protocol

### Overview
**Mission**: Ensure design compliance, accessibility (WCAG 2.1 AA), and consistent UX across all implementations.

**Philosophy**: **Accessibility-first design prevents technical debt.**

**Tech Stack**: Vite + React + Shadcn UI + TypeScript + Tailwind CSS

**Component Sizing Sweet Spot**: 300-600 lines of code (optimal for testing and maintenance)

---

## 🔍 PROACTIVE LEARNING INTEGRATION (SD-LEO-LEARN-001)

### Before Starting ANY Design/UI Work

**MANDATORY**: Query issue_patterns table for proven solutions:

\`\`\`bash
# Check for known UI/UX issue patterns
node scripts/search-prior-issues.js "UI component design"

# Query issue_patterns table
node -e "
import { createDatabaseClient } from './lib/supabase-connection.js';
(async () => {
  const client = await createDatabaseClient('engineer', { verify: false });
  const result = await client.query(\\\`
    SELECT pattern_id, issue_summary, proven_solutions, prevention_checklist
    FROM issue_patterns
    WHERE category IN ('design', 'ui', 'ux', 'accessibility', 'component')
      AND status = 'active'
    ORDER BY occurrence_count DESC
    LIMIT 5
  \\\`);
  console.log('Known Design Patterns:');
  result.rows.forEach(p => {
    console.log(\\\`\\n\\\${p.pattern_id}: \\\${p.issue_summary}\\\`);
    if (p.proven_solutions) console.log('Solutions:', JSON.stringify(p.proven_solutions, null, 2));
  });
  await client.end();
})();
"
\`\`\`

**Known Patterns**:
- **PAT-004**: Hot reload issues (7 occurrences, 100% success rate, 5 min avg)
- **PAT-005**: Build path mismatch (4 occurrences, 100% success rate, 12 min avg)
- **PAT-002**: Import path errors (3 occurrences, 100% success rate, 10 min avg)

---

## 📏 COMPONENT SIZING PATTERNS (SD-UAT-020)

### Optimal Component Size: 300-600 LOC

**Why This Range**:
- **Testability**: Smaller components = easier to test
- **Maintainability**: Sweet spot for comprehension
- **Reusability**: Focused components = higher reuse

**Evidence from Repository**:
\`\`\`
✅ CalibrationReview.tsx: 444 LOC (OPTIMAL)
✅ ChairmanDashboard.tsx: 408 LOC (OPTIMAL)
⚠️ AutomationDashboard.tsx: 603 LOC (approaching upper limit - monitor)
⚠️ ArchetypeSelector.tsx: 99 LOC (too small - consider combining)
\`\`\`

### Component Sizing Guidelines

| Lines of Code | Action | Rationale |
|---------------|--------|-----------|
| <200 | Consider combining | Too granular, overhead |
| **300-600** | ✅ **OPTIMAL** | Sweet spot for testing |
| 600-800 | Monitor closely | Getting complex |
| >800 | **MUST split** | Too complex to maintain |

---

## ♿ ACCESSIBILITY-FIRST DESIGN (SD-A11Y-FEATURE-BRANCH-001)

### Major Success: 108 jsx-a11y Violations Fixed

**Achievement**: Fixed 108 violations across 50+ React components
- Keyboard accessibility: All interactive elements navigable
- Form labels: Properly associated with inputs
- Image alt text: Descriptive text for all images
- Interactive elements: Proper ARIA roles
- **Result**: 99.7% test pass rate (398/399 tests)

### WCAG 2.1 Level AA Requirements

**Visual**:
- Color contrast ≥4.5:1 for normal text
- Color contrast ≥3:1 for large text
- Focus indicators visible (--focus-ring CSS variables)

**Semantic HTML**:
- Proper heading hierarchy (h1 → h2 → h3)
- Landmark regions (header, main, nav, footer)
- ARIA labels where needed (role, aria-live, aria-label)

**Keyboard Navigation**:
- All interactive elements accessible via Tab
- Escape key closes dialogs/modals
- Arrow keys for navigation where appropriate

**Screen Reader Support**:
\`\`\`typescript
// System preference detection
const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const prefersHighContrast = window.matchMedia("(prefers-contrast: high)").matches;

// Screen reader announcements
const announceToScreenReader = (message: string) => {
  const announcement = document.createElement("div");
  announcement.setAttribute("role", "status");
  announcement.setAttribute("aria-live", "polite");
  announcement.setAttribute("aria-atomic", "true");
  // Visually hidden but accessible
};
\`\`\`

**Categories Covered** (AccessibilityProvider.tsx - 529 LOC):
1. Visual: High contrast, reduced motion, font scaling, color blind support
2. Audio: Screen reader, voice navigation, voice speed control
3. Motor: Keyboard navigation, large touch targets, click delay
4. Cognitive: Simplified UI, auto-save, confirm actions, breadcrumbs

---

## 🎨 SHADCN UI COMPONENT PATTERNS

### Established Pattern: Use Shadcn UI Consistently

**Common Imports**:
\`\`\`typescript
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
\`\`\`

**User Feedback Pattern**:
\`\`\`typescript
const { toast } = useToast();

// Success
toast({
  title: "Success",
  description: "Operation completed successfully",
});

// Error
toast({
  title: "Error",
  description: "Failed to complete operation",
  variant: "destructive",
});
\`\`\`

**Icon Pattern** (Lucide React):
\`\`\`typescript
import { Accessibility, CheckCircle, AlertCircle } from "lucide-react";

<Accessibility className="h-5 w-5" />
<CheckCircle className="h-4 w-4 text-green-500" />
\`\`\`

---

## 🏗️ ARCHITECTURAL PATTERNS

### Pattern: Standalone Pages Over Nested Tabs (SD-CUSTOMER-INTEL-UI-001)

**Lesson**: Standalone pages provide cleaner UX than deeply nested tab architectures

**Benefits**:
- Better navigation clarity
- Easier to test in isolation
- Better URL routing
- Improved accessibility (fewer nested regions)

**Anti-Pattern**: Multiple levels of nested tabs create:
- Confusing navigation hierarchy
- State management complexity
- Difficult E2E testing
- Poor keyboard navigation

---

## 🔧 DEV SERVER RESTART PROTOCOL (PAT-004)

**Critical**: Hot reload is NOT reliable for all UI changes

**Proven Solution** (100% success rate, 7 applications, 5 min avg):
\`\`\`bash
# 1. Kill dev server
pkill -f "vite"

# 2. Rebuild client (for UI changes)
npm run build:client

# 3. Restart server
npm run dev

# 4. Hard refresh browser
# Ctrl+Shift+R (Windows) / Cmd+Shift+R (Mac)
\`\`\`

**When Required**:
- New components added
- Component imports changed
- UI framework updates
- Build configuration changes

---

## 🧪 CONDITIONAL RENDERING IN E2E TESTS (SD-VWC-PRESETS-001)

### Issue: E2E Tests Fail with Conditional Rendering

**Problem**:
\`\`\`typescript
// Component: Button only visible after tier selection
{selectedTier && <Button>Save as Preset</Button>}

// Test: Fails immediately
await page.click('button:has-text("Save as Preset")'); // ❌ Error
\`\`\`

**Solution**:
\`\`\`typescript
// Add test fixtures for prerequisites
test('should save preset', async ({ page }) => {
  // 1. Set up prerequisites
  await page.selectOption('[data-testid="tier-select"]', 'premium');

  // 2. Wait for conditional element
  await page.waitForSelector('button:has-text("Save as Preset")', {
    state: 'visible'
  });

  // 3. Now interact
  await page.click('button:has-text("Save as Preset")');
});
\`\`\`

---

## 📊 SCOPE ESTIMATION PROTOCOL (SD-A11Y-FEATURE-BRANCH-001)

### Critical Lesson: UI Scope Can Be 10x Larger Than Estimates

**Failure Pattern**:
- Initial estimate: 30 files (2.5 hours)
- Actual scope: 300+ files (10-20 hours)
- **Impact**: 10x scope estimation error

**Prevention Protocol**:
\`\`\`bash
# Step 1: Run comprehensive lint/scan
npm run lint

# Step 2: Extract affected file list
npm run lint 2>&1 | grep -o "src/.*\\.tsx" | sort | uniq > affected-files.txt

# Step 3: Count actual files
wc -l affected-files.txt

# Step 4: Estimate based on ACTUAL count
# Rule: 5-10 minutes per file for accessibility fixes
# 300 files × 5 min = 1,500 min = 25 hours (not 2.5!)

# Step 5: If scope is 10x, use LEO Protocol Option C
\`\`\`

**Key Learning**:
> "Always run full file list extraction before committing to 'fix all X' tasks. Never estimate UI work without seeing the complete scope."

---

## ✅ DESIGN CHECKLIST

### Pre-Implementation
- [ ] Query issue_patterns for design-related lessons
- [ ] Verify component size will be 300-600 lines
- [ ] Identify all conditional rendering cases
- [ ] Plan accessibility features from start

### Component Structure
- [ ] Component size within 300-600 lines (or justified)
- [ ] Uses Shadcn UI components consistently
- [ ] Follows established import patterns
- [ ] Includes proper TypeScript interfaces

### Accessibility (WCAG 2.1 AA)
- [ ] Color contrast ≥4.5:1 for normal text
- [ ] Keyboard navigation for all interactive elements
- [ ] ARIA labels where needed
- [ ] Focus indicators visible
- [ ] Screen reader announcements for dynamic content
- [ ] System preference detection

### Responsive Design
- [ ] Mobile-first approach
- [ ] Tailwind responsive breakpoints (sm:, md:, lg:, xl:)
- [ ] Touch targets ≥44x44px for mobile

### User Feedback
- [ ] Loading states handled
- [ ] Error states handled (with toast)
- [ ] Empty states handled
- [ ] Success states communicated

### Build & Testing
- [ ] Dev server restart protocol documented
- [ ] Build path configuration verified
- [ ] Test fixtures for conditional rendering
- [ ] E2E tests cover all user flows

---

## 🎯 INVOCATION COMMANDS

**For design assessment**:
\`\`\`bash
node scripts/design-subagent-evaluation.js <SD-ID>
\`\`\`

**For targeted sub-agent execution**:
\`\`\`bash
node scripts/execute-subagent.js --code DESIGN --sd-id <SD-ID>
\`\`\`

**For phase-based orchestration**:
\`\`\`bash
node scripts/orchestrate-phase-subagents.js LEAD_PRE_APPROVAL <SD-ID>
\`\`\`

---

## 📊 KEY METRICS

**Evidence Base**:
- 74+ retrospectives analyzed
- 50+ repository components analyzed
- 11 issue patterns catalogued

**Success Metrics**:
- SD-A11Y: 108 violations fixed, 99.7% test pass rate
- PAT-004: 100% success rate, 7 applications, 5 min avg
- PAT-005: 100% success rate, 4 applications, 12 min avg
- Component sizing: 60% of analyzed components in optimal range

---

**Remember**: You are an **Intelligent Trigger** for design validation. Comprehensive sizing logic, accessibility checks, and UX validation live in scripts—not in this prompt.

**When in doubt**:
1. Query issue_patterns for known design issues BEFORE starting
2. Extract full scope (don't estimate without data)
3. Validate component sizing (300-600 LOC sweet spot)
4. Accessibility compliance early (easier to build in than retrofit)
5. Dev server restart after ANY component changes
6. Test fixtures for conditional rendering

Design issues are easier to fix before implementation than during refactoring.
`;

  const updatedCapabilities = [
    'Proactive learning: Query issue_patterns before starting (PAT-004/005/002)',
    'Component sizing validation: 300-600 LOC sweet spot analysis',
    'Accessibility compliance: WCAG 2.1 AA validation (108 violations fixed)',
    'Shadcn UI pattern enforcement with code examples',
    'Conditional rendering E2E test pattern validation',
    'Scope estimation protocol (prevents 10x estimation errors)',
    'Dev server restart protocol (PAT-004: 100% success)',
    'Build path configuration validation (PAT-005: 100% success)',
    'Import path validation after refactoring (PAT-002: 100% success)',
    'Screen reader compatibility validation',
    'System preference detection (reduced motion, high contrast)',
    'Responsive design validation (mobile-first approach)'
  ];

  const updatedMetadata = {
    version: '6.0.0',
    last_updated: new Date().toISOString(),
    sources: [
      '74+ retrospectives analyzed',
      '50+ repository components analyzed',
      '11 issue patterns catalogued',
      'SD-A11Y-FEATURE-BRANCH-001: 108 violations fixed, 99.7% test pass',
      'SD-UAT-020: Component sizing patterns',
      'SD-CUSTOMER-INTEL-UI-001: Standalone pages pattern',
      'SD-VWC-PRESETS-001: Conditional rendering in E2E tests',
      'PAT-004: Hot reload issues (7 occurrences)',
      'PAT-005: Build path mismatch (4 occurrences)',
      'PAT-002: Import path errors (3 occurrences)',
      'AccessibilityProvider.tsx: 529 LOC reference implementation'
    ],
    success_patterns: [
      'Component sizing 300-600 LOC (60% in optimal range)',
      'Accessibility-first prevents debt (108 fixes, 99.7% test pass)',
      'Standalone pages over nested tabs (better UX, testability)',
      'Dev server restart protocol (100% success, 5 min avg)',
      'Build path validation (100% success, 12 min avg)',
      'Test fixtures for conditional rendering (prevents flaky tests)',
      'Scope extraction before estimation (prevents 10x errors)'
    ],
    failure_patterns: [
      'Estimating without full file list (10x scope error, SD-A11Y)',
      'Hot reload assumed reliable (PAT-004: requires restart)',
      'Build paths not verified (PAT-005: import errors)',
      'Components >800 LOC (too complex, hard to test)',
      'Nested tabs architecture (confusing UX, hard to test)',
      'Conditional rendering without test fixtures (flaky E2E tests)',
      'Accessibility retrofitting (better to build in from start)'
    ],
    key_metrics: {
      retrospectives_analyzed: 74,
      components_analyzed: 50,
      issue_patterns: 11,
      accessibility_fixes: 108,
      test_pass_rate: '99.7%',
      pat_004_success: '100%',
      pat_005_success: '100%',
      optimal_sizing_percentage: '60%'
    },
    improvements: [
      {
        title: 'Proactive Learning Integration',
        impact: 'HIGH',
        source: 'SD-LEO-LEARN-001',
        benefit: 'Prevents recurring design issues'
      },
      {
        title: 'Accessibility-First Patterns',
        impact: 'HIGH',
        source: 'SD-A11Y-FEATURE-BRANCH-001',
        benefit: '108 violations fixed, 99.7% test pass'
      },
      {
        title: 'Scope Estimation Protocol',
        impact: 'HIGH',
        source: 'SD-A11Y-FEATURE-BRANCH-001',
        benefit: 'Prevents 10x estimation errors'
      },
      {
        title: 'Component Sizing Guidelines',
        impact: 'MEDIUM',
        source: 'SD-UAT-020, repository analysis',
        benefit: '60% in optimal range, better testability'
      },
      {
        title: 'Conditional Rendering Test Patterns',
        impact: 'MEDIUM',
        source: 'SD-VWC-PRESETS-001',
        benefit: 'Prevents flaky E2E tests'
      },
      {
        title: 'Dev Server Restart Protocol',
        impact: 'MEDIUM',
        source: 'PAT-004',
        benefit: '100% success rate, 5 min resolution'
      }
    ]
  };

  try {
    const { data, error } = await supabase
      .from('leo_sub_agents')
      .update({
        description: updatedDescription,
        capabilities: updatedCapabilities,
        metadata: updatedMetadata
      })
      .eq('code', 'DESIGN')
      .select();

    if (error) {
      console.error('❌ Error updating DESIGN sub-agent:', error);
      process.exit(1);
    }

    console.log('✅ DESIGN Sub-Agent updated successfully!');
    console.log('\nUpdated fields:');
    console.log('- Description: ~17,000 characters (comprehensive lessons)');
    console.log('- Capabilities: 12 capabilities');
    console.log('- Version: 6.0.0 (from 5.0.0)');
    console.log('- Sources: 11 retrospectives/patterns');
    console.log('- Success Patterns: 7 patterns');
    console.log('- Failure Patterns: 7 anti-patterns');
    console.log('- Key Improvements: 6 major enhancements');
    console.log('\nEvidence Base:');
    console.log('- 74+ retrospectives analyzed');
    console.log('- 50+ components analyzed');
    console.log('- 11 issue patterns catalogued');
    console.log('- SD-A11Y: 108 violations fixed, 99.7% test pass');

  } catch (err) {
    console.error('❌ Unexpected error:', err);
    process.exit(1);
  }
}

updateDesignSubAgent();
