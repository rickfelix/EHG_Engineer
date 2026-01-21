/**
 * TESTING Sub-Agent - Troubleshooting Module
 * Provides intelligent troubleshooting suggestions based on error types
 *
 * Responsibilities:
 * - Analyze error messages
 * - Suggest tiered troubleshooting tactics
 * - Provide platform-specific commands
 */

/**
 * Suggest troubleshooting tactics based on error type
 *
 * @param {Error} error - Error object from test execution
 * @returns {Array<Object>} Array of troubleshooting tactics
 */
export function suggestTroubleshootingTactics(error) {
  const tactics = [];
  const errorMsg = error.message.toLowerCase();
  const isWindows = process.platform === 'win32';

  // Tactic 1: Always suggest server restart + single test first
  tactics.push({
    name: 'Server Kill & Restart + Single Test Isolation',
    tier: 'Tier 1 (Quick Win)',
    description: 'Kill server, restart fresh, run single test in isolation',
    command: isWindows ? 'taskkill /f /im node.exe & npm run dev' : 'pkill -f "vite" && npm run dev',
    priority: 1,
    estimated_time: '5-10 minutes',
    fixes_percentage: '40%'
  });

  // Port conflict
  if (containsPortError(errorMsg)) {
    tactics.push({
      name: 'Port Conflict Resolution',
      tier: 'Tier 1 (Quick Win)',
      description: 'Free up ports blocked by zombie processes',
      command: isWindows
        ? 'netstat -ano | findstr :5173  (then: taskkill /F /PID [PID])'
        : 'lsof -i :5173 && kill -9 [PID]',
      priority: 1,
      estimated_time: '5 minutes'
    });
  }

  // Module/cache issues
  if (containsModuleError(errorMsg)) {
    tactics.push({
      name: 'Nuclear Cache Clear',
      tier: 'Tier 1 (Quick Win)',
      description: 'Remove all cached build artifacts',
      command: isWindows
        ? 'rmdir /s /q node_modules\\.vite dist && npm run build'
        : 'rm -rf node_modules/.vite dist/ && npm run build',
      priority: 1,
      estimated_time: '10-15 minutes'
    });

    tactics.push({
      name: 'Dependency Lock Verification',
      tier: 'Tier 1 (Quick Win)',
      description: 'Ensure package-lock.json matches installed versions',
      command: 'npm ci && npx playwright install --with-deps',
      priority: 2,
      estimated_time: '10 minutes'
    });
  }

  // Timeout issues
  if (containsTimeoutError(errorMsg)) {
    tactics.push({
      name: 'Test Timeout & Async Analysis',
      tier: 'Tier 2 (Deep Diagnostic)',
      description: 'Increase timeout and check for missing await statements',
      command: 'npx playwright test --timeout=60000 --debug',
      priority: 2,
      estimated_time: '15-20 minutes'
    });
  }

  // Element not found
  if (containsElementError(errorMsg)) {
    tactics.push({
      name: 'Visual Debugging & Screenshots',
      tier: 'Tier 3 (Advanced)',
      description: 'See exactly what browser sees at failure point',
      command: 'npx playwright test --headed --debug',
      priority: 2,
      estimated_time: '20-30 minutes'
    });
  }

  // Database issues
  if (containsDatabaseError(errorMsg)) {
    tactics.push({
      name: 'Database State Verification & Reset',
      tier: 'Tier 2 (Deep Diagnostic)',
      description: 'Ensure test database is in known state',
      command: 'npm run db:migrate:status && npm run db:seed:test',
      priority: 2,
      estimated_time: '15-20 minutes'
    });
  }

  // Environment issues
  if (containsEnvError(errorMsg)) {
    tactics.push({
      name: 'Environment Variable Validation',
      tier: 'Tier 2 (Deep Diagnostic)',
      description: 'Verify all required env vars are loaded',
      command: 'node -e "require(\'dotenv\').config(); console.log(process.env.SUPABASE_URL)"',
      priority: 2,
      estimated_time: '10 minutes'
    });
  }

  // Sort by priority
  tactics.sort((a, b) => a.priority - b.priority);

  return tactics;
}

/**
 * Check if error contains port-related keywords
 */
function containsPortError(errorMsg) {
  return errorMsg.includes('eaddrinuse') ||
    errorMsg.includes('address already in use') ||
    errorMsg.includes('connection refused');
}

/**
 * Check if error contains module/file-related keywords
 */
function containsModuleError(errorMsg) {
  return errorMsg.includes('module') ||
    errorMsg.includes('cannot find') ||
    errorMsg.includes('enoent');
}

/**
 * Check if error contains timeout-related keywords
 */
function containsTimeoutError(errorMsg) {
  return errorMsg.includes('timeout') ||
    errorMsg.includes('exceeded');
}

/**
 * Check if error contains element/selector-related keywords
 */
function containsElementError(errorMsg) {
  return errorMsg.includes('element') ||
    errorMsg.includes('selector') ||
    errorMsg.includes('not found');
}

/**
 * Check if error contains database-related keywords
 */
function containsDatabaseError(errorMsg) {
  return errorMsg.includes('database') ||
    errorMsg.includes('query') ||
    errorMsg.includes('rls') ||
    errorMsg.includes('permission');
}

/**
 * Check if error contains environment-related keywords
 */
function containsEnvError(errorMsg) {
  return errorMsg.includes('undefined') ||
    errorMsg.includes('env') ||
    errorMsg.includes('config');
}
