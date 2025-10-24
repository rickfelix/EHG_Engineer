#!/usr/bin/env node
/**
 * 📝 STORIES Sub-Agent - User Story Creation & Context Engineering
 *
 * BMAD Enhancement: Hyper-detailed implementation context for user stories
 *
 * Purpose:
 * - Create user stories from PRD acceptance criteria (if none exist)
 * - Generate comprehensive implementation context for each user story
 * - Provide architecture references, code patterns, and testing scenarios
 * - Reduce EXEC agent confusion by front-loading implementation details
 *
 * User Story Creation:
 * - Automatically generates user stories from PRD acceptance_criteria
 * - One user story per acceptance criterion
 * - Auto-assigns priority (first=HIGH, 2-3=MEDIUM, rest=LOW)
 * - Adds standard acceptance criteria for testing validation
 *
 * Context Engineering Fields:
 * 1. implementation_context - Detailed implementation guidance
 * 2. architecture_references - Links to patterns, components, docs
 * 3. example_code_patterns - Code snippets and patterns to follow
 * 4. testing_scenarios - Test cases with inputs/outputs
 *
 * Activation: PLAN_PRD phase (after PRD creation, before EXEC)
 * Blocking: No (enhancement only, doesn't block)
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { randomUUID } from 'crypto';
import pkg from 'glob';
const { glob } = pkg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '../../.env') });

/**
 * Execute User Story Context Engineering
 * @param {string} sdId - Strategic Directive ID
 * @param {Object} subAgent - Sub-agent configuration
 * @param {Object} options - Execution options
 * @returns {Promise<Object>} Enhancement results
 */
