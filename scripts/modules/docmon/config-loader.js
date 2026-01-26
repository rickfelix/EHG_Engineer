/**
 * DOCMON Config Loader
 * Loads and validates .docmon configuration files
 *
 * Part of SD-LEO-INFRA-DOCMON-SUB-AGENT-001-A
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Exit codes
export const EXIT_CODES = {
  PASS: 0,
  RUNTIME_ERROR: 1,
  VALIDATION_FAILED: 2,
  CONFIG_ERROR: 3
};

/**
 * Find repository root by looking for .git directory
 */
export function findRepoRoot(startDir = process.cwd()) {
  let dir = startDir;
  while (dir !== path.parse(dir).root) {
    if (fs.existsSync(path.join(dir, '.git'))) {
      return dir;
    }
    dir = path.dirname(dir);
  }
  return process.cwd();
}

/**
 * Load a JSON config file from .docmon directory
 */
export function loadConfig(filename, repoRoot = null) {
  const root = repoRoot || findRepoRoot();
  const configPath = path.join(root, '.docmon', filename);

  if (!fs.existsSync(configPath)) {
    return {
      success: false,
      error: `Config file not found: ${configPath}`,
      exitCode: EXIT_CODES.CONFIG_ERROR
    };
  }

  try {
    const content = fs.readFileSync(configPath, 'utf8');
    const config = JSON.parse(content);
    return {
      success: true,
      config,
      path: configPath,
      version: config.version || '1.0.0'
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to parse config ${filename}: ${error.message}`,
      exitCode: EXIT_CODES.CONFIG_ERROR
    };
  }
}

/**
 * Load rules configuration
 */
export function loadRulesConfig(repoRoot = null) {
  return loadConfig('rules.json', repoRoot);
}

/**
 * Load metadata schema configuration
 */
export function loadMetadataSchema(repoRoot = null) {
  return loadConfig('metadata.schema.json', repoRoot);
}

/**
 * Load naming exceptions configuration
 */
export function loadNamingExceptions(repoRoot = null) {
  return loadConfig('naming.exceptions.json', repoRoot);
}

/**
 * Get all configs with validation
 */
export function loadAllConfigs(repoRoot = null) {
  const root = repoRoot || findRepoRoot();

  const rules = loadRulesConfig(root);
  const metadata = loadMetadataSchema(root);
  const naming = loadNamingExceptions(root);

  const errors = [];
  if (!rules.success) errors.push(rules.error);
  if (!metadata.success) errors.push(metadata.error);
  if (!naming.success) errors.push(naming.error);

  return {
    success: errors.length === 0,
    configs: {
      rules: rules.success ? rules.config : null,
      metadata: metadata.success ? metadata.config : null,
      naming: naming.success ? naming.config : null
    },
    errors,
    versions: {
      rules: rules.version,
      metadata: metadata.version,
      naming: naming.version
    }
  };
}
