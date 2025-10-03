import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function createPRD() {
  const prdId = 'PRD-SD-DESIGN-007';

  const { data, error } = await supabase
    .from('prd_registry')
    .insert({
      id: prdId,
      sd_id: '4ebc4f0c-15ea-42e0-aba2-4e440a8085f7',
      title: 'Design System Documentation - Color Token Rationale',
      executive_summary: 'Document the strategic rationale behind three critical color token changes from SD-DESIGN-001: --primary (hsl(221.2 83.2% 53.3%) → hsl(262.1 83.3% 57.8%)), --muted-foreground (hsl(215.4 16.3% 46.9%) → hsl(215.4 16.3% 56.9%)), and --sidebar-foreground (hsl(240 5.3% 26.1%) → hsl(240 5.9% 10%)). This documentation prevents knowledge loss and provides future developers with context for these foundational design decisions.',
      acceptance_criteria: [
        'AC-1: Create comprehensive documentation file at docs/design-system/color-token-rationale.md explaining all three token changes',
        'AC-2: Document --primary token change with BEFORE/AFTER values, visual hierarchy impact analysis, and button prominence assessment',
        'AC-3: Document --muted-foreground token change with BEFORE/AFTER values, readability evaluation across light/dark themes, and contrast ratio validation',
        'AC-4: Document --sidebar-foreground token change with BEFORE/AFTER values, sidebar legibility assessment, and navigation clarity impact',
        'AC-5: Include cross-references to SD-DESIGN-001 parent directive with links to specific commits or files modified',
        'AC-6: Add visual examples section with code snippets showing token usage in Button, Typography, and Sidebar components',
        'AC-7: Include accessibility compliance notes for each token (WCAG 2.1 AA contrast requirements)',
        'AC-8: Create conventional git commit with format: docs(SD-DESIGN-007): Document color token rationale from SD-DESIGN-001'
      ],
      functional_requirements: [
        'Documentation Structure: Frontmatter with title, parent SD, date, authors',
        'Token Analysis Format: For each token - BEFORE value, AFTER value, HSL breakdown, rationale, impact analysis',
        'Visual Hierarchy Section: Explain how --primary change affects button prominence and call-to-action visibility',
        'Readability Section: Document how --muted-foreground change improves text legibility without sacrificing hierarchy',
        'Navigation Section: Explain how --sidebar-foreground change enhances navigation clarity and reduces eye strain',
        'Cross-Reference System: Markdown links to SD-DESIGN-001, related files, and commit hashes',
        'Code Examples: Practical before/after snippets showing token usage in shadcn/ui components',
        'Accessibility Notes: WCAG contrast ratio requirements (4.5:1 for text, 3:1 for large text, 4.5:1 for UI components)'
      ],
      technical_requirements: [
        'File Location: docs/design-system/color-token-rationale.md',
        'Markdown Format: GitHub-flavored markdown with proper headings, code blocks, and tables',
        'HSL Color Notation: Document all values in HSL format matching Tailwind CSS conventions',
        'Token References: Use CSS variable syntax (--primary, --muted-foreground, --sidebar-foreground)',
        'Code Blocks: Use css for color definitions, tsx for component examples',
        'Contrast Calculation: Include actual contrast ratios calculated using WCAG formula',
        'Git Integration: Ensure file is tracked, committed with SD-DESIGN-007 reference, and pushed to repository',
        'Parent SD Link: Include full SD-DESIGN-001 context (ID, title, completion date if available)'
      ],
      implementation_approach: 'PHASE 1 - Research (15 min): Review SD-DESIGN-001 changes, identify specific files modified, gather before/after HSL values. PHASE 2 - Structure (15 min): Create docs/design-system/ directory if needed, set up markdown template with frontmatter and sections. PHASE 3 - Content (45 min): Write detailed rationale for each token (--primary: visual hierarchy, --muted-foreground: readability, --sidebar-foreground: navigation clarity), include HSL breakdowns, impact analysis, and accessibility notes. PHASE 4 - Examples (20 min): Add code snippets showing token usage in Button (--primary), Typography (--muted-foreground), and Sidebar (--sidebar-foreground) components. PHASE 5 - Git (10 min): Commit with conventional format, verify file is tracked and pushed.',
      test_scenarios: [
        'Manual Test 1: Open docs/design-system/color-token-rationale.md in VS Code, verify frontmatter includes title, parent SD-DESIGN-001, date, authors',
        'Manual Test 2: Check --primary section contains BEFORE (hsl(221.2 83.2% 53.3%)) and AFTER (hsl(262.1 83.3% 57.8%)) values',
        'Manual Test 3: Check --muted-foreground section contains BEFORE (hsl(215.4 16.3% 46.9%)) and AFTER (hsl(215.4 16.3% 56.9%)) values',
        'Manual Test 4: Check --sidebar-foreground section contains BEFORE (hsl(240 5.3% 26.1%)) and AFTER (hsl(240 5.9% 10%)) values',
        'Manual Test 5: Verify each token section includes impact analysis (visual hierarchy, readability, or navigation)',
        'Manual Test 6: Verify code examples section includes Button component using --primary token',
        'Manual Test 7: Verify accessibility section includes WCAG 2.1 AA contrast requirements (4.5:1, 3:1)',
        'Manual Test 8: Run git log --oneline --grep=SD-DESIGN-007, verify commit exists with docs(SD-DESIGN-007) format',
        'Manual Test 9: Verify cross-references to SD-DESIGN-001 are valid markdown links',
        'Manual Test 10: Verify all HSL values match SD-DESIGN-001 actual changes (not hypothetical)'
      ],
      metadata: {
        estimated_effort: '1.75 hours (Research: 15min, Structure: 15min, Content: 45min, Examples: 20min, Git: 10min, Buffer: 30min)',
        target_files: [
          'docs/design-system/color-token-rationale.md (NEW - primary deliverable)',
          'docs/design-system/ (directory creation if needed)'
        ],
        sub_agents_required: ['Senior Design Sub-Agent (design rationale expertise)', 'Information Architecture Lead (documentation structure)'],
        parent_sd_context: {
          parent_id: 'SD-DESIGN-001',
          parent_title: 'Chairman Dashboard Color Token Updates',
          tokens_changed: ['--primary', '--muted-foreground', '--sidebar-foreground'],
          change_summary: 'Improved visual hierarchy, readability, and navigation clarity through strategic HSL adjustments'
        },
        token_details: {
          primary: {
            before: 'hsl(221.2 83.2% 53.3%)',
            after: 'hsl(262.1 83.3% 57.8%)',
            impact: 'Visual hierarchy and button prominence'
          },
          muted_foreground: {
            before: 'hsl(215.4 16.3% 46.9%)',
            after: 'hsl(215.4 16.3% 56.9%)',
            impact: 'Readability and text legibility'
          },
          sidebar_foreground: {
            before: 'hsl(240 5.3% 26.1%)',
            after: 'hsl(240 5.9% 10%)',
            impact: 'Navigation clarity and sidebar legibility'
          }
        }
      }
    })
    .select();

  if (error) {
    console.error('❌ Error creating PRD:', error.message);
    return;
  }

  console.log('✅ PRD-SD-DESIGN-007 created successfully');
  console.log('');
  console.log('📋 PRD Details:');
  console.log('   ID:', prdId);
  console.log('   Acceptance Criteria: 8');
  console.log('   Functional Requirements: 8');
  console.log('   Technical Requirements: 8');
  console.log('   Test Scenarios: 10');
  console.log('   Estimated Effort: 1.75 hours');
  console.log('');
  console.log('🎯 Next Step: PLAN agent creates PLAN→EXEC handoff');
}

createPRD();
