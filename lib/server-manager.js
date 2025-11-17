/**
 * Server Management Helper
 * Integrates with LEO stack restart script for QUICKFIX workflow
 *
 * WSL Context: Vite dev server does not automatically detect changes and
 * recompile in WSL environment due to file system watching limitations.
 * Manual restart via leo-stack.sh is required after code changes.
 *
 * Created: 2025-11-17
 */

import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ENGINEER_DIR = path.resolve(__dirname, '..');
const LEO_STACK_SCRIPT = path.join(ENGINEER_DIR, 'scripts', 'leo-stack.sh');

/**
 * Restart the LEO stack after code changes
 *
 * Required in WSL: Vite dev server does not automatically detect file changes
 * and recompile due to WSL file system watching limitations. This function
 * triggers a manual restart to ensure code changes are picked up.
 *
 * @param {Object} options - Restart options
 * @returns {Promise<Object>} { success: boolean, message: string }
 */
export async function restartLeoStack(options = {}) {
  const { verbose = true, timeout = 60000 } = options;

  if (verbose) {
    console.log('\n🔄 Restarting LEO Stack...\n');
    console.log('   Note: Required in WSL - Vite does not auto-detect changes\n');
  }

  try {
    // Check if script exists
    try {
      execSync(`test -f "${LEO_STACK_SCRIPT}"`, { stdio: 'pipe' });
    } catch (err) {
      return {
        success: false,
        message: 'LEO stack script not found - manual restart required'
      };
    }

    // Run the restart command
    if (verbose) {
      console.log('   Executing: bash scripts/leo-stack.sh restart\n');
    }

    execSync(`bash "${LEO_STACK_SCRIPT}" restart`, {
      cwd: ENGINEER_DIR,
      stdio: verbose ? 'inherit' : 'pipe',
      timeout,
      encoding: 'utf-8'
    });

    if (verbose) {
      console.log('\n   ✅ LEO Stack restarted successfully\n');
    }

    return {
      success: true,
      message: 'LEO Stack restarted successfully'
    };

  } catch (err) {
    if (verbose) {
      console.error(`\n   ❌ LEO Stack restart failed: ${err.message}\n`);
    }

    return {
      success: false,
      message: `LEO Stack restart failed: ${err.message}`,
      error: err
    };
  }
}

/**
 * Check if LEO stack is running
 * @returns {Object} { engineer: boolean, app: boolean, agent: boolean }
 */
export function checkLeoStackStatus() {
  try {
    const output = execSync(`bash "${LEO_STACK_SCRIPT}" status`, {
      cwd: ENGINEER_DIR,
      encoding: 'utf-8',
      stdio: 'pipe'
    });

    return {
      engineer: output.includes('EHG_Engineer') && output.includes('running'),
      app: output.includes('EHG App') && output.includes('running'),
      agent: output.includes('Agent Platform') && output.includes('running'),
      raw: output
    };
  } catch (err) {
    return {
      engineer: false,
      app: false,
      agent: false,
      error: err.message
    };
  }
}

/**
 * Verify server restart was successful
 * @param {number} retries - Number of retries
 * @param {number} delay - Delay between retries (ms)
 * @returns {Promise<boolean>}
 */
export async function verifyServerRestart(retries = 3, delay = 5000) {
  for (let i = 0; i < retries; i++) {
    await new Promise(resolve => setTimeout(resolve, delay));

    const status = checkLeoStackStatus();

    if (status.engineer || status.app || status.agent) {
      return true;
    }

    console.log(`   ⏳ Waiting for servers to start (${i + 1}/${retries})...`);
  }

  return false;
}
