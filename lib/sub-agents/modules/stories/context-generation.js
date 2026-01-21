/**
 * Context Generation Functions for User Stories
 * Generates implementation context, architecture references, code patterns, and testing scenarios
 *
 * @module context-generation
 */

/**
 * Generate implementation context for a user story
 * @param {Object} story - The user story object
 * @param {Object} prd - The PRD object
 * @param {Object} patterns - Codebase patterns
 * @returns {Promise<string>} Implementation context markdown
 */
export async function generateImplementationContext(story, prd, patterns) {
  const context = [];

  context.push('## Implementation Guidance');
  context.push('');

  // Component location
  if (story.title.toLowerCase().includes('ui') || story.title.toLowerCase().includes('component')) {
    context.push('**Component Location:**');
    if (patterns.components.length > 0) {
      context.push(`- Similar components: ${patterns.components.slice(0, 3).map(c => c.path).join(', ')}`);
      context.push('- Follow existing component structure in `src/components/`');
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

/**
 * Generate architecture references for a user story
 * @param {Object} _story - The user story object
 * @param {Object} _prd - The PRD object
 * @param {Object} patterns - Codebase patterns
 * @returns {Promise<Array>} Architecture references array
 */
export async function generateArchitectureReferences(_story, _prd, patterns) {
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

/**
 * Generate example code patterns for a user story
 * @param {Object} story - The user story object
 * @param {Object} _prd - The PRD object
 * @param {Object} _patterns - Codebase patterns
 * @returns {Promise<Array>} Code patterns array
 */
export async function generateCodePatterns(story, _prd, _patterns) {
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

/**
 * Generate testing scenarios for a user story
 * @param {Object} story - The user story object
 * @param {Object} _prd - The PRD object
 * @returns {Promise<Array>} Testing scenarios array
 */
export async function generateTestingScenarios(story, _prd) {
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
