/**
 * FileDiscoveryEngine Module
 * SD-PRE-EXEC-ANALYSIS-001
 *
 * Purpose: Discover relevant files for EXEC implementation using glob patterns
 * and PRD hints.
 *
 * Dependencies: PathValidator (MUST validate all discovered paths)
 */

import { glob } from 'glob';
import path from 'path';
import { PathValidator } from './path-validator.js';

/**
 * FileDiscoveryEngine class - Discovers relevant files for implementation
 */
export class FileDiscoveryEngine {
  constructor(projectRoot, pathValidator) {
    this.projectRoot = projectRoot;
    this.pathValidator = pathValidator || new PathValidator(projectRoot);
  }

  /**
   * Discover files based on PRD hints
   * @param {Object} prdHints - Hints from PRD (component names, paths, etc.)
   * @returns {Promise<Object>} Discovered files categorized by type
   */
  async discover(prdHints) {
    const discovered = {
      primary: [],
      dependencies: [],
      tests: [],
      configs: []
    };

    try {
      // Extract hints from PRD
      const componentNames = this.extractComponentNames(prdHints);
      const directPaths = this.extractDirectPaths(prdHints);

      // Discover primary implementation files
      discovered.primary = await this.discoverPrimaryFiles(componentNames, directPaths);

      // Discover test files
      discovered.tests = await this.discoverTestFiles(componentNames);

      // Discover configuration files
      discovered.configs = await this.discoverConfigFiles();

      // Dependencies will be populated by DependencyAnalyzer
      // (we discover them here based on imports from primary files)

      // Validate all discovered paths
      const allPaths = [
        ...discovered.primary,
        ...discovered.tests,
        ...discovered.configs
      ];

      const validation = this.pathValidator.validateBatch(allPaths);

      if (validation.invalid.length > 0) {
        console.warn(`⚠️  ${validation.invalid.length} paths excluded due to security validation`);
        validation.invalid.forEach(inv => {
          console.warn(`   ${inv.path}: ${inv.reason}`);
        });
      }

      // Return only validated paths
      return {
        primary: discovered.primary.filter(p => validation.valid.includes(p)),
        dependencies: [],  // Will be populated by DependencyAnalyzer
        tests: discovered.tests.filter(p => validation.valid.includes(p)),
        configs: discovered.configs.filter(p => validation.valid.includes(p)),
        excluded: validation.invalid
      };

    } catch (error) {
      console.error('FileDiscoveryEngine error:', error.message);
      throw error;
    }
  }

  /**
   * Extract component names from PRD
   * @param {Object} prdHints - PRD hints
   * @returns {string[]} Component names
   */
  extractComponentNames(prdHints) {
    const names = [];

    // Extract from functional requirements
    if (prdHints.functional_requirements) {
      prdHints.functional_requirements.forEach(req => {
        // Look for component names in titles and descriptions
        const text = `${req.title} ${req.description}`.toLowerCase();

        // Common patterns: "ComponentName", "feature-name", "module_name"
        const matches = text.match(/[A-Z][a-z]+(?:[A-Z][a-z]+)*/g) || [];
        names.push(...matches);
      });
    }

    // Extract from system architecture
    if (prdHints.system_architecture && prdHints.system_architecture.components) {
      prdHints.system_architecture.components.forEach(comp => {
        if (comp.name) names.push(comp.name);
        if (comp.file_path) names.push(path.basename(comp.file_path, path.extname(comp.file_path)));
      });
    }

    return [...new Set(names)];  // Remove duplicates
  }

  /**
   * Extract direct file paths from PRD
   * @param {Object} prdHints - PRD hints
   * @returns {string[]} Direct file paths
   */
  extractDirectPaths(prdHints) {
    const paths = [];

    // Extract from system architecture components
    if (prdHints.system_architecture && prdHints.system_architecture.components) {
      prdHints.system_architecture.components.forEach(comp => {
        if (comp.file_path) {
          paths.push(comp.file_path);
        }
      });
    }

    return paths;
  }

