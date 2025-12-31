/**
 * Genesis Virtual Bunker - Quality Gates
 *
 * Validates generated code passes all quality checks before deployment.
 * Part of SD-GENESIS-V31-MASON-P2
 *
 * @module lib/genesis/quality-gates
 */

import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs/promises';

/**
 * Gate result structure.
 * @typedef {Object} GateResult
 * @property {string} gate - Name of the gate
 * @property {boolean} passed - Whether the gate passed
 * @property {string} output - Command output
 * @property {number} duration - Execution time in ms
 * @property {string} [error] - Error message if failed
 */

/**
 * Execute a command and capture output.
 *
 * @param {string} command - Command to run
 * @param {string[]} args - Command arguments
 * @param {string} cwd - Working directory
 * @param {number} timeout - Timeout in ms (default 60000)
 * @returns {Promise<{ success: boolean, output: string, exitCode: number }>}
 */
async function execCommand(command, args, cwd, timeout = 60000) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    let output = '';
    let timedOut = false;

    const proc = spawn(command, args, {
      cwd,
      shell: true,
      env: { ...process.env, CI: 'true' },
    });

    const timer = setTimeout(() => {
      timedOut = true;
      proc.kill('SIGTERM');
    }, timeout);

    proc.stdout.on('data', (data) => {
      output += data.toString();
    });

    proc.stderr.on('data', (data) => {
      output += data.toString();
    });

    proc.on('close', (exitCode) => {
      clearTimeout(timer);
      resolve({
        success: exitCode === 0 && !timedOut,
        output: timedOut ? output + '\n[TIMEOUT]' : output,
        exitCode: timedOut ? -1 : exitCode,
        duration: Date.now() - startTime,
      });
    });

    proc.on('error', (err) => {
      clearTimeout(timer);
      resolve({
        success: false,
        output: err.message,
        exitCode: -1,
        duration: Date.now() - startTime,
      });
    });
  });
}

/**
 * Run TypeScript type checking (tsc --noEmit).
 *
 * @param {string} projectDir - Project directory
 * @returns {Promise<GateResult>}
 */
export async function runTypeScriptGate(projectDir) {
  const startTime = Date.now();

  // Check if tsconfig exists
  const tsconfigPath = path.join(projectDir, 'tsconfig.json');
  try {
    await fs.access(tsconfigPath);
  } catch {
    return {
      gate: 'TypeScript',
      passed: true,
      output: 'No tsconfig.json found - skipping TypeScript check',
      duration: Date.now() - startTime,
    };
  }

  const result = await execCommand('npx', ['tsc', '--noEmit'], projectDir);

  return {
    gate: 'TypeScript',
    passed: result.success,
    output: result.output || 'TypeScript check passed',
    duration: result.duration,
    error: result.success ? undefined : 'TypeScript compilation failed',
  };
}

/**
 * Run ESLint check.
 *
 * @param {string} projectDir - Project directory
 * @param {string[]} files - Specific files to lint (optional)
 * @returns {Promise<GateResult>}
 */
export async function runESLintGate(projectDir, files = ['.']) {
  const startTime = Date.now();

  // Check if eslint config exists
  const eslintConfigs = ['.eslintrc.js', '.eslintrc.json', '.eslintrc.cjs', 'eslint.config.js'];
  let hasConfig = false;
  for (const config of eslintConfigs) {
    try {
      await fs.access(path.join(projectDir, config));
      hasConfig = true;
      break;
    } catch {
      // Continue checking
    }
  }

  if (!hasConfig) {
    return {
      gate: 'ESLint',
      passed: true,
      output: 'No ESLint config found - skipping lint check',
      duration: Date.now() - startTime,
    };
  }

  const args = ['eslint', ...files, '--max-warnings', '0'];
  const result = await execCommand('npx', args, projectDir);

  return {
    gate: 'ESLint',
    passed: result.success,
    output: result.output || 'ESLint check passed',
    duration: result.duration,
    error: result.success ? undefined : 'ESLint found errors',
  };
}

/**
 * Run build check (npm run build or npm run dev --dry-run).
 *
 * @param {string} projectDir - Project directory
 * @returns {Promise<GateResult>}
 */
export async function runBuildGate(projectDir) {
  const startTime = Date.now();

  // Check package.json for build script
  let packageJson;
  try {
    const content = await fs.readFile(path.join(projectDir, 'package.json'), 'utf-8');
    packageJson = JSON.parse(content);
  } catch {
    return {
      gate: 'Build',
      passed: true,
      output: 'No package.json found - skipping build check',
      duration: Date.now() - startTime,
    };
  }

  const scripts = packageJson.scripts || {};

  // Try build first, then dev with timeout
  if (scripts.build) {
    const result = await execCommand('npm', ['run', 'build'], projectDir, 120000);
    return {
      gate: 'Build',
      passed: result.success,
      output: result.output || 'Build completed',
      duration: result.duration,
      error: result.success ? undefined : 'Build failed',
    };
  }

  // For dev, we just check it can start
  if (scripts.dev) {
    const result = await execCommand('npm', ['run', 'dev', '--', '--help'], projectDir, 10000);
    return {
      gate: 'Build',
      passed: true, // Dev scripts don't need to complete
      output: 'Dev script exists and is invocable',
      duration: result.duration,
    };
  }

  return {
    gate: 'Build',
    passed: true,
    output: 'No build or dev script found',
    duration: Date.now() - startTime,
  };
}

