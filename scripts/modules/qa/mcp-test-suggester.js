/**
 * MCP Test Suggester Module
 *
 * Generates natural language Playwright MCP commands from user stories
 * for fast, interactive testing during EXEC phase.
 *
 * Philosophy: "MCP for iteration, Playwright scripts for automation"
 */

/**
 * Generate MCP testing commands from a user story
 *
 * @param {Object} userStory - User story object from database
 * @param {string} userStory.story_key - Story key (e.g., "US-001")
 * @param {string} userStory.title - Story title
 * @param {string} userStory.description - Story description
 * @param {Array<string>} userStory.acceptance_criteria - Acceptance criteria
 * @param {string} userStory.test_scenarios - Test scenarios (optional)
 * @returns {Object} MCP workflow with commands and metadata
 */
export function generateMCPTestCommands(userStory) {
  const url = extractURLFromStory(userStory);
  const actions = extractActionsFromCriteria(userStory.acceptance_criteria || []);
  const verifications = extractVerifications(userStory.acceptance_criteria || []);

  const workflow = [
    `Navigate to ${url}`,
    'Wait for page to load completely',
    ...actions.map(action => `${action}`),
    ...verifications.map(verify => `Verify: ${verify}`),
    `Take screenshot and save as "${userStory.story_key}-evidence.png"`
  ];

  return {
    story_key: userStory.story_key,
    title: userStory.title,
    method: 'MCP_INTERACTIVE',
    estimated_time: '2-5 minutes',
    mcp_workflow: workflow,
    mcp_tools: {
      navigate: 'mcp__playwright__browser_navigate',
      click: 'mcp__playwright__browser_click',
      type: 'mcp__playwright__browser_type',
      screenshot: 'mcp__playwright__browser_take_screenshot',
      snapshot: 'mcp__playwright__browser_snapshot'
    },
    example_invocation: generateExampleInvocation(userStory, workflow),
    automation_alternative: {
      method: 'AUTOMATED_PLAYWRIGHT',
      command: `npm run test:e2e -- tests/e2e/${extractTestFileName(userStory)}`,
      estimated_time: '5-15 minutes',
      when_to_use: 'For comprehensive validation, CI/CD, regression testing'
    }
  };
}

/**
 * Generate natural language example of how to invoke MCP for this user story
 */
function generateExampleInvocation(userStory, workflow) {
  return {
    prompt: `Test user story ${userStory.story_key}: ${userStory.title}`,
    mcp_commands: workflow,
    expected_output: 'Screenshot evidence + validation results'
  };
}

/**
 * Extract URL from user story description or title
 */
function extractURLFromStory(userStory) {
  const description = userStory.description || userStory.title || '';

  // Look for explicit URLs
  const urlMatch = description.match(/https?:\/\/[^\s]+/);
  if (urlMatch) {
    return urlMatch[0];
  }

  // Look for route patterns
  const routeMatch = description.match(/\/([\w-\/]+)/);
  if (routeMatch) {
    return `http://localhost:5173${routeMatch[0]}`;
  }

  // Infer from title keywords
  const keywords = {
    'dashboard': '/dashboard',
    'analytics': '/chairman-analytics',
    'settings': '/settings',
    'ventures': '/ventures',
    'portfolios': '/portfolios',
    'login': '/auth/login',
    'profile': '/profile'
  };

  for (const [keyword, route] of Object.entries(keywords)) {
    if (description.toLowerCase().includes(keyword)) {
      return `http://localhost:5173${route}`;
    }
  }

  return 'http://localhost:5173';
}

/**
 * Extract actions from acceptance criteria
 */
function extractActionsFromCriteria(criteria) {
  const actions = [];

  for (const criterion of criteria) {
    // Look for action verbs
    const actionPatterns = [
      /click(s|ing)?\s+(?:the\s+)?["']?([^"'\n]+)["']?/gi,
      /enter(s|ing)?\s+["']?([^"'\n]+)["']?/gi,
      /fill(s|ing)?\s+(?:in\s+)?["']?([^"'\n]+)["']?/gi,
      /select(s|ing)?\s+["']?([^"'\n]+)["']?/gi,
      /submit(s|ting)?\s+(?:the\s+)?form/gi,
      /navigate(s|ing)?\s+to\s+["']?([^"'\n]+)["']?/gi
    ];

    for (const pattern of actionPatterns) {
      const matches = criterion.matchAll(pattern);
      for (const match of matches) {
        const actionType = match[0].split(/\s+/)[0].toLowerCase();
        const target = match[2] || match[0];

        if (actionType.startsWith('click')) {
          actions.push(`Click the "${target}" button`);
        } else if (actionType.startsWith('enter') || actionType.startsWith('fill')) {
          actions.push(`Fill "${target}" field`);
        } else if (actionType.startsWith('select')) {
          actions.push(`Select "${target}" option`);
        } else if (actionType.startsWith('submit')) {
          actions.push('Submit the form');
        } else if (actionType.startsWith('navigate')) {
          actions.push(`Navigate to ${target}`);
        }
      }
    }
  }

  return actions.length > 0 ? actions : ['Interact with the page as described in acceptance criteria'];
}

/**
 * Extract verification points from acceptance criteria
 */
