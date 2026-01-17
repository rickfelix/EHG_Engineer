/**
 * Plugin Bridge for Claude Code Simplifier
 * Part of SD-LEO-001: /simplify Command for Automated Code Simplification
 *
 * Detects if the official Claude Code Simplifier Plugin is available
 * and provides a bridge to delegate to it when present.
 *
 * Detection Strategy (from triangulation consensus):
 * 1. Try CLI: `claude /plugin list`
 * 2. Fallback: Check filesystem at ~/.claude/plugins/
 *
 * When plugin is available, delegate for potentially better results.
 * When not available, use native SimplificationEngine.
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

const PLUGIN_NAME = 'code-simplifier';
const PLUGIN_MANIFEST_PATH = path.join(os.homedir(), '.claude', 'plugins', PLUGIN_NAME);

/**
 * Check if the official Claude Code Simplifier Plugin is available
 * @returns {Object} { available, method, version }
 */
export function detectPlugin() {
  // Method 1: Try CLI detection using `claude plugin list`
  try {
    const output = execSync('claude plugin list 2>&1', {
      encoding: 'utf8',
      timeout: 10000
    });

    if (output.includes(PLUGIN_NAME)) {
      // Parse version from output like "Version: 1.0.0"
      const versionMatch = output.match(/Version:\s*([\d.]+)/);
      // Check if enabled
      const isEnabled = output.includes('enabled');
      return {
        available: isEnabled,
        method: 'cli',
        version: versionMatch ? versionMatch[1] : 'unknown',
        enabled: isEnabled
      };
    }
  } catch (error) {
    // CLI method failed, try filesystem
    console.warn(`Plugin detection via CLI failed: ${error.message}`);
  }

  // Method 2: Check filesystem
  try {
    if (fs.existsSync(PLUGIN_MANIFEST_PATH)) {
      const manifestPath = path.join(PLUGIN_MANIFEST_PATH, 'manifest.json');
      if (fs.existsSync(manifestPath)) {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        return {
          available: true,
          method: 'filesystem',
          version: manifest.version || 'unknown',
          enabled: true
        };
      }
      return {
        available: true,
        method: 'filesystem',
        version: 'unknown',
        enabled: true
      };
    }
  } catch {
    // Filesystem check failed
  }

  return {
    available: false,
    method: null,
    version: null,
    enabled: false
  };
}

/**
 * Delegate simplification to the official plugin
 * @param {Array<string>} files - Files to simplify
 * @param {Object} options - Plugin options
 * @returns {Object} Plugin execution result
 */
export async function delegateToPlugin(files, options = {}) {
  const detection = detectPlugin();

  if (!detection.available) {
    return {
      success: false,
      delegated: false,
      reason: 'Plugin not available'
    };
  }

  const {
    dryRun = true
  } = options;

  try {
    // Build plugin command
    const fileArgs = files.map(f => `"${f}"`).join(' ');
    const dryRunFlag = dryRun ? '--dry-run' : '';
    const command = `claude /code-simplifier ${dryRunFlag} ${fileArgs}`;

    console.log(`\n🔌 Delegating to official plugin (v${detection.version})`);
    console.log(`   Command: ${command.substring(0, 80)}${command.length > 80 ? '...' : ''}`);

    const output = execSync(command, {
      encoding: 'utf8',
      timeout: 120000, // 2 minute timeout
      maxBuffer: 10 * 1024 * 1024 // 10MB buffer
    });

    return {
      success: true,
      delegated: true,
      pluginVersion: detection.version,
      output,
      method: detection.method
    };

  } catch (error) {
    console.error(`   ❌ Plugin execution failed: ${error.message}`);
    return {
      success: false,
      delegated: true,
      error: error.message,
      pluginVersion: detection.version
    };
  }
}

/**
 * Get plugin status summary
 * @returns {Object} Status information
 */
export function getPluginStatus() {
  const detection = detectPlugin();

  return {
    ...detection,
    recommendation: detection.available
      ? 'Official plugin available - will use for potentially better results'
      : 'Using native SimplificationEngine (plugin not installed)',
    installInstructions: detection.available ? null : [
      '# To install the official plugin (when available):',
      '/plugin marketplace update claude-plugins-official',
      '/plugin install code-simplifier',
      '/exit && claude  # Restart session'
    ]
  };
}

export default {
  detectPlugin,
  delegateToPlugin,
  getPluginStatus
};