export async function execute(sdId, subAgent, options = {}) {
  console.log(`\n📝 USER STORY CONTEXT ENGINEERING - Executing for ${sdId}\n`);

  const supabase = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );

  const results = {
    sd_id: sdId,
    timestamp: new Date().toISOString(),
    stories_processed: 0,
    stories_enhanced: 0,
    context_added: [],
    skipped: [],
    verdict: 'PASS',
    confidence: 0
  };

  try {
    // ============================================
    // 1. FETCH USER STORIES
    // ============================================
    console.log('📋 Step 1: Fetching user stories...');
    let { data: userStories, error: storiesError } = await supabase
      .from('user_stories')
      .select('*')
      .eq('sd_id', sdId);

    if (storiesError) {
      throw new Error(`Failed to fetch user stories: ${storiesError.message}`);
    }

    // ============================================
    // 1A. CREATE USER STORIES IF NONE EXIST
    // ============================================
    if (!userStories || userStories.length === 0) {
      console.log('   ⚠️  No user stories found');
      console.log('\n📝 Step 1A: Creating user stories from acceptance criteria...');

      // Fetch PRD to get acceptance criteria
      const prdId = options.prd_id || `PRD-${sdId}`;
      console.log(`   Fetching PRD: ${prdId}`);

      const { data: prd, error: prdError } = await supabase
        .from('product_requirements_v2')
        .select('*')
        .eq('id', prdId)
        .single();

      if (prdError || !prd) {
        console.log(`   ❌ PRD not found: ${prdError?.message || 'No PRD exists'}`);
        results.verdict = 'WARNING';
        results.confidence = 50;
        results.warnings = ['No user stories found and no PRD to generate from. Create PRD first.'];
        return results;
      }

      if (!prd.acceptance_criteria || prd.acceptance_criteria.length === 0) {
        console.log('   ❌ PRD has no acceptance criteria');
        results.verdict = 'WARNING';
        results.confidence = 50;
        results.warnings = ['No acceptance criteria in PRD to generate user stories from.'];
        return results;
      }

      console.log(`   ✓ Found ${prd.acceptance_criteria.length} acceptance criteria`);
      console.log('   📝 Generating user stories with implementation context...\n');

      // Analyze codebase patterns first
      const codebasePatterns = await analyzeCodebasePatterns(sdId, prd);

      const createdStories = [];
      for (let i = 0; i < prd.acceptance_criteria.length; i++) {
        const criterion = prd.acceptance_criteria[i];
        const storyKey = `${sdId}:US-${String(i + 1).padStart(3, '0')}`;

        // Create basic story object for context generation
        const storyTemplate = {
          title: criterion,
          sd_id: sdId,
          prd_id: prdId
        };

        // Generate implementation context upfront
        const implContext = await generateImplementationContext(storyTemplate, prd, codebasePatterns);

        // Generate user story with implementation context (matching working pattern)
        const userStory = {
          id: randomUUID(),
          story_key: storyKey,
          sd_id: sdId,
          prd_id: prdId,
          title: criterion,
          user_role: 'developer',
          user_want: `implement ${criterion}`,
          user_benefit: 'the system functions correctly and meets acceptance criteria',
          story_points: 2,
          priority: i === 0 ? 'critical' : (i < 3 ? 'high' : 'medium'),
          status: 'ready',
          acceptance_criteria: [
            criterion,
            'Implementation verified through unit tests',
            'E2E test validates user-facing behavior',
            'No regressions in related functionality'
          ],
          implementation_context: implContext,
          created_by: 'PLAN'
        };

        // Insert user story
        const { data: inserted, error: insertError } = await supabase
          .from('user_stories')
          .insert(userStory)
          .select()
          .single();

        if (insertError) {
          console.log(`   ❌ Failed to create ${storyKey}: ${insertError.message}`);
          continue;
        }

        console.log(`   ✅ Created ${storyKey}: ${criterion.substring(0, 60)}...`);
        createdStories.push(inserted);
      }

      if (createdStories.length === 0) {
        results.verdict = 'FAIL';
        results.confidence = 0;
        results.critical_issues = [{
          issue: 'Failed to create any user stories from acceptance criteria',
          mitigation_required: true
        }];
        return results;
      }

      console.log(`\n   ✅ Created ${createdStories.length} user stories from acceptance criteria`);
      userStories = createdStories;
      results.stories_created = createdStories.length;
    }

    console.log(`   ✓ Found ${userStories.length} user stories`);
    results.stories_processed = userStories.length;

    // ============================================
    // 2. FETCH PRD FOR CONTEXT
    // ============================================
    console.log('\n📦 Step 2: Fetching PRD for context...');
    const { data: prd } = await supabase
      .from('product_requirements_v2')
      .select('*')
      .eq('sd_id', sdId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (prd) {
      console.log(`   ✓ PRD found: ${prd.title}`);
    } else {
      console.log('   ⚠️  No PRD found - using limited context');
    }

    // ============================================
    // 3. ANALYZE CODEBASE PATTERNS
    // ============================================
    console.log('\n🔍 Step 3: Analyzing codebase patterns...');
    const codebasePatterns = await analyzeCodebasePatterns(sdId, prd);
    console.log(`   ✓ Found ${Object.keys(codebasePatterns).length} relevant patterns`);

    // ============================================
    // 4. ENHANCE EACH USER STORY
    // ============================================
    console.log('\n✨ Step 4: Enhancing user stories with context...\n');

    for (const story of userStories) {
      console.log(`   Processing: ${story.story_id || story.id}`);
      console.log(`   Title: ${story.title}`);

      // Check if already enhanced
      if (story.implementation_context && story.implementation_context.length > 100) {
        console.log('   ⏭️  Already enhanced - skipping');
        results.skipped.push({
          story_id: story.story_id || story.id,
          reason: 'Already has implementation context'
        });
        continue;
      }

      // Generate context
      const context = await generateImplementationContext(story, prd, codebasePatterns);
      const architectureRefs = await generateArchitectureReferences(story, prd, codebasePatterns);
      const codePatterns = await generateCodePatterns(story, prd, codebasePatterns);
      const testingScenarios = await generateTestingScenarios(story, prd);

      // Update user story
      const { error: updateError } = await supabase
        .from('user_stories')
        .update({
          implementation_context: context,
          architecture_references: architectureRefs,
          example_code_patterns: codePatterns,
          testing_scenarios: testingScenarios,
          updated_at: new Date().toISOString()
        })
        .eq('id', story.id);

      if (updateError) {
        console.log(`   ❌ Failed to update: ${updateError.message}`);
        results.skipped.push({
          story_id: story.story_id || story.id,
          reason: `Update failed: ${updateError.message}`
        });
      } else {
        console.log('   ✅ Enhanced with implementation context');
        results.stories_enhanced++;
        results.context_added.push({
          story_id: story.story_id || story.id,
          title: story.title,
          context_length: context.length,
          architecture_refs: architectureRefs.length,
          code_patterns: codePatterns.length,
          test_scenarios: testingScenarios.length
        });
      }

      console.log('');
    }

    // ============================================
    // 5. GENERATE SUMMARY
    // ============================================
    console.log('\n📊 Step 5: Generating summary...');

    const enhancementRate = (results.stories_enhanced / results.stories_processed * 100).toFixed(1);
    results.confidence = Math.min(parseInt(enhancementRate), 95);

    if (results.stories_enhanced === results.stories_processed) {
      results.verdict = 'PASS';
      console.log(`   ✅ All ${results.stories_enhanced} stories enhanced`);
    } else if (results.stories_enhanced > 0) {
      results.verdict = 'CONDITIONAL_PASS';
      console.log(`   ⚠️  ${results.stories_enhanced}/${results.stories_processed} stories enhanced`);
    } else {
      results.verdict = 'WARNING';
      console.log(`   ⚠️  No stories were enhanced`);
    }

    // ============================================
    // 6. GENERATE RECOMMENDATIONS
    // ============================================
    results.recommendations = [];

    if (results.stories_enhanced > 0) {
      results.recommendations.push({
        title: 'Context Engineering Complete',
        description: `${results.stories_enhanced} user stories enhanced with implementation context. EXEC agents will have detailed guidance.`
      });
    }

    if (results.skipped.length > 0) {
      results.recommendations.push({
        title: 'Review Skipped Stories',
        description: `${results.skipped.length} stories were skipped. Review to ensure they have adequate context.`
      });
    }

    // Add usage guidance
    results.recommendations.push({
      title: 'EXEC Phase Guidance',
      description: 'User stories now include: implementation_context (architecture patterns, component locations), architecture_references (existing code to reference), example_code_patterns (code snippets), and testing_scenarios (test cases).'
    });

    // ============================================
    // 7. FINAL SUMMARY
    // ============================================
    console.log('\n' + '='.repeat(60));
    console.log('📝 USER STORY CONTEXT ENGINEERING COMPLETE');
    console.log('='.repeat(60));
    console.log(`Stories Processed: ${results.stories_processed}`);
    console.log(`Stories Enhanced: ${results.stories_enhanced}`);
    console.log(`Skipped: ${results.skipped.length}`);
    console.log(`Enhancement Rate: ${enhancementRate}%`);
    console.log(`Verdict: ${results.verdict} (${results.confidence}% confidence)`);
    console.log('='.repeat(60) + '\n');

    return results;

  } catch (error) {
    console.error('❌ Context Engineering Failed:', error.message);
    return {
      ...results,
      verdict: 'FAIL',
      confidence: 0,
      critical_issues: [{
        issue: `Context engineering failed: ${error.message}`,
        mitigation_required: false
      }]
    };
  }
}