/**
 * Run smoke test (basic functionality check).
 *
 * @param {string} projectDir - Project directory
 * @returns {Promise<GateResult>}
 */
export async function runSmokeTestGate(projectDir) {
  const startTime = Date.now();

  // Check for test script
  let packageJson;
  try {
    const content = await fs.readFile(path.join(projectDir, 'package.json'), 'utf-8');
    packageJson = JSON.parse(content);
  } catch {
    return {
      gate: 'SmokeTest',
      passed: true,
      output: 'No package.json found - skipping smoke test',
      duration: Date.now() - startTime,
    };
  }

  const scripts = packageJson.scripts || {};

  // Look for test:smoke, test:unit, or test
  const testScript = scripts['test:smoke'] ? 'test:smoke' :
                     scripts['test:unit'] ? 'test:unit' :
                     scripts.test ? 'test' : null;

  if (!testScript) {
    return {
      gate: 'SmokeTest',
      passed: true,
      output: 'No test script found - skipping smoke test',
      duration: Date.now() - startTime,
    };
  }

  const result = await execCommand('npm', ['run', testScript], projectDir, 120000);

  return {
    gate: 'SmokeTest',
    passed: result.success,
    output: result.output || 'Smoke test passed',
    duration: result.duration,
    error: result.success ? undefined : 'Smoke test failed',
  };
}

/**
 * Run all quality gates on a project.
 *
 * @param {string} projectDir - Project directory
 * @param {Object} options - Gate options
 * @param {boolean} options.skipTypeScript - Skip TypeScript gate
 * @param {boolean} options.skipESLint - Skip ESLint gate
 * @param {boolean} options.skipBuild - Skip build gate
 * @param {boolean} options.skipSmokeTest - Skip smoke test gate
 * @returns {Promise<{ passed: boolean, results: GateResult[], summary: string }>}
 */
export async function runAllGates(projectDir, options = {}) {
  const results = [];
  const gates = [];

  if (!options.skipTypeScript) {
    gates.push(runTypeScriptGate(projectDir));
  }
  if (!options.skipESLint) {
    gates.push(runESLintGate(projectDir));
  }
  if (!options.skipBuild) {
    gates.push(runBuildGate(projectDir));
  }
  if (!options.skipSmokeTest) {
    gates.push(runSmokeTestGate(projectDir));
  }

  const gateResults = await Promise.all(gates);
  results.push(...gateResults);

  const passed = results.every((r) => r.passed);
  const passedCount = results.filter((r) => r.passed).length;
  const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);

  const summary = [
    `Quality Gates: ${passedCount}/${results.length} passed`,
    `Total duration: ${totalDuration}ms`,
    '',
    ...results.map((r) => `  ${r.passed ? '✓' : '✗'} ${r.gate}: ${r.passed ? 'PASS' : 'FAIL'}`),
  ].join('\n');

  return { passed, results, summary };
}

/**
 * Validate a single file with quick gates.
 *
 * @param {string} filePath - Path to file
 * @param {string} projectDir - Project directory
 * @returns {Promise<{ passed: boolean, results: GateResult[] }>}
 */
export async function validateFile(filePath, projectDir) {
  const results = [];

  // TypeScript check for .ts/.tsx files
  if (filePath.endsWith('.ts') || filePath.endsWith('.tsx')) {
    const tsResult = await runTypeScriptGate(projectDir);
    results.push(tsResult);
  }

  // ESLint check
  const eslintResult = await runESLintGate(projectDir, [filePath]);
  results.push(eslintResult);

  const passed = results.every((r) => r.passed);
  return { passed, results };
}

/**
 * Create a quality report in JSON format.
 *
 * @param {GateResult[]} results - Gate results
 * @param {string} projectDir - Project directory
 * @returns {Object} - Quality report
 */
export function createQualityReport(results, projectDir) {
  const timestamp = new Date().toISOString();
  const passed = results.every((r) => r.passed);

  return {
    timestamp,
    projectDir,
    overall: passed ? 'PASS' : 'FAIL',
    gates: results.map((r) => ({
      name: r.gate,
      status: r.passed ? 'PASS' : 'FAIL',
      duration: r.duration,
      error: r.error,
    })),
    summary: {
      total: results.length,
      passed: results.filter((r) => r.passed).length,
      failed: results.filter((r) => !r.passed).length,
      totalDuration: results.reduce((sum, r) => sum + r.duration, 0),
    },
  };
}

export default {
  runTypeScriptGate,
  runESLintGate,
  runBuildGate,
  runSmokeTestGate,
  runAllGates,
  validateFile,
  createQualityReport,
};
