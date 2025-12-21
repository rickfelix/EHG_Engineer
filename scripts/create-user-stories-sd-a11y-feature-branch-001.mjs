#!/usr/bin/env node

/**
 * Create user stories for SD-A11Y-FEATURE-BRANCH-001
 * Accessibility cleanup: 134 jsx-a11y violations across 15+ files
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const db = require('../lib/supabase-connection.js');

const stories = [
  {
    story_key: 'SD-A11Y-FEATURE-BRANCH-001:US-001',
    prd_id: 'PRD-SD-A11Y-FEATURE-BRANCH-001',
    sd_id: 'SD-A11Y-FEATURE-BRANCH-001',
    title: 'Fix parsing error in AnalyticsDashboard.tsx',
    user_role: 'Developer',
    user_want: 'fix the parsing error in AnalyticsDashboard.tsx',
    user_benefit: 'ESLint can run without syntax errors and the build pipeline succeeds',
    story_points: 2,
    priority: 'critical',
    status: 'draft',
    acceptance_criteria: ['Parsing error in AnalyticsDashboard.tsx resolved', 'ESLint runs without syntax errors', 'Component still functions correctly'],
    implementation_context: 'Review syntax in AnalyticsDashboard.tsx lines 1-50 for missing brackets, unclosed JSX tags, or invalid syntax. Common causes: missing closing tags, unclosed template literals, incorrect JSX nesting. Use ESLint output to identify exact line number.',
    architecture_references: ['/mnt/c/_EHG/EHG/src/components/analytics/AnalyticsDashboard.tsx'],
    example_code_patterns: ['Check for patterns like: <div>...</div> (all tags closed)', '{...} (all braces matched)', '() (all parens matched)'],
    testing_scenarios: [
      { scenario: 'Run npm run lint', expected: 'Parsing error resolved' },
      { scenario: 'Check component renders', expected: 'No errors in browser' }
    ]
  },
  {
    story_key: 'SD-A11Y-FEATURE-BRANCH-001:US-002',
    prd_id: 'PRD-SD-A11Y-FEATURE-BRANCH-001',
    sd_id: 'SD-A11Y-FEATURE-BRANCH-001',
    title: 'Fix keyboard accessibility violations (50+ errors)',
    user_role: 'User',
    user_want: 'navigate all interactive elements using only keyboard',
    user_benefit: 'I can use the application without a mouse, improving accessibility',
    story_points: 13,
    priority: 'high',
    status: 'draft',
    acceptance_criteria: [
      'All interactive elements have onKeyDown/onKeyPress handlers',
      'All click handlers also support keyboard navigation',
      'Tab navigation works for all interactive elements',
      '0 jsx-a11y/click-events-have-key-events violations'
    ],
    implementation_context: 'Add keyboard event handlers to all interactive divs/spans. Pattern: onClick + onKeyDown={(e) => e.key === Enter && handleClick()}. Common violations: jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions. Affected files: chairman components, AnalyticsDashboard, AudioPlayer, security cards.',
    architecture_references: ['React keyboard event handling patterns', 'WCAG 2.1 AA keyboard navigation standards'],
    example_code_patterns: ['<div onClick={handleClick} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") handleClick(); }} role="button" tabIndex={0}>...</div>'],
    testing_scenarios: [
      { scenario: 'Use keyboard-only navigation (Tab key)', expected: 'All interactive elements are reachable' },
      { scenario: 'Press Enter/Space on interactive elements', expected: 'Elements activate correctly' },
      { scenario: 'Run npm run lint', expected: '0 keyboard violations' }
    ]
  },
  {
    story_key: 'SD-A11Y-FEATURE-BRANCH-001:US-003',
    prd_id: 'PRD-SD-A11Y-FEATURE-BRANCH-001',
    sd_id: 'SD-A11Y-FEATURE-BRANCH-001',
    title: 'Fix form label violations (40+ errors)',
    user_role: 'Screen Reader User',
    user_want: 'have all form inputs properly labeled',
    user_benefit: 'I can understand what each form field is for and fill out forms independently',
    story_points: 8,
    priority: 'high',
    status: 'draft',
    acceptance_criteria: [
      'All input/select/textarea elements have associated labels',
      'Labels use htmlFor or wrap input elements',
      'Screen readers can identify form controls',
      '0 jsx-a11y/label-has-associated-control violations'
    ],
    implementation_context: 'Add <label htmlFor="inputId">Label Text</label> for all form inputs. Or wrap: <label>Label Text <input /></label>. Common violations: jsx-a11y/label-has-associated-control, jsx-a11y/label-has-for. Affected files: chairman components, AIDocVisualizer, form components.',
    architecture_references: ['React form accessibility patterns', 'WCAG 2.1 AA label requirements'],
    example_code_patterns: ['<label htmlFor="email">Email</label><input id="email" type="email" />', '<label>Email <input type="email" /></label>'],
    testing_scenarios: [
      { scenario: 'Use screen reader (NVDA/JAWS)', expected: 'All inputs are properly labeled' },
      { scenario: 'Run npm run lint', expected: '0 label violations' }
    ]
  },
  {
    story_key: 'SD-A11Y-FEATURE-BRANCH-001:US-004',
    prd_id: 'PRD-SD-A11Y-FEATURE-BRANCH-001',
    sd_id: 'SD-A11Y-FEATURE-BRANCH-001',
    title: 'Fix media caption violations (5 errors)',
    user_role: 'Deaf/Hard of Hearing User',
    user_want: 'have captions or text alternatives for all audio/video content',
    user_benefit: 'I can understand the content even without audio',
    story_points: 3,
    priority: 'medium',
    status: 'draft',
    acceptance_criteria: [
      'All <audio>/<video> elements have track element for captions',
      'Media players provide text alternatives',
      '0 jsx-a11y/media-has-caption violations'
    ],
    implementation_context: 'Add <track kind="captions" src="captions.vtt" /> to audio/video elements. Or add aria-label describing audio content. Affected files: AudioPlayer.tsx. Pattern: Provide text alternative for media content.',
    architecture_references: ['/mnt/c/_EHG/EHG/src/components/audio/AudioPlayer.tsx', 'WebVTT caption format'],
    example_code_patterns: ['<audio controls><source src="audio.mp3" /><track kind="captions" src="captions.vtt" srclang="en" label="English" /></audio>'],
    testing_scenarios: [
      { scenario: 'Verify media elements have caption tracks or text alternatives', expected: 'All media has captions or aria-labels' },
      { scenario: 'Run npm run lint', expected: '0 media caption violations' }
    ]
  },
  {
    story_key: 'SD-A11Y-FEATURE-BRANCH-001:US-005',
    prd_id: 'PRD-SD-A11Y-FEATURE-BRANCH-001',
    sd_id: 'SD-A11Y-FEATURE-BRANCH-001',
    title: 'Fix interactive element violations (40+ errors)',
    user_role: 'Developer',
    user_want: 'all interactive elements to have appropriate ARIA roles and keyboard support',
    user_benefit: 'the application meets WCAG 2.1 AA standards and passes accessibility audits',
    story_points: 8,
    priority: 'high',
    status: 'draft',
    acceptance_criteria: [
      'All interactive elements have appropriate ARIA roles',
      'All interactive elements are keyboard accessible',
      'No redundant or conflicting roles',
      '0 jsx-a11y/no-noninteractive-element-interactions violations'
    ],
    implementation_context: 'Add role="button" to clickable divs/spans. Remove onClick from non-interactive elements (p, h1-h6). Or convert to button element. Common violations: jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-static-element-interactions. Pattern: Use semantic HTML (button, a) over divs with onClick.',
    architecture_references: ['ARIA roles specification', 'WCAG 2.1 AA interactive element guidelines'],
    example_code_patterns: [
      'Instead of: <div onClick={...}>Click</div>',
      'Use: <button onClick={...}>Click</button>',
      'OR: <div role="button" onClick={...} onKeyDown={...} tabIndex={0}>Click</div>'
    ],
    testing_scenarios: [
      { scenario: 'Verify all interactive elements have proper roles and keyboard support', expected: 'All elements have roles' },
      { scenario: 'Use axe DevTools to scan', expected: '0 violations' },
      { scenario: 'Run npm run lint', expected: '0 interactive element violations' }
    ]
  }
];

async function createUserStories() {
  console.log('Creating 5 user stories for SD-A11Y-FEATURE-BRANCH-001...\n');

  const client = await db.createDatabaseClient('engineer', {verify: true});

  try {
    let created = 0;
    for (const story of stories) {
      try {
        const result = await client.query(
          `INSERT INTO user_stories (
            story_key, prd_id, sd_id, title, user_role, user_want, user_benefit,
            story_points, priority, status, acceptance_criteria, implementation_context,
            architecture_references, example_code_patterns, testing_scenarios,
            validation_status, created_by
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
          RETURNING id, story_key`,
          [
            story.story_key,
            story.prd_id,
            story.sd_id,
            story.title,
            story.user_role,
            story.user_want,
            story.user_benefit,
            story.story_points,
            story.priority,
            story.status,
            JSON.stringify(story.acceptance_criteria),
            story.implementation_context,
            JSON.stringify(story.architecture_references),
            JSON.stringify(story.example_code_patterns),
            JSON.stringify(story.testing_scenarios),
            'pending',
            'PLAN-AGENT'
          ]
        );
        console.log(`✅ Created: ${result.rows[0].story_key}`);
        created++;
      } catch (error) {
        console.error(`❌ Failed: ${story.story_key} - ${error.message}`);
      }
    }

    console.log(`\n✅ User story creation complete: ${created}/5 stories created`);
    console.log('\nTotal story points:', stories.reduce((sum, s) => sum + s.story_points, 0));
  } finally {
    await client.end();
  }
}

createUserStories().catch(console.error);