function extractVerifications(criteria) {
  const verifications = [];

  for (const criterion of criteria) {
    // Look for verification keywords
    const verificationPatterns = [
      /should\s+(?:see|display|show)\s+["']?([^"'\n]+)["']?/gi,
      /must\s+(?:see|display|show|contain)\s+["']?([^"'\n]+)["']?/gi,
      /expect(s|ing)?\s+["']?([^"'\n]+)["']?/gi,
      /verify\s+["']?([^"'\n]+)["']?/gi
    ];

    for (const pattern of verificationPatterns) {
      const matches = criterion.matchAll(pattern);
      for (const match of matches) {
        verifications.push(match[1] || match[2] || 'Expected outcome achieved');
      }
    }
  }

  return verifications.length > 0 ? verifications : ['All acceptance criteria met'];
}

/**
 * Extract test file name from user story
 */
function extractTestFileName(userStory) {
  // If test_scenarios has explicit file name, use it
  if (userStory.test_scenarios && userStory.test_scenarios.includes('.spec.ts')) {
    const match = userStory.test_scenarios.match(/[\w-]+\.spec\.ts/);
    if (match) return match[0];
  }

  // Generate from story key
  const storyKey = userStory.story_key.toLowerCase().replace('us-', '');
  return `user-story-${storyKey}.spec.ts`;
}

/**
 * Generate MCP workflow summary for multiple user stories
 *
 * @param {Array<Object>} userStories - Array of user story objects
 * @returns {Object} Aggregated MCP testing workflow
 */
export function generateMCPWorkflowForSD(userStories) {
  const workflows = userStories.map(story => generateMCPTestCommands(story));

  const totalEstimatedTime = workflows.length * 3; // 3 minutes average per story

  return {
    total_stories: userStories.length,
    estimated_time: `${totalEstimatedTime}-${totalEstimatedTime * 2} minutes`,
    method: 'MCP_INTERACTIVE',
    approach: 'Test each user story interactively with Playwright MCP',
    workflows: workflows,
    summary: {
      mcp_tools_needed: ['playwright MCP'],
      prerequisites: [
        'Dev server running (npm run dev)',
        'Playwright MCP server connected (claude mcp list)',
        'Features implemented and accessible'
      ],
      deliverables: [
        'Screenshot evidence for each user story',
        'Validation results for acceptance criteria',
        'Quick feedback for EXEC agent'
      ]
    },
    automation_alternative: {
      method: 'AUTOMATED_PLAYWRIGHT',
      command: 'npm run test:e2e',
      estimated_time: `${workflows.length * 5}-${workflows.length * 10} minutes`,
      when_to_use: 'For comprehensive validation before PLAN→LEAD handoff'
    }
  };
}

/**
 * Create human-readable MCP testing guide
 *
 * @param {Object} userStory - User story object
 * @returns {string} Formatted guide for main agent
 */
export function createMCPTestingGuide(userStory) {
  const commands = generateMCPTestCommands(userStory);

  return `
🎭 Playwright MCP Testing Guide for ${commands.story_key}
${'='.repeat(60)}

Story: ${commands.title}
Method: ${commands.method} (${commands.estimated_time})

MCP Workflow:
${commands.mcp_workflow.map((step, i) => `${i + 1}. ${step}`).join('\n')}

Example Invocation:
"${commands.example_invocation.prompt}"

Expected Deliverables:
- Screenshot: ${commands.story_key}-evidence.png
- Validation: All acceptance criteria verified
- Time: ~${commands.estimated_time}

Alternative (Automated):
${commands.automation_alternative.command}
Time: ~${commands.automation_alternative.estimated_time}
When: ${commands.automation_alternative.when_to_use}
`;
}

/**
 * Determine if MCP testing is appropriate for this SD
 *
 * @param {Object} sd - Strategic directive object
 * @param {string} phase - Current phase (EXEC, PLAN, etc.)
 * @returns {Object} Recommendation with rationale
 */
export function shouldUseMCPTesting(sd, phase) {
  // MCP is preferred during EXEC phase for quick iteration
  if (phase === 'EXEC' || phase === 'EXEC_IMPLEMENTATION') {
    return {
      use_mcp: true,
      rationale: 'EXEC phase: MCP provides fast feedback for iterative development',
      primary_method: 'MCP_INTERACTIVE',
      fallback_method: 'AUTOMATED_PLAYWRIGHT'
    };
  }

  // Automated tests are preferred during PLAN verification
  if (phase === 'PLAN' || phase === 'PLAN_VERIFY' || phase === 'PLAN_VERIFICATION') {
    return {
      use_mcp: false,
      rationale: 'PLAN phase: Comprehensive automated testing required for verification',
      primary_method: 'AUTOMATED_PLAYWRIGHT',
      alternative_method: 'MCP_INTERACTIVE'
    };
  }

  // For UI-related SDs, MCP is valuable
  if (isUISD(sd)) {
    return {
      use_mcp: true,
      rationale: 'UI SD: MCP visual verification is highly effective',
      primary_method: 'MCP_INTERACTIVE',
      fallback_method: 'AUTOMATED_PLAYWRIGHT'
    };
  }

  return {
    use_mcp: false,
    rationale: 'Non-UI SD: Automated tests may be sufficient',
    primary_method: 'AUTOMATED_PLAYWRIGHT',
    alternative_method: 'MCP_INTERACTIVE'
  };
}

/**
 * Helper: Check if SD is UI-related
 */
function isUISD(sd) {
  const uiCategories = ['UI', 'Feature', 'Dashboard', 'Component', 'Page', 'Frontend'];
  const uiKeywords = ['component', 'page', 'dashboard', 'interface', 'form', 'button', 'modal'];

  const categoryMatch = uiCategories.some(cat =>
    sd.category?.toLowerCase().includes(cat.toLowerCase())
  );

  const scopeMatch = uiKeywords.some(kw =>
    sd.scope?.toLowerCase().includes(kw)
  );

  return categoryMatch || scopeMatch;
}