// ============================================
// CONTEXT GENERATION FUNCTIONS
// ============================================

async function analyzeCodebasePatterns(sdId, prd) {
  const patterns = {
    components: [],
    services: [],
    utilities: [],
    hooks: [],
    types: []
  };

  // Detect target application from PRD or SD
  const targetApp = detectTargetApplication(prd);
  const basePath = targetApp === 'EHG' ? '/mnt/c/_EHG/ehg' : '/mnt/c/_EHG/EHG_Engineer';

  console.log(`   Target app: ${targetApp} (${basePath})`);

  try {
    // Find existing components
    if (existsSync(`${basePath}/src/components`)) {
      const componentFiles = await glob(`${basePath}/src/components/**/*.{tsx,jsx}`, { absolute: true });
      const filesArray = Array.isArray(componentFiles) ? componentFiles : [];
      patterns.components = filesArray.slice(0, 10).map(f => ({
        path: f.replace(basePath, ''),
        name: f.split('/').pop().replace(/\.(tsx|jsx)$/, '')
      }));
    }

    // Find existing services
    if (existsSync(`${basePath}/src/services`)) {
      const serviceFiles = await glob(`${basePath}/src/services/**/*.{ts,js}`, { absolute: true });
      const filesArray = Array.isArray(serviceFiles) ? serviceFiles : [];
      patterns.services = filesArray.slice(0, 10).map(f => ({
        path: f.replace(basePath, ''),
        name: f.split('/').pop().replace(/\.(ts|js)$/, '')
      }));
    }

    // Find existing hooks
    if (existsSync(`${basePath}/src/hooks`)) {
      const hookFiles = await glob(`${basePath}/src/hooks/**/*.{ts,tsx,js,jsx}`, { absolute: true });
      const filesArray = Array.isArray(hookFiles) ? hookFiles : [];
      patterns.hooks = filesArray.slice(0, 10).map(f => ({
        path: f.replace(basePath, ''),
        name: f.split('/').pop().replace(/\.(ts|tsx|js|jsx)$/, '')
      }));
    }

  } catch (error) {
    console.log(`   ⚠️  Pattern analysis warning: ${error.message}`);
  }

  return patterns;
}

