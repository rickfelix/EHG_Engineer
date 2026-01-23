/**
 * Troubleshooting Tactics for E2E Test Failures
 *
 * Extracted from TESTING sub-agent v3.0
 * SD: SD-LEO-REFAC-TESTING-INFRA-001
 */

/**
 * Suggest troubleshooting tactics based on error type
 * @param {Error} error - The error that occurred
 * @returns {Array<Object>} Sorted list of troubleshooting tactics
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
  if (errorMsg.includes('eaddrinuse') || errorMsg.includes('address already in use') ||
      errorMsg.includes('connection refused')) {
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
  if (errorMsg.includes('module') || errorMsg.includes('cannot find') ||
      errorMsg.includes('enoent')) {
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
  if (errorMsg.includes('timeout') || errorMsg.includes('exceeded')) {
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
  if (errorMsg.includes('element') || errorMsg.includes('selector') ||
      errorMsg.includes('not found')) {
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
  if (errorMsg.includes('database') || errorMsg.includes('query') ||
      errorMsg.includes('rls') || errorMsg.includes('permission')) {
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
  if (errorMsg.includes('undefined') || errorMsg.includes('env') ||
      errorMsg.includes('config')) {
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
 * Log troubleshooting suggestions to console
 * @param {Array<Object>} tactics - List of troubleshooting tactics
 */
export function logTroubleshootingTactics(tactics) {
  if (!tactics || tactics.length === 0) return;

  console.log('\n      🔧 TROUBLESHOOTING SUGGESTIONS:');
  tactics.forEach((tactic, i) => {
    console.log(`         ${i + 1}. ${tactic.name} (${tactic.tier})`);
    console.log(`            ${tactic.description}`);
  });
}
