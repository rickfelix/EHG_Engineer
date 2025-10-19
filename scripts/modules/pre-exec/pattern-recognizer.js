/**
 * PatternRecognizer Module
 * SD-PRE-EXEC-ANALYSIS-001
 *
 * Purpose: Recognize code patterns, naming conventions, and architectural styles
 */

import path from 'path';
import fs from 'fs/promises';

export class PatternRecognizer {
  /**
   * Recognize patterns in discovered files
   * @param {string[]} filePaths - Files to analyze
   * @returns {Promise<Object>} Recognized patterns
   */
  async recognize(filePaths) {
    const patterns = {
      naming_convention: await this.detectNamingConvention(filePaths),
      existing_utilities: await this.discoverUtilities(),
      architecture_style: await this.detectArchitectureStyle(filePaths),
      framework_conventions: await this.detectFrameworkConventions(filePaths)
    };

    return patterns;
  }

  /**
   * Detect naming convention from file names
   * @param {string[]} filePaths - Files to analyze
   * @returns {Promise<string>} Detected convention
   */
  async detectNamingConvention(filePaths) {
    const fileNames = filePaths.map(fp => path.basename(fp, path.extname(fp)));

    let pascalCaseCount = 0;
    let camelCaseCount = 0;
    let kebabCaseCount = 0;

    fileNames.forEach(name => {
      if (/^[A-Z][a-z]+(?:[A-Z][a-z]+)*$/.test(name)) pascalCaseCount++;
      else if (/^[a-z]+(?:[A-Z][a-z]+)*$/.test(name)) camelCaseCount++;
      else if (/^[a-z]+(?:-[a-z]+)*$/.test(name)) kebabCaseCount++;
    });

    if (pascalCaseCount > camelCaseCount && pascalCaseCount > kebabCaseCount) {
      return 'PascalCase (components)';
    } else if (camelCaseCount > kebabCaseCount) {
      return 'camelCase (utilities)';
    } else if (kebabCaseCount > 0) {
      return 'kebab-case';
    }
    return 'Mixed/Unknown';
  }

  /**
   * Discover existing utilities
   * @returns {Promise<Array>} Discovered utilities
   */
  async discoverUtilities() {
    const utilities = [];
    const searchDirs = ['lib', 'utils', 'hooks', 'helpers'];

    for (const dir of searchDirs) {
      try {
        const dirPath = path.resolve(process.cwd(), dir);
        const files = await fs.readdir(dirPath).catch(() => []);

        for (const file of files) {
          const filePath = path.join(dirPath, file);
          const ext = path.extname(file);

          if (['.ts', '.tsx', '.js', '.jsx'].includes(ext)) {
            utilities.push({
              path: filePath.replace(process.cwd(), ''),
              name: path.basename(file, ext),
              category: dir
            });
          }
        }
      } catch {
        // Directory doesn't exist
      }
    }

    return utilities;
  }

  /**
   * Detect architecture style
   * @param {string[]} filePaths - Files to analyze
   * @returns {Promise<string>} Architecture style
   */
  async detectArchitectureStyle(filePaths) {
    const hasFeatureDirectories = filePaths.some(fp => fp.includes('/features/'));
    const hasComponentsDirectory = filePaths.some(fp => fp.includes('/components/'));
    const hasPagesDirectory = filePaths.some(fp => fp.includes('/pages/'));

    if (hasFeatureDirectories) return 'Feature-based';
    if (hasPagesDirectory) return 'Page-based (Next.js/Remix style)';
    if (hasComponentsDirectory) return 'Component-based';
    return 'Unknown';
  }

  /**
   * Detect framework conventions
   * @param {string[]} filePaths - Files to analyze
   * @returns {Promise<Array>} Detected conventions
   */
  async detectFrameworkConventions(filePaths) {
    const conventions = [];

    // Check for React hooks pattern
    const hasHooks = filePaths.some(fp => {
      const fileName = path.basename(fp);
      return fileName.startsWith('use') && /^use[A-Z]/.test(fileName);
    });
    if (hasHooks) conventions.push('React Hooks (use* pattern)');

    // Check for Shadcn UI usage (would need to parse imports)
    const hasShadcn = filePaths.some(fp => fp.includes('/components/ui/'));
    if (hasShadcn) conventions.push('Shadcn UI components');

    return conventions;
  }
}

export function createPatternRecognizer() {
  return new PatternRecognizer();
}

export default PatternRecognizer;