function detectTargetApplication(prd) {
  if (!prd) return 'EHG'; // Default to EHG

  const content = `${prd.title} ${prd.executive_summary || ''} ${prd.technical_context || ''}`.toLowerCase();

  // EHG_Engineer indicators
  if (content.includes('leo protocol') ||
      content.includes('strategic directive') ||
      content.includes('dashboard') && content.includes('management') ||
      content.includes('engineer')) {
    return 'EHG_Engineer';
  }

  return 'EHG'; // Default to customer-facing app
}

async function generateImplementationContext(story, prd, patterns) {
  const context = [];

  context.push('## Implementation Guidance');
  context.push('');

  // Component location
  if (story.title.toLowerCase().includes('ui') || story.title.toLowerCase().includes('component')) {
    context.push('**Component Location:**');
    if (patterns.components.length > 0) {
      context.push(`- Similar components: ${patterns.components.slice(0, 3).map(c => c.path).join(', ')}`);
      context.push(`- Follow existing component structure in \`src/components/\``);
    } else {
      context.push('- Create new component in `src/components/`');
    }
    context.push('');
  }

  // Architecture patterns
  context.push('**Architecture Patterns:**');
  if (prd?.system_architecture) {
    context.push(`- Follow architecture: ${prd.system_architecture.substring(0, 200)}...`);
  }
  context.push('- Use existing patterns from similar features');
  context.push('- Maintain separation of concerns (UI/logic/data)');
  context.push('');

  // Integration points
  context.push('**Integration Points:**');
  if (patterns.services.length > 0) {
    context.push(`- Services: ${patterns.services.slice(0, 3).map(s => s.name).join(', ')}`);
  }
  if (patterns.hooks.length > 0) {
    context.push(`- Hooks: ${patterns.hooks.slice(0, 3).map(h => h.name).join(', ')}`);
  }
  context.push('- Database: Use Supabase client with proper error handling');
  context.push('');

  // Implementation steps
  context.push('**Implementation Steps:**');
  context.push('1. Read existing similar components/features');
  context.push('2. Create component structure following patterns');
  context.push('3. Implement core logic with error handling');
  context.push('4. Add unit tests for business logic');
  context.push('5. Add E2E tests for user flows');
  context.push('6. Verify accessibility and responsive design');

  return context.join('\n');
}