  /**
   * Discover primary implementation files
   * @param {string[]} componentNames - Component names to search for
   * @param {string[]} directPaths - Direct paths from PRD
   * @returns {Promise<string[]>} Discovered primary files
   */
  async discoverPrimaryFiles(componentNames, directPaths) {
    const files = new Set();

    // Add direct paths first
    directPaths.forEach(p => files.add(path.resolve(this.projectRoot, p)));

    // Search for components by name
    for (const name of componentNames) {
      const patterns = [
        `**/${name}.{ts,tsx,js,jsx}`,
        `**/${name.toLowerCase()}.{ts,tsx,js,jsx}`,
        `**/${name}-*.{ts,tsx,js,jsx}`,
        `**/*${name}.{ts,tsx,js,jsx}`
      ];

      for (const pattern of patterns) {
        try {
          const matches = await glob(pattern, {
            cwd: this.projectRoot,
            ignore: [
              '**/node_modules/**',
              '**/dist/**',
              '**/build/**',
              '**/.next/**',
              '**/coverage/**'
            ],
            absolute: true
          });
          matches.forEach(m => files.add(m));
        } catch (error) {
          console.warn(`Pattern search failed for ${pattern}:`, error.message);
        }
      }
    }

    return Array.from(files);
  }

  /**
   * Discover test files
   * @param {string[]} componentNames - Component names
   * @returns {Promise<string[]>} Discovered test files
   */
  async discoverTestFiles(componentNames) {
    const files = new Set();

    for (const name of componentNames) {
      const patterns = [
        `**/${name}.test.{ts,tsx,js,jsx}`,
        `**/${name}.spec.{ts,tsx,js,jsx}`,
        `**/${name.toLowerCase()}.test.{ts,tsx,js,jsx}`,
        `**/__tests__/**/${name}.{ts,tsx,js,jsx}`,
        `**/tests/**/${name}.{ts,tsx,js,jsx}`
      ];

      for (const pattern of patterns) {
        try {
          const matches = await glob(pattern, {
            cwd: this.projectRoot,
            ignore: ['**/node_modules/**', '**/dist/**'],
            absolute: true
          });
          matches.forEach(m => files.add(m));
        } catch (error) {
          // Test files may not exist yet
        }
      }
    }

    return Array.from(files);
  }

  /**
   * Discover configuration files
   * @returns {Promise<string[]>} Discovered config files
   */
  async discoverConfigFiles() {
    const configPatterns = [
      'tsconfig.json',
      'vite.config.{ts,js}',
      'package.json',
      'jest.config.{ts,js}',
      'vitest.config.{ts,js}',
      'playwright.config.{ts,js}'
    ];

    const files = new Set();

    for (const pattern of configPatterns) {
      try {
        const matches = await glob(pattern, {
          cwd: this.projectRoot,
          absolute: true
        });
        matches.forEach(m => files.add(m));
      } catch (error) {
        // Config file may not exist
      }
    }

    return Array.from(files);
  }

  /**
   * Discover files in a specific directory
   * @param {string} directory - Directory to search
   * @param {string[]} extensions - File extensions to match
   * @returns {Promise<string[]>} Discovered files
   */
  async discoverInDirectory(directory, extensions = ['ts', 'tsx', 'js', 'jsx']) {
    const extPattern = extensions.length === 1 ? extensions[0] : `{${extensions.join(',')}}`;
    const pattern = `**/*.${extPattern}`;

    try {
      const matches = await glob(pattern, {
        cwd: path.resolve(this.projectRoot, directory),
        ignore: [
          '**/node_modules/**',
          '**/dist/**',
          '**/build/**',
          '**/.next/**'
        ],
        absolute: true
      });

      // Validate paths
      const validation = this.pathValidator.validateBatch(matches);
      return validation.valid;
    } catch (error) {
      console.warn(`Directory search failed for ${directory}:`, error.message);
      return [];
    }
  }
}

/**
 * Create a default FileDiscoveryEngine for current project
 * @param {string} projectRoot - Project root path
 * @returns {FileDiscoveryEngine}
 */
export function createDiscoveryEngine(projectRoot) {
  const pathValidator = new PathValidator(projectRoot);
  return new FileDiscoveryEngine(projectRoot, pathValidator);
}

export default FileDiscoveryEngine;