async function generateArchitectureReferences(story, prd, patterns) {
  const references = [];

  // Component references
  if (patterns.components.length > 0) {
    references.push({
      type: 'component',
      name: patterns.components[0].name,
      path: patterns.components[0].path,
      purpose: 'Similar component to reference for patterns'
    });
  }

  // Service references
  if (patterns.services.length > 0) {
    references.push({
      type: 'service',
      name: patterns.services[0].name,
      path: patterns.services[0].path,
      purpose: 'Service layer pattern to follow'
    });
  }

  // Documentation references
  references.push({
    type: 'documentation',
    name: 'Component Guidelines',
    path: 'docs/03_protocols_and_standards/component-guidelines.md',
    purpose: 'Component sizing and structure guidelines (300-600 LOC)'
  });

  references.push({
    type: 'documentation',
    name: 'Testing Requirements',
    path: 'docs/reference/test-timeout-handling.md',
    purpose: 'Unit + E2E testing requirements'
  });

  return references;
}

async function generateCodePatterns(story, prd, patterns) {
  const codePatterns = [];

  // Supabase query pattern
  codePatterns.push({
    pattern: 'Supabase Query',
    description: 'Standard Supabase query with error handling',
    code: `const { data, error } = await supabase
  .from('table_name')
  .select('id, title, status')
  .eq('condition', value)
  .limit(10);

if (error) {
  console.error('Query failed:', error.message);
  return { success: false, error: error.message };
}

return { success: true, data };`
  });

  // React component pattern
  if (story.title.toLowerCase().includes('ui') || story.title.toLowerCase().includes('component')) {
    codePatterns.push({
      pattern: 'React Component',
      description: 'Standard React component with TypeScript',
      code: `interface ComponentProps {
  title: string;
  onAction: (id: string) => void;
}

export function Component({ title, onAction }: ComponentProps) {
  const [loading, setLoading] = useState(false);

  const handleAction = async (id: string) => {
    setLoading(true);
    try {
      await onAction(id);
    } catch (error) {
      console.error('Action failed:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="component">
      <h2>{title}</h2>
      {/* Component content */}
    </div>
  );
}`
    });
  }

  // Error handling pattern
  codePatterns.push({
    pattern: 'Error Handling',
    description: 'Standard try-catch with logging',
    code: `try {
  const result = await operation();
  return { success: true, data: result };
} catch (error) {
  console.error('Operation failed:', error.message);
  return {
    success: false,
    error: error.message,
    timestamp: new Date().toISOString()
  };
}`
  });

  return codePatterns;
}

async function generateTestingScenarios(story, prd) {
  const scenarios = [];

  // Happy path scenario
  scenarios.push({
    scenario: 'Happy Path',
    description: `User successfully completes: ${story.title}`,
    input: 'Valid user input with proper permissions',
    expected_output: 'Operation succeeds, UI updates correctly, success message shown',
    test_type: 'e2e',
    priority: 'HIGH'
  });

  // Error scenario
  scenarios.push({
    scenario: 'Error Handling',
    description: 'System handles errors gracefully',
    input: 'Invalid input or missing permissions',
    expected_output: 'Clear error message, no data corruption, UI remains stable',
    test_type: 'unit + e2e',
    priority: 'MEDIUM'
  });

  // Edge case scenario
  scenarios.push({
    scenario: 'Edge Cases',
    description: 'System handles edge cases (empty data, special characters, etc.)',
    input: 'Edge case inputs (empty strings, null values, special characters)',
    expected_output: 'Graceful handling, validation messages where appropriate',
    test_type: 'unit',
    priority: 'LOW'
  });

  return scenarios;
}

// ============================================
// CLI EXECUTION
// ============================================
if (import.meta.url === `file://${process.argv[1]}`) {
  const sdId = process.argv[2];

  if (!sdId) {
    console.error('Usage: node stories.js <SD-ID>');
    console.error('Example: node stories.js SD-EXPORT-001');
    process.exit(1);
  }

  execute(sdId, { code: 'STORIES', name: 'User Story Context Engineering Sub-Agent' })
    .then(results => {
      const exitCode = results.verdict === 'PASS' || results.verdict === 'CONDITIONAL_PASS' ? 0 : 1;
      process.exit(exitCode);
    })
    .catch(error => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}
